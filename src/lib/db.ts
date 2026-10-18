import { SEED_TEMPLATES, CATEGORIES, EVENT_END, EVENT_NAME, EVENT_START, EVENT_TIMEZONE } from '../content/templates';
import type { StoredAnswer, SurveyDocument } from './questions';
import type { ResponseGroup } from './report';

export type EventRow = {
  id: number;
  name: string;
  timezone: string;
  starts_on: string;
  ends_on: string;
  small_group_threshold: number;
  status: string;
};

export type ProgramRow = { id: number; event_id: number; name: string; short_name: string };
export type CategoryRow = { id: number; name: string; sort_order: number };

export type SessionRow = {
  id: number;
  event_id: number;
  program_id: number | null;
  title: string;
  description: string;
  location: string;
  activity_type: string;
  starts_at: string;
  ends_at: string;
};

export type TemplateRow = {
  id: number;
  name: string;
  description: string;
  category_name: string;
  anonymity: 'anonymous' | 'identified';
  archived: number;
};

export type VersionRow = {
  id: number;
  template_id: number;
  version_number: number;
  status: 'draft' | 'published';
  document_json: string;
  published_at: string | null;
};

export type AssignmentRow = {
  id: number;
  public_id: string;
  event_id: number;
  version_id: number;
  template_id: number;
  session_id: number | null;
  title: string;
  description: string;
  category_name: string;
  program_id: number | null;
  anonymity: 'anonymous' | 'identified';
  required_flag: number;
  expected_count: number | null;
  open_rule_json: string;
  schedule_override: number;
  override_open_at: string | null;
  override_close_at: string | null;
  publication: 'draft' | 'published' | 'archived';
  manual_state: 'open' | 'closed' | null;
  rendered_json: string;
};

const ASSIGNMENT_COLUMNS = `id, public_id, event_id, version_id, template_id, session_id, title, description, category_name,
  program_id, anonymity, required_flag, expected_count, open_rule_json, schedule_override, override_open_at,
  override_close_at, publication, manual_state, rendered_json`;

export async function ensureSeeded(db: D1Database): Promise<void> {
  const existing = await db.prepare('SELECT id FROM events WHERE name = ?').bind(EVENT_NAME).first();
  if (existing) return;
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO events (id, name, timezone, starts_on, ends_on, small_group_threshold, status)
       VALUES (1, ?, ?, ?, ?, 5, 'active')`,
    ).bind(EVENT_NAME, EVENT_TIMEZONE, EVENT_START, EVENT_END),
    db.prepare(`INSERT INTO programs (id, event_id, name, short_name) VALUES (1, 1, 'Company Officer', 'Company')`),
    db.prepare(`INSERT INTO programs (id, event_id, name, short_name) VALUES (2, 1, 'Command Officer', 'Command')`),
    ...CATEGORIES.map((name, index) =>
      db.prepare(`INSERT INTO survey_categories (id, event_id, name, sort_order) VALUES (?, 1, ?, ?)`).bind(index + 1, name, index + 1),
    ),
  ];
  for (const [index, template] of SEED_TEMPLATES.entries()) {
    const id = index + 1;
    statements.push(
      db
        .prepare(
          `INSERT INTO survey_templates (id, name, description, category_name, anonymity, archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .bind(id, template.name, template.description, template.category, template.anonymity, now, now),
      db
        .prepare(
          `INSERT INTO survey_versions (template_id, version_number, status, document_json, published_at, created_at)
           VALUES (?, 1, 'published', ?, ?, ?)`,
        )
        .bind(id, JSON.stringify(template.document), now, now),
    );
  }
  try {
    await db.batch(statements);
  } catch (error) {
    const row = await db.prepare('SELECT id FROM events WHERE name = ?').bind(EVENT_NAME).first();
    if (!row) throw error;
  }
}

export async function getEvent(db: D1Database): Promise<EventRow> {
  const row = await db.prepare('SELECT id, name, timezone, starts_on, ends_on, small_group_threshold, status FROM events ORDER BY id LIMIT 1').first<EventRow>();
  if (!row) throw new Error('The institute event is not set up.');
  return row;
}

