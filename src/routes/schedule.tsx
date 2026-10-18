import { Hono } from 'hono';
import { SESSION_CSV_TEMPLATE, parseSessionCsv } from '../lib/csv';
import { loadCatalog, toCards } from '../lib/catalog';
import { deleteSession, getSession, insertSession, updateSession, writeAudit, type SessionInput } from '../lib/db';
import { readFields, stringFields } from '../lib/form';
import { programKey } from '../lib/format';
import { formatInstant, utcToDatetimeLocal, zonedToUtc } from '../lib/time';
import { Banner, Hero, Section } from '../views/Layout';
import { page, requireAdmin, type AppContext } from './guard';

export const scheduleRoutes = new Hono<{ Bindings: Env }>();

scheduleRoutes.get('/admin/schedule/template.csv', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  return new Response(SESSION_CSV_TEMPLATE, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="sessions.csv"' },
  });
});

scheduleRoutes.get('/admin/schedule', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  return page(c, access, 'Schedule', <ScheduleList catalog={catalog} notice={c.req.query('notice')} error={c.req.query('error')} />);
});

scheduleRoutes.get('/admin/schedule/new', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  return page(c, access, 'New session', <SessionEditor catalog={catalog} />);
});

scheduleRoutes.post('/admin/schedule', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const input = sessionFromFields(stringFields(await readFields(c)), catalog);
  if ('error' in input) return page(c, access, 'New session', <SessionEditor catalog={catalog} error={input.error} />, 400);
  const id = await insertSession(c.env.DB, catalog.event.id, input);
  await writeAudit(c.env.DB, access.actor ?? 'admin', 'session_create', 'session', String(id), input.title);
  return c.redirect('/admin/schedule?notice=Session+saved');
});

scheduleRoutes.get('/admin/schedule/import', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  return page(c, access, 'Import schedule', <ImportForm />);
});

scheduleRoutes.post('/admin/schedule/import', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return page(c, access, 'Import schedule', <ImportForm error="Choose a CSV file." />, 400);
  if (file.size > 1_000_000) return page(c, access, 'Import schedule', <ImportForm error="That file is too large." />, 400);
  const parsed = parseSessionCsv(await file.text());
  const catalog = await loadCatalog(c.env.DB);
  let created = 0;
  const errors = parsed.errors.slice();
  for (const [index, row] of parsed.rows.entries()) {
    const programId = programFromName(row.program, catalog.programs);
    if ('error' in programId) {
      errors.push({ line: index + 2, message: programId.error });
      continue;
    }
    try {
      const startsAt = zonedToUtc(row.date, row.start, catalog.event.timezone);
      const endsAt = zonedToUtc(row.date, row.end, catalog.event.timezone);
      if (new Date(endsAt) <= new Date(startsAt)) {
        errors.push({ line: index + 2, message: 'The end time must be after the start time.' });
        continue;
      }
      await insertSession(c.env.DB, catalog.event.id, {
        programId: programId.id,
        title: row.title,
        description: '',
        location: row.location,
        activityType: row.activityType,
        startsAt,
        endsAt,
        instructors: row.instructors,
      });
      created += 1;
    } catch {
      errors.push({ line: index + 2, message: 'Could not read the date or time.' });
    }
  }
  await writeAudit(c.env.DB, access.actor ?? 'admin', 'session_import', 'event', String(catalog.event.id), `created ${created}`);
  return page(c, access, 'Import schedule', <ImportResult created={created} errors={errors} />);
});

scheduleRoutes.get('/admin/schedule/:id', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const catalog = await loadCatalog(c.env.DB);
  const session = catalog.sessions.find((item) => item.id === Number(c.req.param('id')));
  if (!session) return c.redirect('/admin/schedule?error=Session+not+found');
  return page(c, access, session.title, <SessionEditor catalog={catalog} session={session} instructors={catalog.instructors.get(session.id) ?? []} />);
});

