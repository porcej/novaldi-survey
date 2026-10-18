import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { site } from '../content/site';
import { getAssignmentByPublicId, getEvent, getSession, guardExists, saveResponse } from '../lib/db';
import { fieldsToForm, readFields } from '../lib/form';
import { sha256Hex } from '../lib/crypto';
import { newPublicId } from '../lib/ids';
import { collectAnswers, formValueMap } from '../lib/questions';
import { computeWindow, parseRules } from '../lib/schedule';
import { dateInZone, formatInstant } from '../lib/time';
import { Banner, Hero, Section } from '../views/Layout';
import { SurveyForm } from '../views/SurveyForm';
import { page, type AppContext } from './guard';

export const publicRoutes = new Hono<{ Bindings: Env }>();

publicRoutes.get('/', (c) =>
  page(
    c,
    {},
    'Evaluations',
    <>
      <Hero title="Evaluations" lead={`Feedback for ${site.session.dates}. Open the link or QR code from your class.`} />
      <Section title="Open a survey" narrow>
        <form method="get" action="/go" class="space-y-4">
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Survey link or code</span>
            <input class="input mt-1.5" name="code" required autocomplete="off" />
          </label>
          <button type="submit" class="btn btn-primary">
            Continue
          </button>
        </form>
      </Section>
    </>,
  ),
);

publicRoutes.get('/go', (c) => {
  const id = extractId(c.req.query('code') ?? '');
  if (!id) {
    return page(
      c,
      {},
      'Evaluations',
      <>
        <Hero title="Survey not found" lead="That code is not a survey link." />
        <Section narrow>
          <a href="/" class="btn btn-primary">
            Try again
          </a>
        </Section>
      </>,
      404,
    );
  }
  return c.redirect(`/s/${id}`);
});

publicRoutes.get('/s/:publicId', async (c) => renderSurvey(c, false));
publicRoutes.get('/s/:publicId/thanks', (c) =>
  page(
    c,
    {},
    'Submitted',
    <>
      <Hero title="Thank you" lead="Your evaluation was submitted." />
      <Section title="You are done" narrow>
        <p class="text-muted">You can close this page. If the survey was anonymous, this confirmation is not tied to your answers.</p>
      </Section>
    </>,
  ),
);

publicRoutes.post('/s/:publicId', async (c) => {
  const publicId = c.req.param('publicId') ?? '';
  const limited = await tooFast(c, publicId);
  if (limited) return limited;
  const loaded = await loadOpen(c, publicId);
  if (loaded instanceof Response) return loaded;
  const guard = getCookie(c, cookieName(publicId));
  if (!guard) {
    return surveyMessage(c, loaded.assignment.title, 'Enable cookies, then open this survey again. A cookie on this device is how we notice a second submit without storing your name.', 400);
  }
  const hash = await sha256Hex(guard);
  if (await guardExists(c.env.DB, loaded.assignment.id, hash)) return alreadySubmitted(c, loaded.assignment.title);
  const fields = await readFields(c);
  const form = fieldsToForm(fields);
  const result = collectAnswers(loaded.document, form);
  if (result.errors.length > 0) {
    return page(
      c,
      {},
      loaded.assignment.title,
      <>
        <Hero compact title={loaded.assignment.title} lead={loaded.assignment.description || undefined} />
        <Section>
          <Banner kind="error">Check the questions marked below.</Banner>
          <SurveyForm document={loaded.document} action={`/s/${publicId}`} values={formValueMap(form)} errors={result.errors} anonymity={loaded.assignment.anonymity} />
        </Section>
      </>,
      400,
      true,
    );
  }
  try {
    await saveResponse(
      c.env.DB,
      loaded.assignment.id,
      dateInZone(new Date().toISOString(), loaded.event.timezone),
      hash,
      Object.entries(result.answers).map(([questionId, value]) => ({ questionId, value })),
    );
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return alreadySubmitted(c, loaded.assignment.title);
    throw error;
  }
  return c.redirect(`/s/${publicId}/thanks`);
});

