CREATE TABLE IF NOT EXISTS runtime_descriptors (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hermes', 'openclaw', 'claude', 'codex', 'antigravity', 'deterministic', 'local', 'remote')),
  descriptor_version TEXT NOT NULL,
  requested_version TEXT,
  actual_version TEXT,
  requested_provider TEXT,
  actual_provider TEXT,
  protocol_version INTEGER NOT NULL CHECK (protocol_version = 1),
  capabilities_json TEXT NOT NULL,
  health TEXT NOT NULL CHECK (health IN ('unknown', 'healthy', 'degraded', 'offline')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  execution_location TEXT NOT NULL CHECK (execution_location IN ('local', 'remote')),
  endpoint_ref TEXT,
  provider TEXT,
  data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  last_heartbeat_at TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_runtime_descriptors_workspace_health ON runtime_descriptors(workspace_id, health, enabled);

CREATE TABLE IF NOT EXISTS provider_descriptors (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('nous_portal', 'openrouter', 'openai', 'anthropic', 'google', 'xai', 'ollama', 'custom')),
  health TEXT NOT NULL CHECK (health IN ('unknown', 'healthy', 'degraded', 'offline')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  region TEXT NOT NULL,
  model_ids_json TEXT NOT NULL,
  endpoint_ref TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_provider_descriptors_workspace_health ON provider_descriptors(workspace_id, health, enabled);

CREATE TABLE IF NOT EXISTS model_descriptors (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  context_window INTEGER NOT NULL CHECK (context_window > 0),
  cost_input REAL NOT NULL CHECK (cost_input >= 0),
  cost_output REAL NOT NULL CHECK (cost_output >= 0),
  health TEXT NOT NULL CHECK (health IN ('unknown', 'healthy', 'degraded', 'offline')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, provider_id) REFERENCES provider_descriptors(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_model_descriptors_workspace_health ON model_descriptors(workspace_id, health, enabled);

CREATE TABLE IF NOT EXISTS backend_descriptors (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('local', 'docker', 'ssh', 'singularity', 'modal', 'daytona', 'vercel_sandbox', 'custom')),
  execution_location TEXT NOT NULL CHECK (execution_location IN ('local', 'remote')),
  capabilities_json TEXT NOT NULL,
  health TEXT NOT NULL CHECK (health IN ('unknown', 'healthy', 'degraded', 'offline')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  endpoint_ref TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_backend_descriptors_workspace_health ON backend_descriptors(workspace_id, health, enabled);

CREATE TABLE IF NOT EXISTS tool_descriptors (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('builtin', 'connector', 'mcp')),
  descriptor_version TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('R0', 'R1', 'R2', 'R3')),
  data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  health TEXT NOT NULL CHECK (health IN ('unknown', 'healthy', 'degraded', 'offline')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  requires_review INTEGER NOT NULL CHECK (requires_review IN (0, 1)),
  endpoint_ref TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_tool_descriptors_workspace_health ON tool_descriptors(workspace_id, health, enabled);
