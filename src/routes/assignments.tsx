import type { FC } from 'hono/jsx';
import { Hono } from 'hono';
import { filterCards, loadCatalog, pageHref, readFilters, toCard, toCards, type AssignmentCard, type Catalog } from '../lib/catalog';
import { archiveAssignment, countResponses, extendAssignment, getAssignment, insertAssignments, listPublishedVersions, publishAssignment, reopenAssignment, setManualState, updateAssignmentMeta, updateAssignmentRules, writeAudit, type PublishedVersion } from '../lib/db';
import { instructorList, programKey } from '../lib/format';
import { field, fieldAll, readFields, stringFields } from '../lib/form';
import { newPublicId } from '../lib/ids';
import { isLowParticipation } from '../lib/report';
import { qrSvg } from '../lib/qr';
import { validateDocument, type SurveyDocument } from '../lib/questions';
import { defaultSessionRules, describeRule, parseRules, rulesFromForm, type OpenCloseRules } from '../lib/schedule';
import { dateInZone, datetimeLocalToUtc, formatClock, formatDay, formatInstant, formatLongDate, todayInZone } from '../lib/time';
import { documentTokens, resolveDocument } from '../lib/tokens';
import { Banner, Hero, Section, StatusBadge } from '../views/Layout';
import { SurveyForm } from '../views/SurveyForm';
import { page, requireAdmin, requireStaff, type AppContext } from './guard';

const PAGE_SIZE = 25;
export const assignmentRoutes = new Hono<{ Bindings: Env }>();

assignmentRoutes.get('/admin', async (c) => {
  const access = await requireStaff(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const filters = readFilters(new URL(c.req.url));
  const cards = filterCards(toCards(catalog), filters);
  const start = (filters.page - 1) * PAGE_SIZE;
  return page(c, access, 'Surveys', <Dashboard catalog={catalog} cards={cards.slice(start, start + PAGE_SIZE)} total={cards.length} filters={filters} notice={c.req.query('notice')} admin={Boolean(access.admin)} />);
});

assignmentRoutes.get('/admin/today', async (c) => {
  const access = await requireStaff(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const today = todayInZone(catalog.event.timezone);
  const day = c.req.query('date') || (today >= catalog.event.starts_on && today <= catalog.event.ends_on ? today : catalog.event.starts_on);
  return page(c, access, 'Today', <Today catalog={catalog} day={day} />);
});

assignmentRoutes.get('/admin/assignments/new', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const versions = await listPublishedVersions(c.env.DB);
  return page(c, access, 'Assign survey', <AssignForm catalog={catalog} versions={versions} />);
});

assignmentRoutes.post('/admin/assignments/review', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const raw = await readFields(c);
  const fields = stringFields(raw);
  const built = await buildProposals(c, catalog, fields, fieldAll(raw, 'session_id'), field(raw, 'no_session') === '1');
  if ('error' in built) {
    const versions = await listPublishedVersions(c.env.DB);
    return page(c, access, 'Assign survey', <AssignForm catalog={catalog} versions={versions} error={built.error} />, 400);
  }
  return page(c, access, 'Review surveys', <Review catalog={catalog} fields={fields} proposals={built.proposals} version={built.version} />);
});

assignmentRoutes.post('/admin/assignments', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const raw = await readFields(c);
  const fields = stringFields(raw);
  const selected = fieldAll(raw, 'session_id');
  const includeShared = field(raw, 'no_session') === '1';
  const built = await buildProposals(c, catalog, fields, selected, includeShared);
  if ('error' in built) return c.redirect(`/admin/assignments/new?error=${encodeURIComponent(built.error)}`);
  const chosen = built.proposals.filter((proposal) => proposal.unresolved.length === 0);
  if (chosen.length === 0) return c.redirect('/admin/assignments/new');
  const publish = fields.publish === 'on';
  const rows = chosen.map((proposal) => ({
    publicId: newPublicId(),
    eventId: catalog.event.id,
    versionId: built.version.id,
    templateId: built.version.template_id,
    sessionId: proposal.sessionId,
    title: proposal.title,
    description: built.version.template_description,
    category: fields.category || built.version.category_name,
    programId: fields.program_id ? Number(fields.program_id) : null,
    anonymity: fields.anonymity === 'identified' ? 'identified' : 'anonymous',
    required: fields.required === 'on',
    expectedCount: numberOrNull(fields.expected_count),
    rulesJson: JSON.stringify(built.rules),
    document: proposal.document,
  }));
  await insertAssignments(c.env.DB, rows);
  if (publish) {
    const fresh = await loadCatalog(c.env.DB);
    for (const row of rows) {
      const assignment = fresh.assignments.find((item) => item.public_id === row.publicId);
      if (!assignment) continue;
      const card = toCard(fresh, assignment);
      if (!card.window.error && validateDocument(card.document).length === 0) await publishAssignment(c.env.DB, assignment.id);
    }
  }
  await writeAudit(c.env.DB, access.actor ?? 'admin', 'assignment_create', 'event', String(catalog.event.id), `created ${chosen.length} from ${built.version.template_name}`);
  return c.redirect(`/admin?notice=${encodeURIComponent(`Created ${chosen.length} survey${chosen.length === 1 ? '' : 's'}`)}`);
});

