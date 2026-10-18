import type { FC } from 'hono/jsx';
import { Hono } from 'hono';
import { loadCatalog, toCard, toCards } from '../lib/catalog';
import { listResponseGroups, writeAudit } from '../lib/db';
import { responseSheet, summarySheet } from '../lib/export';
import { toCsv } from '../lib/csv';
import { orderedQuestions } from '../lib/questions';
import { buildXlsx } from '../lib/xlsx';
import { detailsVisibility, summarizeQuestion, type QuestionReport } from '../lib/report';
import { Banner, Hero, Section, StatusBadge } from '../views/Layout';
import { page, requireAdmin, requireStaff, type AppContext } from './guard';

export const reportRoutes = new Hono<{ Bindings: Env }>();

reportRoutes.get('/admin/export/event/summary.csv', (c) => sendEvent(c, 'csv'));
reportRoutes.get('/admin/export/event/report.xlsx', (c) => sendEvent(c, 'xlsx'));

reportRoutes.get('/admin/reports/:id', async (c) => {
  const access = await requireStaff(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const assignment = catalog.assignments.find((item) => item.id === Number(c.req.param('id')));
  if (!assignment) return c.redirect('/admin');
  if (assignment.anonymity === 'identified' && !access.admin) {
    return page(c, access, 'Administrators only', <Hero title="Administrators only" lead="Identified staff-interest responses are visible only to administrators." />, 403);
  }
  const card = toCard(catalog, assignment);
  const groups = await listResponseGroups(c.env.DB, assignment.id);
  const questions = orderedQuestions(card.document).filter((question) => question.type !== 'info');
  const reports = questions.map((question) => summarizeQuestion(question, groups));
  const visibility = detailsVisibility(groups.length, catalog.event.small_group_threshold, Boolean(access.admin));
  return page(
    c,
    access,
    assignment.title,
    <ReportPage title={assignment.title} status={card.window.availability} count={groups.length} expected={assignment.expected_count} reports={reports} visibility={visibility} admin={Boolean(access.admin)} id={assignment.id} />,
  );
});

reportRoutes.get('/admin/export/:id/summary.csv', (c) => sendExport(c, 'summary', 'csv'));
reportRoutes.get('/admin/export/:id/responses.csv', (c) => sendExport(c, 'responses', 'csv'));
reportRoutes.get('/admin/export/:id/report.xlsx', (c) => sendExport(c, 'workbook', 'xlsx'));

async function sendExport(c: AppContext, kind: 'summary' | 'responses' | 'workbook', format: 'csv' | 'xlsx') {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const assignment = catalog.assignments.find((item) => item.id === Number(c.req.param('id')));
  if (!assignment) return c.notFound();
  const card = toCard(catalog, assignment);
  const groups = await listResponseGroups(c.env.DB, assignment.id);
  const summary = summarySheet(assignment.title, card.document, groups);
  const responses = responseSheet(assignment.title, card.document, groups);
  await writeAudit(c.env.DB, access.actor ?? 'admin', 'export', 'assignment', String(assignment.id), `${kind} ${format}`);
  if (format === 'xlsx') return file(buildXlsx([{ name: 'Summary', rows: summary }, { name: 'Responses', rows: responses }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${slug(assignment.title)}.xlsx`);
  return file(toCsv(kind === 'responses' ? responses : summary), 'text/csv; charset=utf-8', `${slug(assignment.title)}-${kind}.csv`);
}

async function sendEvent(c: AppContext, format: 'csv' | 'xlsx') {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const summary: string[][] = [];
  const responses: string[][] = [];
  for (const card of toCards(catalog)) {
    if (card.assignment.publication === 'draft') continue;
    const groups = await listResponseGroups(c.env.DB, card.assignment.id);
    const part = summarySheet(card.assignment.title, card.document, groups);
    const rows = responseSheet(card.assignment.title, card.document, groups);
    if (summary.length === 0) summary.push(...part);
    else summary.push(...part.slice(1));
    if (responses.length === 0) responses.push(...rows);
    else responses.push(...rows.slice(1));
  }
  await writeAudit(c.env.DB, access.actor ?? 'admin', 'export', 'event', String(catalog.event.id), `event ${format}`);
  if (format === 'xlsx') return file(buildXlsx([{ name: 'Summary', rows: summary }, { name: 'Responses', rows: responses }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'ldi-evaluations.xlsx');
  return file(toCsv(summary), 'text/csv; charset=utf-8', 'ldi-evaluations-summary.csv');
}

function file(body: string | Uint8Array, contentType: string, filename: string) {
  const payload = typeof body === 'string' ? body : new Blob([body]);
  return new Response(payload, {
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'survey';
}

const ReportPage: FC<{
  title: string;
  status: AssignmentCardStatus;
  count: number;
  expected: number | null;
  reports: QuestionReport[];
  visibility: { show: boolean; warning: boolean };
  admin: boolean;
  id: number;
}> = (props) => (
  <>
    <Hero compact title={props.title} lead={`${props.count}${props.expected ? ` of ${props.expected} expected` : ''} responses.`} />
    <Section>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={props.status} />
        {props.admin ? (
          <>
            <a href={`/admin/export/${props.id}/summary.csv`} class="btn btn-quiet btn-sm">
              Summary CSV
            </a>
            <a href={`/admin/export/${props.id}/responses.csv`} class="btn btn-quiet btn-sm">
              Responses CSV
            </a>
            <a href={`/admin/export/${props.id}/report.xlsx`} class="btn btn-secondary btn-sm">
              Excel
            </a>
          </>
        ) : null}
      </div>
      {props.visibility.warning ? <Banner kind="info">Fewer than the small-group threshold. Breakdowns can identify someone in a small class. Administrators can still view them.</Banner> : null}
      {!props.visibility.show ? <Banner kind="info">Not enough responses to show a breakdown.</Banner> : null}
      <div class="grid gap-4">
        {props.reports.map((report) => (
          <article class="panel">
            <h3 class="font-display text-2xl font-bold uppercase text-navy">{report.title}</h3>
            <p class="mt-1 text-sm text-muted">
              {report.answered} answered · {report.na} N/A · {report.skipped} skipped
              {report.mean !== null ? ` · mean ${report.mean}` : ''}
              {report.median !== null ? ` · median ${report.median}` : ''}
              {report.favorablePercent !== null ? ` · favorable ${report.favorablePercent}%` : ''}
            </p>
            {props.visibility.show && report.likert ? (
              <p class="mt-2 text-sm">
                Agree {report.likert.agreePercent}% · Neutral {report.likert.neutralPercent}% · Disagree {report.likert.disagreePercent}%
              </p>
            ) : null}
            {props.visibility.show && report.distribution.length > 0 ? (
              <ul class="mt-3 grid gap-1">
                {report.distribution.map((item) => (
                  <li class="flex justify-between gap-4 text-sm">
                    <span>{item.label}</span>
                    <span>
                      {item.count} ({item.percent}%)
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {props.visibility.show && props.admin && report.comments.length > 0 ? (
              <ul class="mt-3 grid gap-2">
                {report.comments.map((comment) => (
                  <li class="bg-surface px-3 py-2 text-sm whitespace-pre-wrap">{comment}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </Section>
  </>
);

type AssignmentCardStatus = 'draft' | 'scheduled' | 'open' | 'closed' | 'archived';