scheduleRoutes.post('/admin/schedule/:id', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const id = Number(c.req.param('id'));
  const catalog = await loadCatalog(c.env.DB);
  const session = await getSession(c.env.DB, id);
  if (!session) return c.redirect('/admin/schedule?error=Session+not+found');
  const fields = stringFields(await readFields(c));
  const input = sessionFromFields(fields, catalog);
  if ('error' in input) {
    return page(c, access, session.title, <SessionEditor catalog={catalog} session={session} instructors={catalog.instructors.get(session.id) ?? []} error={input.error} />, 400);
  }
  const moved = input.startsAt !== session.starts_at || input.endsAt !== session.ends_at;
  const affected = toCards(catalog).filter((card) => card.assignment.session_id === id && card.assignment.publication === 'published' && card.assignment.schedule_override === 0);
  if (moved && affected.length > 0 && fields.confirm !== 'yes') {
    return page(
      c,
      access,
      session.title,
      <SessionEditor
        catalog={catalog}
        session={{ ...session, ...{ title: input.title, location: input.location, activity_type: input.activityType, description: input.description, program_id: input.programId, starts_at: input.startsAt, ends_at: input.endsAt } }}
        instructors={input.instructors}
        warning={`Changing the time updates ${affected.length} live survey${affected.length === 1 ? '' : 's'} that are not manually overridden: ${affected.map((card) => card.assignment.title).join(', ')}.`}
        confirm
      />,
      400,
    );
  }
  await updateSession(c.env.DB, id, input);
  await writeAudit(c.env.DB, access.actor ?? 'admin', 'session_update', 'session', String(id), moved ? 'times changed' : 'details changed');
  return c.redirect('/admin/schedule?notice=Session+updated');
});

scheduleRoutes.post('/admin/schedule/:id/delete', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const id = Number(c.req.param('id'));
  const error = await deleteSession(c.env.DB, id);
  if (error) return c.redirect(`/admin/schedule?error=${encodeURIComponent(error)}`);
  await writeAudit(c.env.DB, access.actor ?? 'admin', 'session_delete', 'session', String(id), 'deleted');
  return c.redirect('/admin/schedule?notice=Session+deleted');
});

function sessionFromFields(fields: Record<string, string>, catalog: Awaited<ReturnType<typeof loadCatalog>>): SessionInput | { error: string } {
  const title = fields.title?.trim() ?? '';
  if (!title) return { error: 'Enter a session title.' };
  let startsAt = '';
  let endsAt = '';
  try {
    startsAt = zonedToUtc(fields.date ?? '', fields.start ?? '', catalog.event.timezone);
    endsAt = zonedToUtc(fields.date ?? '', fields.end ?? '', catalog.event.timezone);
  } catch {
    return { error: 'Enter a valid date and start and end times.' };
  }
  if (new Date(endsAt) <= new Date(startsAt)) return { error: 'The end time must be after the start time.' };
  const programRaw = fields.program ?? 'shared';
  let programId: number | null = null;
  if (programRaw !== 'shared') {
    programId = Number(programRaw);
    if (!catalog.programs.some((program) => program.id === programId)) return { error: 'Choose a program.' };
  }
  return {
    programId,
    title,
    description: (fields.description ?? '').trim(),
    location: (fields.location ?? '').trim(),
    activityType: (fields.type ?? '').trim(),
    startsAt,
    endsAt,
    instructors: (fields.instructors ?? '').split('\n').map((name) => name.trim()).filter(Boolean),
  };
}

function programFromName(label: string, programs: { id: number; name: string; short_name: string }[]): { id: number | null } | { error: string } {
  const key = programKey(label);
  if (key === null) return { error: `Unknown program “${label}”. Use Company, Command, or Shared.` };
  if (key === 'shared') return { id: null };
  const program = programs.find((item) => programKey(item.name) === key);
  if (!program) return { error: `Unknown program “${label}”.` };
  return { id: program.id };
}

import type { Catalog } from '../lib/catalog';
import type { SessionRow } from '../lib/db';
import type { FC } from 'hono/jsx';