assignmentRoutes.get('/admin/assignments/:id', async (c) => {
  const access = await requireStaff(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const assignment = catalog.assignments.find((item) => item.id === Number(c.req.param('id')));
  if (!assignment) return c.redirect('/admin?error=Survey+not+found');
  const card = toCard(catalog, assignment);
  return page(c, access, assignment.title, <Detail catalog={catalog} card={card} origin={new URL(c.req.url).origin} admin={Boolean(access.admin)} notice={c.req.query('notice')} error={c.req.query('error')} />);
});

assignmentRoutes.post('/admin/assignments/:id/meta', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const id = Number(c.req.param('id'));
  const fields = stringFields(await readFields(c));
  if (!fields.title.trim()) return c.redirect(`/admin/assignments/${id}?error=Enter+a+title`);
  await updateAssignmentMeta(c.env.DB, id, {
    title: fields.title.trim(),
    description: fields.description.trim(),
    category: fields.category,
    programId: fields.program_id ? Number(fields.program_id) : null,
    expectedCount: numberOrNull(fields.expected_count),
    required: fields.required === 'on',
  });
  return c.redirect(`/admin/assignments/${id}?notice=Saved`);
});

assignmentRoutes.post('/admin/assignments/:id/rules', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const id = Number(c.req.param('id'));
  const assignment = await getAssignment(c.env.DB, id);
  if (!assignment) return c.redirect('/admin');
  if ((await countResponses(c.env.DB, id)) > 0) return c.redirect(`/admin/assignments/${id}?error=Rules+stay+fixed+after+the+first+response`);
  const catalog = await loadCatalog(c.env.DB);
  const rules = rulesFromForm(stringFields(await readFields(c)), catalog.event.timezone, datetimeLocalToUtc);
  if ('error' in rules) return c.redirect(`/admin/assignments/${id}?error=${encodeURIComponent(rules.error)}`);
  await updateAssignmentRules(c.env.DB, id, JSON.stringify(rules));
  await writeAudit(c.env.DB, access.actor ?? 'admin', 'schedule_change', 'assignment', String(id), 'rules replaced');
  return c.redirect(`/admin/assignments/${id}?notice=Schedule+updated`);
});

assignmentRoutes.post('/admin/assignments/:id/publish', (c) => lifecycle(c, 'publish'));
assignmentRoutes.post('/admin/assignments/:id/open', (c) => lifecycle(c, 'open'));
assignmentRoutes.post('/admin/assignments/:id/close', (c) => lifecycle(c, 'close'));
assignmentRoutes.post('/admin/assignments/:id/reopen', (c) => lifecycle(c, 'reopen'));
assignmentRoutes.post('/admin/assignments/:id/archive', (c) => lifecycle(c, 'archive'));

assignmentRoutes.post('/admin/assignments/:id/extend', async (c) => {
  const access = await requireStaff(c);
  if (access instanceof Response) return access;
  const id = Number(c.req.param('id'));
  const catalog = await loadCatalog(c.env.DB);
  const assignment = catalog.assignments.find((item) => item.id === id);
  if (!assignment) return c.redirect('/admin');
  const fields = stringFields(await readFields(c));
  let closeAt = '';
  try {
    closeAt = datetimeLocalToUtc(fields.close_at, catalog.event.timezone);
  } catch {
    return c.redirect(`/admin/assignments/${id}?error=Enter+a+new+close+time`);
  }
  const card = toCard(catalog, assignment);
  await extendAssignment(c.env.DB, id, card.window.openAt, closeAt);
  await writeAudit(c.env.DB, access.actor ?? 'staff', 'schedule_override', 'assignment', String(id), 'deadline extended');
  return c.redirect(`/admin/assignments/${id}?notice=Deadline+updated`);
});