async function renderSurvey(c: AppContext, preview: boolean) {
  const publicId = c.req.param('publicId') ?? '';
  const loaded = await loadOpen(c, publicId);
  if (loaded instanceof Response) return loaded;
  const guard = await ensureGuard(c, publicId);
  if (await guardExists(c.env.DB, loaded.assignment.id, await sha256Hex(guard))) return alreadySubmitted(c, loaded.assignment.title);
  return page(
    c,
    {},
    loaded.assignment.title,
    <>
      <Hero compact title={loaded.assignment.title} lead={loaded.assignment.description || (loaded.assignment.required_flag ? 'This evaluation is requested from your class.' : 'This evaluation is optional.')} />
      <Section>
        <SurveyForm document={loaded.document} action={`/s/${publicId}`} anonymity={loaded.assignment.anonymity} preview={preview} />
      </Section>
    </>,
    200,
    true,
  );
}

async function loadOpen(c: AppContext, publicId: string) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(publicId)) return surveyMessage(c, 'Survey not found', 'That survey link is not valid.', 404);
  const assignment = await getAssignmentByPublicId(c.env.DB, publicId);
  if (!assignment) return surveyMessage(c, 'Survey not found', 'That survey link is not valid.', 404);
  const event = await getEvent(c.env.DB);
  const session = assignment.session_id ? await getSession(c.env.DB, assignment.session_id) : null;
  const window = computeWindow({
    publication: assignment.publication,
    manualState: assignment.manual_state,
    scheduleOverride: assignment.schedule_override === 1,
    overrideOpenAt: assignment.override_open_at,
    overrideCloseAt: assignment.override_close_at,
    rules: parseRules(assignment.open_rule_json),
    session: session ? { startsAt: session.starts_at, endsAt: session.ends_at } : null,
    eventEndsOn: event.ends_on,
    timeZone: event.timezone,
    now: new Date().toISOString(),
  });
  if (window.availability !== 'open') {
    const when = window.availability === 'scheduled' && window.openAt ? ` It opens ${formatInstant(window.openAt, event.timezone)}.` : '';
    const closed = window.availability === 'closed' ? ' This evaluation is closed.' : '';
    const waiting = window.availability === 'draft' || window.availability === 'archived' ? ' This evaluation is not available.' : '';
    return surveyMessage(c, assignment.title, `${waiting || closed || 'This evaluation is not open yet.'}${when}`.trim(), 403);
  }
  return { assignment, event, document: JSON.parse(assignment.rendered_json) };
}

function surveyMessage(c: AppContext, title: string, lead: string, status: 400 | 403 | 404 | 429) {
  return page(
    c,
    {},
    title,
    <>
      <Hero title={title} lead={lead} />
      <Section narrow>
        <a href="/" class="btn btn-primary">
          Evaluation home
        </a>
      </Section>
    </>,
    status,
  );
}

function alreadySubmitted(c: AppContext, title: string) {
  return page(
    c,
    {},
    title,
    <>
      <Hero title="Already submitted" lead="This device already sent a response for this evaluation." />
      <Section narrow>
        <p class="text-muted">If you need to submit from another device, ask an administrator. Anonymous responses are not tied to your name.</p>
      </Section>
    </>,
  );
}

async function ensureGuard(c: AppContext, publicId: string): Promise<string> {
  const name = cookieName(publicId);
  const existing = getCookie(c, name);
  if (existing) return existing;
  const guard = newPublicId();
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, name, guard, { httpOnly: true, secure, sameSite: 'Lax', path: `/s/${publicId}`, maxAge: 60 * 60 * 24 * 20 });
  return guard;
}

function cookieName(publicId: string): string {
  return `sv_${publicId}`;
}

async function tooFast(c: AppContext, publicId: string): Promise<Response | null> {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const result = await c.env.SUBMIT_LIMIT.limit({ key: `${publicId}:${ip}` });
  if (result.success) return null;
  return surveyMessage(c, 'Please wait', 'Too many submissions from this network. Wait a minute and try again.', 429);
}

function extractId(raw: string): string | null {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/s\/([A-Za-z0-9_-]{8,64})/);
    if (match) return match[1];
  } catch {
    // A bare code is not a URL.
  }
  return /^[A-Za-z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}
