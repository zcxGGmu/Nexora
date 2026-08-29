CREATE TABLE IF NOT EXISTS connector_quarantines (
  id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  connector_id TEXT NOT NULL,
  connector_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'released')),
  reason TEXT NOT NULL,
  quarantined_by TEXT NOT NULL,
  released_by TEXT,
  release_reason TEXT,
  released_at TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  CHECK ((status = 'active' AND released_by IS NULL AND release_reason IS NULL AND released_at IS NULL) OR (status = 'released' AND released_by IS NOT NULL AND release_reason IS NOT NULL AND released_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_quarantines_active ON connector_quarantines(workspace_id, connector_id, connector_version) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_connector_quarantines_connector ON connector_quarantines(workspace_id, connector_id, connector_version, status);
