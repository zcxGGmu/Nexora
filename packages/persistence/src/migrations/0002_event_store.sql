CREATE TABLE IF NOT EXISTS events (
  event_id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  run_id TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS projection_checkpoints (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  run_id TEXT NOT NULL,
  projection_name TEXT NOT NULL,
  last_sequence INTEGER NOT NULL CHECK (last_sequence >= -1),
  last_event_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('ready', 'degraded')),
  error_code TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, run_id, projection_name),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_events_run_sequence ON events(workspace_id, run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_events_run_event_id ON events(workspace_id, run_id, event_id);
CREATE INDEX IF NOT EXISTS idx_projection_lag ON projection_checkpoints(workspace_id, run_id, status, last_sequence);

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