export async function listPrograms(db: D1Database, eventId: number): Promise<ProgramRow[]> {
  const { results } = await db.prepare('SELECT id, event_id, name, short_name FROM programs WHERE event_id = ? ORDER BY id').bind(eventId).all<ProgramRow>();
  return results;
}

export async function listCategories(db: D1Database, eventId: number): Promise<CategoryRow[]> {
  const { results } = await db
    .prepare('SELECT id, name, sort_order FROM survey_categories WHERE event_id = ? ORDER BY sort_order, name')
    .bind(eventId)
    .all<CategoryRow>();
  return results;
}

export async function listSessions(db: D1Database, eventId: number): Promise<SessionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, event_id, program_id, title, description, location, activity_type, starts_at, ends_at
       FROM sessions WHERE event_id = ? ORDER BY starts_at, id`,
    )
    .bind(eventId)
    .all<SessionRow>();
  return results;
}

export async function getSession(db: D1Database, id: number): Promise<SessionRow | null> {
  return db
    .prepare(
      `SELECT id, event_id, program_id, title, description, location, activity_type, starts_at, ends_at
       FROM sessions WHERE id = ?`,
    )
    .bind(id)
    .first<SessionRow>();
}

export async function instructorMap(db: D1Database, sessionIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (sessionIds.length === 0) return map;
  const placeholders = sessionIds.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT session_id, name FROM session_instructors WHERE session_id IN (${placeholders}) ORDER BY sort_order, id`)
    .bind(...sessionIds)
    .all<{ session_id: number; name: string }>();
  for (const row of results) {
    const names = map.get(row.session_id) ?? [];
    names.push(row.name);
    map.set(row.session_id, names);
  }
  return map;
}

export type SessionInput = {
  programId: number | null;
  title: string;
  description: string;
  location: string;
  activityType: string;
  startsAt: string;
  endsAt: string;
  instructors: string[];
};

export async function insertSession(db: D1Database, eventId: number, input: SessionInput): Promise<number> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `INSERT INTO sessions (event_id, program_id, title, description, location, activity_type, starts_at, ends_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(eventId, input.programId, input.title, input.description, input.location, input.activityType, input.startsAt, input.endsAt, now, now)
    .first<{ id: number }>();
  if (!row) throw new Error('Could not save the session.');
  await replaceInstructors(db, row.id, input.instructors);
  return row.id;
}

export async function updateSession(db: D1Database, id: number, input: SessionInput): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE sessions
       SET program_id = ?, title = ?, description = ?, location = ?, activity_type = ?, starts_at = ?, ends_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(input.programId, input.title, input.description, input.location, input.activityType, input.startsAt, input.endsAt, now, id)
    .run();
  await replaceInstructors(db, id, input.instructors);
}

async function replaceInstructors(db: D1Database, sessionId: number, instructors: string[]): Promise<void> {
  const statements: D1PreparedStatement[] = [db.prepare('DELETE FROM session_instructors WHERE session_id = ?').bind(sessionId)];
  instructors.forEach((name, index) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    statements.push(db.prepare('INSERT INTO session_instructors (session_id, name, sort_order) VALUES (?, ?, ?)').bind(sessionId, trimmed, index));
  });
  await db.batch(statements);
}

export async function deleteSession(db: D1Database, id: number): Promise<string | null> {
  const used = await db.prepare('SELECT id FROM assignments WHERE session_id = ? AND publication != ? LIMIT 1').bind(id, 'archived').first();
  if (used) return 'This session still has a survey. Archive that survey before deleting the session.';
  await db.batch([
    db.prepare('DELETE FROM session_instructors WHERE session_id = ?').bind(id),
    db.prepare('DELETE FROM sessions WHERE id = ?').bind(id),
  ]);
  return null;
}

export async function listTemplates(db: D1Database): Promise<TemplateRow[]> {
  const { results } = await db
    .prepare('SELECT id, name, description, category_name, anonymity, archived FROM survey_templates ORDER BY archived, name')
    .all<TemplateRow>();
  return results;
}

export async function getTemplate(db: D1Database, id: number): Promise<TemplateRow | null> {
  return db.prepare('SELECT id, name, description, category_name, anonymity, archived FROM survey_templates WHERE id = ?').bind(id).first<TemplateRow>();
}

export async function insertTemplate(db: D1Database, input: { name: string; description: string; category: string; anonymity: string; document: SurveyDocument }): Promise<number> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `INSERT INTO survey_templates (name, description, category_name, anonymity, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?) RETURNING id`,
    )
    .bind(input.name, input.description, input.category, input.anonymity, now, now)
    .first<{ id: number }>();
  if (!row) throw new Error('Could not save the template.');
  await db
    .prepare(`INSERT INTO survey_versions (template_id, version_number, status, document_json, created_at) VALUES (?, 1, 'draft', ?, ?)`)
    .bind(row.id, JSON.stringify(input.document), now)
    .run();
  return row.id;
}

export async function updateTemplateMeta(db: D1Database, id: number, input: { name: string; description: string; category: string; anonymity: string }): Promise<void> {
  await db
    .prepare(`UPDATE survey_templates SET name = ?, description = ?, category_name = ?, anonymity = ?, updated_at = ? WHERE id = ?`)
    .bind(input.name, input.description, input.category, input.anonymity, new Date().toISOString(), id)
    .run();
}

export async function setTemplateArchived(db: D1Database, id: number, archived: boolean): Promise<void> {
  await db.prepare('UPDATE survey_templates SET archived = ?, updated_at = ? WHERE id = ?').bind(archived ? 1 : 0, new Date().toISOString(), id).run();
}

export async function listVersions(db: D1Database, templateId: number): Promise<VersionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, template_id, version_number, status, document_json, published_at
       FROM survey_versions WHERE template_id = ? ORDER BY version_number DESC`,
    )
    .bind(templateId)
    .all<VersionRow>();
  return results;
}

