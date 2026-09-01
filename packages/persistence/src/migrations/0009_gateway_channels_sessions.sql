CREATE TABLE IF NOT EXISTS gateways (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hermes', 'openclaw', 'custom')),
  descriptor_version TEXT NOT NULL,
  requested_version TEXT,
  actual_version TEXT,
  protocol_version INTEGER NOT NULL CHECK (protocol_version = 1),
  capabilities_json TEXT NOT NULL,
  health TEXT NOT NULL CHECK (health IN ('unknown', 'healthy', 'degraded', 'offline')),
  status TEXT NOT NULL CHECK (status IN ('registered', 'connecting', 'connected', 'paused', 'offline')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  execution_location TEXT NOT NULL CHECK (execution_location IN ('local', 'remote')),
  endpoint_ref TEXT CHECK (endpoint_ref IS NULL OR endpoint_ref GLOB 'secret://*'),
  data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  last_heartbeat_at TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_gateways_workspace_status ON gateways(workspace_id, status, enabled);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  gateway_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('telegram', 'discord', 'slack', 'whatsapp', 'signal', 'web', 'api', 'custom')),
  descriptor_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('connected', 'degraded', 'offline', 'disabled')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  capabilities_json TEXT NOT NULL,
  credential_ref TEXT CHECK (credential_ref IS NULL OR credential_ref GLOB 'secret://*'),
  endpoint_ref TEXT CHECK (endpoint_ref IS NULL OR endpoint_ref GLOB 'secret://*'),
  allowlist_mode TEXT NOT NULL CHECK (allowlist_mode IN ('deny_by_default', 'allowlist_only')),
  data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, gateway_id) REFERENCES gateways(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_channels_workspace_status ON channels(workspace_id, status, enabled);
CREATE INDEX IF NOT EXISTS idx_channels_gateway ON channels(workspace_id, gateway_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  gateway_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  agent_id TEXT,
  run_id TEXT,
  external_session_ref TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('foreground', 'background')),
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'closed', 'error')),
  cursor TEXT,
  last_message_id TEXT,
  last_event_at TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, gateway_id) REFERENCES gateways(workspace_id, id),
  FOREIGN KEY (workspace_id, channel_id) REFERENCES channels(workspace_id, id),
  FOREIGN KEY (workspace_id, agent_id) REFERENCES agents(workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_workspace_status ON sessions(workspace_id, status, mode);
CREATE INDEX IF NOT EXISTS idx_sessions_channel ON sessions(workspace_id, channel_id, updated_at);

CREATE TABLE IF NOT EXISTS session_messages (
  message_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'accepted', 'delivered', 'failed', 'replayed')),
  idempotency_key TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  cursor TEXT,
  occurred_at TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  sender_ref TEXT,
  recipient_ref TEXT,
  content_json TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('text', 'json', 'binary_ref')),
  content_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, message_id),
  UNIQUE (workspace_id, session_id, idempotency_key),
  UNIQUE (workspace_id, session_id, message_id),
  UNIQUE (workspace_id, session_id, sequence),
  FOREIGN KEY (workspace_id, session_id) REFERENCES sessions(workspace_id, id),
  FOREIGN KEY (workspace_id, channel_id) REFERENCES channels(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_session_messages_session_sequence ON session_messages(workspace_id, session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_session_messages_session_occurred ON session_messages(workspace_id, session_id, occurred_at);

CREATE TABLE IF NOT EXISTS delivery_receipts (
  receipt_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'unknown', 'replayed')),
  provider_receipt_ref TEXT,
  delivered_at TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, receipt_id),
  UNIQUE (workspace_id, message_id, idempotency_key),
  FOREIGN KEY (workspace_id, session_id) REFERENCES sessions(workspace_id, id),
  FOREIGN KEY (workspace_id, message_id) REFERENCES session_messages(workspace_id, message_id),
  FOREIGN KEY (workspace_id, session_id, message_id) REFERENCES session_messages(workspace_id, session_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_receipts_message ON delivery_receipts(workspace_id, message_id, created_at);

CREATE TABLE IF NOT EXISTS channel_allowlist (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'channel', 'thread')),
  subject_ref TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny')),
  reason TEXT NOT NULL,
  expires_at TEXT,
  created_by TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, channel_id, subject_type, subject_ref),
  FOREIGN KEY (workspace_id, channel_id) REFERENCES channels(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_channel_allowlist_subject ON channel_allowlist(workspace_id, channel_id, subject_type, subject_ref, decision);

CREATE TABLE IF NOT EXISTS session_cursor_checkpoints (
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  cursor TEXT NOT NULL,
  message_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, session_id),
  FOREIGN KEY (workspace_id, session_id) REFERENCES sessions(workspace_id, id),
  FOREIGN KEY (workspace_id, session_id, message_id) REFERENCES session_messages(workspace_id, session_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_session_cursor_checkpoints_updated ON session_cursor_checkpoints(workspace_id, updated_at);
