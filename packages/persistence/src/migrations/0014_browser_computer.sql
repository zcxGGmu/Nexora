CREATE TABLE IF NOT EXISTS browser_computer_sandbox_policies (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  network_mode TEXT NOT NULL CHECK (network_mode = 'deny_by_default'),
  filesystem_mode TEXT NOT NULL CHECK (filesystem_mode = 'deny'),
  clipboard_mode TEXT NOT NULL CHECK (clipboard_mode = 'deny'),
  credential_mode TEXT NOT NULL CHECK (credential_mode = 'deny'),
  automation_mode TEXT NOT NULL CHECK (automation_mode = 'approval_required'),
  allowed_target_kinds_json TEXT NOT NULL CHECK (json_valid(allowed_target_kinds_json)),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS browser_computer_sessions (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  gateway_session_id TEXT NOT NULL,
  sandbox_policy_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('browser', 'computer')),
  platform TEXT CHECK (platform IS NULL OR platform IN ('macos', 'linux', 'windows')),
  mode TEXT NOT NULL CHECK (mode IN ('foreground', 'background')),
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'stopped', 'takeover_requested', 'error')),
  current_target_ref TEXT,
  display_ref TEXT,
  active_app_ref TEXT,
  last_screenshot_id TEXT,
  takeover_by TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK ((kind = 'browser' AND platform IS NULL AND display_ref IS NULL) OR (kind = 'computer' AND platform IS NOT NULL AND current_target_ref IS NULL AND display_ref IS NOT NULL)),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, gateway_session_id) REFERENCES sessions(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, sandbox_policy_id) REFERENCES browser_computer_sandbox_policies(workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS browser_computer_allowlist (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('browser_url', 'computer_app')),
  target_ref TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny')),
  reason TEXT NOT NULL,
  expires_at TEXT,
  created_by TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, session_id, target_kind, target_ref),
  FOREIGN KEY (workspace_id, session_id) REFERENCES browser_computer_sessions(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS browser_computer_action_intents (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  action_kind TEXT NOT NULL CHECK (action_kind IN ('navigate', 'click', 'type', 'scroll', 'screenshot', 'app_focus')),
  target_ref TEXT NOT NULL,
  input_summary TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('R0', 'R1', 'R2', 'R3')),
  approval_id TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_approval', 'approved', 'policy_denied', 'completed', 'failed')),
  payload_hash TEXT NOT NULL,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, session_id, id),
  UNIQUE (workspace_id, session_id, idempotency_key),
  FOREIGN KEY (workspace_id, session_id) REFERENCES browser_computer_sessions(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS browser_computer_human_approvals (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  action_intent_id TEXT NOT NULL,
  action_payload_hash TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'denied')),
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, session_id, action_intent_id),
  FOREIGN KEY (workspace_id, session_id) REFERENCES browser_computer_sessions(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, session_id, action_intent_id) REFERENCES browser_computer_action_intents(workspace_id, session_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS browser_computer_action_receipts (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  action_intent_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('policy_denied', 'completed', 'failed', 'acknowledged')),
  result_ref TEXT,
  screenshot_id TEXT,
  error_code TEXT,
  error_message TEXT,
  external_effect INTEGER NOT NULL DEFAULT 0 CHECK (external_effect = 0),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, session_id) REFERENCES browser_computer_sessions(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, session_id, action_intent_id) REFERENCES browser_computer_action_intents(workspace_id, session_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS browser_computer_screenshot_receipts (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  action_intent_id TEXT NOT NULL,
  image_ref TEXT NOT NULL,
  viewport_width INTEGER NOT NULL CHECK (viewport_width > 0 AND viewport_width <= 16384),
  viewport_height INTEGER NOT NULL CHECK (viewport_height > 0 AND viewport_height <= 16384),
  image_hash TEXT NOT NULL,
  redacted INTEGER NOT NULL CHECK (redacted = 1),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, session_id) REFERENCES browser_computer_sessions(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, session_id, action_intent_id) REFERENCES browser_computer_action_intents(workspace_id, session_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_c23_sessions_workspace_status ON browser_computer_sessions(workspace_id, status, kind);
CREATE INDEX IF NOT EXISTS idx_c23_allowlist_session ON browser_computer_allowlist(workspace_id, session_id, target_kind, target_ref);
CREATE INDEX IF NOT EXISTS idx_c23_action_intents_session ON browser_computer_action_intents(workspace_id, session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_c23_action_receipts_session ON browser_computer_action_receipts(workspace_id, session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_c23_screenshot_receipts_session ON browser_computer_screenshot_receipts(workspace_id, session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_c23_human_approvals_session ON browser_computer_human_approvals(workspace_id, session_id, action_intent_id);

CREATE TRIGGER IF NOT EXISTS c23_sandbox_allowed_target_kinds_insert
BEFORE INSERT ON browser_computer_sandbox_policies
WHEN json_type(NEW.allowed_target_kinds_json) != 'array'
  OR json_array_length(NEW.allowed_target_kinds_json) < 1
  OR json_array_length(NEW.allowed_target_kinds_json) > 8
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.allowed_target_kinds_json)
    WHERE type != 'text' OR value NOT IN ('browser_url', 'computer_app')
  )
BEGIN SELECT RAISE(ABORT, 'browser computer sandbox target kinds are invalid'); END;

CREATE TRIGGER IF NOT EXISTS c23_sessions_gateway_scope_insert
BEFORE INSERT ON browser_computer_sessions
WHEN NOT EXISTS (
  SELECT 1 FROM sessions gateway_session
  WHERE gateway_session.workspace_id = NEW.workspace_id
    AND gateway_session.id = NEW.gateway_session_id
    AND gateway_session.run_id = NEW.run_id
)
BEGIN SELECT RAISE(ABORT, 'browser computer session must match gateway session scope'); END;

CREATE TRIGGER IF NOT EXISTS c23_sessions_payload_json_insert
BEFORE INSERT ON browser_computer_sessions
WHEN COALESCE(json_extract(NEW.payload_json, '$.id'), '') != NEW.id
  OR COALESCE(json_extract(NEW.payload_json, '$.workspace_id'), '') != NEW.workspace_id
  OR COALESCE(json_extract(NEW.payload_json, '$.run_id'), '') != NEW.run_id
  OR COALESCE(json_extract(NEW.payload_json, '$.gateway_session_id'), '') != NEW.gateway_session_id
  OR COALESCE(json_extract(NEW.payload_json, '$.sandbox_policy_id'), '') != NEW.sandbox_policy_id
  OR COALESCE(json_extract(NEW.payload_json, '$.name'), '') != NEW.name
  OR COALESCE(json_extract(NEW.payload_json, '$.kind'), '') != NEW.kind
  OR COALESCE(json_extract(NEW.payload_json, '$.platform'), '') != COALESCE(NEW.platform, '')
  OR COALESCE(json_extract(NEW.payload_json, '$.mode'), '') != NEW.mode
  OR COALESCE(json_extract(NEW.payload_json, '$.status'), '') != NEW.status
  OR COALESCE(json_extract(NEW.payload_json, '$.current_target_ref'), '') != COALESCE(NEW.current_target_ref, '')
  OR COALESCE(json_extract(NEW.payload_json, '$.display_ref'), '') != COALESCE(NEW.display_ref, '')
  OR COALESCE(json_extract(NEW.payload_json, '$.active_app_ref'), '') != COALESCE(NEW.active_app_ref, '')
  OR COALESCE(json_extract(NEW.payload_json, '$.last_screenshot_id'), '') != COALESCE(NEW.last_screenshot_id, '')
  OR COALESCE(json_extract(NEW.payload_json, '$.takeover_by'), '') != COALESCE(NEW.takeover_by, '')
  OR COALESCE(json_extract(NEW.payload_json, '$.descriptor_only'), 0) != 1
  OR COALESCE(json_extract(NEW.payload_json, '$.revision'), -1) != NEW.version
  OR COALESCE(json_extract(NEW.payload_json, '$.schema_version'), -1) != NEW.schema_version
BEGIN SELECT RAISE(ABORT, 'browser computer session payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c23_sandbox_policies_payload_json_insert
BEFORE INSERT ON browser_computer_sandbox_policies
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.name') IS NOT NEW.name
  OR json_extract(NEW.payload_json, '$.network_mode') IS NOT NEW.network_mode
  OR json_extract(NEW.payload_json, '$.filesystem_mode') IS NOT NEW.filesystem_mode
  OR json_extract(NEW.payload_json, '$.clipboard_mode') IS NOT NEW.clipboard_mode
  OR json_extract(NEW.payload_json, '$.credential_mode') IS NOT NEW.credential_mode
  OR json_extract(NEW.payload_json, '$.automation_mode') IS NOT NEW.automation_mode
  OR json_extract(NEW.payload_json, '$.allowed_target_kinds') IS NOT json(NEW.allowed_target_kinds_json)
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'browser computer sandbox policy payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c23_allowlist_payload_json_insert
BEFORE INSERT ON browser_computer_allowlist
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.session_id') IS NOT NEW.session_id
  OR json_extract(NEW.payload_json, '$.target_kind') IS NOT NEW.target_kind
  OR json_extract(NEW.payload_json, '$.target_ref') IS NOT NEW.target_ref
  OR json_extract(NEW.payload_json, '$.decision') IS NOT NEW.decision
  OR json_extract(NEW.payload_json, '$.reason') IS NOT NEW.reason
  OR json_extract(NEW.payload_json, '$.expires_at') IS NOT NEW.expires_at
  OR json_extract(NEW.payload_json, '$.created_by') IS NOT NEW.created_by
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'browser computer allowlist payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_intents_payload_json_insert
BEFORE INSERT ON browser_computer_action_intents
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.session_id') IS NOT NEW.session_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.action_kind') IS NOT NEW.action_kind
  OR json_extract(NEW.payload_json, '$.target_ref') IS NOT NEW.target_ref
  OR json_extract(NEW.payload_json, '$.input_summary') IS NOT NEW.input_summary
  OR json_extract(NEW.payload_json, '$.risk_level') IS NOT NEW.risk_level
  OR json_extract(NEW.payload_json, '$.approval_id') IS NOT NEW.approval_id
  OR json_extract(NEW.payload_json, '$.idempotency_key') IS NOT NEW.idempotency_key
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'browser computer action intent payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c23_human_approvals_payload_json_insert
BEFORE INSERT ON browser_computer_human_approvals
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.session_id') IS NOT NEW.session_id
  OR json_extract(NEW.payload_json, '$.action_intent_id') IS NOT NEW.action_intent_id
  OR json_extract(NEW.payload_json, '$.action_payload_hash') IS NOT NEW.action_payload_hash
  OR json_extract(NEW.payload_json, '$.decision') IS NOT NEW.decision
  OR json_extract(NEW.payload_json, '$.decided_by') IS NOT NEW.decided_by
  OR json_extract(NEW.payload_json, '$.decided_at') IS NOT NEW.decided_at
  OR json_extract(NEW.payload_json, '$.reason') IS NOT NEW.reason
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'browser computer human approval payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_receipts_payload_json_insert
BEFORE INSERT ON browser_computer_action_receipts
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.session_id') IS NOT NEW.session_id
  OR json_extract(NEW.payload_json, '$.action_intent_id') IS NOT NEW.action_intent_id
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.result_ref') IS NOT NEW.result_ref
  OR json_extract(NEW.payload_json, '$.screenshot_id') IS NOT NEW.screenshot_id
  OR json_extract(NEW.payload_json, '$.error_code') IS NOT NEW.error_code
  OR json_extract(NEW.payload_json, '$.error_message') IS NOT NEW.error_message
  OR json_extract(NEW.payload_json, '$.external_effect') IS NOT NEW.external_effect
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'browser computer action receipt payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c23_screenshot_receipts_payload_json_insert
BEFORE INSERT ON browser_computer_screenshot_receipts
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.session_id') IS NOT NEW.session_id
  OR json_extract(NEW.payload_json, '$.action_intent_id') IS NOT NEW.action_intent_id
  OR json_extract(NEW.payload_json, '$.image_ref') IS NOT NEW.image_ref
  OR json_extract(NEW.payload_json, '$.viewport_width') IS NOT NEW.viewport_width
  OR json_extract(NEW.payload_json, '$.viewport_height') IS NOT NEW.viewport_height
  OR json_extract(NEW.payload_json, '$.image_hash') IS NOT NEW.image_hash
  OR json_extract(NEW.payload_json, '$.redacted') IS NOT NEW.redacted
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'browser computer screenshot receipt payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c23_sandbox_payload_secret_shape_insert
BEFORE INSERT ON browser_computer_sandbox_policies
WHEN lower(NEW.payload_json) LIKE '%sk-live-%'
  OR lower(NEW.payload_json) LIKE '%sk-proj-%'
  OR lower(NEW.payload_json) LIKE '%sk-test-%'
  OR lower(NEW.payload_json) LIKE '%sk-ant-%'
  OR lower(NEW.payload_json) LIKE '%xoxa-%'
  OR lower(NEW.payload_json) LIKE '%xoxb-%'
  OR lower(NEW.payload_json) LIKE '%xoxp-%'
  OR lower(NEW.payload_json) LIKE '%xoxr-%'
  OR lower(NEW.payload_json) LIKE '%xoxs-%'
  OR lower(NEW.payload_json) LIKE '%ghp_%'
  OR lower(NEW.payload_json) LIKE '%gho_%'
  OR lower(NEW.payload_json) LIKE '%ghu_%'
  OR lower(NEW.payload_json) LIKE '%ghs_%'
  OR lower(NEW.payload_json) LIKE '%ghr_%'
  OR lower(NEW.payload_json) LIKE '%eyj%.%.%'
  OR lower(NEW.payload_json) LIKE '%akia%'
  OR lower(NEW.payload_json) LIKE '%asia%'
  OR lower(NEW.payload_json) LIKE '%aiza%'
BEGIN SELECT RAISE(ABORT, 'browser computer secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c23_allowlist_payload_secret_shape_insert
BEFORE INSERT ON browser_computer_allowlist
WHEN lower(NEW.payload_json) LIKE '%sk-live-%'
  OR lower(NEW.payload_json) LIKE '%sk-proj-%'
  OR lower(NEW.payload_json) LIKE '%sk-test-%'
  OR lower(NEW.payload_json) LIKE '%sk-ant-%'
  OR lower(NEW.payload_json) LIKE '%xoxa-%'
  OR lower(NEW.payload_json) LIKE '%xoxb-%'
  OR lower(NEW.payload_json) LIKE '%xoxp-%'
  OR lower(NEW.payload_json) LIKE '%xoxr-%'
  OR lower(NEW.payload_json) LIKE '%xoxs-%'
  OR lower(NEW.payload_json) LIKE '%ghp_%'
  OR lower(NEW.payload_json) LIKE '%gho_%'
  OR lower(NEW.payload_json) LIKE '%ghu_%'
  OR lower(NEW.payload_json) LIKE '%ghs_%'
  OR lower(NEW.payload_json) LIKE '%ghr_%'
  OR lower(NEW.payload_json) LIKE '%eyj%.%.%'
  OR lower(NEW.payload_json) LIKE '%akia%'
  OR lower(NEW.payload_json) LIKE '%asia%'
  OR lower(NEW.payload_json) LIKE '%aiza%'
BEGIN SELECT RAISE(ABORT, 'browser computer secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_intents_payload_secret_shape_insert
BEFORE INSERT ON browser_computer_action_intents
WHEN lower(NEW.payload_json) LIKE '%sk-live-%'
  OR lower(NEW.payload_json) LIKE '%sk-proj-%'
  OR lower(NEW.payload_json) LIKE '%sk-test-%'
  OR lower(NEW.payload_json) LIKE '%sk-ant-%'
  OR lower(NEW.payload_json) LIKE '%xoxa-%'
  OR lower(NEW.payload_json) LIKE '%xoxb-%'
  OR lower(NEW.payload_json) LIKE '%xoxp-%'
  OR lower(NEW.payload_json) LIKE '%xoxr-%'
  OR lower(NEW.payload_json) LIKE '%xoxs-%'
  OR lower(NEW.payload_json) LIKE '%ghp_%'
  OR lower(NEW.payload_json) LIKE '%gho_%'
  OR lower(NEW.payload_json) LIKE '%ghu_%'
  OR lower(NEW.payload_json) LIKE '%ghs_%'
  OR lower(NEW.payload_json) LIKE '%ghr_%'
  OR lower(NEW.payload_json) LIKE '%eyj%.%.%'
  OR lower(NEW.payload_json) LIKE '%akia%'
  OR lower(NEW.payload_json) LIKE '%asia%'
  OR lower(NEW.payload_json) LIKE '%aiza%'
BEGIN SELECT RAISE(ABORT, 'browser computer secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c23_human_approvals_payload_secret_shape_insert
BEFORE INSERT ON browser_computer_human_approvals
WHEN lower(NEW.payload_json) LIKE '%sk-live-%'
  OR lower(NEW.payload_json) LIKE '%sk-proj-%'
  OR lower(NEW.payload_json) LIKE '%sk-test-%'
  OR lower(NEW.payload_json) LIKE '%sk-ant-%'
  OR lower(NEW.payload_json) LIKE '%xoxa-%'
  OR lower(NEW.payload_json) LIKE '%xoxb-%'
  OR lower(NEW.payload_json) LIKE '%xoxp-%'
  OR lower(NEW.payload_json) LIKE '%xoxr-%'
  OR lower(NEW.payload_json) LIKE '%xoxs-%'
  OR lower(NEW.payload_json) LIKE '%ghp_%'
  OR lower(NEW.payload_json) LIKE '%gho_%'
  OR lower(NEW.payload_json) LIKE '%ghu_%'
  OR lower(NEW.payload_json) LIKE '%ghs_%'
  OR lower(NEW.payload_json) LIKE '%ghr_%'
  OR lower(NEW.payload_json) LIKE '%eyj%.%.%'
  OR lower(NEW.payload_json) LIKE '%akia%'
  OR lower(NEW.payload_json) LIKE '%asia%'
  OR lower(NEW.payload_json) LIKE '%aiza%'
BEGIN SELECT RAISE(ABORT, 'browser computer secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_receipts_payload_secret_shape_insert
BEFORE INSERT ON browser_computer_action_receipts
WHEN lower(NEW.payload_json) LIKE '%sk-live-%'
  OR lower(NEW.payload_json) LIKE '%sk-proj-%'
  OR lower(NEW.payload_json) LIKE '%sk-test-%'
  OR lower(NEW.payload_json) LIKE '%sk-ant-%'
  OR lower(NEW.payload_json) LIKE '%xoxa-%'
  OR lower(NEW.payload_json) LIKE '%xoxb-%'
  OR lower(NEW.payload_json) LIKE '%xoxp-%'
  OR lower(NEW.payload_json) LIKE '%xoxr-%'
  OR lower(NEW.payload_json) LIKE '%xoxs-%'
  OR lower(NEW.payload_json) LIKE '%ghp_%'
  OR lower(NEW.payload_json) LIKE '%gho_%'
  OR lower(NEW.payload_json) LIKE '%ghu_%'
  OR lower(NEW.payload_json) LIKE '%ghs_%'
  OR lower(NEW.payload_json) LIKE '%ghr_%'
  OR lower(NEW.payload_json) LIKE '%eyj%.%.%'
  OR lower(NEW.payload_json) LIKE '%akia%'
  OR lower(NEW.payload_json) LIKE '%asia%'
  OR lower(NEW.payload_json) LIKE '%aiza%'
BEGIN SELECT RAISE(ABORT, 'browser computer secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c23_screenshot_receipts_payload_secret_shape_insert
BEFORE INSERT ON browser_computer_screenshot_receipts
WHEN lower(NEW.payload_json) LIKE '%sk-live-%'
  OR lower(NEW.payload_json) LIKE '%sk-proj-%'
  OR lower(NEW.payload_json) LIKE '%sk-test-%'
  OR lower(NEW.payload_json) LIKE '%sk-ant-%'
  OR lower(NEW.payload_json) LIKE '%xoxa-%'
  OR lower(NEW.payload_json) LIKE '%xoxb-%'
  OR lower(NEW.payload_json) LIKE '%xoxp-%'
  OR lower(NEW.payload_json) LIKE '%xoxr-%'
  OR lower(NEW.payload_json) LIKE '%xoxs-%'
  OR lower(NEW.payload_json) LIKE '%ghp_%'
  OR lower(NEW.payload_json) LIKE '%gho_%'
  OR lower(NEW.payload_json) LIKE '%ghu_%'
  OR lower(NEW.payload_json) LIKE '%ghs_%'
  OR lower(NEW.payload_json) LIKE '%ghr_%'
  OR lower(NEW.payload_json) LIKE '%eyj%.%.%'
  OR lower(NEW.payload_json) LIKE '%akia%'
  OR lower(NEW.payload_json) LIKE '%asia%'
  OR lower(NEW.payload_json) LIKE '%aiza%'
BEGIN SELECT RAISE(ABORT, 'browser computer secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c23_secret_safe_text_insert
BEFORE INSERT ON browser_computer_sandbox_policies
WHEN lower(NEW.name) LIKE '%bearer %'
  OR lower(NEW.name) LIKE '%basic %'
  OR lower(NEW.name) LIKE '%api_key%'
  OR lower(NEW.name) LIKE '%api-key%'
  OR lower(NEW.name) LIKE '%access_token%'
  OR lower(NEW.name) LIKE '%access-token%'
  OR lower(NEW.name) LIKE '%authorization%'
  OR lower(NEW.name) LIKE '%private_key%'
  OR lower(NEW.name) LIKE '%private-key%'
  OR lower(NEW.name) LIKE '%client_secret%'
  OR lower(NEW.name) LIKE '%client-secret%'
  OR lower(NEW.name) LIKE '%refresh_token%'
  OR lower(NEW.name) LIKE '%refresh-token%'
  OR lower(NEW.name) LIKE '%session_token%'
  OR lower(NEW.name) LIKE '%session-token%'
  OR lower(NEW.name) LIKE '%token=%'
  OR lower(NEW.name) LIKE '%password=%'
  OR lower(NEW.name) LIKE '%passwd=%'
  OR lower(NEW.name) LIKE '%pwd=%'
  OR lower(NEW.name) LIKE '%secret://%'
  OR lower(NEW.name) LIKE '%credential:%'
  OR lower(NEW.name) LIKE '%token%3d%'
  OR lower(NEW.name) LIKE '%password%3d%'
  OR lower(NEW.payload_json) LIKE '%bearer %'
  OR lower(NEW.payload_json) LIKE '%api_key%'
  OR lower(NEW.payload_json) LIKE '%api-key%'
  OR lower(NEW.payload_json) LIKE '%access_token%'
  OR lower(NEW.payload_json) LIKE '%access-token%'
  OR lower(NEW.payload_json) LIKE '%authorization%'
  OR lower(NEW.payload_json) LIKE '%client_secret%'
  OR lower(NEW.payload_json) LIKE '%client-secret%'
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%credential:%'
  OR lower(NEW.payload_json) LIKE '%token%3d%'
  OR lower(NEW.payload_json) LIKE '%password%3d%'
BEGIN SELECT RAISE(ABORT, 'browser computer secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c23_session_secret_safe_text_insert
BEFORE INSERT ON browser_computer_sessions
WHEN lower(NEW.name) LIKE '%bearer %'
  OR lower(COALESCE(NEW.takeover_by, '')) LIKE '%bearer %'
  OR lower(NEW.name) LIKE '%api_key%'
  OR lower(COALESCE(NEW.takeover_by, '')) LIKE '%api_key%'
  OR lower(NEW.name) LIKE '%authorization%'
  OR lower(COALESCE(NEW.takeover_by, '')) LIKE '%authorization%'
  OR lower(NEW.name) LIKE '%client_secret%'
  OR lower(COALESCE(NEW.takeover_by, '')) LIKE '%client_secret%'
  OR lower(NEW.name) LIKE '%token=%'
  OR lower(COALESCE(NEW.takeover_by, '')) LIKE '%token=%'
  OR lower(NEW.name) LIKE '%password=%'
  OR lower(COALESCE(NEW.takeover_by, '')) LIKE '%password=%'
  OR lower(NEW.name) LIKE '%secret://%'
  OR lower(COALESCE(NEW.takeover_by, '')) LIKE '%secret://%'
  OR lower(NEW.name) LIKE '%credential:%'
  OR lower(COALESCE(NEW.takeover_by, '')) LIKE '%credential:%'
  OR lower(NEW.payload_json) LIKE '%bearer %'
  OR lower(NEW.payload_json) LIKE '%api_key%'
  OR lower(NEW.payload_json) LIKE '%authorization%'
  OR lower(NEW.payload_json) LIKE '%client_secret%'
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%credential:%'
BEGIN SELECT RAISE(ABORT, 'browser computer secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c23_sessions_target_safe_insert
BEFORE INSERT ON browser_computer_sessions
WHEN (NEW.current_target_ref IS NOT NULL AND NOT (NEW.current_target_ref GLOB 'browser://url/http/?*' OR NEW.current_target_ref GLOB 'browser://url/https/?*'))
  OR (NEW.display_ref IS NOT NULL AND NOT (NEW.display_ref GLOB 'computer://display/?*'))
  OR (NEW.active_app_ref IS NOT NULL AND NOT (NEW.active_app_ref GLOB 'computer://app/?*'))
  OR lower(COALESCE(NEW.current_target_ref, '')) LIKE '%169.254.%'
  OR COALESCE(NEW.current_target_ref, '') GLOB 'browser://url/http/[0-9]*.[0-9]*.[0-9]*.[0-9]*'
  OR COALESCE(NEW.current_target_ref, '') GLOB 'browser://url/https/[0-9]*.[0-9]*.[0-9]*.[0-9]*'
  OR lower(COALESCE(NEW.current_target_ref, '')) LIKE '%/10.%'
  OR lower(COALESCE(NEW.current_target_ref, '')) LIKE '%/127.%'
  OR lower(COALESCE(NEW.current_target_ref, '')) LIKE '%.local%'
  OR lower(COALESCE(NEW.current_target_ref, '')) LIKE '%localhost%'
  OR instr(COALESCE(NEW.current_target_ref, ''), '%') > 0
  OR instr(COALESCE(NEW.current_target_ref, ''), '@') > 0
  OR EXISTS (
    SELECT 1
    FROM (
      SELECT
        target_host,
        target_port,
        substr(target_host, 1, instr(target_host, '.') - 1) AS first_octet,
        substr(substr(target_host, instr(target_host, '.') + 1), 1, instr(substr(target_host, instr(target_host, '.') + 1) || '.', '.') - 1) AS second_octet
      FROM (
        SELECT
          CASE WHEN instr(host_port, ':') > 0 THEN substr(host_port, 1, instr(host_port, ':') - 1) ELSE host_port END AS target_host,
          CASE WHEN instr(host_port, ':') > 0 THEN substr(host_port, instr(host_port, ':') + 1) ELSE NULL END AS target_port
        FROM (
          SELECT substr(locator, 1, instr(locator || '/', '/') - 1) AS host_port
          FROM (
            SELECT replace(replace(
              CASE
                WHEN lower(COALESCE(NEW.current_target_ref, '')) GLOB 'browser://url/http/?*' THEN substr(lower(COALESCE(NEW.current_target_ref, '')), length('browser://url/http/') + 1)
                WHEN lower(COALESCE(NEW.current_target_ref, '')) GLOB 'browser://url/https/?*' THEN substr(lower(COALESCE(NEW.current_target_ref, '')), length('browser://url/https/') + 1)
                ELSE ''
              END,
              '?', '/'
            ), '#', '/') AS locator
          )
        )
      )
    )
    WHERE COALESCE(NEW.current_target_ref, '') GLOB 'browser://url/*'
      AND (
        target_host = ''
        OR target_host GLOB '*[^abcdefghijklmnopqrstuvwxyz0123456789.-]*'
        OR instr(target_host, '.') = 0
        OR target_host LIKE '%..%'
        OR target_host GLOB '-*'
        OR target_host GLOB '*.-*'
        OR target_host GLOB '*-'
        OR target_host = 'localhost'
        OR target_host GLOB '*.localhost'
        OR target_host GLOB '*.local'
        OR (target_port IS NOT NULL AND (target_port = '' OR target_port GLOB '*[^0123456789]*' OR CAST(target_port AS INTEGER) > 65535))
        OR (target_host GLOB '[0-9]*.[0-9]*.[0-9]*.[0-9]*' AND target_host NOT GLOB '*[^0123456789.]*' AND (
          CAST(first_octet AS INTEGER) IN (0, 10, 127)
          OR CAST(first_octet AS INTEGER) >= 224
          OR (CAST(first_octet AS INTEGER) = 100 AND CAST(second_octet AS INTEGER) BETWEEN 64 AND 127)
          OR (CAST(first_octet AS INTEGER) = 169 AND CAST(second_octet AS INTEGER) = 254)
          OR (CAST(first_octet AS INTEGER) = 172 AND CAST(second_octet AS INTEGER) BETWEEN 16 AND 31)
          OR (CAST(first_octet AS INTEGER) = 192 AND CAST(second_octet AS INTEGER) IN (0, 168))
          OR (CAST(first_octet AS INTEGER) = 198 AND CAST(second_octet AS INTEGER) IN (18, 19, 51))
          OR (CAST(first_octet AS INTEGER) = 203 AND CAST(second_octet AS INTEGER) = 0)
        ))
      )
  )
  OR (COALESCE(NEW.current_target_ref, '') GLOB 'browser://url/http/?*' AND instr(substr(COALESCE(NEW.current_target_ref, ''), length('browser://url/http/') + 1), '.') = 0)
  OR (COALESCE(NEW.current_target_ref, '') GLOB 'browser://url/https/?*' AND instr(substr(COALESCE(NEW.current_target_ref, ''), length('browser://url/https/') + 1), '.') = 0)
  OR lower(COALESCE(NEW.current_target_ref, '')) LIKE '%token=%'
  OR lower(COALESCE(NEW.current_target_ref, '')) LIKE '%password=%'
  OR lower(COALESCE(NEW.current_target_ref, '')) LIKE '%secret://%'
  OR lower(COALESCE(NEW.current_target_ref, '')) LIKE '%2e%2e%'
  OR COALESCE(NEW.current_target_ref, '') LIKE '%..%'
  OR instr(COALESCE(NEW.current_target_ref, ''), char(92)) > 0
  OR instr(COALESCE(NEW.current_target_ref, ''), char(173)) > 0
  OR instr(COALESCE(NEW.current_target_ref, ''), char(8203)) > 0
  OR instr(COALESCE(NEW.current_target_ref, ''), char(8204)) > 0
  OR instr(COALESCE(NEW.current_target_ref, ''), char(8205)) > 0
  OR instr(COALESCE(NEW.current_target_ref, ''), char(8288)) > 0
  OR instr(COALESCE(NEW.current_target_ref, ''), char(65279)) > 0
  OR instr(COALESCE(NEW.display_ref, ''), '%') > 0
  OR instr(COALESCE(NEW.active_app_ref, ''), '%') > 0
  OR instr(COALESCE(NEW.display_ref, ''), char(8203)) > 0
  OR instr(COALESCE(NEW.active_app_ref, ''), char(8203)) > 0
BEGIN SELECT RAISE(ABORT, 'browser computer session target rejected by sandbox policy'); END;

CREATE TRIGGER IF NOT EXISTS c23_allowlist_target_safe_insert
BEFORE INSERT ON browser_computer_allowlist
WHEN NOT (
    (NEW.target_kind = 'browser_url' AND (NEW.target_ref GLOB 'browser://url/http/?*' OR NEW.target_ref GLOB 'browser://url/https/?*' OR NEW.target_ref GLOB 'browser://domain/?*'))
    OR (NEW.target_kind = 'computer_app' AND NEW.target_ref GLOB 'computer://app/?*')
  )
  OR lower(NEW.target_ref) LIKE '%169.254.%'
  OR NEW.target_ref GLOB 'browser://url/http/[0-9]*.[0-9]*.[0-9]*.[0-9]*'
  OR NEW.target_ref GLOB 'browser://url/https/[0-9]*.[0-9]*.[0-9]*.[0-9]*'
  OR NEW.target_ref GLOB 'browser://domain/[0-9]*.[0-9]*.[0-9]*.[0-9]*'
  OR lower(NEW.target_ref) LIKE '%/10.%'
  OR lower(NEW.target_ref) LIKE '%/127.%'
  OR lower(NEW.target_ref) LIKE '%.local%'
  OR lower(NEW.target_ref) LIKE '%localhost%'
  OR instr(NEW.target_ref, '%') > 0
  OR instr(NEW.target_ref, '@') > 0
  OR EXISTS (
    SELECT 1
    FROM (
      SELECT lower(substr(NEW.target_ref, length('browser://domain/') + 1)) AS target_host
    )
    WHERE NEW.target_ref GLOB 'browser://domain/?*'
      AND (
        target_host = ''
        OR target_host GLOB '*[^abcdefghijklmnopqrstuvwxyz0123456789.-]*'
        OR instr(target_host, '.') = 0
        OR target_host LIKE '%..%'
        OR target_host GLOB '-*'
        OR target_host GLOB '*.-*'
        OR target_host GLOB '*-'
        OR target_host = 'localhost'
        OR target_host GLOB '*.localhost'
        OR target_host GLOB '*.local'
        OR (target_host GLOB '[0-9]*.[0-9]*.[0-9]*.[0-9]*' AND target_host NOT GLOB '*[^0123456789.]*')
      )
  )
  OR EXISTS (
    SELECT 1
    FROM (
      SELECT
        target_host,
        target_port,
        substr(target_host, 1, instr(target_host, '.') - 1) AS first_octet,
        substr(substr(target_host, instr(target_host, '.') + 1), 1, instr(substr(target_host, instr(target_host, '.') + 1) || '.', '.') - 1) AS second_octet
      FROM (
        SELECT
          CASE WHEN instr(host_port, ':') > 0 THEN substr(host_port, 1, instr(host_port, ':') - 1) ELSE host_port END AS target_host,
          CASE WHEN instr(host_port, ':') > 0 THEN substr(host_port, instr(host_port, ':') + 1) ELSE NULL END AS target_port
        FROM (
          SELECT substr(locator, 1, instr(locator || '/', '/') - 1) AS host_port
          FROM (
            SELECT replace(replace(
              CASE
                WHEN lower(NEW.target_ref) GLOB 'browser://url/http/?*' THEN substr(lower(NEW.target_ref), length('browser://url/http/') + 1)
                WHEN lower(NEW.target_ref) GLOB 'browser://url/https/?*' THEN substr(lower(NEW.target_ref), length('browser://url/https/') + 1)
                ELSE ''
              END,
              '?', '/'
            ), '#', '/') AS locator
          )
        )
      )
    )
    WHERE NEW.target_ref GLOB 'browser://url/*'
      AND (
        target_host = ''
        OR target_host GLOB '*[^abcdefghijklmnopqrstuvwxyz0123456789.-]*'
        OR instr(target_host, '.') = 0
        OR target_host LIKE '%..%'
        OR target_host GLOB '-*'
        OR target_host GLOB '*.-*'
        OR target_host GLOB '*-'
        OR target_host = 'localhost'
        OR target_host GLOB '*.localhost'
        OR target_host GLOB '*.local'
        OR (target_port IS NOT NULL AND (target_port = '' OR target_port GLOB '*[^0123456789]*' OR CAST(target_port AS INTEGER) > 65535))
        OR (target_host GLOB '[0-9]*.[0-9]*.[0-9]*.[0-9]*' AND target_host NOT GLOB '*[^0123456789.]*' AND (
          CAST(first_octet AS INTEGER) IN (0, 10, 127)
          OR CAST(first_octet AS INTEGER) >= 224
          OR (CAST(first_octet AS INTEGER) = 100 AND CAST(second_octet AS INTEGER) BETWEEN 64 AND 127)
          OR (CAST(first_octet AS INTEGER) = 169 AND CAST(second_octet AS INTEGER) = 254)
          OR (CAST(first_octet AS INTEGER) = 172 AND CAST(second_octet AS INTEGER) BETWEEN 16 AND 31)
          OR (CAST(first_octet AS INTEGER) = 192 AND CAST(second_octet AS INTEGER) IN (0, 168))
          OR (CAST(first_octet AS INTEGER) = 198 AND CAST(second_octet AS INTEGER) IN (18, 19, 51))
          OR (CAST(first_octet AS INTEGER) = 203 AND CAST(second_octet AS INTEGER) = 0)
        ))
      )
  )
  OR (NEW.target_ref GLOB 'browser://url/http/?*' AND instr(substr(NEW.target_ref, length('browser://url/http/') + 1), '.') = 0)
  OR (NEW.target_ref GLOB 'browser://url/https/?*' AND instr(substr(NEW.target_ref, length('browser://url/https/') + 1), '.') = 0)
  OR (NEW.target_ref GLOB 'browser://domain/?*' AND instr(substr(NEW.target_ref, length('browser://domain/') + 1), '.') = 0)
  OR lower(NEW.target_ref) LIKE '%token=%'
  OR lower(NEW.target_ref) LIKE '%password=%'
  OR lower(NEW.target_ref) LIKE '%secret://%'
  OR lower(NEW.target_ref) LIKE '%2e%2e%'
  OR NEW.target_ref LIKE '%..%'
  OR instr(NEW.target_ref, char(92)) > 0
  OR instr(NEW.target_ref, char(173)) > 0
  OR instr(NEW.target_ref, char(8203)) > 0
  OR instr(NEW.target_ref, char(8204)) > 0
  OR instr(NEW.target_ref, char(8205)) > 0
  OR instr(NEW.target_ref, char(8288)) > 0
  OR instr(NEW.target_ref, char(65279)) > 0
  OR NOT EXISTS (
    SELECT 1 FROM browser_computer_sessions session
    JOIN browser_computer_sandbox_policies policy
      ON policy.workspace_id = session.workspace_id
      AND policy.id = session.sandbox_policy_id
    JOIN json_each(policy.allowed_target_kinds_json) target_kind
    WHERE session.workspace_id = NEW.workspace_id
      AND session.id = NEW.session_id
      AND target_kind.value = NEW.target_kind
  )
BEGIN SELECT RAISE(ABORT, 'browser computer allowlist target rejected by sandbox policy'); END;

CREATE TRIGGER IF NOT EXISTS c23_allowlist_secret_safe_text_insert
BEFORE INSERT ON browser_computer_allowlist
WHEN lower(NEW.reason) LIKE '%bearer %'
  OR lower(COALESCE(NEW.created_by, '')) LIKE '%bearer %'
  OR lower(NEW.reason) LIKE '%api_key%'
  OR lower(COALESCE(NEW.created_by, '')) LIKE '%api_key%'
  OR lower(NEW.reason) LIKE '%api-key%'
  OR lower(COALESCE(NEW.created_by, '')) LIKE '%api-key%'
  OR lower(NEW.reason) LIKE '%access_token%'
  OR lower(COALESCE(NEW.created_by, '')) LIKE '%access_token%'
  OR lower(NEW.reason) LIKE '%authorization%'
  OR lower(COALESCE(NEW.created_by, '')) LIKE '%authorization%'
  OR lower(NEW.reason) LIKE '%client_secret%'
  OR lower(COALESCE(NEW.created_by, '')) LIKE '%client_secret%'
  OR lower(NEW.reason) LIKE '%token=%'
  OR lower(COALESCE(NEW.created_by, '')) LIKE '%token=%'
  OR lower(NEW.reason) LIKE '%password=%'
  OR lower(COALESCE(NEW.created_by, '')) LIKE '%password=%'
  OR lower(NEW.reason) LIKE '%secret://%'
  OR lower(COALESCE(NEW.created_by, '')) LIKE '%secret://%'
  OR lower(NEW.reason) LIKE '%credential:%'
  OR lower(COALESCE(NEW.created_by, '')) LIKE '%credential:%'
  OR lower(NEW.reason) LIKE '%token%3d%'
  OR lower(COALESCE(NEW.created_by, '')) LIKE '%token%3d%'
  OR lower(NEW.payload_json) LIKE '%bearer %'
  OR lower(NEW.payload_json) LIKE '%api_key%'
  OR lower(NEW.payload_json) LIKE '%api-key%'
  OR lower(NEW.payload_json) LIKE '%access_token%'
  OR lower(NEW.payload_json) LIKE '%authorization%'
  OR lower(NEW.payload_json) LIKE '%client_secret%'
  OR lower(NEW.payload_json) LIKE '%token%3d%'
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%credential:%'
BEGIN SELECT RAISE(ABORT, 'browser computer secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_intents_target_allowlist_insert
BEFORE INSERT ON browser_computer_action_intents
WHEN NOT (NEW.target_ref GLOB 'browser://url/http/?*' OR NEW.target_ref GLOB 'browser://url/https/?*' OR NEW.target_ref GLOB 'computer://app/?*')
  OR lower(NEW.target_ref) LIKE '%169.254.%'
  OR NEW.target_ref GLOB 'browser://url/http/[0-9]*.[0-9]*.[0-9]*.[0-9]*'
  OR NEW.target_ref GLOB 'browser://url/https/[0-9]*.[0-9]*.[0-9]*.[0-9]*'
  OR lower(NEW.target_ref) LIKE '%/10.%'
  OR lower(NEW.target_ref) LIKE '%/127.%'
  OR lower(NEW.target_ref) LIKE '%.local%'
  OR lower(NEW.target_ref) LIKE '%localhost%'
  OR instr(NEW.target_ref, '%') > 0
  OR instr(NEW.target_ref, '@') > 0
  OR EXISTS (
    SELECT 1
    FROM (
      SELECT
        target_host,
        target_port,
        substr(target_host, 1, instr(target_host, '.') - 1) AS first_octet,
        substr(substr(target_host, instr(target_host, '.') + 1), 1, instr(substr(target_host, instr(target_host, '.') + 1) || '.', '.') - 1) AS second_octet
      FROM (
        SELECT
          CASE WHEN instr(host_port, ':') > 0 THEN substr(host_port, 1, instr(host_port, ':') - 1) ELSE host_port END AS target_host,
          CASE WHEN instr(host_port, ':') > 0 THEN substr(host_port, instr(host_port, ':') + 1) ELSE NULL END AS target_port
        FROM (
          SELECT substr(locator, 1, instr(locator || '/', '/') - 1) AS host_port
          FROM (
            SELECT replace(replace(
              CASE
                WHEN lower(NEW.target_ref) GLOB 'browser://url/http/?*' THEN substr(lower(NEW.target_ref), length('browser://url/http/') + 1)
                WHEN lower(NEW.target_ref) GLOB 'browser://url/https/?*' THEN substr(lower(NEW.target_ref), length('browser://url/https/') + 1)
                ELSE ''
              END,
              '?', '/'
            ), '#', '/') AS locator
          )
        )
      )
    )
    WHERE NEW.target_ref GLOB 'browser://url/*'
      AND (
        target_host = ''
        OR target_host GLOB '*[^abcdefghijklmnopqrstuvwxyz0123456789.-]*'
        OR instr(target_host, '.') = 0
        OR target_host LIKE '%..%'
        OR target_host GLOB '-*'
        OR target_host GLOB '*.-*'
        OR target_host GLOB '*-'
        OR target_host = 'localhost'
        OR target_host GLOB '*.localhost'
        OR target_host GLOB '*.local'
        OR (target_port IS NOT NULL AND (target_port = '' OR target_port GLOB '*[^0123456789]*' OR CAST(target_port AS INTEGER) > 65535))
        OR (target_host GLOB '[0-9]*.[0-9]*.[0-9]*.[0-9]*' AND target_host NOT GLOB '*[^0123456789.]*' AND (
          CAST(first_octet AS INTEGER) IN (0, 10, 127)
          OR CAST(first_octet AS INTEGER) >= 224
          OR (CAST(first_octet AS INTEGER) = 100 AND CAST(second_octet AS INTEGER) BETWEEN 64 AND 127)
          OR (CAST(first_octet AS INTEGER) = 169 AND CAST(second_octet AS INTEGER) = 254)
          OR (CAST(first_octet AS INTEGER) = 172 AND CAST(second_octet AS INTEGER) BETWEEN 16 AND 31)
          OR (CAST(first_octet AS INTEGER) = 192 AND CAST(second_octet AS INTEGER) IN (0, 168))
          OR (CAST(first_octet AS INTEGER) = 198 AND CAST(second_octet AS INTEGER) IN (18, 19, 51))
          OR (CAST(first_octet AS INTEGER) = 203 AND CAST(second_octet AS INTEGER) = 0)
        ))
      )
  )
  OR (NEW.target_ref GLOB 'browser://url/http/?*' AND instr(substr(NEW.target_ref, length('browser://url/http/') + 1), '.') = 0)
  OR (NEW.target_ref GLOB 'browser://url/https/?*' AND instr(substr(NEW.target_ref, length('browser://url/https/') + 1), '.') = 0)
  OR lower(NEW.target_ref) LIKE '%token=%'
  OR lower(NEW.target_ref) LIKE '%password=%'
  OR lower(NEW.target_ref) LIKE '%secret://%'
  OR lower(NEW.target_ref) LIKE '%2e%2e%'
  OR NEW.target_ref LIKE '%..%'
  OR instr(NEW.target_ref, char(92)) > 0
  OR instr(NEW.target_ref, char(173)) > 0
  OR instr(NEW.target_ref, char(8203)) > 0
  OR instr(NEW.target_ref, char(8204)) > 0
  OR instr(NEW.target_ref, char(8205)) > 0
  OR instr(NEW.target_ref, char(8288)) > 0
  OR instr(NEW.target_ref, char(65279)) > 0
  OR NOT EXISTS (
    SELECT 1 FROM browser_computer_sessions session
    JOIN browser_computer_sandbox_policies policy
      ON policy.workspace_id = session.workspace_id
      AND policy.id = session.sandbox_policy_id
    JOIN json_each(policy.allowed_target_kinds_json) target_kind
    WHERE session.workspace_id = NEW.workspace_id
      AND session.id = NEW.session_id
      AND target_kind.value = CASE WHEN NEW.target_ref GLOB 'computer://app/?*' THEN 'computer_app' ELSE 'browser_url' END
  )
BEGIN SELECT RAISE(ABORT, 'browser computer action target rejected by sandbox policy'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_intents_secret_safe_text_insert
BEFORE INSERT ON browser_computer_action_intents
WHEN lower(NEW.input_summary) LIKE '%bearer %'
  OR lower(NEW.input_summary) LIKE '%basic %'
  OR lower(NEW.input_summary) LIKE '%api_key%'
  OR lower(NEW.input_summary) LIKE '%api-key%'
  OR lower(NEW.input_summary) LIKE '%access_token%'
  OR lower(NEW.input_summary) LIKE '%access-token%'
  OR lower(NEW.input_summary) LIKE '%authorization%'
  OR lower(NEW.input_summary) LIKE '%private_key%'
  OR lower(NEW.input_summary) LIKE '%private-key%'
  OR lower(NEW.input_summary) LIKE '%client_secret%'
  OR lower(NEW.input_summary) LIKE '%client-secret%'
  OR lower(NEW.input_summary) LIKE '%refresh_token%'
  OR lower(NEW.input_summary) LIKE '%refresh-token%'
  OR lower(NEW.input_summary) LIKE '%session_token%'
  OR lower(NEW.input_summary) LIKE '%session-token%'
  OR lower(NEW.input_summary) LIKE '%token=%'
  OR lower(NEW.input_summary) LIKE '%password=%'
  OR lower(NEW.input_summary) LIKE '%passwd=%'
  OR lower(NEW.input_summary) LIKE '%pwd=%'
  OR lower(NEW.input_summary) LIKE '%secret://%'
  OR lower(NEW.input_summary) LIKE '%credential:%'
  OR lower(NEW.input_summary) LIKE '%token%3d%'
  OR lower(NEW.input_summary) LIKE '%password%3d%'
  OR lower(NEW.idempotency_key) LIKE '%token=%'
  OR lower(NEW.idempotency_key) LIKE '%password=%'
  OR lower(NEW.idempotency_key) LIKE '%secret://%'
  OR lower(NEW.idempotency_key) LIKE '%credential:%'
  OR lower(NEW.payload_json) LIKE '%bearer %'
  OR lower(NEW.payload_json) LIKE '%api_key%'
  OR lower(NEW.payload_json) LIKE '%api-key%'
  OR lower(NEW.payload_json) LIKE '%access_token%'
  OR lower(NEW.payload_json) LIKE '%authorization%'
  OR lower(NEW.payload_json) LIKE '%client_secret%'
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%credential:%'
  OR lower(NEW.payload_json) LIKE '%token%3d%'
  OR lower(NEW.payload_json) LIKE '%password%3d%'
BEGIN SELECT RAISE(ABORT, 'browser computer secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c23_human_approvals_action_scope_insert
BEFORE INSERT ON browser_computer_human_approvals
WHEN NOT EXISTS (
  SELECT 1 FROM browser_computer_action_intents intent
  WHERE intent.workspace_id = NEW.workspace_id
    AND intent.session_id = NEW.session_id
    AND intent.id = NEW.action_intent_id
    AND intent.payload_hash = NEW.action_payload_hash
)
BEGIN SELECT RAISE(ABORT, 'browser computer approval action scope mismatch'); END;

CREATE TRIGGER IF NOT EXISTS c23_human_approvals_secret_safe_text_insert
BEFORE INSERT ON browser_computer_human_approvals
WHEN lower(NEW.decided_by) LIKE '%bearer %'
  OR lower(NEW.reason) LIKE '%bearer %'
  OR lower(NEW.decided_by) LIKE '%api_key%'
  OR lower(NEW.reason) LIKE '%api_key%'
  OR lower(NEW.decided_by) LIKE '%api-key%'
  OR lower(NEW.reason) LIKE '%api-key%'
  OR lower(NEW.decided_by) LIKE '%access_token%'
  OR lower(NEW.reason) LIKE '%access_token%'
  OR lower(NEW.decided_by) LIKE '%authorization%'
  OR lower(NEW.reason) LIKE '%authorization%'
  OR lower(NEW.decided_by) LIKE '%client_secret%'
  OR lower(NEW.reason) LIKE '%client_secret%'
  OR lower(NEW.decided_by) LIKE '%token=%'
  OR lower(NEW.reason) LIKE '%token=%'
  OR lower(NEW.decided_by) LIKE '%password=%'
  OR lower(NEW.reason) LIKE '%password=%'
  OR lower(NEW.decided_by) LIKE '%secret://%'
  OR lower(NEW.reason) LIKE '%secret://%'
  OR lower(NEW.decided_by) LIKE '%credential:%'
  OR lower(NEW.reason) LIKE '%credential:%'
  OR lower(NEW.payload_json) LIKE '%bearer %'
  OR lower(NEW.payload_json) LIKE '%api_key%'
  OR lower(NEW.payload_json) LIKE '%api-key%'
  OR lower(NEW.payload_json) LIKE '%access_token%'
  OR lower(NEW.payload_json) LIKE '%authorization%'
  OR lower(NEW.payload_json) LIKE '%client_secret%'
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%credential:%'
BEGIN SELECT RAISE(ABORT, 'browser computer secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c23_sandbox_policies_normalized_text_safe_insert
BEFORE INSERT ON browser_computer_sandbox_policies
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
  ) THEN RAISE(ABORT, 'browser computer normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c23_sessions_normalized_text_safe_insert
BEFORE INSERT ON browser_computer_sessions
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.current_target_ref, '') || ' ' || COALESCE(NEW.display_ref, '') || ' ' || COALESCE(NEW.active_app_ref, '') || ' ' || COALESCE(NEW.takeover_by, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
  ) THEN RAISE(ABORT, 'browser computer normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c23_allowlist_normalized_text_safe_insert
BEFORE INSERT ON browser_computer_allowlist
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.target_ref, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.created_by, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
  ) THEN RAISE(ABORT, 'browser computer normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c23_action_intents_normalized_text_safe_insert
BEFORE INSERT ON browser_computer_action_intents
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.target_ref, '') || ' ' || COALESCE(NEW.input_summary, '') || ' ' || COALESCE(NEW.idempotency_key, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
  ) THEN RAISE(ABORT, 'browser computer normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c23_human_approvals_normalized_text_safe_insert
BEFORE INSERT ON browser_computer_human_approvals
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.decided_by, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
  ) THEN RAISE(ABORT, 'browser computer normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c23_action_receipts_normalized_text_safe_insert
BEFORE INSERT ON browser_computer_action_receipts
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.result_ref, '') || ' ' || COALESCE(NEW.error_message, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
  ) THEN RAISE(ABORT, 'browser computer normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c23_screenshot_receipts_normalized_text_safe_insert
BEFORE INSERT ON browser_computer_screenshot_receipts
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.image_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
  ) THEN RAISE(ABORT, 'browser computer normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c23_action_intents_session_run_scope_insert
BEFORE INSERT ON browser_computer_action_intents
WHEN NOT EXISTS (
  SELECT 1 FROM browser_computer_sessions session
  WHERE session.workspace_id = NEW.workspace_id
    AND session.id = NEW.session_id
    AND session.run_id = NEW.run_id
)
BEGIN SELECT RAISE(ABORT, 'browser computer action must match session run scope'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_receipts_scope_insert
BEFORE INSERT ON browser_computer_action_receipts
WHEN NOT EXISTS (
  SELECT 1 FROM browser_computer_action_intents intent
  WHERE intent.workspace_id = NEW.workspace_id
    AND intent.session_id = NEW.session_id
    AND intent.id = NEW.action_intent_id
)
BEGIN SELECT RAISE(ABORT, 'browser computer action receipt scope mismatch'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_receipts_screenshot_scope_insert
BEFORE INSERT ON browser_computer_action_receipts
WHEN NEW.screenshot_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM browser_computer_screenshot_receipts screenshot
    WHERE screenshot.workspace_id = NEW.workspace_id
      AND screenshot.session_id = NEW.session_id
      AND screenshot.action_intent_id = NEW.action_intent_id
      AND screenshot.id = NEW.screenshot_id
  )
BEGIN SELECT RAISE(ABORT, 'browser computer action receipt screenshot scope mismatch'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_receipts_executable_insert
BEFORE INSERT ON browser_computer_action_receipts
WHEN NOT EXISTS (
  SELECT 1 FROM browser_computer_action_intents intent
  JOIN browser_computer_human_approvals approval
    ON approval.workspace_id = intent.workspace_id
    AND approval.session_id = intent.session_id
    AND approval.action_intent_id = intent.id
    AND approval.action_payload_hash = intent.payload_hash
    AND approval.decision = 'approved'
  JOIN browser_computer_allowlist allowlist
    ON allowlist.workspace_id = intent.workspace_id
    AND allowlist.session_id = intent.session_id
    AND allowlist.decision = 'allow'
    AND (allowlist.expires_at IS NULL OR allowlist.expires_at > NEW.created_at)
  WHERE intent.workspace_id = NEW.workspace_id
    AND intent.session_id = NEW.session_id
    AND intent.id = NEW.action_intent_id
    AND (
      allowlist.target_ref = intent.target_ref
      OR (
        allowlist.target_kind = 'browser_url'
        AND allowlist.target_ref GLOB 'browser://domain/?*'
        AND EXISTS (
          SELECT 1
          FROM (
            SELECT
              allowed_host,
              CASE WHEN instr(host_port, ':') > 0 THEN substr(host_port, 1, instr(host_port, ':') - 1) ELSE host_port END AS target_host
            FROM (
              SELECT
                allowed_host,
                substr(locator, 1, instr(locator || '/', '/') - 1) AS host_port
              FROM (
                SELECT
                  lower(substr(allowlist.target_ref, length('browser://domain/') + 1)) AS allowed_host,
                  replace(replace(
                    CASE
                      WHEN lower(intent.target_ref) GLOB 'browser://url/http/?*' THEN substr(lower(intent.target_ref), length('browser://url/http/') + 1)
                      WHEN lower(intent.target_ref) GLOB 'browser://url/https/?*' THEN substr(lower(intent.target_ref), length('browser://url/https/') + 1)
                      ELSE ''
                    END,
                    '?', '/'
                  ), '#', '/') AS locator
              )
            )
          )
          WHERE target_host = allowed_host
            OR (
              length(target_host) > length(allowed_host) + 1
              AND substr(target_host, -(length(allowed_host) + 1)) = '.' || allowed_host
            )
        )
      )
    )
)
BEGIN SELECT RAISE(ABORT, 'browser computer action receipt requires executable approved policy'); END;

CREATE TRIGGER IF NOT EXISTS c23_screenshot_receipts_scope_insert
BEFORE INSERT ON browser_computer_screenshot_receipts
WHEN NOT EXISTS (
  SELECT 1 FROM browser_computer_action_intents intent
  WHERE intent.workspace_id = NEW.workspace_id
    AND intent.session_id = NEW.session_id
    AND intent.id = NEW.action_intent_id
)
BEGIN SELECT RAISE(ABORT, 'browser computer screenshot receipt scope mismatch'); END;

CREATE TRIGGER IF NOT EXISTS c23_screenshot_receipts_executable_insert
BEFORE INSERT ON browser_computer_screenshot_receipts
WHEN NOT EXISTS (
  SELECT 1 FROM browser_computer_action_intents intent
  JOIN browser_computer_human_approvals approval
    ON approval.workspace_id = intent.workspace_id
    AND approval.session_id = intent.session_id
    AND approval.action_intent_id = intent.id
    AND approval.action_payload_hash = intent.payload_hash
    AND approval.decision = 'approved'
  JOIN browser_computer_allowlist allowlist
    ON allowlist.workspace_id = intent.workspace_id
    AND allowlist.session_id = intent.session_id
    AND allowlist.decision = 'allow'
    AND (allowlist.expires_at IS NULL OR allowlist.expires_at > NEW.created_at)
  WHERE intent.workspace_id = NEW.workspace_id
    AND intent.session_id = NEW.session_id
    AND intent.id = NEW.action_intent_id
    AND (
      allowlist.target_ref = intent.target_ref
      OR (
        allowlist.target_kind = 'browser_url'
        AND allowlist.target_ref GLOB 'browser://domain/?*'
        AND EXISTS (
          SELECT 1
          FROM (
            SELECT
              allowed_host,
              CASE WHEN instr(host_port, ':') > 0 THEN substr(host_port, 1, instr(host_port, ':') - 1) ELSE host_port END AS target_host
            FROM (
              SELECT
                allowed_host,
                substr(locator, 1, instr(locator || '/', '/') - 1) AS host_port
              FROM (
                SELECT
                  lower(substr(allowlist.target_ref, length('browser://domain/') + 1)) AS allowed_host,
                  replace(replace(
                    CASE
                      WHEN lower(intent.target_ref) GLOB 'browser://url/http/?*' THEN substr(lower(intent.target_ref), length('browser://url/http/') + 1)
                      WHEN lower(intent.target_ref) GLOB 'browser://url/https/?*' THEN substr(lower(intent.target_ref), length('browser://url/https/') + 1)
                      ELSE ''
                    END,
                    '?', '/'
                  ), '#', '/') AS locator
              )
            )
          )
          WHERE target_host = allowed_host
            OR (
              length(target_host) > length(allowed_host) + 1
              AND substr(target_host, -(length(allowed_host) + 1)) = '.' || allowed_host
            )
        )
      )
    )
)
BEGIN SELECT RAISE(ABORT, 'browser computer screenshot receipt requires executable approved policy'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_receipts_ref_safe_insert
BEFORE INSERT ON browser_computer_action_receipts
WHEN (NEW.result_ref IS NOT NULL AND (
    NOT NEW.result_ref GLOB 'artifact://?*'
    OR instr(NEW.result_ref, '%') > 0
    OR NEW.result_ref LIKE '%..%'
    OR instr(NEW.result_ref, char(92)) > 0
    OR lower(NEW.result_ref) LIKE '%secret%'
    OR lower(NEW.result_ref) LIKE '%token=%'
    OR lower(NEW.result_ref) LIKE '%password=%'
    OR instr(NEW.result_ref, char(173)) > 0
    OR instr(NEW.result_ref, char(8203)) > 0
    OR instr(NEW.result_ref, char(8204)) > 0
    OR instr(NEW.result_ref, char(8205)) > 0
    OR instr(NEW.result_ref, char(8288)) > 0
    OR instr(NEW.result_ref, char(65279)) > 0
  ))
  OR lower(COALESCE(NEW.error_message, '')) LIKE '%secret%'
  OR lower(COALESCE(NEW.error_message, '')) LIKE '%token=%'
  OR lower(COALESCE(NEW.error_message, '')) LIKE '%password=%'
  OR instr(COALESCE(NEW.error_message, ''), '%') > 0
BEGIN SELECT RAISE(ABORT, 'browser computer action receipt ref rejected by sandbox policy'); END;

CREATE TRIGGER IF NOT EXISTS c23_screenshot_receipts_ref_safe_insert
BEFORE INSERT ON browser_computer_screenshot_receipts
WHEN NOT NEW.image_ref GLOB 'artifact://?*'
  OR instr(NEW.image_ref, '%') > 0
  OR NEW.image_ref LIKE '%..%'
  OR instr(NEW.image_ref, char(92)) > 0
  OR lower(NEW.image_ref) LIKE '%secret%'
  OR lower(NEW.image_ref) LIKE '%token=%'
  OR lower(NEW.image_ref) LIKE '%password=%'
  OR instr(NEW.image_ref, char(173)) > 0
  OR instr(NEW.image_ref, char(8203)) > 0
  OR instr(NEW.image_ref, char(8204)) > 0
  OR instr(NEW.image_ref, char(8205)) > 0
  OR instr(NEW.image_ref, char(8288)) > 0
  OR instr(NEW.image_ref, char(65279)) > 0
  OR NOT (NEW.image_hash GLOB 'sha256:[0-9a-f][0-9a-f][0-9a-f][0-9a-f]*' AND length(NEW.image_hash) = 71)
BEGIN SELECT RAISE(ABORT, 'browser computer screenshot receipt ref rejected by sandbox policy'); END;

CREATE TRIGGER IF NOT EXISTS c23_sandbox_policies_no_update
BEFORE UPDATE ON browser_computer_sandbox_policies
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer sandbox policies are immutable'); END;

CREATE TRIGGER IF NOT EXISTS c23_sandbox_policies_no_delete
BEFORE DELETE ON browser_computer_sandbox_policies
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer sandbox policies are append-only'); END;

CREATE TRIGGER IF NOT EXISTS c23_allowlist_no_update
BEFORE UPDATE ON browser_computer_allowlist
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer allowlist entries are append-only'); END;

CREATE TRIGGER IF NOT EXISTS c23_allowlist_no_delete
BEFORE DELETE ON browser_computer_allowlist
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer allowlist entries are append-only'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_intents_no_update
BEFORE UPDATE ON browser_computer_action_intents
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer action intents are immutable'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_intents_no_delete
BEFORE DELETE ON browser_computer_action_intents
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer action intents are append-only'); END;

CREATE TRIGGER IF NOT EXISTS c23_sessions_guarded_update
BEFORE UPDATE ON browser_computer_sessions
FOR EACH ROW
WHEN OLD.workspace_id != NEW.workspace_id
  OR OLD.id != NEW.id
  OR OLD.run_id != NEW.run_id
  OR OLD.gateway_session_id != NEW.gateway_session_id
  OR OLD.sandbox_policy_id != NEW.sandbox_policy_id
  OR OLD.name != NEW.name
  OR OLD.kind != NEW.kind
  OR COALESCE(OLD.platform, '') != COALESCE(NEW.platform, '')
  OR OLD.mode != NEW.mode
  OR COALESCE(OLD.current_target_ref, '') != COALESCE(NEW.current_target_ref, '')
  OR COALESCE(OLD.display_ref, '') != COALESCE(NEW.display_ref, '')
  OR COALESCE(OLD.active_app_ref, '') != COALESCE(NEW.active_app_ref, '')
  OR COALESCE(OLD.last_screenshot_id, '') != COALESCE(NEW.last_screenshot_id, '')
  OR OLD.created_at != NEW.created_at
  OR NEW.descriptor_only != 1
  OR NEW.schema_version != OLD.schema_version
  OR NEW.version != OLD.version + 1
  OR COALESCE(json_extract(NEW.payload_json, '$.id'), '') != NEW.id
  OR COALESCE(json_extract(NEW.payload_json, '$.workspace_id'), '') != NEW.workspace_id
  OR COALESCE(json_extract(NEW.payload_json, '$.run_id'), '') != NEW.run_id
  OR COALESCE(json_extract(NEW.payload_json, '$.gateway_session_id'), '') != NEW.gateway_session_id
  OR COALESCE(json_extract(NEW.payload_json, '$.sandbox_policy_id'), '') != NEW.sandbox_policy_id
  OR COALESCE(json_extract(NEW.payload_json, '$.name'), '') != NEW.name
  OR COALESCE(json_extract(NEW.payload_json, '$.kind'), '') != NEW.kind
  OR COALESCE(json_extract(NEW.payload_json, '$.platform'), '') != COALESCE(NEW.platform, '')
  OR COALESCE(json_extract(NEW.payload_json, '$.mode'), '') != NEW.mode
  OR COALESCE(json_extract(NEW.payload_json, '$.status'), '') != NEW.status
  OR COALESCE(json_extract(NEW.payload_json, '$.current_target_ref'), '') != COALESCE(NEW.current_target_ref, '')
  OR COALESCE(json_extract(NEW.payload_json, '$.display_ref'), '') != COALESCE(NEW.display_ref, '')
  OR COALESCE(json_extract(NEW.payload_json, '$.active_app_ref'), '') != COALESCE(NEW.active_app_ref, '')
  OR COALESCE(json_extract(NEW.payload_json, '$.last_screenshot_id'), '') != COALESCE(NEW.last_screenshot_id, '')
  OR COALESCE(json_extract(NEW.payload_json, '$.takeover_by'), '') != COALESCE(NEW.takeover_by, '')
  OR COALESCE(json_extract(NEW.payload_json, '$.descriptor_only'), 0) != 1
  OR COALESCE(json_extract(NEW.payload_json, '$.revision'), -1) != NEW.version
  OR COALESCE(json_extract(NEW.payload_json, '$.schema_version'), -1) != NEW.schema_version
  OR (COALESCE(OLD.takeover_by, '') != COALESCE(NEW.takeover_by, '') AND NEW.status != 'takeover_requested')
  OR NOT (
    OLD.status = NEW.status
    OR (OLD.status = 'active' AND NEW.status IN ('paused', 'stopped', 'takeover_requested', 'error'))
    OR (OLD.status = 'paused' AND NEW.status IN ('active', 'stopped', 'takeover_requested', 'error'))
    OR (OLD.status = 'takeover_requested' AND NEW.status = 'stopped')
    OR (OLD.status = 'error' AND NEW.status = 'stopped')
  )
BEGIN SELECT RAISE(ABORT, 'browser computer session update violates guarded transition or immutable scope'); END;

CREATE TRIGGER IF NOT EXISTS c23_sessions_no_delete
BEFORE DELETE ON browser_computer_sessions
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer sessions cannot be deleted'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_receipts_no_update
BEFORE UPDATE ON browser_computer_action_receipts
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer action receipts are append-only'); END;

CREATE TRIGGER IF NOT EXISTS c23_action_receipts_no_delete
BEFORE DELETE ON browser_computer_action_receipts
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer action receipts are append-only'); END;

CREATE TRIGGER IF NOT EXISTS c23_screenshot_receipts_no_update
BEFORE UPDATE ON browser_computer_screenshot_receipts
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer screenshot receipts are append-only'); END;

CREATE TRIGGER IF NOT EXISTS c23_screenshot_receipts_no_delete
BEFORE DELETE ON browser_computer_screenshot_receipts
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer screenshot receipts are append-only'); END;

CREATE TRIGGER IF NOT EXISTS c23_human_approvals_no_update
BEFORE UPDATE ON browser_computer_human_approvals
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer human approvals are append-only'); END;

CREATE TRIGGER IF NOT EXISTS c23_human_approvals_no_delete
BEFORE DELETE ON browser_computer_human_approvals
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'browser computer human approvals are append-only'); END;
