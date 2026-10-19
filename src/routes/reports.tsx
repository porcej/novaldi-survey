import type { FC } from 'hono/jsx';
import { Hono } from 'hono';
import { reportBlock, sessionBars, type ComparisonBar, type ReportBlock } from '../lib/charts';
import { loadCatalog, toCard, toCards, type AssignmentCard } from '../lib/catalog';
import { listResponseGroups, writeAudit, type AssignmentRow } from '../lib/db';
import { responseSheet, summarySheet } from '../lib/export';
import { toCsv } from '../lib/csv';
import { orderedQuestions, type Question } from '../lib/questions';
import { buildSurveyPdf } from '../lib/pdf';
import { detailsVisibility, summarizeQuestion, type QuestionReport, type ResponseGroup } from '../lib/report';
import { buildXlsx } from '../lib/xlsx';
import { ChartFigure, ComparisonChart, TrendChart } from '../views/Charts';
import { Banner, Hero, Section, StatusBadge } from '../views/Layout';
import { page, requireAdmin, requireStaff, type AppContext } from './guard';

export const reportRoutes = new Hono<{ Bindings: Env }>();

reportRoutes.get('/admin/export/event/summary.csv', (c) => sendEvent(c, 'csv'));
reportRoutes.get('/admin/export/event/report.xlsx', (c) => sendEvent(c, 'xlsx'));

reportRoutes.get('/admin/reports/:id', async (c) => {
  const access = await requireStaff(c);
  if (access instanceof Response) return access;
  const loaded = await loadReport(c, Number(c.req.param('id')), Boolean(access.admin));
  if (!loaded) return c.redirect('/admin');
  if (loaded.assignment.anonymity === 'identified' && !access.admin) {
    return page(c, access, 'Administrators only', <Hero title="Administrators only" lead="Identified staff-interest responses are visible only to administrators." />, 403);
  }
  return page(
    c,
    access,
    loaded.assignment.title,
    <ReportPage
      title={loaded.assignment.title}
      status={loaded.card.window.availability}
      count={loaded.groups.length}
      expected={loaded.assignment.expected_count}
      blocks={loaded.blocks}
      visibility={loaded.visibility}
      admin={Boolean(access.admin)}
      id={loaded.assignment.id}
    />,
  );
});

reportRoutes.get('/admin/export/:id/summary.csv', (c) => sendExport(c, 'summary', 'csv'));
reportRoutes.get('/admin/export/:id/responses.csv', (c) => sendExport(c, 'responses', 'csv'));
reportRoutes.get('/admin/export/:id/report.xlsx', (c) => sendExport(c, 'workbook', 'xlsx'));
reportRoutes.get('/admin/export/:id/report.pdf', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const loaded = await loadReport(c, Number(c.req.param('id')), true);
  if (!loaded) return c.notFound();
  const rows = responseSheet(loaded.assignment.title, loaded.card.document, loaded.groups);
  const pdf = await buildSurveyPdf({
    title: loaded.assignment.title,
    context: [loaded.card.programLabel, loaded.card.session?.title, loaded.card.day].filter(Boolean).join(' · '),
    responseCount: loaded.groups.length,
    expected: loaded.assignment.expected_count,
    warning: loaded.visibility.warning ? 'Fewer than the small-group threshold. Breakdowns can identify someone in a small class.' : null,
    blocks: loaded.blocks,
    rows,
  });
  await writeAudit(c.env.DB, access.actor ?? 'admin', 'export', 'assignment', String(loaded.assignment.id), 'report pdf');
  return file(pdf, 'application/pdf', `${slug(loaded.assignment.title)}.pdf`);
});

async function loadReport(c: AppContext, id: number, admin: boolean) {
  const catalog = await loadCatalog(c.env.DB);
  const assignment = catalog.assignments.find((item) => item.id === id);
  if (!assignment) return null;
  const card = toCard(catalog, assignment);
  const groups = await listResponseGroups(c.env.DB, assignment.id);
  const questions = orderedQuestions(card.document).filter((question) => question.type !== 'info');
  const comparisons = await metricComparisons(c.env.DB, toCards(catalog), assignment, questions, groups, admin);
  const blocks = questions.map((question) => reportBlock(question, groups, comparisons.get(question.id) ?? null));
  const visibility = detailsVisibility(groups.length, catalog.event.small_group_threshold, admin);
  return { assignment, card, groups, blocks, visibility };
}