export async function getVersion(db: D1Database, id: number): Promise<VersionRow | null> {
  return db
    .prepare('SELECT id, template_id, version_number, status, document_json, published_at FROM survey_versions WHERE id = ?')
    .bind(id)
    .first<VersionRow>();
}

export async function latestVersion(db: D1Database, templateId: number): Promise<VersionRow | null> {
  return db
    .prepare(
      `SELECT id, template_id, version_number, status, document_json, published_at
       FROM survey_versions WHERE template_id = ? ORDER BY version_number DESC LIMIT 1`,
    )
    .bind(templateId)
    .first<VersionRow>();
}

export async function saveDraft(db: D1Database, versionId: number, document: SurveyDocument): Promise<boolean> {
  const result = await db
    .prepare(`UPDATE survey_versions SET document_json = ? WHERE id = ? AND status = 'draft'`)
    .bind(JSON.stringify(document), versionId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function publishVersion(db: D1Database, versionId: number): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(`UPDATE survey_versions SET status = 'published', published_at = ? WHERE id = ? AND status = 'draft'`)
    .bind(now, versionId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function createDraft(db: D1Database, templateId: number, document: SurveyDocument): Promise<number> {
  const latest = await db.prepare('SELECT MAX(version_number) AS n FROM survey_versions WHERE template_id = ?').bind(templateId).first<{ n: number | null }>();
  const row = await db
    .prepare(`INSERT INTO survey_versions (template_id, version_number, status, document_json) VALUES (?, ?, 'draft', ?) RETURNING id`)
    .bind(templateId, (latest?.n ?? 0) + 1, JSON.stringify(document))
    .first<{ id: number }>();
  if (!row) throw new Error('Could not create a draft.');
  return row.id;
}

export type PublishedVersion = VersionRow & { template_name: string; category_name: string; anonymity: 'anonymous' | 'identified'; template_description: string };

export async function listPublishedVersions(db: D1Database): Promise<PublishedVersion[]> {
  const { results } = await db
    .prepare(
      `SELECT v.id, v.template_id, v.version_number, v.status, v.document_json, v.published_at,
              t.name AS template_name, t.category_name, t.anonymity, t.description AS template_description
       FROM survey_versions v
       JOIN survey_templates t ON t.id = v.template_id
       WHERE v.status = 'published' AND t.archived = 0
       ORDER BY t.name, v.version_number DESC`,
    )
    .all<PublishedVersion>();
  return results;
}

export async function listAssignments(db: D1Database, eventId: number): Promise<AssignmentRow[]> {
  const { results } = await db
    .prepare(`SELECT ${ASSIGNMENT_COLUMNS} FROM assignments WHERE event_id = ? ORDER BY id DESC`)
    .bind(eventId)
    .all<AssignmentRow>();
  return results;
}

export async function getAssignment(db: D1Database, id: number): Promise<AssignmentRow | null> {
  return db.prepare(`SELECT ${ASSIGNMENT_COLUMNS} FROM assignments WHERE id = ?`).bind(id).first<AssignmentRow>();
}

export async function getAssignmentByPublicId(db: D1Database, publicId: string): Promise<AssignmentRow | null> {
  return db.prepare(`SELECT ${ASSIGNMENT_COLUMNS} FROM assignments WHERE public_id = ?`).bind(publicId).first<AssignmentRow>();
}

export type NewAssignment = {
  publicId: string;
  eventId: number;
  versionId: number;
  templateId: number;
  sessionId: number | null;
  title: string;
  description: string;
  category: string;
  programId: number | null;
  anonymity: string;
  required: boolean;
  expectedCount: number | null;
  rulesJson: string;
  document: SurveyDocument;
};

export async function insertAssignments(db: D1Database, rows: NewAssignment[]): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  await db.batch(
    rows.map((row) =>
      db
        .prepare(
          `INSERT INTO assignments (
             public_id, event_id, version_id, template_id, session_id, title, description, category_name, program_id,
             anonymity, required_flag, expected_count, open_rule_json, rendered_json, publication, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        )
        .bind(
          row.publicId,
          row.eventId,
          row.versionId,
          row.templateId,
          row.sessionId,
          row.title,
          row.description,
          row.category,
          row.programId,
          row.anonymity,
          row.required ? 1 : 0,
          row.expectedCount,
          row.rulesJson,
          JSON.stringify(row.document),
          now,
          now,
        ),
    ),
  );
}

export async function updateAssignmentMeta(
  db: D1Database,
  id: number,
  input: { title: string; description: string; category: string; programId: number | null; expectedCount: number | null; required: boolean },
): Promise<void> {
  await db
    .prepare(
      `UPDATE assignments
       SET title = ?, description = ?, category_name = ?, program_id = ?, expected_count = ?, required_flag = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(input.title, input.description, input.category, input.programId, input.expectedCount, input.required ? 1 : 0, new Date().toISOString(), id)
    .run();
}

export async function updateAssignmentRules(db: D1Database, id: number, rulesJson: string): Promise<void> {
  await db
    .prepare(
      `UPDATE assignments
       SET open_rule_json = ?, schedule_override = 0, override_open_at = NULL, override_close_at = NULL, manual_state = NULL, updated_at = ?
       WHERE id = ?`,
    )
    .bind(rulesJson, new Date().toISOString(), id)
    .run();
}

export async function publishAssignment(db: D1Database, id: number): Promise<void> {
  await db.prepare(`UPDATE assignments SET publication = 'published', updated_at = ? WHERE id = ? AND publication = 'draft'`).bind(new Date().toISOString(), id).run();
}

export async function setManualState(db: D1Database, id: number, state: 'open' | 'closed' | null, publish: boolean): Promise<void> {
  await db
    .prepare(
      `UPDATE assignments
       SET manual_state = ?, publication = CASE WHEN ? = 1 AND publication = 'draft' THEN 'published' ELSE publication END, updated_at = ?
       WHERE id = ? AND publication != 'archived'`,
    )
    .bind(state, publish ? 1 : 0, new Date().toISOString(), id)
    .run();
}

export async function extendAssignment(db: D1Database, id: number, openAt: string | null, closeAt: string): Promise<void> {
  await db
    .prepare(
      `UPDATE assignments
       SET schedule_override = 1, override_open_at = ?, override_close_at = ?, manual_state = NULL,
           publication = CASE WHEN publication = 'draft' THEN 'published' ELSE publication END, updated_at = ?
       WHERE id = ? AND publication != 'archived'`,
    )
    .bind(openAt, closeAt, new Date().toISOString(), id)
    .run();
}

export async function archiveAssignment(db: D1Database, id: number): Promise<void> {
  await db.prepare(`UPDATE assignments SET publication = 'archived', manual_state = NULL, updated_at = ? WHERE id = ?`).bind(new Date().toISOString(), id).run();
}

export async function reopenAssignment(db: D1Database, id: number): Promise<void> {
  await db
    .prepare(`UPDATE assignments SET publication = 'published', manual_state = 'open', updated_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), id)
    .run();
}

export async function responseCounts(db: D1Database, eventId: number): Promise<Map<number, number>> {
  const { results } = await db
    .prepare(
      `SELECT r.assignment_id AS id, COUNT(*) AS n
       FROM responses r
       JOIN assignments a ON a.id = r.assignment_id
       WHERE a.event_id = ?
       GROUP BY r.assignment_id`,
    )
    .bind(eventId)
    .all<{ id: number; n: number }>();
  return new Map(results.map((row) => [row.id, row.n]));
}

export async function countResponses(db: D1Database, assignmentId: number): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM responses WHERE assignment_id = ?').bind(assignmentId).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function guardExists(db: D1Database, assignmentId: number, guardHash: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS ok FROM submission_guards WHERE assignment_id = ? AND guard_hash = ?').bind(assignmentId, guardHash).first();
  return Boolean(row);
}

export async function saveResponse(db: D1Database, assignmentId: number, submittedOn: string, guardHash: string, answers: AnswerMapEntries): Promise<void> {
  const responseId = crypto.randomUUID();
  const statements = [
    db.prepare('INSERT INTO submission_guards (assignment_id, guard_hash) VALUES (?, ?)').bind(assignmentId, guardHash),
    db.prepare('INSERT INTO responses (id, assignment_id, submitted_on) VALUES (?, ?, ?)').bind(responseId, assignmentId, submittedOn),
    ...answers.map((answer) =>
      db.prepare('INSERT INTO answers (response_id, question_id, value_json) VALUES (?, ?, ?)').bind(responseId, answer.questionId, JSON.stringify(answer.value)),
    ),
  ];
  await db.batch(statements);
}

type AnswerMapEntries = { questionId: string; value: StoredAnswer }[];

export async function listResponseGroups(db: D1Database, assignmentId: number): Promise<ResponseGroup[]> {
  const responses = await db.prepare('SELECT id, submitted_on FROM responses WHERE assignment_id = ?').bind(assignmentId).all<{ id: string; submitted_on: string }>();
  if (responses.results.length === 0) return [];
  const answers = await db
    .prepare(
      `SELECT a.response_id, a.question_id, a.value_json
       FROM answers a
       JOIN responses r ON r.id = a.response_id
       WHERE r.assignment_id = ?`,
    )
    .bind(assignmentId)
    .all<{ response_id: string; question_id: string; value_json: string }>();
  const grouped = new Map<string, ResponseGroup>();
  for (const response of responses.results) grouped.set(response.id, { id: response.id, submittedOn: response.submitted_on, answers: {} });
  for (const answer of answers.results) {
    const group = grouped.get(answer.response_id);
    if (group) group.answers[answer.question_id] = JSON.parse(answer.value_json) as StoredAnswer;
  }
  return [...grouped.values()];
}

export async function writeAudit(db: D1Database, actor: string, eventType: string, entityType: string, entityId: string, detail: string): Promise<void> {
  await db
    .prepare('INSERT INTO audit_log (actor, event_type, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(actor, eventType, entityType, entityId, detail.slice(0, 400))
    .run();
}
