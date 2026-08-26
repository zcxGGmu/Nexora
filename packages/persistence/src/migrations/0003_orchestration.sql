CREATE TABLE IF NOT EXISTS queue_jobs (
  id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'leased', 'completed', 'failed', 'cancel_requested', 'cancelled', 'cancel_unknown')),
  available_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL CHECK (max_attempts > 0 AND max_attempts <= 3),
  fencing_token INTEGER NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
  lease_id TEXT,
  last_error_code TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, step_id) REFERENCES steps(workspace_id, id)
);

CREATE TABLE IF NOT EXISTS leases (
  lease_id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  job_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'released')),
  heartbeat_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, lease_id),
  FOREIGN KEY (workspace_id, job_id) REFERENCES queue_jobs(workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, step_id) REFERENCES steps(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_queue_jobs_claim ON queue_jobs(status, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_run ON queue_jobs(workspace_id, run_id, step_id);
CREATE INDEX IF NOT EXISTS idx_leases_expiry ON leases(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_leases_step ON leases(workspace_id, step_id, fencing_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leases_active_step ON leases(workspace_id, step_id) WHERE status = 'active';