assignmentRoutes.get('/admin/assignments/:id/preview', async (c) => {
  const access = await requireStaff(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const assignment = catalog.assignments.find((item) => item.id === Number(c.req.param('id')));
  if (!assignment) return c.redirect('/admin');
  const card = toCard(catalog, assignment);
  return page(
    c,
    access,
    assignment.title,
    <>
      <Hero compact title={assignment.title} lead="Staff preview. Answers are not saved." />
      <Section>
        <SurveyForm document={card.document} anonymity={assignment.anonymity} preview />
      </Section>
    </>,
    200,
    true,
  );
});

assignmentRoutes.get('/admin/assignments/:id/qr.svg', async (c) => {
  const access = await requireStaff(c);
  if (access instanceof Response) return access;
  const assignment = await getAssignment(c.env.DB, Number(c.req.param('id')));
  if (!assignment) return c.notFound();
  const svg = qrSvg(surveyLink(new URL(c.req.url).origin, assignment.public_id));
  return c.body(svg, 200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store' });
});

assignmentRoutes.get('/admin/assignments/:id/qr', async (c) => {
  const access = await requireStaff(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const assignment = catalog.assignments.find((item) => item.id === Number(c.req.param('id')));
  if (!assignment) return c.redirect('/admin');
  const link = surveyLink(new URL(c.req.url).origin, assignment.public_id);
  return page(
    c,
    access,
    'QR code',
    <section class="mx-auto max-w-xl px-5 py-10 text-center">
      <p class="font-display text-sm font-semibold uppercase tracking-[0.2em] text-gold">NVFR LDI</p>
      <h1 class="mt-2 font-display text-4xl font-bold uppercase text-navy">{assignment.title}</h1>
      <img src={`/admin/assignments/${assignment.id}/qr.svg`} alt="" class="mx-auto mt-6 h-64 w-64" />
      <p class="mt-4 break-all text-sm text-muted">{link}</p>
      <p class="no-print mt-6">
        <button type="button" class="btn btn-primary" onclick="window.print()">
          Print
        </button>
      </p>
    </section>,
  );
});

async function lifecycle(c: AppContext, action: 'publish' | 'open' | 'close' | 'reopen' | 'archive') {
  const access = await requireStaff(c);
  if (access instanceof Response) return access;
  if ((action === 'publish' || action === 'archive') && !access.admin) return c.redirect('/admin/login');
  const id = Number(c.req.param('id'));
  const assignment = await getAssignment(c.env.DB, id);
  if (!assignment) return c.redirect('/admin');
  if (action === 'publish') {
    const catalog = await loadCatalog(c.env.DB);
    const card = toCard(catalog, assignment);
    const problems = [...validateDocument(card.document), ...documentTokens(card.document).map((token) => `Unresolved {{${token}}}.`)];
    if (card.window.error) problems.push(card.window.error);
    if (problems.length > 0) return c.redirect(`/admin/assignments/${id}?error=${encodeURIComponent(problems[0])}`);
    await publishAssignment(c.env.DB, id);
  } else if (action === 'open') await setManualState(c.env.DB, id, 'open', true);
  else if (action === 'close') await setManualState(c.env.DB, id, 'closed', false);
  else if (action === 'reopen') await reopenAssignment(c.env.DB, id);
  else await archiveAssignment(c.env.DB, id);
  await writeAudit(c.env.DB, access.actor ?? 'staff', `assignment_${action}`, 'assignment', String(id), action);
  const back = new URL(c.req.url).searchParams.get('back') || `/admin/assignments/${id}`;
  return c.redirect(`${back}${back.includes('?') ? '&' : '?'}notice=${encodeURIComponent(action)}`);
}

type Proposal = { sessionId: number | null; label: string; title: string; duplicate: boolean; unresolved: string[]; document: SurveyDocument };

async function buildProposals(
  c: AppContext,
  catalog: Catalog,
  fields: Record<string, string>,
  sessionIds: string[],
  includeShared: boolean,
): Promise<{ proposals: Proposal[]; version: PublishedVersion; rules: OpenCloseRules } | { error: string }> {
  const versions = await listPublishedVersions(c.env.DB);
  const version = versions.find((item) => item.id === Number(fields.version_id));
  if (!version) return { error: 'Choose a published template.' };
  const rules = rulesFromForm(fields, catalog.event.timezone, datetimeLocalToUtc);
  if ('error' in rules) return rules;
  const program = catalog.programs.find((item) => item.id === Number(fields.program_id));
  const className = program?.name ?? 'All programs';
  const source = JSON.parse(version.document_json) as SurveyDocument;
  if (sessionIds.length === 0 && !includeShared) return { error: 'Select at least one session, or choose a shared survey with no session.' };
  const sessions = catalog.sessions.filter((session) => sessionIds.includes(String(session.id)));
  const targets: { session: (typeof sessions)[number] | null; sessionId: number | null }[] = sessions.map((session) => ({ session, sessionId: session.id }));
  if (includeShared) targets.push({ session: null, sessionId: null });
  const proposals: Proposal[] = targets.map(({ session, sessionId }) => {
    const needsSession = rules.open.type === 'session_start' || rules.open.type === 'session_end' || rules.open.type === 'offset_after_end';
    const rendered = resolveDocument(source, {
      session_title: session?.title ?? '',
      instructor_name: instructorList(session ? (catalog.instructors.get(session.id) ?? []) : []),
      class_name: className,
      event_name: catalog.event.name,
      session_date: session ? formatLongDate(session.starts_at, catalog.event.timezone) : '',
    });
    if (!session && needsSession) rendered.unresolved.push('a session for this open rule');
    const duplicate = sessionId !== null && catalog.assignments.some((assignment) => assignment.session_id === sessionId && assignment.template_id === version.template_id && assignment.publication !== 'archived');
    return {
      sessionId,
      label: session ? session.title : 'Shared survey',
      title: session ? `${version.template_name}: ${session.title}` : version.template_name,
      duplicate,
      unresolved: rendered.unresolved,
      document: rendered.document,
    };
  });
  return { proposals, version, rules };
}

function numberOrNull(value: string | undefined): number | null {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function ruleLabel(type: string): string {
  if (type === 'offset_after_end') return 'Minutes after the session ends';
  if (type === 'offset_after_open') return 'Minutes after it opens';
  if (type === 'session_end') return 'When the session ends';
  if (type === 'session_start') return 'When the session starts';
  if (type === 'event_end') return 'When the institute ends';
  if (type === 'absolute') return 'A set date and time';
  return 'When an administrator decides';
}

function surveyLink(origin: string, publicId: string): string {
  return `${origin}/s/${publicId}`;
}

function countLabel(card: AssignmentCard): string {
  return card.assignment.expected_count ? `${card.count}/${card.assignment.expected_count}` : String(card.count);
}

const Dashboard: FC<{ catalog: Catalog; cards: AssignmentCard[]; total: number; filters: ReturnType<typeof readFilters>; notice?: string; admin?: boolean }> = (props) => {
  const all = toCards(props.catalog);
  const summary = { draft: 0, scheduled: 0, open: 0, closed: 0, responses: 0, low: 0 };
  for (const card of all) {
    if (card.window.availability === 'draft') summary.draft += 1;
    if (card.window.availability === 'scheduled') summary.scheduled += 1;
    if (card.window.availability === 'open') summary.open += 1;
    if (card.window.availability === 'closed') summary.closed += 1;
    summary.responses += card.count;
    if (isLowParticipation(card.count, card.assignment.expected_count, card.window.availability)) summary.low += 1;
  }
  const pages = Math.max(1, Math.ceil(props.total / PAGE_SIZE));
  return (
    <>
      <Hero compact title="Surveys" lead={props.catalog.event.name} />
      <Section>
        {props.notice ? <Banner kind="success">{props.notice}</Banner> : null}
        <div class="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Draft" value={summary.draft} />
          <Stat label="Scheduled" value={summary.scheduled} />
          <Stat label="Open" value={summary.open} />
          <Stat label="Closed" value={summary.closed} />
          <Stat label="Responses" value={summary.responses} />
          <Stat label="Low participation" value={summary.low} />
        </div>
        <div class="mb-4 flex flex-wrap gap-3">
          <a href="/admin/assignments/new" class="btn btn-primary">
            Assign survey
          </a>
          <a href="/admin/today" class="btn btn-quiet">
            Today
          </a>
          {props.admin ? (
            <>
              <a href="/admin/export/event/summary.csv" class="btn btn-quiet">
                Event CSV
              </a>
              <a href="/admin/export/event/report.xlsx" class="btn btn-quiet">
                Event Excel
              </a>
            </>
          ) : null}
        </div>
        <form method="get" action="/admin" class="mb-4 grid gap-2 md:grid-cols-6">
          <input class="input md:col-span-2" name="q" value={props.filters.q} placeholder="Search" />
          <select class="select" name="program">
            <option value="">All programs</option>
            <option value="company" selected={props.filters.program === 'company'}>Company</option>
            <option value="command" selected={props.filters.program === 'command'}>Command</option>
            <option value="shared" selected={props.filters.program === 'shared'}>Shared</option>
          </select>
          <input class="input" type="date" name="day" value={props.filters.day} />
          <select class="select" name="category">
            <option value="">All categories</option>
            {props.catalog.categories.map((category) => (
              <option value={category.name} selected={props.filters.category === category.name}>
                {category.name}
              </option>
            ))}
          </select>
          <select class="select" name="status">
            <option value="">Any status</option>
            {['draft', 'scheduled', 'open', 'closed', 'archived'].map((status) => (
              <option value={status} selected={props.filters.status === status}>
                {status}
              </option>
            ))}
          </select>
          <button type="submit" class="btn btn-secondary btn-sm">
            Filter
          </button>
        </form>
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Program</th>
                <th>Survey</th>
                <th>Session</th>
                <th>Opens / closes</th>
                <th>Status</th>
                <th>Responses</th>
              </tr>
            </thead>
            <tbody>
              {props.cards.map((card) => (
                <tr class={isLowParticipation(card.count, card.assignment.expected_count, card.window.availability) ? 'row-alert' : ''}>
                  <td>{card.day ? formatDay(card.day, props.catalog.event.timezone) : '—'}</td>
                  <td>{card.programLabel}</td>
                  <td>
                    <a href={`/admin/assignments/${card.assignment.id}`} class="font-semibold text-navy underline">
                      {card.assignment.title}
                    </a>
                    <div class="text-sm text-muted">{card.assignment.category_name}</div>
                  </td>
                  <td>{card.session?.title ?? '—'}</td>
                  <td>
                    {card.window.openAt ? formatInstant(card.window.openAt, props.catalog.event.timezone) : 'Manual'}
                    <br />
                    {card.window.closeAt ? formatInstant(card.window.closeAt, props.catalog.event.timezone) : 'Until closed'}
                  </td>
                  <td>
                    <StatusBadge status={card.window.availability} />
                  </td>
                  <td>{countLabel(card)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {props.total === 0 ? <p class="mt-4 text-muted">No surveys match.</p> : null}
        {pages > 1 ? (
          <p class="mt-4 flex gap-3">
            {props.filters.page > 1 ? <a href={pageHref(props.filters, props.filters.page - 1)}>Previous</a> : null}
            <span>
              Page {props.filters.page} of {pages}
            </span>
            {props.filters.page < pages ? <a href={pageHref(props.filters, props.filters.page + 1)}>Next</a> : null}
          </p>
        ) : null}
      </Section>
    </>
  );
};

const Today: FC<{ catalog: Catalog; day: string }> = (props) => {
  const cards = toCards(props.catalog).filter((card) => card.day === props.day && card.window.availability !== 'archived');
  const groups = ['Company', 'Command', 'Shared'] as const;
  const missing = props.catalog.sessions.filter((session) => dateInZone(session.starts_at, props.catalog.event.timezone) === props.day && !props.catalog.assignments.some((assignment) => assignment.session_id === session.id && assignment.publication !== 'archived'));
  return (
    <>
      <Hero compact title="Today" lead={formatDay(props.day, props.catalog.event.timezone)} />
      <Section>
        <form method="get" action="/admin/today" class="mb-6 flex flex-wrap items-end gap-3">
          <label>
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Day</span>
            <input class="input mt-1" type="date" name="date" value={props.day} />
          </label>
          <button type="submit" class="btn btn-secondary">
            Show
          </button>
        </form>
        {missing.length > 0 ? (
          <Banner kind="info">
            No survey for {missing.map((session) => session.title).join(', ')}.
          </Banner>
        ) : null}
        {groups.map((group) => (
          <div class="mb-8">
            <h3 class="font-display text-2xl font-bold uppercase text-navy">{group}</h3>
            <table class="data-table mt-2">
              <thead>
                <tr>
                  <th>Survey</th>
                  <th>Status</th>
                  <th>Responses</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cards
                  .filter((card) => card.programLabel === group || (group === 'Shared' && card.audienceKey === 'shared'))
                  .filter((card) => (group === 'Shared' ? card.audienceKey === 'shared' : card.programLabel === group))
                  .map((card) => (
                    <tr class={isLowParticipation(card.count, card.assignment.expected_count, card.window.availability) ? 'row-alert' : ''}>
                      <td>
                        <a href={`/admin/assignments/${card.assignment.id}`} class="font-semibold text-navy underline">
                          {card.session?.title ?? card.assignment.title}
                        </a>
                      </td>
                      <td>
                        <StatusBadge status={card.window.availability} />
                      </td>
                      <td>{countLabel(card)}</td>
                      <td class="flex flex-wrap gap-2">
                        <Quick action="open" id={card.assignment.id} back={`/admin/today?date=${props.day}`} label="Open" />
                        <Quick action="close" id={card.assignment.id} back={`/admin/today?date=${props.day}`} label="Close" />
                        <a href={`/admin/assignments/${card.assignment.id}/qr`} class="btn btn-quiet btn-sm">
                          QR
                        </a>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </Section>
    </>
  );
};

const Quick: FC<{ action: string; id: number; back: string; label: string }> = (props) => (
  <form method="post" action={`/admin/assignments/${props.id}/${props.action}?back=${encodeURIComponent(props.back)}`}>
    <button type="submit" class="btn btn-quiet btn-sm">
      {props.label}
    </button>
  </form>
);

const Stat: FC<{ label: string; value: number }> = (props) => (
  <div class="stat-card">
    <p class="font-display text-3xl font-bold text-navy">{props.value}</p>
    <p class="text-sm uppercase tracking-wide text-muted">{props.label}</p>
  </div>
);

const AssignForm: FC<{ catalog: Catalog; versions: PublishedVersion[]; error?: string }> = (props) => (
  <>
    <Hero compact title="Assign a survey" lead="One published questionnaire can be given to many sessions. Nothing already assigned is overwritten." />
    <Section>
      {props.error ? <Banner kind="error">{props.error}</Banner> : null}
      <form method="post" action="/admin/assignments/review" class="grid gap-4">
        <label class="block">
          <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Template</span>
          <select class="select mt-1.5" name="version_id" required>
            {props.versions.map((version) => (
              <option value={String(version.id)}>
                {version.template_name} (v{version.version_number})
              </option>
            ))}
          </select>
        </label>
        <div class="grid gap-4 md:grid-cols-2">
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Audience</span>
            <select class="select mt-1.5" name="program_id">
              <option value="">Shared</option>
              {props.catalog.programs.map((program) => (
                <option value={String(program.id)}>{program.name}</option>
              ))}
            </select>
          </label>
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Category</span>
            <select class="select mt-1.5" name="category">
              {props.catalog.categories.map((category) => (
                <option value={category.name}>{category.name}</option>
              ))}
            </select>
          </label>
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Anonymity</span>
            <select class="select mt-1.5" name="anonymity">
              <option value="anonymous">Anonymous</option>
              <option value="identified">Identified</option>
            </select>
          </label>
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Expected responses</span>
            <input class="input mt-1.5" name="expected_count" inputmode="numeric" />
          </label>
        </div>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="required" value="on" /> Required for the class
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="publish" value="on" /> Publish after creating
        </label>
        <RuleFields />
        <label class="flex items-center gap-2">
          <input type="checkbox" name="no_session" value="1" /> Shared survey with no session
        </label>
        <SessionPicker catalog={props.catalog} />
        <script src="/assign.js" defer />
        <button type="submit" class="btn btn-primary">
          Review
        </button>
      </form>
    </Section>
  </>
);

const SessionPicker: FC<{ catalog: Catalog }> = (props) => {
  const zone = props.catalog.event.timezone;
  const days = new Map<string, typeof props.catalog.sessions>();
  for (const session of props.catalog.sessions) {
    const day = dateInZone(session.starts_at, zone);
    const list = days.get(day) ?? [];
    list.push(session);
    days.set(day, list);
  }
  return (
    <fieldset id="session-picker" class="grid gap-4">
      <legend class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Sessions</legend>
      <p class="text-sm text-muted">These settings are copied onto every session you select.</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn btn-quiet btn-sm" data-select="all">
          Select all
        </button>
        <button type="button" class="btn btn-quiet btn-sm" data-select="program" data-program="company">
          Company
        </button>
        <button type="button" class="btn btn-quiet btn-sm" data-select="program" data-program="command">
          Command
        </button>
        <button type="button" class="btn btn-quiet btn-sm" data-select="none">
          Clear
        </button>
      </div>
      <p class="text-sm font-semibold text-navy" data-selected-count>
        0 sessions selected
      </p>
      {[...days.entries()].map(([day, sessions]) => (
        <div class="grid gap-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-display text-xl font-bold uppercase text-navy">{formatDay(day, zone)}</h3>
            <button type="button" class="btn btn-quiet btn-sm" data-select="day" data-day={day}>
              Select day
            </button>
          </div>
          {sessions.map((session) => {
            const program = props.catalog.programs.find((item) => item.id === session.program_id);
            const key = program ? (programKey(program.name) ?? 'shared') : 'shared';
            const instructors = instructorList(props.catalog.instructors.get(session.id) ?? []);
            return (
              <label class="flex items-start gap-2">
                <input type="checkbox" name="session_id" value={String(session.id)} data-day={day} data-program={key} />
                <span>
                  {formatClock(session.starts_at, zone)}–{formatClock(session.ends_at, zone)} · {session.title}
                  <span class="text-muted">
                    {' '}
                    · {program?.short_name ?? 'Shared'}
                    {instructors ? ` · ${instructors}` : ''}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
};

const RuleFields: FC<{ rules?: OpenCloseRules }> = (props) => {
  const rules = props.rules ?? defaultSessionRules();
  return (
    <div class="grid gap-4 md:grid-cols-2">
      <label class="block">
        <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Opens</span>
        <select class="select mt-1.5" name="open_type">
          {['session_end', 'offset_after_end', 'session_start', 'absolute', 'manual'].map((type) => (
            <option value={type} selected={rules.open.type === type}>
              {ruleLabel(type)}
            </option>
          ))}
        </select>
        <input class="input mt-2" type="datetime-local" name="open_at" />
        <input class="input mt-2" name="open_minutes" placeholder="Minutes" value={rules.open.type === 'offset_after_end' ? String(rules.open.minutes) : '0'} />
      </label>
      <label class="block">
        <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Closes</span>
        <select class="select mt-1.5" name="close_type">
          {['event_end', 'offset_after_open', 'absolute', 'manual'].map((type) => (
            <option value={type} selected={rules.close.type === type}>
              {ruleLabel(type)}
            </option>
          ))}
        </select>
        <input class="input mt-2" type="datetime-local" name="close_at" />
        <input class="input mt-2" name="close_minutes" placeholder="Minutes after open" value={rules.close.type === 'offset_after_open' ? String(rules.close.minutes) : '0'} />
      </label>
    </div>
  );
};

const Review: FC<{ catalog: Catalog; fields: Record<string, string>; proposals: Proposal[]; version: PublishedVersion }> = (props) => (
  <>
    <Hero compact title="Review assignments" lead="Unchecked duplicates are skipped. Rows with missing session details are blocked." />
    <Section>
      <form method="post" action="/admin/assignments" class="grid gap-4">
        {Object.entries(props.fields)
          .filter(([key]) => key !== 'session_id' && key !== 'no_session')
          .map(([key, value]) => (
            <input type="hidden" name={key} value={value} />
          ))}
        <ul class="grid gap-3">
          {props.proposals.map((proposal) => (
            <li class="panel">
              <label class="flex items-start gap-3">
                {proposal.unresolved.length === 0 ? (
                  proposal.sessionId === null ? (
                    <input type="checkbox" name="no_session" value="1" checked />
                  ) : (
                    <input type="checkbox" name="session_id" value={String(proposal.sessionId)} checked={!proposal.duplicate} />
                  )
                ) : (
                  <input type="checkbox" disabled />
                )}
                <span>
                  <strong>{proposal.title}</strong>
                  {proposal.duplicate ? <span class="mt-1 block text-sm text-navy">A survey from this template already exists. Check the box to add another.</span> : null}
                  {proposal.unresolved.length > 0 ? <span class="mt-1 block text-sm text-red-800">Missing {proposal.unresolved.join(', ')}. Add it on the session, then try again.</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <button type="submit" class="btn btn-primary">
          Create surveys
        </button>
      </form>
    </Section>
  </>
);

const Detail: FC<{ catalog: Catalog; card: AssignmentCard; origin: string; admin: boolean; notice?: string; error?: string }> = (props) => {
  const link = surveyLink(props.origin, props.card.assignment.public_id);
  const low = isLowParticipation(props.card.count, props.card.assignment.expected_count, props.card.window.availability);
  return (
    <>
      <Hero compact title={props.card.assignment.title} lead={`${props.card.programLabel} · ${props.card.assignment.anonymity === 'anonymous' ? 'Anonymous' : 'Identified'}`} />
      <Section>
        {props.notice ? <Banner kind="success">{props.notice}</Banner> : null}
        {props.error ? <Banner kind="error">{props.error}</Banner> : null}
        {props.card.window.error ? <Banner kind="error">{props.card.window.error}</Banner> : null}
        {low ? <Banner kind="info">Participation is under half of the expected {props.card.assignment.expected_count} responses.</Banner> : null}
        <div class="mb-6 flex flex-wrap items-center gap-3">
          <StatusBadge status={props.card.window.availability} />
          <span>
            {countLabel(props.card)} responses
          </span>
          <span class="text-muted">
            {props.card.window.openAt ? formatInstant(props.card.window.openAt, props.catalog.event.timezone) : 'Opens manually'}
            {' – '}
            {props.card.window.closeAt ? formatInstant(props.card.window.closeAt, props.catalog.event.timezone) : 'until closed'}
          </span>
        </div>
        <div class="mb-6 grid gap-4 md:grid-cols-[12rem_1fr] md:items-center">
          <img src={`/admin/assignments/${props.card.assignment.id}/qr.svg`} alt="" class="h-40 w-40" />
          <div>
            <label class="block">
              <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Link</span>
              <input class="input mt-1.5" readonly value={link} />
            </label>
            <div class="mt-3 flex flex-wrap gap-2">
              <a href={`/admin/assignments/${props.card.assignment.id}/qr`} class="btn btn-quiet btn-sm">
                Print QR
              </a>
              <a href={`/admin/assignments/${props.card.assignment.id}/preview`} class="btn btn-quiet btn-sm">
                Preview
              </a>
              {props.admin || props.card.assignment.anonymity === 'anonymous' ? (
                <a href={`/admin/reports/${props.card.assignment.id}`} class="btn btn-secondary btn-sm">
                  Report
                </a>
              ) : null}
            </div>
          </div>
        </div>
        <div class="mb-8 flex flex-wrap gap-2">
          <Quick action="open" id={props.card.assignment.id} back={`/admin/assignments/${props.card.assignment.id}`} label="Open now" />
          <Quick action="close" id={props.card.assignment.id} back={`/admin/assignments/${props.card.assignment.id}`} label="Close" />
          <Quick action="reopen" id={props.card.assignment.id} back={`/admin/assignments/${props.card.assignment.id}`} label="Reopen" />
          {props.admin ? <Quick action="publish" id={props.card.assignment.id} back={`/admin/assignments/${props.card.assignment.id}`} label="Publish" /> : null}
          {props.admin ? <Quick action="archive" id={props.card.assignment.id} back={`/admin/assignments/${props.card.assignment.id}`} label="Archive" /> : null}
        </div>
        <form method="post" action={`/admin/assignments/${props.card.assignment.id}/extend`} class="mb-8 flex flex-wrap items-end gap-3">
          <label>
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Extend close time</span>
            <input class="input mt-1" type="datetime-local" name="close_at" required />
          </label>
          <button type="submit" class="btn btn-secondary">
            Extend
          </button>
        </form>
        {props.admin ? (
          <form method="post" action={`/admin/assignments/${props.card.assignment.id}/meta`} class="grid gap-3 border border-navy/10 p-4">
            <h3 class="font-display text-2xl font-bold uppercase text-navy">Details</h3>
            <input class="input" name="title" value={props.card.assignment.title} />
            <textarea class="textarea" name="description">
              {props.card.assignment.description}
            </textarea>
            <select class="select" name="category">
              {props.catalog.categories.map((category) => (
                <option value={category.name} selected={category.name === props.card.assignment.category_name}>
                  {category.name}
                </option>
              ))}
            </select>
            <select class="select" name="program_id">
              <option value="" selected={!props.card.assignment.program_id}>
                Shared
              </option>
              {props.catalog.programs.map((program) => (
                <option value={String(program.id)} selected={program.id === props.card.assignment.program_id}>
                  {program.name}
                </option>
              ))}
            </select>
            <input class="input" name="expected_count" value={props.card.assignment.expected_count ?? ''} placeholder="Expected responses" />
            <label class="flex items-center gap-2">
              <input type="checkbox" name="required" value="on" checked={props.card.assignment.required_flag === 1} /> Required
            </label>
            <button type="submit" class="btn btn-secondary">
              Save details
            </button>
          </form>
        ) : null}
        {props.admin && props.card.count === 0 ? (
          <form method="post" action={`/admin/assignments/${props.card.assignment.id}/rules`} class="mt-6 border border-navy/10 p-4">
            <h3 class="mb-3 font-display text-2xl font-bold uppercase text-navy">Schedule rules</h3>
            <p class="mb-3 text-sm text-muted">Current open rule: {describeRule(parseRules(props.card.assignment.open_rule_json).open)}. Close rule: {describeRule(parseRules(props.card.assignment.open_rule_json).close)}.</p>
            <RuleFields rules={parseRules(props.card.assignment.open_rule_json)} />
            <button type="submit" class="btn btn-quiet mt-3">
              Replace rules
            </button>
          </form>
        ) : null}
      </Section>
    </>
  );
};
