CREATE TABLE IF NOT EXISTS egress_receipts (
  id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  execution_location TEXT NOT NULL CHECK (execution_location IN ('local', 'remote')),
  provider TEXT NOT NULL,
  region TEXT NOT NULL,
  data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  redaction_count INTEGER NOT NULL CHECK (redaction_count >= 0),
  snapshot_hash TEXT NOT NULL,
  policy_decision_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, attempt_id) REFERENCES attempts(workspace_id, id),
  FOREIGN KEY (workspace_id, step_id) REFERENCES steps(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_egress_receipts_run ON egress_receipts(workspace_id, run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_egress_receipts_location ON egress_receipts(workspace_id, execution_location, provider, region);
