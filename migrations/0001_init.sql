CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  small_group_threshold INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE programs (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  UNIQUE (event_id, short_name)
);

CREATE TABLE survey_categories (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE (event_id, name)
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  program_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  activity_type TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_sessions_event ON sessions (event_id, starts_at);

CREATE TABLE session_instructors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_session_instructors_session ON session_instructors (session_id, sort_order);

CREATE TABLE survey_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_name TEXT NOT NULL,
  anonymity TEXT NOT NULL DEFAULT 'anonymous',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE survey_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  document_json TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (template_id, version_number)
);

CREATE INDEX idx_versions_template ON survey_versions (template_id, version_number);

CREATE TABLE assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  event_id INTEGER NOT NULL,
  version_id INTEGER NOT NULL,
  template_id INTEGER NOT NULL,
  session_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_name TEXT NOT NULL,
  program_id INTEGER,
  anonymity TEXT NOT NULL,
  required_flag INTEGER NOT NULL DEFAULT 0,
  expected_count INTEGER,
  open_rule_json TEXT NOT NULL,
  schedule_override INTEGER NOT NULL DEFAULT 0,
  override_open_at TEXT,
  override_close_at TEXT,
  publication TEXT NOT NULL DEFAULT 'draft',
  manual_state TEXT,
  rendered_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_assignments_event ON assignments (event_id);
CREATE INDEX idx_assignments_session ON assignments (session_id);
CREATE INDEX idx_assignments_template ON assignments (template_id, session_id);

CREATE TABLE responses (
  id TEXT PRIMARY KEY,
  assignment_id INTEGER NOT NULL,
  submitted_on TEXT NOT NULL
);

CREATE INDEX idx_responses_assignment ON responses (assignment_id);

CREATE TABLE answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  value_json TEXT NOT NULL
);

CREATE INDEX idx_answers_response ON answers (response_id);

CREATE TABLE submission_guards (
  assignment_id INTEGER NOT NULL,
  guard_hash TEXT NOT NULL,
  PRIMARY KEY (assignment_id, guard_hash)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id);