const ScheduleList: FC<{ catalog: Catalog; notice?: string; error?: string }> = (props) => (
  <>
    <Hero compact title="Schedule" lead={`${props.catalog.event.name}. Times are shown in Eastern Time.`} />
    <Section>
      {props.notice ? <Banner kind="success">{props.notice}</Banner> : null}
      {props.error ? <Banner kind="error">{props.error}</Banner> : null}
      <div class="mb-6 flex flex-wrap gap-3">
        <a href="/admin/schedule/new" class="btn btn-primary">
          Add session
        </a>
        <a href="/admin/schedule/import" class="btn btn-quiet">
          Import CSV
        </a>
      </div>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Program</th>
              <th>Session</th>
              <th>Instructors</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {props.catalog.sessions.map((session) => (
              <tr>
                <td>
                  {formatInstant(session.starts_at, props.catalog.event.timezone)} – {formatInstant(session.ends_at, props.catalog.event.timezone).replace(/^.*?, /, '')}
                </td>
                <td>{props.catalog.programs.find((program) => program.id === session.program_id)?.short_name ?? 'Shared'}</td>
                <td>
                  <a href={`/admin/schedule/${session.id}`} class="font-semibold text-navy underline">
                    {session.title}
                  </a>
                  {session.location ? <div class="text-sm text-muted">{session.location}</div> : null}
                </td>
                <td>{(props.catalog.instructors.get(session.id) ?? []).join(', ')}</td>
                <td>
                  <a href={`/admin/schedule/${session.id}`} class="btn btn-quiet btn-sm">
                    Edit
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {props.catalog.sessions.length === 0 ? <p class="mt-4 text-muted">No sessions yet.</p> : null}
      </div>
    </Section>
  </>
);

const SessionEditor: FC<{ catalog: Catalog; session?: SessionRow; instructors?: string[]; error?: string; warning?: string; confirm?: boolean }> = (props) => {
  const zone = props.catalog.event.timezone;
  const starts = props.session ? utcToDatetimeLocal(props.session.starts_at, zone) : `${props.catalog.event.starts_on}T09:00`;
  const ends = props.session ? utcToDatetimeLocal(props.session.ends_at, zone) : `${props.catalog.event.starts_on}T10:00`;
  return (
    <>
      <Hero compact title={props.session ? 'Edit session' : 'New session'} lead="Surveys set to open at session end follow these times unless an administrator overrides them." />
      <Section narrow>
        {props.error ? <Banner kind="error">{props.error}</Banner> : null}
        {props.warning ? <Banner kind="info">{props.warning}</Banner> : null}
        <form method="post" action={props.session ? `/admin/schedule/${props.session.id}` : '/admin/schedule'} class="space-y-4">
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Title</span>
            <input class="input mt-1.5" name="title" required value={props.session?.title ?? ''} />
          </label>
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Date</span>
            <input class="input mt-1.5" type="date" name="date" required value={starts.slice(0, 10)} />
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Start</span>
              <input class="input mt-1.5" type="time" name="start" required value={starts.slice(11, 16)} />
            </label>
            <label class="block">
              <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">End</span>
              <input class="input mt-1.5" type="time" name="end" required value={ends.slice(11, 16)} />
            </label>
          </div>
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Program</span>
            <select class="select mt-1.5" name="program">
              <option value="shared" selected={!props.session?.program_id}>
                Shared
              </option>
              {props.catalog.programs.map((program) => (
                <option value={String(program.id)} selected={props.session?.program_id === program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </label>
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Location</span>
            <input class="input mt-1.5" name="location" value={props.session?.location ?? ''} />
          </label>
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Type</span>
            <input class="input mt-1.5" name="type" value={props.session?.activity_type ?? 'instruction'} placeholder="instruction, exercise, meal" />
          </label>
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Instructors, one per line</span>
            <textarea class="textarea mt-1.5" name="instructors">{(props.instructors ?? []).join('\n')}</textarea>
          </label>
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Description</span>
            <textarea class="textarea mt-1.5" name="description">{props.session?.description ?? ''}</textarea>
          </label>
          {props.confirm ? (
            <label class="flex items-center gap-2">
              <input type="checkbox" name="confirm" value="yes" required />
              <span>Update the live surveys that follow this session</span>
            </label>
          ) : null}
          <button type="submit" class="btn btn-primary">
            Save session
          </button>
        </form>
        {props.session ? (
          <form method="post" action={`/admin/schedule/${props.session.id}/delete`} class="mt-8">
            <button type="submit" class="btn btn-quiet">
              Delete session
            </button>
          </form>
        ) : null}
      </Section>
    </>
  );
};

const ImportForm: FC<{ error?: string }> = (props) => (
  <>
    <Hero compact title="Import sessions" lead="Columns: date, start, end, program, title, instructors, location, type. Times are Eastern Time." />
    <Section narrow>
      {props.error ? <Banner kind="error">{props.error}</Banner> : null}
      <p class="mb-4">
        <a href="/admin/schedule/template.csv" class="font-semibold text-navy underline">
          Download a sample file
        </a>
      </p>
      <form method="post" action="/admin/schedule/import" enctype="multipart/form-data" class="space-y-4">
        <input class="input" type="file" name="file" accept=".csv,text/csv" required />
        <button type="submit" class="btn btn-primary">
          Import
        </button>
      </form>
    </Section>
  </>
);

const ImportResult: FC<{ created: number; errors: { line: number; message: string }[] }> = (props) => (
  <>
    <Hero compact title="Import finished" lead={`${props.created} session${props.created === 1 ? '' : 's'} added.`} />
    <Section>
      {props.errors.length > 0 ? (
        <Banner kind="error">
          <ul class="list-disc pl-5">
            {props.errors.map((error) => (
              <li>
                Line {error.line}: {error.message}
              </li>
            ))}
          </ul>
        </Banner>
      ) : (
        <Banner kind="success">Every row was imported.</Banner>
      )}
      <a href="/admin/schedule" class="btn btn-primary">
        Back to schedule
      </a>
    </Section>
  </>
);