async function metricComparisons(
  db: D1Database,
  cards: AssignmentCard[],
  current: AssignmentRow,
  questions: Question[],
  groups: ResponseGroup[],
  admin: boolean,
): Promise<Map<string, ComparisonBar[]>> {
  const metrics = [...new Set(questions.filter((question) => question.reportingMetric && numeric(question)).map((question) => question.reportingMetric))];
  const result = new Map<string, ComparisonBar[]>();
  if (metrics.length === 0) return result;
  const peers = cards.filter((card) => {
    if (card.assignment.publication !== 'published' || card.assignment.id === current.id) return false;
    if (!admin && card.assignment.anonymity === 'identified') return false;
    return orderedQuestions(card.document).some((question) => numeric(question) && metrics.includes(question.reportingMetric));
  });
  const peerGroups = new Map<number, ResponseGroup[]>();
  for (const peer of peers) peerGroups.set(peer.assignment.id, await listResponseGroups(db, peer.assignment.id));
  const shown = new Set<string>();
  for (const question of questions) {
    const metric = question.reportingMetric;
    if (!metric || !numeric(question) || shown.has(metric)) continue;
    const others = peers.flatMap((peer) => {
      const match = orderedQuestions(peer.document).find((item) => item.reportingMetric === metric && numeric(item));
      if (!match) return [];
      return [{ label: peer.assignment.title, mean: summarizeQuestion(match, peerGroups.get(peer.assignment.id) ?? []).mean }];
    });
    const bars = sessionBars({ label: current.title, mean: summarizeQuestion(question, groups).mean }, others);
    if (!bars) continue;
    result.set(question.id, bars);
    shown.add(metric);
  }
  return result;
}

function numeric(question: Question): boolean {
  return question.type === 'rating' || question.type === 'likert' || question.type === 'matrix';
}

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
  const payload = typeof body === 'string' ? body : new Blob([new Uint8Array(body)]);
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
  blocks: ReportBlock[];
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
            <a href={`/admin/export/${props.id}/report.pdf`} class="btn btn-primary btn-sm">
              PDF
            </a>
          </>
        ) : null}
      </div>
      {props.visibility.warning ? <Banner kind="info">Fewer than the small-group threshold. Breakdowns can identify someone in a small class. Administrators can still view them.</Banner> : null}
      {!props.visibility.show ? <Banner kind="info">Not enough responses to show a breakdown.</Banner> : null}
      <div class="grid gap-4">
        {props.blocks.map((block) => (
          <QuestionCard block={block} show={props.visibility.show} admin={props.admin} />
        ))}
      </div>
    </Section>
  </>
);

const QuestionCard: FC<{ block: ReportBlock; show: boolean; admin: boolean }> = ({ block, show, admin }) => {
  const report: QuestionReport = block.report;
  const written = report.type === 'short_text' || report.type === 'long_text' || report.type === 'email' || report.type === 'phone';
  return (
    <article class="panel">
      <h3 class="font-display text-2xl font-bold uppercase text-navy">{report.title}</h3>
      <p class="mt-1 text-sm text-muted">
        {report.answered} answered · {report.na} N/A · {report.skipped} skipped
        {report.mean !== null ? ` · mean ${report.mean}` : ''}
        {report.median !== null ? ` · median ${report.median}` : ''}
        {report.favorablePercent !== null ? ` · favorable ${report.favorablePercent}%` : ''}
      </p>
      {show
        ? block.charts.map((chart) => (
            <ChartFigure chart={chart} />
          ))
        : null}
      {show && block.trend ? <TrendChart trend={block.trend} /> : null}
      {show && block.comparison ? <ComparisonChart bars={block.comparison} /> : null}
      {show && admin && written && report.comments.length > 0 ? (
        <ul class="mt-3 grid gap-2">
          {report.comments.map((comment) => (
            <li class="bg-surface px-3 py-2 text-sm whitespace-pre-wrap">{comment}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
};

type AssignmentCardStatus = 'draft' | 'scheduled' | 'open' | 'closed' | 'archived';
