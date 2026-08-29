DROP TRIGGER IF EXISTS events_no_update;
DROP TRIGGER IF EXISTS events_no_delete;
DROP INDEX IF EXISTS idx_events_run_sequence;
DROP INDEX IF EXISTS idx_events_run_event_id;

ALTER TABLE events RENAME TO events_c14_old;

CREATE TABLE events (
  event_id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  run_id TEXT,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  attempt_id TEXT,
  step_id TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  UNIQUE (workspace_id, event_id),
  UNIQUE (workspace_id, run_id, sequence),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id)
);

INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version)
SELECT event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version
FROM events_c14_old;

DROP TABLE events_c14_old;

CREATE INDEX IF NOT EXISTS idx_events_run_sequence ON events(workspace_id, run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_events_run_event_id ON events(workspace_id, run_id, event_id);
CREATE INDEX IF NOT EXISTS idx_events_workspace_type ON events(workspace_id, event_type, sequence);

CREATE TRIGGER IF NOT EXISTS events_no_update
BEFORE UPDATE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS events_no_delete
BEFORE DELETE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  workflow_id TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  timezone TEXT NOT NULL,
  next_fire_at TEXT,
  last_fire_at TEXT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS schedule_occurrences (
  id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  schedule_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  fired_at TEXT NOT NULL,
  run_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('enqueued', 'skipped_overlap', 'blocked_policy', 'failed_enqueue')),
  dedupe_key TEXT NOT NULL,
  schedule_revision INTEGER NOT NULL CHECK (schedule_revision > 0),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, dedupe_key),
  CHECK ((status = 'enqueued' AND run_id IS NOT NULL) OR (status IN ('skipped_overlap', 'blocked_policy', 'failed_enqueue') AND run_id IS NULL)),
  FOREIGN KEY (workspace_id, schedule_id) REFERENCES schedules(workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules(workspace_id, enabled, next_fire_at);
CREATE INDEX IF NOT EXISTS idx_schedule_occurrences_schedule ON schedule_occurrences(workspace_id, schedule_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_schedule_occurrences_run ON schedule_occurrences(workspace_id, run_id);
