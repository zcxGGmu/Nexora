CREATE TABLE IF NOT EXISTS skills (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'quarantined', 'revoked')),
  current_version_id TEXT,
  approved_version_id TEXT,
  capabilities_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  quarantine_reason TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_skills_workspace_status ON skills(workspace_id, status, updated_at);

CREATE TABLE IF NOT EXISTS skill_versions (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  skill_id TEXT NOT NULL,
  semver TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending_scan', 'needs_review', 'approved', 'revoked', 'quarantined')),
  source_hash TEXT NOT NULL,
  snapshot_hash TEXT,
  snapshot_ref TEXT,
  diff_hash TEXT NOT NULL,
  diff_summary TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  revoked_at TEXT,
  rollback_to_version_id TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, skill_id, semver),
  FOREIGN KEY (workspace_id, skill_id) REFERENCES skills(workspace_id, id),
  FOREIGN KEY (workspace_id, rollback_to_version_id) REFERENCES skill_versions(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_skill_versions_skill_status ON skill_versions(workspace_id, skill_id, status, updated_at);

CREATE TABLE IF NOT EXISTS skill_sources (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  skill_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('workspace', 'artifact', 'memory', 'manual')),
  source_ref TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  diff_hash TEXT NOT NULL,
  diff_summary TEXT NOT NULL,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, skill_id) REFERENCES skills(workspace_id, id),
  FOREIGN KEY (workspace_id, version_id) REFERENCES skill_versions(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_skill_sources_version ON skill_sources(workspace_id, version_id, created_at);

CREATE TABLE IF NOT EXISTS skill_scans (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  skill_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'quarantined')),
  findings_json TEXT NOT NULL,
  secret_findings INTEGER NOT NULL CHECK (secret_findings >= 0),
  scanned_at TEXT NOT NULL,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, skill_id) REFERENCES skills(workspace_id, id),
  FOREIGN KEY (workspace_id, version_id) REFERENCES skill_versions(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_skill_scans_version ON skill_scans(workspace_id, version_id, scanned_at);

CREATE TABLE IF NOT EXISTS skill_reviews (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  skill_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  scan_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'quarantine', 'revoke')),
  reviewer_ref TEXT NOT NULL,
  reason TEXT NOT NULL,
  approved_snapshot_hash TEXT,
  decided_at TEXT NOT NULL,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, skill_id) REFERENCES skills(workspace_id, id),
  FOREIGN KEY (workspace_id, version_id) REFERENCES skill_versions(workspace_id, id),
  FOREIGN KEY (workspace_id, scan_id) REFERENCES skill_scans(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_skill_reviews_version ON skill_reviews(workspace_id, version_id, decided_at);

CREATE TABLE IF NOT EXISTS skill_installations (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  skill_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('installed', 'revoked', 'quarantined', 'rolled_back')),
  approved_snapshot_hash TEXT,
  installed_at TEXT,
  revoked_at TEXT,
  quarantine_reason TEXT,
  rollback_to_version_id TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, skill_id) REFERENCES skills(workspace_id, id),
  FOREIGN KEY (workspace_id, version_id) REFERENCES skill_versions(workspace_id, id),
  FOREIGN KEY (workspace_id, rollback_to_version_id) REFERENCES skill_versions(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_skill_installations_skill_status ON skill_installations(workspace_id, skill_id, status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_installations_unique_skill_version ON skill_installations(workspace_id, skill_id, version_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_installations_one_non_revoked_skill ON skill_installations(workspace_id, skill_id) WHERE status IN ('installed', 'quarantined', 'rolled_back');

CREATE TABLE IF NOT EXISTS skill_invocation_facts (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  skill_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  goal_loop_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('allowed', 'blocked')),
  snapshot_hash TEXT,
  reason TEXT NOT NULL,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, skill_id) REFERENCES skills(workspace_id, id),
  FOREIGN KEY (workspace_id, version_id) REFERENCES skill_versions(workspace_id, id),
  FOREIGN KEY (workspace_id, installation_id) REFERENCES skill_installations(workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, goal_loop_id) REFERENCES goal_loops(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_skill_invocations_run ON skill_invocation_facts(workspace_id, run_id, created_at);

CREATE TABLE IF NOT EXISTS learning_candidates (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  run_id TEXT NOT NULL,
  goal_loop_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  proposed_skill_id TEXT NOT NULL,
  lesson TEXT NOT NULL,
  proposed_diff_summary TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'needs_review', 'approved', 'rejected', 'quarantined', 'applied')),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, proposed_skill_id) REFERENCES skills(workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, goal_loop_id) REFERENCES goal_loops(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_learning_candidates_workspace_status ON learning_candidates(workspace_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_learning_candidates_source_event ON learning_candidates(workspace_id, run_id, source_event_id);

CREATE TABLE IF NOT EXISTS learning_commands (
  command_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL CHECK (kind IN ('learn', 'scan', 'approve', 'install', 'revoke', 'quarantine', 'rollback')),
  idempotency_key TEXT NOT NULL,
  expected_revision INTEGER CHECK (expected_revision IS NULL OR expected_revision > 0),
  installation_revision INTEGER CHECK (installation_revision IS NULL OR installation_revision > 0),
  candidate_id TEXT,
  skill_id TEXT,
  version_id TEXT,
  reason TEXT,
  rollback_to_version_id TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, command_id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, candidate_id) REFERENCES learning_candidates(workspace_id, id),
  FOREIGN KEY (workspace_id, skill_id) REFERENCES skills(workspace_id, id),
  FOREIGN KEY (workspace_id, version_id) REFERENCES skill_versions(workspace_id, id),
  FOREIGN KEY (workspace_id, rollback_to_version_id) REFERENCES skill_versions(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_learning_commands_workspace_created ON learning_commands(workspace_id, created_at, command_id);

CREATE TRIGGER IF NOT EXISTS skills_payload_columns_match_insert
BEFORE INSERT ON skills
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.name') IS NOT NEW.name
  OR json_extract(NEW.payload_json, '$.description') IS NOT NEW.description
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.current_version_id') IS NOT NEW.current_version_id
  OR json_extract(NEW.payload_json, '$.approved_version_id') IS NOT NEW.approved_version_id
  OR json_extract(NEW.payload_json, '$.capabilities') IS NOT json(NEW.capabilities_json)
  OR json_extract(NEW.payload_json, '$.tags') IS NOT json(NEW.tags_json)
  OR json_extract(NEW.payload_json, '$.quarantine_reason') IS NOT NEW.quarantine_reason
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'skill payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS skills_payload_columns_match_update
BEFORE UPDATE ON skills
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.name') IS NOT NEW.name
  OR json_extract(NEW.payload_json, '$.description') IS NOT NEW.description
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.current_version_id') IS NOT NEW.current_version_id
  OR json_extract(NEW.payload_json, '$.approved_version_id') IS NOT NEW.approved_version_id
  OR json_extract(NEW.payload_json, '$.capabilities') IS NOT json(NEW.capabilities_json)
  OR json_extract(NEW.payload_json, '$.tags') IS NOT json(NEW.tags_json)
  OR json_extract(NEW.payload_json, '$.quarantine_reason') IS NOT NEW.quarantine_reason
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'skill payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS skill_versions_payload_columns_match_insert
BEFORE INSERT ON skill_versions
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.skill_id') IS NOT NEW.skill_id
  OR json_extract(NEW.payload_json, '$.semver') IS NOT NEW.semver
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.source_hash') IS NOT NEW.source_hash
  OR json_extract(NEW.payload_json, '$.snapshot_hash') IS NOT NEW.snapshot_hash
  OR json_extract(NEW.payload_json, '$.snapshot_ref') IS NOT NEW.snapshot_ref
  OR json_extract(NEW.payload_json, '$.diff_hash') IS NOT NEW.diff_hash
  OR json_extract(NEW.payload_json, '$.diff_summary') IS NOT NEW.diff_summary
  OR json_extract(NEW.payload_json, '$.approved_at') IS NOT NEW.approved_at
  OR json_extract(NEW.payload_json, '$.approved_by') IS NOT NEW.approved_by
  OR json_extract(NEW.payload_json, '$.revoked_at') IS NOT NEW.revoked_at
  OR json_extract(NEW.payload_json, '$.rollback_to_version_id') IS NOT NEW.rollback_to_version_id
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'skill version payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS skill_versions_payload_columns_match_update
BEFORE UPDATE ON skill_versions
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.skill_id') IS NOT NEW.skill_id
  OR json_extract(NEW.payload_json, '$.semver') IS NOT NEW.semver
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.source_hash') IS NOT NEW.source_hash
  OR json_extract(NEW.payload_json, '$.snapshot_hash') IS NOT NEW.snapshot_hash
  OR json_extract(NEW.payload_json, '$.snapshot_ref') IS NOT NEW.snapshot_ref
  OR json_extract(NEW.payload_json, '$.diff_hash') IS NOT NEW.diff_hash
  OR json_extract(NEW.payload_json, '$.diff_summary') IS NOT NEW.diff_summary
  OR json_extract(NEW.payload_json, '$.approved_at') IS NOT NEW.approved_at
  OR json_extract(NEW.payload_json, '$.approved_by') IS NOT NEW.approved_by
  OR json_extract(NEW.payload_json, '$.revoked_at') IS NOT NEW.revoked_at
  OR json_extract(NEW.payload_json, '$.rollback_to_version_id') IS NOT NEW.rollback_to_version_id
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'skill version payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS skill_sources_payload_columns_match_insert
BEFORE INSERT ON skill_sources
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.skill_id') IS NOT NEW.skill_id
  OR json_extract(NEW.payload_json, '$.version_id') IS NOT NEW.version_id
  OR json_extract(NEW.payload_json, '$.source_kind') IS NOT NEW.source_kind
  OR json_extract(NEW.payload_json, '$.source_ref') IS NOT NEW.source_ref
  OR json_extract(NEW.payload_json, '$.source_hash') IS NOT NEW.source_hash
  OR json_extract(NEW.payload_json, '$.diff_hash') IS NOT NEW.diff_hash
  OR json_extract(NEW.payload_json, '$.diff_summary') IS NOT NEW.diff_summary
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'skill source payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS skill_scans_payload_columns_match_insert
BEFORE INSERT ON skill_scans
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.skill_id') IS NOT NEW.skill_id
  OR json_extract(NEW.payload_json, '$.version_id') IS NOT NEW.version_id
  OR json_extract(NEW.payload_json, '$.source_hash') IS NOT NEW.source_hash
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.findings') IS NOT json(NEW.findings_json)
  OR json_extract(NEW.payload_json, '$.secret_findings') IS NOT NEW.secret_findings
  OR json_extract(NEW.payload_json, '$.scanned_at') IS NOT NEW.scanned_at
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'skill scan payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS skill_reviews_payload_columns_match_insert
BEFORE INSERT ON skill_reviews
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.skill_id') IS NOT NEW.skill_id
  OR json_extract(NEW.payload_json, '$.version_id') IS NOT NEW.version_id
  OR json_extract(NEW.payload_json, '$.scan_id') IS NOT NEW.scan_id
  OR json_extract(NEW.payload_json, '$.decision') IS NOT NEW.decision
  OR json_extract(NEW.payload_json, '$.reviewer_ref') IS NOT NEW.reviewer_ref
  OR json_extract(NEW.payload_json, '$.reason') IS NOT NEW.reason
  OR json_extract(NEW.payload_json, '$.approved_snapshot_hash') IS NOT NEW.approved_snapshot_hash
  OR json_extract(NEW.payload_json, '$.decided_at') IS NOT NEW.decided_at
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'skill review payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS skill_installations_payload_columns_match_insert
BEFORE INSERT ON skill_installations
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.skill_id') IS NOT NEW.skill_id
  OR json_extract(NEW.payload_json, '$.version_id') IS NOT NEW.version_id
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.approved_snapshot_hash') IS NOT NEW.approved_snapshot_hash
  OR json_extract(NEW.payload_json, '$.installed_at') IS NOT NEW.installed_at
  OR json_extract(NEW.payload_json, '$.revoked_at') IS NOT NEW.revoked_at
  OR json_extract(NEW.payload_json, '$.quarantine_reason') IS NOT NEW.quarantine_reason
  OR json_extract(NEW.payload_json, '$.rollback_to_version_id') IS NOT NEW.rollback_to_version_id
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'skill installation payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS skill_installations_payload_columns_match_update
BEFORE UPDATE ON skill_installations
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.skill_id') IS NOT NEW.skill_id
  OR json_extract(NEW.payload_json, '$.version_id') IS NOT NEW.version_id
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.approved_snapshot_hash') IS NOT NEW.approved_snapshot_hash
  OR json_extract(NEW.payload_json, '$.installed_at') IS NOT NEW.installed_at
  OR json_extract(NEW.payload_json, '$.revoked_at') IS NOT NEW.revoked_at
  OR json_extract(NEW.payload_json, '$.quarantine_reason') IS NOT NEW.quarantine_reason
  OR json_extract(NEW.payload_json, '$.rollback_to_version_id') IS NOT NEW.rollback_to_version_id
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'skill installation payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS skill_invocations_payload_columns_match_insert
BEFORE INSERT ON skill_invocation_facts
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.skill_id') IS NOT NEW.skill_id
  OR json_extract(NEW.payload_json, '$.version_id') IS NOT NEW.version_id
  OR json_extract(NEW.payload_json, '$.installation_id') IS NOT NEW.installation_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.goal_loop_id') IS NOT NEW.goal_loop_id
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.snapshot_hash') IS NOT NEW.snapshot_hash
  OR json_extract(NEW.payload_json, '$.reason') IS NOT NEW.reason
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'skill invocation payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS learning_candidates_payload_columns_match_insert
BEFORE INSERT ON learning_candidates
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.goal_loop_id') IS NOT NEW.goal_loop_id
  OR json_extract(NEW.payload_json, '$.source_event_id') IS NOT NEW.source_event_id
  OR json_extract(NEW.payload_json, '$.proposed_skill_id') IS NOT NEW.proposed_skill_id
  OR json_extract(NEW.payload_json, '$.lesson') IS NOT NEW.lesson
  OR json_extract(NEW.payload_json, '$.proposed_diff_summary') IS NOT NEW.proposed_diff_summary
  OR json_extract(NEW.payload_json, '$.evidence_refs') IS NOT json(NEW.evidence_refs_json)
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'learning candidate payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS learning_candidates_payload_columns_match_update
BEFORE UPDATE ON learning_candidates
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.goal_loop_id') IS NOT NEW.goal_loop_id
  OR json_extract(NEW.payload_json, '$.source_event_id') IS NOT NEW.source_event_id
  OR json_extract(NEW.payload_json, '$.proposed_skill_id') IS NOT NEW.proposed_skill_id
  OR json_extract(NEW.payload_json, '$.lesson') IS NOT NEW.lesson
  OR json_extract(NEW.payload_json, '$.proposed_diff_summary') IS NOT NEW.proposed_diff_summary
  OR json_extract(NEW.payload_json, '$.evidence_refs') IS NOT json(NEW.evidence_refs_json)
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'learning candidate payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS learning_commands_payload_columns_match_insert
BEFORE INSERT ON learning_commands
WHEN json_extract(NEW.payload_json, '$.command_id') IS NOT NEW.command_id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.kind') IS NOT NEW.kind
  OR json_extract(NEW.payload_json, '$.idempotency_key') IS NOT NEW.idempotency_key
  OR json_extract(NEW.payload_json, '$.expected_revision') IS NOT NEW.expected_revision
  OR json_extract(NEW.payload_json, '$.installation_revision') IS NOT NEW.installation_revision
  OR json_extract(NEW.payload_json, '$.candidate_id') IS NOT NEW.candidate_id
  OR json_extract(NEW.payload_json, '$.skill_id') IS NOT NEW.skill_id
  OR json_extract(NEW.payload_json, '$.version_id') IS NOT NEW.version_id
  OR json_extract(NEW.payload_json, '$.reason') IS NOT NEW.reason
  OR json_extract(NEW.payload_json, '$.rollback_to_version_id') IS NOT NEW.rollback_to_version_id
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'learning command payload must match normalized columns');
END;

CREATE TRIGGER IF NOT EXISTS learning_commands_kind_fields_insert
BEFORE INSERT ON learning_commands
WHEN (NEW.kind = 'learn' AND (
    NEW.candidate_id IS NULL
    OR NEW.skill_id IS NOT NULL
    OR NEW.version_id IS NOT NULL
    OR NEW.rollback_to_version_id IS NOT NULL
    OR NEW.installation_revision IS NOT NULL
  ))
  OR (NEW.kind != 'learn' AND (
    NEW.candidate_id IS NOT NULL
    OR NEW.skill_id IS NULL
    OR NEW.version_id IS NULL
  ))
  OR (NEW.kind != 'rollback' AND NEW.rollback_to_version_id IS NOT NULL)
  OR (NEW.kind IN ('approve', 'install', 'scan') AND NEW.installation_revision IS NOT NULL)
  OR (NEW.kind IN ('revoke', 'quarantine', 'rollback') AND NEW.installation_revision IS NULL)
  OR (NEW.kind = 'rollback' AND NEW.rollback_to_version_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'learning command fields must match command kind');
END;

CREATE TRIGGER IF NOT EXISTS skills_active_requires_approved_pointer_insert
BEFORE INSERT ON skills
WHEN NEW.status = 'active'
  AND NEW.approved_version_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'active skill requires approved version pointer');
END;

CREATE TRIGGER IF NOT EXISTS skills_active_requires_approved_pointer_update
BEFORE UPDATE ON skills
WHEN NEW.status = 'active'
  AND NEW.approved_version_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'active skill requires approved version pointer');
END;

CREATE TRIGGER IF NOT EXISTS skills_current_version_scope_insert
BEFORE INSERT ON skills
WHEN NEW.current_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM skill_versions version
    WHERE version.workspace_id = NEW.workspace_id
      AND version.skill_id = NEW.id
      AND version.id = NEW.current_version_id
  )
BEGIN
  SELECT RAISE(ABORT, 'skill current version pointer must reference same skill workspace');
END;

CREATE TRIGGER IF NOT EXISTS skills_current_version_scope_update
BEFORE UPDATE ON skills
WHEN NEW.current_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM skill_versions version
    WHERE version.workspace_id = NEW.workspace_id
      AND version.skill_id = NEW.id
      AND version.id = NEW.current_version_id
  )
BEGIN
  SELECT RAISE(ABORT, 'skill current version pointer must reference same skill workspace');
END;

CREATE TRIGGER IF NOT EXISTS skills_active_current_version_trust_chain_insert
BEFORE INSERT ON skills
WHEN NEW.status = 'active'
  AND NEW.current_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM skill_versions version
    JOIN skill_reviews review ON review.workspace_id = version.workspace_id AND review.skill_id = version.skill_id AND review.version_id = version.id
    JOIN skill_scans scan ON scan.workspace_id = review.workspace_id AND scan.id = review.scan_id AND scan.skill_id = review.skill_id AND scan.version_id = review.version_id
    WHERE version.workspace_id = NEW.workspace_id
      AND version.skill_id = NEW.id
      AND version.id = NEW.current_version_id
      AND version.status = 'approved'
      AND version.snapshot_hash IS NOT NULL
      AND version.snapshot_ref IS NOT NULL
      AND review.decision = 'approve'
      AND review.approved_snapshot_hash = version.snapshot_hash
      AND scan.status = 'passed'
      AND scan.source_hash = version.source_hash
      AND scan.secret_findings = 0
      AND json_type(scan.findings_json) = 'array'
      AND json_array_length(scan.findings_json) = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'skill active current version pointer requires approved snapshot and clean review scan');
END;

CREATE TRIGGER IF NOT EXISTS skills_active_current_version_trust_chain_update
BEFORE UPDATE ON skills
WHEN NEW.status = 'active'
  AND NEW.current_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM skill_versions version
    JOIN skill_reviews review ON review.workspace_id = version.workspace_id AND review.skill_id = version.skill_id AND review.version_id = version.id
    JOIN skill_scans scan ON scan.workspace_id = review.workspace_id AND scan.id = review.scan_id AND scan.skill_id = review.skill_id AND scan.version_id = review.version_id
    WHERE version.workspace_id = NEW.workspace_id
      AND version.skill_id = NEW.id
      AND version.id = NEW.current_version_id
      AND version.status = 'approved'
      AND version.snapshot_hash IS NOT NULL
      AND version.snapshot_ref IS NOT NULL
      AND review.decision = 'approve'
      AND review.approved_snapshot_hash = version.snapshot_hash
      AND scan.status = 'passed'
      AND scan.source_hash = version.source_hash
      AND scan.secret_findings = 0
      AND json_type(scan.findings_json) = 'array'
      AND json_array_length(scan.findings_json) = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'skill active current version pointer requires approved snapshot and clean review scan');
END;

CREATE TRIGGER IF NOT EXISTS skills_approved_version_trust_chain_insert
BEFORE INSERT ON skills
WHEN NEW.approved_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM skill_versions version
    JOIN skill_reviews review ON review.workspace_id = version.workspace_id AND review.skill_id = version.skill_id AND review.version_id = version.id
    JOIN skill_scans scan ON scan.workspace_id = review.workspace_id AND scan.id = review.scan_id AND scan.skill_id = review.skill_id AND scan.version_id = review.version_id
    WHERE version.workspace_id = NEW.workspace_id
      AND version.skill_id = NEW.id
      AND version.id = NEW.approved_version_id
      AND version.status = 'approved'
      AND version.snapshot_hash IS NOT NULL
      AND version.snapshot_ref IS NOT NULL
      AND review.decision = 'approve'
      AND review.approved_snapshot_hash = version.snapshot_hash
      AND scan.status = 'passed'
      AND scan.source_hash = version.source_hash
      AND scan.secret_findings = 0
      AND json_type(scan.findings_json) = 'array'
      AND json_array_length(scan.findings_json) = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'skill approved version pointer requires approved snapshot and clean review scan');
END;

CREATE TRIGGER IF NOT EXISTS skills_approved_version_trust_chain_update
BEFORE UPDATE ON skills
WHEN NEW.approved_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM skill_versions version
    JOIN skill_reviews review ON review.workspace_id = version.workspace_id AND review.skill_id = version.skill_id AND review.version_id = version.id
    JOIN skill_scans scan ON scan.workspace_id = review.workspace_id AND scan.id = review.scan_id AND scan.skill_id = review.skill_id AND scan.version_id = review.version_id
    WHERE version.workspace_id = NEW.workspace_id
      AND version.skill_id = NEW.id
      AND version.id = NEW.approved_version_id
      AND version.status = 'approved'
      AND version.snapshot_hash IS NOT NULL
      AND version.snapshot_ref IS NOT NULL
      AND review.decision = 'approve'
      AND review.approved_snapshot_hash = version.snapshot_hash
      AND scan.status = 'passed'
      AND scan.source_hash = version.source_hash
      AND scan.secret_findings = 0
      AND json_type(scan.findings_json) = 'array'
      AND json_array_length(scan.findings_json) = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'skill approved version pointer requires approved snapshot and clean review scan');
END;

CREATE TRIGGER IF NOT EXISTS skill_versions_snapshot_ref_safe_insert
BEFORE INSERT ON skill_versions
WHEN NEW.snapshot_ref IS NOT NULL
  AND (
    lower(NEW.snapshot_ref) NOT LIKE 'artifact://%'
    AND lower(NEW.snapshot_ref) NOT LIKE 'workspace://%'
    AND lower(NEW.snapshot_ref) NOT LIKE 'memory://%'
    AND lower(NEW.snapshot_ref) NOT LIKE 'skill://%'
    OR lower(NEW.snapshot_ref) LIKE 'artifact:///%'
    OR lower(NEW.snapshot_ref) LIKE 'workspace:///%'
    OR lower(NEW.snapshot_ref) LIKE 'memory:///%'
    OR lower(NEW.snapshot_ref) LIKE 'skill:///%'
    OR instr(lower(NEW.snapshot_ref), 'http://') > 0
    OR instr(lower(NEW.snapshot_ref), 'https://') > 0
    OR instr(lower(NEW.snapshot_ref), 'file://') > 0
    OR instr(lower(NEW.snapshot_ref), 'secret://') > 0
    OR instr(lower(NEW.snapshot_ref), 'vault://') > 0
    OR instr(lower(NEW.snapshot_ref), '=/') > 0
    OR instr(lower(NEW.snapshot_ref), '=~/') > 0
    OR instr(lower(NEW.snapshot_ref), '=../') > 0
    OR instr(lower(NEW.snapshot_ref), '=./') > 0
    OR instr(lower(NEW.snapshot_ref), '/../') > 0
    OR instr(lower(NEW.snapshot_ref), '/./') > 0
    OR instr(lower(NEW.snapshot_ref), '%2e') > 0
    OR instr(lower(NEW.snapshot_ref), '%2f') > 0
    OR instr(lower(NEW.snapshot_ref), '%5c') > 0
    OR instr(lower(NEW.snapshot_ref), '%25') > 0
    OR replace(lower(NEW.snapshot_ref), '://', ':--') GLOB '*[a-z]:/*'
    OR (lower(NEW.snapshot_ref) LIKE 'artifact://%' AND instr(substr(lower(NEW.snapshot_ref), 12), '://') > 0)
    OR (lower(NEW.snapshot_ref) LIKE 'workspace://%' AND instr(substr(lower(NEW.snapshot_ref), 13), '://') > 0)
    OR (lower(NEW.snapshot_ref) LIKE 'memory://%' AND instr(substr(lower(NEW.snapshot_ref), 10), '://') > 0)
    OR (lower(NEW.snapshot_ref) LIKE 'skill://%' AND instr(substr(lower(NEW.snapshot_ref), 9), '://') > 0)
  )
BEGIN
  SELECT RAISE(ABORT, 'skill snapshot ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS skill_versions_snapshot_ref_safe_update
BEFORE UPDATE OF snapshot_ref ON skill_versions
WHEN NEW.snapshot_ref IS NOT NULL
  AND (
    lower(NEW.snapshot_ref) NOT LIKE 'artifact://%'
    AND lower(NEW.snapshot_ref) NOT LIKE 'workspace://%'
    AND lower(NEW.snapshot_ref) NOT LIKE 'memory://%'
    AND lower(NEW.snapshot_ref) NOT LIKE 'skill://%'
    OR lower(NEW.snapshot_ref) LIKE 'artifact:///%'
    OR lower(NEW.snapshot_ref) LIKE 'workspace:///%'
    OR lower(NEW.snapshot_ref) LIKE 'memory:///%'
    OR lower(NEW.snapshot_ref) LIKE 'skill:///%'
    OR instr(lower(NEW.snapshot_ref), 'http://') > 0
    OR instr(lower(NEW.snapshot_ref), 'https://') > 0
    OR instr(lower(NEW.snapshot_ref), 'file://') > 0
    OR instr(lower(NEW.snapshot_ref), 'secret://') > 0
    OR instr(lower(NEW.snapshot_ref), 'vault://') > 0
    OR instr(lower(NEW.snapshot_ref), '=/') > 0
    OR instr(lower(NEW.snapshot_ref), '=~/') > 0
    OR instr(lower(NEW.snapshot_ref), '=../') > 0
    OR instr(lower(NEW.snapshot_ref), '=./') > 0
    OR instr(lower(NEW.snapshot_ref), '/../') > 0
    OR instr(lower(NEW.snapshot_ref), '/./') > 0
    OR instr(lower(NEW.snapshot_ref), '%2e') > 0
    OR instr(lower(NEW.snapshot_ref), '%2f') > 0
    OR instr(lower(NEW.snapshot_ref), '%5c') > 0
    OR instr(lower(NEW.snapshot_ref), '%25') > 0
    OR replace(lower(NEW.snapshot_ref), '://', ':--') GLOB '*[a-z]:/*'
    OR (lower(NEW.snapshot_ref) LIKE 'artifact://%' AND instr(substr(lower(NEW.snapshot_ref), 12), '://') > 0)
    OR (lower(NEW.snapshot_ref) LIKE 'workspace://%' AND instr(substr(lower(NEW.snapshot_ref), 13), '://') > 0)
    OR (lower(NEW.snapshot_ref) LIKE 'memory://%' AND instr(substr(lower(NEW.snapshot_ref), 10), '://') > 0)
    OR (lower(NEW.snapshot_ref) LIKE 'skill://%' AND instr(substr(lower(NEW.snapshot_ref), 9), '://') > 0)
  )
BEGIN
  SELECT RAISE(ABORT, 'skill snapshot ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS skill_versions_approved_requires_snapshot_insert
BEFORE INSERT ON skill_versions
WHEN NEW.status = 'approved'
  AND (
    NEW.snapshot_hash IS NULL
    OR NEW.snapshot_ref IS NULL
    OR NEW.approved_at IS NULL
    OR NEW.approved_by IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'skill approved version requires snapshot metadata');
END;

CREATE TRIGGER IF NOT EXISTS skill_versions_approved_requires_snapshot_update
BEFORE UPDATE OF status, snapshot_hash, snapshot_ref, approved_at, approved_by ON skill_versions
WHEN NEW.status = 'approved'
  AND (
    NEW.snapshot_hash IS NULL
    OR NEW.snapshot_ref IS NULL
    OR NEW.approved_at IS NULL
    OR NEW.approved_by IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'skill approved version requires snapshot metadata');
END;

CREATE TRIGGER IF NOT EXISTS skill_versions_approved_review_trust_update
BEFORE UPDATE OF skill_id, status, source_hash, snapshot_hash, snapshot_ref ON skill_versions
WHEN EXISTS (
    SELECT 1 FROM skill_reviews review
    WHERE review.workspace_id = OLD.workspace_id
      AND review.skill_id = OLD.skill_id
      AND review.version_id = OLD.id
      AND review.decision = 'approve'
  )
  AND NOT EXISTS (
    SELECT 1 FROM skill_reviews review
    JOIN skill_scans scan ON scan.workspace_id = review.workspace_id AND scan.id = review.scan_id AND scan.skill_id = review.skill_id AND scan.version_id = review.version_id
    WHERE review.workspace_id = NEW.workspace_id
      AND review.skill_id = NEW.skill_id
      AND review.version_id = NEW.id
      AND review.decision = 'approve'
      AND NEW.status = 'approved'
      AND NEW.snapshot_hash IS NOT NULL
      AND NEW.snapshot_ref IS NOT NULL
      AND review.approved_snapshot_hash = NEW.snapshot_hash
      AND scan.status = 'passed'
      AND scan.source_hash = NEW.source_hash
      AND scan.secret_findings = 0
      AND json_type(scan.findings_json) = 'array'
      AND json_array_length(scan.findings_json) = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'skill version approved snapshot trust chain cannot be invalidated');
END;

CREATE TRIGGER IF NOT EXISTS skill_sources_source_ref_safe_insert
BEFORE INSERT ON skill_sources
WHEN lower(NEW.source_ref) NOT LIKE 'artifact://%'
  AND lower(NEW.source_ref) NOT LIKE 'workspace://%'
  AND lower(NEW.source_ref) NOT LIKE 'memory://%'
  AND lower(NEW.source_ref) NOT LIKE 'skill://%'
  OR lower(NEW.source_ref) LIKE 'artifact:///%'
  OR lower(NEW.source_ref) LIKE 'workspace:///%'
  OR lower(NEW.source_ref) LIKE 'memory:///%'
  OR lower(NEW.source_ref) LIKE 'skill:///%'
  OR instr(lower(NEW.source_ref), 'http://') > 0
  OR instr(lower(NEW.source_ref), 'https://') > 0
  OR instr(lower(NEW.source_ref), 'file://') > 0
  OR instr(lower(NEW.source_ref), 'secret://') > 0
  OR instr(lower(NEW.source_ref), 'vault://') > 0
  OR instr(lower(NEW.source_ref), '=/') > 0
  OR instr(lower(NEW.source_ref), '=~/') > 0
  OR instr(lower(NEW.source_ref), '=../') > 0
  OR instr(lower(NEW.source_ref), '=./') > 0
  OR instr(lower(NEW.source_ref), '/../') > 0
  OR instr(lower(NEW.source_ref), '/./') > 0
  OR instr(lower(NEW.source_ref), '%2e') > 0
  OR instr(lower(NEW.source_ref), '%2f') > 0
  OR instr(lower(NEW.source_ref), '%5c') > 0
  OR instr(lower(NEW.source_ref), '%25') > 0
  OR replace(lower(NEW.source_ref), '://', ':--') GLOB '*[a-z]:/*'
  OR (lower(NEW.source_ref) LIKE 'artifact://%' AND instr(substr(lower(NEW.source_ref), 12), '://') > 0)
  OR (lower(NEW.source_ref) LIKE 'workspace://%' AND instr(substr(lower(NEW.source_ref), 13), '://') > 0)
  OR (lower(NEW.source_ref) LIKE 'memory://%' AND instr(substr(lower(NEW.source_ref), 10), '://') > 0)
  OR (lower(NEW.source_ref) LIKE 'skill://%' AND instr(substr(lower(NEW.source_ref), 9), '://') > 0)
BEGIN
  SELECT RAISE(ABORT, 'skill source ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS skill_scans_passed_requires_clean_findings_insert
BEFORE INSERT ON skill_scans
WHEN NEW.status = 'passed'
  AND (
    NEW.secret_findings != 0
    OR json_type(NEW.findings_json) IS NOT 'array'
    OR json_array_length(NEW.findings_json) != 0
  )
BEGIN
  SELECT RAISE(ABORT, 'skill passed scan requires no findings');
END;

CREATE TRIGGER IF NOT EXISTS skill_reviews_approval_requires_clean_scan_insert
BEFORE INSERT ON skill_reviews
WHEN NEW.decision = 'approve'
  AND NOT EXISTS (
    SELECT 1 FROM skill_scans scan
    JOIN skill_versions version ON version.workspace_id = scan.workspace_id AND version.id = scan.version_id AND version.skill_id = scan.skill_id
    WHERE scan.workspace_id = NEW.workspace_id
      AND scan.id = NEW.scan_id
      AND scan.skill_id = NEW.skill_id
      AND scan.version_id = NEW.version_id
      AND scan.status = 'passed'
      AND scan.source_hash = version.source_hash
      AND scan.secret_findings = 0
      AND json_type(scan.findings_json) = 'array'
      AND json_array_length(scan.findings_json) = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'skill approval review requires clean passed scan');
END;

CREATE TRIGGER IF NOT EXISTS skill_installations_require_approved_version_insert
BEFORE INSERT ON skill_installations
WHEN NEW.status = 'installed'
  AND NOT EXISTS (
    SELECT 1 FROM skill_versions version
    JOIN skill_reviews review ON review.workspace_id = version.workspace_id AND review.skill_id = version.skill_id AND review.version_id = version.id
    JOIN skill_scans scan ON scan.workspace_id = review.workspace_id AND scan.id = review.scan_id AND scan.skill_id = review.skill_id AND scan.version_id = review.version_id
    WHERE version.workspace_id = NEW.workspace_id
      AND version.id = NEW.version_id
      AND version.skill_id = NEW.skill_id
      AND version.status = 'approved'
      AND version.snapshot_hash = NEW.approved_snapshot_hash
      AND version.snapshot_ref IS NOT NULL
      AND review.decision = 'approve'
      AND review.approved_snapshot_hash = version.snapshot_hash
      AND scan.status = 'passed'
      AND scan.source_hash = version.source_hash
      AND scan.secret_findings = 0
      AND json_type(scan.findings_json) = 'array'
      AND json_array_length(scan.findings_json) = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'skill installation requires approved snapshot and clean review scan');
END;

CREATE TRIGGER IF NOT EXISTS skill_installations_require_approved_version_update
BEFORE UPDATE OF status, skill_id, version_id, approved_snapshot_hash ON skill_installations
WHEN NEW.status = 'installed'
  AND NOT EXISTS (
    SELECT 1 FROM skill_versions version
    JOIN skill_reviews review ON review.workspace_id = version.workspace_id AND review.skill_id = version.skill_id AND review.version_id = version.id
    JOIN skill_scans scan ON scan.workspace_id = review.workspace_id AND scan.id = review.scan_id AND scan.skill_id = review.skill_id AND scan.version_id = review.version_id
    WHERE version.workspace_id = NEW.workspace_id
      AND version.id = NEW.version_id
      AND version.skill_id = NEW.skill_id
      AND version.status = 'approved'
      AND version.snapshot_hash = NEW.approved_snapshot_hash
      AND version.snapshot_ref IS NOT NULL
      AND review.decision = 'approve'
      AND review.approved_snapshot_hash = version.snapshot_hash
      AND scan.status = 'passed'
      AND scan.source_hash = version.source_hash
      AND scan.secret_findings = 0
      AND json_type(scan.findings_json) = 'array'
      AND json_array_length(scan.findings_json) = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'skill installation requires approved snapshot and clean review scan');
END;

CREATE TRIGGER IF NOT EXISTS skill_sources_skill_version_scope_insert
BEFORE INSERT ON skill_sources
WHEN NOT EXISTS (
  SELECT 1 FROM skill_versions
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.version_id
    AND skill_id = NEW.skill_id
)
BEGIN
  SELECT RAISE(ABORT, 'skill source skill/version scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS skill_scans_skill_version_scope_insert
BEFORE INSERT ON skill_scans
WHEN NOT EXISTS (
  SELECT 1 FROM skill_versions
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.version_id
    AND skill_id = NEW.skill_id
)
BEGIN
  SELECT RAISE(ABORT, 'skill scan skill/version scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS skill_reviews_skill_version_scope_insert
BEFORE INSERT ON skill_reviews
WHEN NOT EXISTS (
  SELECT 1 FROM skill_versions
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.version_id
    AND skill_id = NEW.skill_id
)
BEGIN
  SELECT RAISE(ABORT, 'skill review skill/version scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS skill_reviews_scan_version_scope_insert
BEFORE INSERT ON skill_reviews
WHEN NOT EXISTS (
  SELECT 1 FROM skill_scans
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.scan_id
    AND skill_id = NEW.skill_id
    AND version_id = NEW.version_id
)
BEGIN
  SELECT RAISE(ABORT, 'skill review scan/version scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS skill_installations_require_rollback_target_insert
BEFORE INSERT ON skill_installations
WHEN NEW.status = 'rolled_back'
  AND NEW.rollback_to_version_id = NEW.version_id
BEGIN
  SELECT RAISE(ABORT, 'skill rollback target must differ from current version');
END;

CREATE TRIGGER IF NOT EXISTS skill_installations_require_rollback_snapshot_insert
BEFORE INSERT ON skill_installations
WHEN NEW.status = 'rolled_back'
  AND NOT EXISTS (
    SELECT 1 FROM skill_versions version
    JOIN skill_reviews review ON review.workspace_id = version.workspace_id AND review.skill_id = version.skill_id AND review.version_id = version.id
    JOIN skill_scans scan ON scan.workspace_id = review.workspace_id AND scan.id = review.scan_id AND scan.skill_id = review.skill_id AND scan.version_id = review.version_id
    WHERE version.workspace_id = NEW.workspace_id
      AND version.id = NEW.rollback_to_version_id
      AND version.skill_id = NEW.skill_id
      AND version.status = 'approved'
      AND version.snapshot_hash IS NOT NULL
      AND version.snapshot_ref IS NOT NULL
      AND review.decision = 'approve'
      AND review.approved_snapshot_hash = version.snapshot_hash
      AND scan.status = 'passed'
      AND scan.source_hash = version.source_hash
      AND scan.secret_findings = 0
      AND json_type(scan.findings_json) = 'array'
      AND json_array_length(scan.findings_json) = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'skill rollback target requires same skill approved snapshot and clean review scan');
END;

CREATE TRIGGER IF NOT EXISTS skill_installations_status_transition_update
BEFORE UPDATE OF status ON skill_installations
WHEN (OLD.status = 'installed' AND NEW.status NOT IN ('revoked', 'quarantined', 'rolled_back'))
  OR (OLD.status = 'quarantined' AND NEW.status NOT IN ('revoked', 'rolled_back'))
  OR (OLD.status = 'rolled_back' AND NEW.status NOT IN ('revoked', 'quarantined'))
  OR OLD.status = 'revoked'
BEGIN
  SELECT RAISE(ABORT, 'skill installation status transition is invalid');
END;

CREATE TRIGGER IF NOT EXISTS skill_installations_require_rollback_target_update
BEFORE UPDATE OF status, rollback_to_version_id ON skill_installations
WHEN NEW.status = 'rolled_back'
  AND NEW.rollback_to_version_id = NEW.version_id
BEGIN
  SELECT RAISE(ABORT, 'skill rollback target must differ from current version');
END;

CREATE TRIGGER IF NOT EXISTS skill_installations_require_rollback_snapshot_update
BEFORE UPDATE OF status, rollback_to_version_id ON skill_installations
WHEN NEW.status = 'rolled_back'
  AND NOT EXISTS (
    SELECT 1 FROM skill_versions version
    JOIN skill_reviews review ON review.workspace_id = version.workspace_id AND review.skill_id = version.skill_id AND review.version_id = version.id
    JOIN skill_scans scan ON scan.workspace_id = review.workspace_id AND scan.id = review.scan_id AND scan.skill_id = review.skill_id AND scan.version_id = review.version_id
    WHERE version.workspace_id = NEW.workspace_id
      AND version.id = NEW.rollback_to_version_id
      AND version.skill_id = NEW.skill_id
      AND version.status = 'approved'
      AND version.snapshot_hash IS NOT NULL
      AND version.snapshot_ref IS NOT NULL
      AND review.decision = 'approve'
      AND review.approved_snapshot_hash = version.snapshot_hash
      AND scan.status = 'passed'
      AND scan.source_hash = version.source_hash
      AND scan.secret_findings = 0
      AND json_type(scan.findings_json) = 'array'
      AND json_array_length(scan.findings_json) = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'skill rollback target requires same skill approved snapshot and clean review scan');
END;

CREATE TRIGGER IF NOT EXISTS skill_invocations_require_installed_snapshot_insert
BEFORE INSERT ON skill_invocation_facts
WHEN NEW.status = 'allowed'
  AND NOT EXISTS (
    SELECT 1 FROM skill_installations
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.installation_id
      AND skill_id = NEW.skill_id
      AND version_id = NEW.version_id
      AND status = 'installed'
      AND approved_snapshot_hash = NEW.snapshot_hash
  )
BEGIN
  SELECT RAISE(ABORT, 'skill invocation requires approved installed snapshot');
END;

CREATE TRIGGER IF NOT EXISTS skill_invocations_goal_run_scope_insert
BEFORE INSERT ON skill_invocation_facts
WHEN NOT EXISTS (
  SELECT 1 FROM goal_loops
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.goal_loop_id
    AND run_id = NEW.run_id
)
BEGIN
  SELECT RAISE(ABORT, 'skill invocation run/goal scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS learning_candidates_goal_run_scope_insert
BEFORE INSERT ON learning_candidates
WHEN NOT EXISTS (
  SELECT 1 FROM goal_loops
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.goal_loop_id
    AND run_id = NEW.run_id
)
BEGIN
  SELECT RAISE(ABORT, 'learning candidate run/goal scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS learning_candidates_goal_run_scope_update
BEFORE UPDATE OF workspace_id, run_id, goal_loop_id ON learning_candidates
WHEN NOT EXISTS (
  SELECT 1 FROM goal_loops
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.goal_loop_id
    AND run_id = NEW.run_id
)
BEGIN
  SELECT RAISE(ABORT, 'learning candidate run/goal scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS learning_source_events_envelope_insert
BEFORE INSERT ON events
WHEN NEW.event_type = 'learning.source' AND (
  json_extract(NEW.payload_json, '$.event_id') IS NOT NEW.event_id
  OR json_extract(NEW.payload_json, '$.event_type') IS NOT NEW.event_type
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.occurred_at') IS NOT NEW.occurred_at
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.scope.kind') IS NOT 'run'
  OR json_extract(NEW.payload_json, '$.scope.id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.trace_id') IS NOT NEW.trace_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.attempt_id') IS NOT NEW.attempt_id
  OR json_extract(NEW.payload_json, '$.step_id') IS NOT NEW.step_id
  OR json_extract(NEW.payload_json, '$.sequence') IS NOT NEW.sequence
  OR COALESCE(json_type(NEW.payload_json, '$.actor'), '') != 'object'
  OR json_extract(NEW.payload_json, '$.actor.type') NOT IN ('system', 'agent', 'human', 'connector')
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json, '$.actor') WHERE key = 'id') != 1
  OR json_type(NEW.payload_json, '$.actor.id') NOT IN ('null', 'text')
  OR (json_type(NEW.payload_json, '$.actor.id') = 'text' AND (
    length(json_extract(NEW.payload_json, '$.actor.id')) != 26
    OR json_extract(NEW.payload_json, '$.actor.id') NOT GLOB '[0-7][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z]'
  ))
  OR COALESCE(json_type(NEW.payload_json, '$.payload'), '') != 'object'
  OR json_extract(NEW.payload_json, '$.payload.descriptor_only') IS NOT 1
  OR COALESCE(json_type(NEW.payload_json, '$.payload.proposed_skill_id'), '') != 'text'
  OR length(json_extract(NEW.payload_json, '$.payload.proposed_skill_id')) > 96
  OR json_extract(NEW.payload_json, '$.payload.proposed_skill_id') NOT GLOB '[a-z]*'
  OR json_extract(NEW.payload_json, '$.payload.proposed_skill_id') GLOB '*[^a-z0-9._-]*'
  OR COALESCE(json_type(NEW.payload_json, '$.payload.goal_loop_id'), '') != 'text'
  OR length(json_extract(NEW.payload_json, '$.payload.goal_loop_id')) != 26
  OR json_extract(NEW.payload_json, '$.payload.goal_loop_id') NOT GLOB '[0-7][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z]'
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json, '$.payload') WHERE key = 'continuation_cursor') != 1
  OR json_type(NEW.payload_json, '$.payload.continuation_cursor') NOT IN ('null', 'text')
  OR (json_type(NEW.payload_json, '$.payload.continuation_cursor') = 'text' AND (
    length(json_extract(NEW.payload_json, '$.payload.continuation_cursor')) < 1
    OR length(json_extract(NEW.payload_json, '$.payload.continuation_cursor')) > 512
  ))
  OR COALESCE(json_type(NEW.payload_json, '$.redactions'), '') != 'array'
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json) WHERE key NOT IN ('event_id', 'event_type', 'schema_version', 'occurred_at', 'workspace_id', 'scope', 'trace_id', 'run_id', 'attempt_id', 'step_id', 'actor', 'payload', 'redactions', 'sequence')) > 0
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json, '$.scope') WHERE key NOT IN ('kind', 'id')) > 0
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json, '$.actor') WHERE key NOT IN ('type', 'id')) > 0
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json, '$.payload') WHERE key NOT IN ('descriptor_only', 'proposed_skill_id', 'goal_loop_id', 'continuation_cursor')) > 0
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json, '$.redactions') WHERE type != 'text') > 0
  OR NOT EXISTS (
    SELECT 1 FROM goal_loops loop
    WHERE loop.workspace_id = NEW.workspace_id
      AND loop.id = json_extract(NEW.payload_json, '$.payload.goal_loop_id')
      AND loop.run_id = NEW.run_id
      AND loop.continuation_cursor IS json_extract(NEW.payload_json, '$.payload.continuation_cursor')
  )
)
BEGIN
  SELECT RAISE(ABORT, 'learning source event envelope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS learning_candidates_proposed_skill_scope_insert
BEFORE INSERT ON learning_candidates
WHEN NOT EXISTS (
  SELECT 1 FROM skills skill
  WHERE skill.workspace_id = NEW.workspace_id
    AND skill.id = NEW.proposed_skill_id
)
BEGIN
  SELECT RAISE(ABORT, 'learning candidate proposed skill scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS learning_candidates_proposed_skill_scope_update
BEFORE UPDATE OF workspace_id, proposed_skill_id ON learning_candidates
WHEN NOT EXISTS (
  SELECT 1 FROM skills skill
  WHERE skill.workspace_id = NEW.workspace_id
    AND skill.id = NEW.proposed_skill_id
)
BEGIN
  SELECT RAISE(ABORT, 'learning candidate proposed skill scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS learning_candidates_source_event_scope_insert
BEFORE INSERT ON learning_candidates
WHEN NOT EXISTS (
  SELECT 1 FROM events event
  JOIN goal_loops loop ON loop.workspace_id = event.workspace_id
    AND loop.id = NEW.goal_loop_id
    AND loop.id = json_extract(event.payload_json, '$.payload.goal_loop_id')
    AND loop.run_id = event.run_id
    AND loop.continuation_cursor IS json_extract(event.payload_json, '$.payload.continuation_cursor')
  WHERE event.workspace_id = NEW.workspace_id
    AND event.run_id = NEW.run_id
    AND event.event_id = NEW.source_event_id
    AND event.event_type = 'learning.source'
    AND json_extract(event.payload_json, '$.payload.proposed_skill_id') = NEW.proposed_skill_id
)
BEGIN
  SELECT RAISE(ABORT, 'learning candidate source event skill loop scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS learning_candidates_source_event_scope_update
BEFORE UPDATE OF workspace_id, run_id, goal_loop_id, source_event_id, proposed_skill_id ON learning_candidates
WHEN NOT EXISTS (
  SELECT 1 FROM events event
  JOIN goal_loops loop ON loop.workspace_id = event.workspace_id
    AND loop.id = NEW.goal_loop_id
    AND loop.id = json_extract(event.payload_json, '$.payload.goal_loop_id')
    AND loop.run_id = event.run_id
    AND loop.continuation_cursor IS json_extract(event.payload_json, '$.payload.continuation_cursor')
  WHERE event.workspace_id = NEW.workspace_id
    AND event.run_id = NEW.run_id
    AND event.event_id = NEW.source_event_id
    AND event.event_type = 'learning.source'
    AND json_extract(event.payload_json, '$.payload.proposed_skill_id') = NEW.proposed_skill_id
)
BEGIN
  SELECT RAISE(ABORT, 'learning candidate source event skill loop scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS skill_versions_snapshot_ref_safe_terminal_insert
BEFORE INSERT ON skill_versions
WHEN NEW.snapshot_ref IS NOT NULL AND (
  lower(NEW.snapshot_ref) LIKE '%/..'
  OR lower(NEW.snapshot_ref) LIKE '%/.'
  OR instr(lower(NEW.snapshot_ref), '~/') > 0
  OR instr(lower(NEW.snapshot_ref), '\\') > 0
)
BEGIN
  SELECT RAISE(ABORT, 'skill snapshot ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS skill_versions_snapshot_ref_safe_terminal_update
BEFORE UPDATE OF snapshot_ref ON skill_versions
WHEN NEW.snapshot_ref IS NOT NULL AND (
  lower(NEW.snapshot_ref) LIKE '%/..'
  OR lower(NEW.snapshot_ref) LIKE '%/.'
  OR instr(lower(NEW.snapshot_ref), '~/') > 0
  OR instr(lower(NEW.snapshot_ref), '\\') > 0
)
BEGIN
  SELECT RAISE(ABORT, 'skill snapshot ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS skill_sources_source_ref_safe_terminal_insert
BEFORE INSERT ON skill_sources
WHEN lower(NEW.source_ref) LIKE '%/..'
  OR lower(NEW.source_ref) LIKE '%/.'
  OR instr(lower(NEW.source_ref), '~/') > 0
  OR instr(lower(NEW.source_ref), '\\') > 0
BEGIN
  SELECT RAISE(ABORT, 'skill source ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS learning_candidates_evidence_refs_safe_insert
BEFORE INSERT ON learning_candidates
WHEN json_type(NEW.evidence_refs_json) IS NOT 'array'
  OR json_array_length(NEW.evidence_refs_json) < 1
  OR json_array_length(NEW.evidence_refs_json) > 32
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.evidence_refs_json)
    WHERE type != 'text'
      OR (
        lower(CAST(value AS TEXT)) NOT LIKE 'artifact://%'
        AND lower(CAST(value AS TEXT)) NOT LIKE 'workspace://%'
        AND lower(CAST(value AS TEXT)) NOT LIKE 'memory://%'
        AND lower(CAST(value AS TEXT)) NOT LIKE 'skill://%'
      )
      OR lower(CAST(value AS TEXT)) LIKE 'artifact:///%'
      OR lower(CAST(value AS TEXT)) LIKE 'workspace:///%'
      OR lower(CAST(value AS TEXT)) LIKE 'memory:///%'
      OR lower(CAST(value AS TEXT)) LIKE 'skill:///%'
      OR instr(substr(lower(CAST(value AS TEXT)), instr(lower(CAST(value AS TEXT)), '://') + 3), '://') > 0
      OR instr(lower(CAST(value AS TEXT)), 'http://') > 0
      OR instr(lower(CAST(value AS TEXT)), 'https://') > 0
      OR instr(lower(CAST(value AS TEXT)), 'file://') > 0
      OR instr(lower(CAST(value AS TEXT)), 'secret://') > 0
      OR instr(lower(CAST(value AS TEXT)), 'vault://') > 0
      OR instr(lower(CAST(value AS TEXT)), '=/') > 0
      OR instr(lower(CAST(value AS TEXT)), '=~/') > 0
      OR instr(lower(CAST(value AS TEXT)), '=../') > 0
      OR instr(lower(CAST(value AS TEXT)), '=./') > 0
      OR instr(lower(CAST(value AS TEXT)), '/../') > 0
      OR instr(lower(CAST(value AS TEXT)), '/./') > 0
      OR lower(CAST(value AS TEXT)) LIKE '%/..'
      OR lower(CAST(value AS TEXT)) LIKE '%/.'
      OR instr(lower(CAST(value AS TEXT)), '~/') > 0
      OR instr(lower(CAST(value AS TEXT)), '\\') > 0
      OR instr(lower(CAST(value AS TEXT)), '%2e') > 0
      OR instr(lower(CAST(value AS TEXT)), '%2f') > 0
      OR instr(lower(CAST(value AS TEXT)), '%5c') > 0
      OR instr(lower(CAST(value AS TEXT)), '%25') > 0
      OR replace(lower(CAST(value AS TEXT)), '://', ':--') GLOB '*[a-z]:/*'
  )
BEGIN
  SELECT RAISE(ABORT, 'learning evidence ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS learning_candidates_evidence_refs_safe_update
BEFORE UPDATE OF evidence_refs_json ON learning_candidates
WHEN json_type(NEW.evidence_refs_json) IS NOT 'array'
  OR json_array_length(NEW.evidence_refs_json) < 1
  OR json_array_length(NEW.evidence_refs_json) > 32
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.evidence_refs_json)
    WHERE type != 'text'
      OR (
        lower(CAST(value AS TEXT)) NOT LIKE 'artifact://%'
        AND lower(CAST(value AS TEXT)) NOT LIKE 'workspace://%'
        AND lower(CAST(value AS TEXT)) NOT LIKE 'memory://%'
        AND lower(CAST(value AS TEXT)) NOT LIKE 'skill://%'
      )
      OR lower(CAST(value AS TEXT)) LIKE 'artifact:///%'
      OR lower(CAST(value AS TEXT)) LIKE 'workspace:///%'
      OR lower(CAST(value AS TEXT)) LIKE 'memory:///%'
      OR lower(CAST(value AS TEXT)) LIKE 'skill:///%'
      OR instr(substr(lower(CAST(value AS TEXT)), instr(lower(CAST(value AS TEXT)), '://') + 3), '://') > 0
      OR instr(lower(CAST(value AS TEXT)), 'http://') > 0
      OR instr(lower(CAST(value AS TEXT)), 'https://') > 0
      OR instr(lower(CAST(value AS TEXT)), 'file://') > 0
      OR instr(lower(CAST(value AS TEXT)), 'secret://') > 0
      OR instr(lower(CAST(value AS TEXT)), 'vault://') > 0
      OR instr(lower(CAST(value AS TEXT)), '=/') > 0
      OR instr(lower(CAST(value AS TEXT)), '=~/') > 0
      OR instr(lower(CAST(value AS TEXT)), '=../') > 0
      OR instr(lower(CAST(value AS TEXT)), '=./') > 0
      OR instr(lower(CAST(value AS TEXT)), '/../') > 0
      OR instr(lower(CAST(value AS TEXT)), '/./') > 0
      OR lower(CAST(value AS TEXT)) LIKE '%/..'
      OR lower(CAST(value AS TEXT)) LIKE '%/.'
      OR instr(lower(CAST(value AS TEXT)), '~/') > 0
      OR instr(lower(CAST(value AS TEXT)), '\\') > 0
      OR instr(lower(CAST(value AS TEXT)), '%2e') > 0
      OR instr(lower(CAST(value AS TEXT)), '%2f') > 0
      OR instr(lower(CAST(value AS TEXT)), '%5c') > 0
      OR instr(lower(CAST(value AS TEXT)), '%25') > 0
      OR replace(lower(CAST(value AS TEXT)), '://', ':--') GLOB '*[a-z]:/*'
  )
BEGIN
  SELECT RAISE(ABORT, 'learning evidence ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS skills_text_safe_insert
BEFORE INSERT ON skills
WHEN instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'secret://') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'vault://') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'file://') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'token=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'token:') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'password=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'password:') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'passwd=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'pwd=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'api_key=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'apikey=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'access_token=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'client_secret=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'private_key=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'authorization=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'bearer ') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'basic ') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'xoxb-') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'xoxp-') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'ghp_') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'sk-live-') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'sk-proj-') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '/users/') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '/opt/') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '/etc/') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '~/') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '../') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), './') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '=/') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'c:/') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '%2e') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '%2f') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '%5c') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '%25') > 0
BEGIN
  SELECT RAISE(ABORT, 'skill text must not include secret or path-shaped content');
END;

CREATE TRIGGER IF NOT EXISTS skills_text_safe_update
BEFORE UPDATE OF name, description, quarantine_reason ON skills
WHEN instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'secret://') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'vault://') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'file://') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'token=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'token:') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'password=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'password:') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'passwd=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'pwd=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'api_key=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'apikey=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'access_token=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'client_secret=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'private_key=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'authorization=') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'bearer ') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'basic ') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'xoxb-') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'xoxp-') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'ghp_') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'sk-live-') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'sk-proj-') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '/users/') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '/opt/') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '/etc/') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '~/') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '../') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), './') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '=/') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), 'c:/') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '%2e') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '%2f') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '%5c') > 0
  OR instr(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), '%25') > 0
BEGIN
  SELECT RAISE(ABORT, 'skill text must not include secret or path-shaped content');
END;

CREATE TRIGGER IF NOT EXISTS skills_text_drive_safe_insert
BEFORE INSERT ON skills
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM (SELECT replace(replace(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), char(92), '/'), '://', ':--') AS text)
    WHERE text GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'skill text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS skills_text_drive_safe_update
BEFORE UPDATE OF name, description, quarantine_reason ON skills
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM (SELECT replace(replace(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), char(92), '/'), '://', ':--') AS text)
    WHERE text GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'skill text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS skill_versions_text_safe_insert
BEFORE INSERT ON skill_versions
WHEN instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), 'secret://') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), 'vault://') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), 'file://') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), 'token=') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), 'password=') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), 'api_key=') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), 'access_token=') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), '/users/') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), '/opt/') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), '/etc/') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), '~/') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), '../') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), './') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), '=/') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), '%2e') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), '%2f') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), '%5c') > 0
BEGIN
  SELECT RAISE(ABORT, 'skill version text must not include secret or path-shaped content');
END;

CREATE TRIGGER IF NOT EXISTS skill_sources_text_safe_insert
BEFORE INSERT ON skill_sources
WHEN instr(lower(COALESCE(NEW.diff_summary, '')), 'secret://') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), 'vault://') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), 'file://') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), 'token=') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), 'password=') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), 'api_key=') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), 'access_token=') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), '/users/') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), '/opt/') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), '/etc/') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), '~/') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), '../') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), './') > 0
  OR instr(lower(COALESCE(NEW.diff_summary, '')), '=/') > 0
BEGIN
  SELECT RAISE(ABORT, 'skill source text must not include secret or path-shaped content');
END;

CREATE TRIGGER IF NOT EXISTS skill_scans_text_safe_insert
BEFORE INSERT ON skill_scans
WHEN instr(lower(COALESCE(NEW.findings_json, '')), 'secret://') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), 'vault://') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), 'file://') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), 'token=') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), 'password=') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), 'api_key=') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), 'access_token=') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), '/users/') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), '/opt/') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), '/etc/') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), '~/') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), '../') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), './') > 0
  OR instr(lower(COALESCE(NEW.findings_json, '')), '=/') > 0
BEGIN
  SELECT RAISE(ABORT, 'skill scan text must not include secret or path-shaped content');
END;

CREATE TRIGGER IF NOT EXISTS skill_reviews_text_safe_insert
BEFORE INSERT ON skill_reviews
WHEN instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), 'secret://') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), 'vault://') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), 'file://') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), 'token=') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), 'token:') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), 'password=') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), 'password:') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), 'api_key=') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), 'access_token=') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), 'client_secret=') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), 'bearer ') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), '/users/') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), '/opt/') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), '/etc/') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), '~/') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), '../') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), './') > 0
  OR instr(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), '=/') > 0
BEGIN
  SELECT RAISE(ABORT, 'skill review text must not include secret or path-shaped content');
END;

CREATE TRIGGER IF NOT EXISTS skill_installations_text_safe_insert
BEFORE INSERT ON skill_installations
WHEN instr(lower(COALESCE(NEW.quarantine_reason, '')), 'secret://') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), 'vault://') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), 'file://') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), 'token=') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), 'password=') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), '/users/') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), '/opt/') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), '/etc/') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), '~/') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), '../') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), './') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), '=/') > 0
BEGIN
  SELECT RAISE(ABORT, 'skill installation text must not include secret or path-shaped content');
END;

CREATE TRIGGER IF NOT EXISTS skill_installations_text_safe_update
BEFORE UPDATE OF quarantine_reason ON skill_installations
WHEN instr(lower(COALESCE(NEW.quarantine_reason, '')), 'secret://') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), 'vault://') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), 'file://') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), 'token=') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), 'password=') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), '/users/') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), '/opt/') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), '/etc/') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), '~/') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), '../') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), './') > 0
  OR instr(lower(COALESCE(NEW.quarantine_reason, '')), '=/') > 0
BEGIN
  SELECT RAISE(ABORT, 'skill installation text must not include secret or path-shaped content');
END;

CREATE TRIGGER IF NOT EXISTS skill_invocations_text_safe_insert
BEFORE INSERT ON skill_invocation_facts
WHEN instr(lower(COALESCE(NEW.reason, '')), 'secret://') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), 'vault://') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), 'file://') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), 'token=') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), 'password=') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), '/users/') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), '/opt/') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), '/etc/') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), '~/') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), '../') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), './') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), '=/') > 0
BEGIN
  SELECT RAISE(ABORT, 'skill invocation text must not include secret or path-shaped content');
END;

CREATE TRIGGER IF NOT EXISTS learning_candidates_text_safe_insert
BEFORE INSERT ON learning_candidates
WHEN instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'secret://') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'vault://') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'file://') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'token=') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'token:') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'password=') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'password:') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'api_key=') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'access_token=') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'client_secret=') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'bearer ') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '/users/') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '/opt/') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '/etc/') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '~/') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '../') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), './') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '=/') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '%2e') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '%2f') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '%5c') > 0
BEGIN
  SELECT RAISE(ABORT, 'learning candidate text must not include secret or path-shaped content');
END;

CREATE TRIGGER IF NOT EXISTS learning_candidates_text_safe_update
BEFORE UPDATE OF lesson, proposed_diff_summary ON learning_candidates
WHEN instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'secret://') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'vault://') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'file://') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'token=') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'token:') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'password=') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'password:') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'api_key=') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'access_token=') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'client_secret=') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), 'bearer ') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '/users/') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '/opt/') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '/etc/') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '~/') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '../') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), './') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '=/') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '%2e') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '%2f') > 0
  OR instr(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), '%5c') > 0
BEGIN
  SELECT RAISE(ABORT, 'learning candidate text must not include secret or path-shaped content');
END;

CREATE TRIGGER IF NOT EXISTS learning_commands_text_safe_insert
BEFORE INSERT ON learning_commands
WHEN instr(lower(COALESCE(NEW.reason, '')), 'secret://') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), 'vault://') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), 'file://') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), 'token=') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), 'password=') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), 'api_key=') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), '/users/') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), '/opt/') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), '/etc/') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), '~/') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), '../') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), './') > 0
  OR instr(lower(COALESCE(NEW.reason, '')), '=/') > 0
BEGIN
  SELECT RAISE(ABORT, 'learning command text must not include secret or path-shaped content');
END;

CREATE TRIGGER IF NOT EXISTS c21_snapshot_ref_hardened_insert
BEFORE INSERT ON skill_versions
WHEN NEW.snapshot_ref IS NOT NULL AND EXISTS (
  SELECT 1 FROM (
    SELECT lower(NEW.snapshot_ref) AS text,
      replace(replace(lower(NEW.snapshot_ref), char(92), '/'), '://', ':--') AS normalized
  )
  WHERE instr(text, 'secret://') > 0
    OR instr(text, 'vault://') > 0
    OR instr(text, 'file://') > 0
    OR instr(text, 'http://') > 0
    OR instr(text, 'https://') > 0
    OR instr(text, 'bearer ') > 0
    OR instr(text, 'basic ') > 0
    OR instr(text, 'token=') > 0
    OR instr(text, 'token:') > 0
    OR instr(text, 'password=') > 0
    OR instr(text, 'password:') > 0
    OR instr(text, 'passwd=') > 0
    OR instr(text, 'pwd=') > 0
    OR instr(text, 'api_key=') > 0
    OR instr(text, 'apikey=') > 0
    OR instr(text, 'access_token=') > 0
    OR instr(text, 'refresh_token=') > 0
    OR instr(text, 'session_token=') > 0
    OR instr(text, 'authorization=') > 0
    OR instr(text, 'client_secret=') > 0
    OR instr(text, 'private_key=') > 0
    OR instr(text, 'secret=') > 0
    OR instr(text, 'secret:') > 0
    OR instr(text, 'xoxb-') > 0
    OR instr(text, 'xoxp-') > 0
    OR instr(text, 'ghp_') > 0
    OR instr(text, 'sk-live-') > 0
    OR instr(text, 'sk-proj-') > 0
    OR instr(text, 'sk-test-') > 0
    OR instr(text, 'sk-ant-') > 0
    OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
    OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
    OR text GLOB '*eyj*.*.*'
    OR instr(text, 'aiza') > 0
    OR normalized GLOB '*[a-z]:/*'
    OR normalized LIKE '%//%'
)
BEGIN
  SELECT RAISE(ABORT, 'skill snapshot ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS c21_snapshot_ref_hardened_update
BEFORE UPDATE OF snapshot_ref ON skill_versions
WHEN NEW.snapshot_ref IS NOT NULL AND EXISTS (
  SELECT 1 FROM (
    SELECT lower(NEW.snapshot_ref) AS text,
      replace(replace(lower(NEW.snapshot_ref), char(92), '/'), '://', ':--') AS normalized
  )
  WHERE instr(text, 'secret://') > 0
    OR instr(text, 'vault://') > 0
    OR instr(text, 'file://') > 0
    OR instr(text, 'http://') > 0
    OR instr(text, 'https://') > 0
    OR instr(text, 'bearer ') > 0
    OR instr(text, 'basic ') > 0
    OR instr(text, 'token=') > 0
    OR instr(text, 'token:') > 0
    OR instr(text, 'password=') > 0
    OR instr(text, 'password:') > 0
    OR instr(text, 'passwd=') > 0
    OR instr(text, 'pwd=') > 0
    OR instr(text, 'api_key=') > 0
    OR instr(text, 'apikey=') > 0
    OR instr(text, 'access_token=') > 0
    OR instr(text, 'refresh_token=') > 0
    OR instr(text, 'session_token=') > 0
    OR instr(text, 'authorization=') > 0
    OR instr(text, 'client_secret=') > 0
    OR instr(text, 'private_key=') > 0
    OR instr(text, 'secret=') > 0
    OR instr(text, 'secret:') > 0
    OR instr(text, 'xoxb-') > 0
    OR instr(text, 'xoxp-') > 0
    OR instr(text, 'ghp_') > 0
    OR instr(text, 'sk-live-') > 0
    OR instr(text, 'sk-proj-') > 0
    OR instr(text, 'sk-test-') > 0
    OR instr(text, 'sk-ant-') > 0
    OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
    OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
    OR text GLOB '*eyj*.*.*'
    OR instr(text, 'aiza') > 0
    OR normalized GLOB '*[a-z]:/*'
    OR normalized LIKE '%//%'
)
BEGIN
  SELECT RAISE(ABORT, 'skill snapshot ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS c21_source_ref_hardened_insert
BEFORE INSERT ON skill_sources
WHEN EXISTS (
  SELECT 1 FROM (
    SELECT lower(NEW.source_ref) AS text,
      replace(replace(lower(NEW.source_ref), char(92), '/'), '://', ':--') AS normalized
  )
  WHERE instr(text, 'secret://') > 0
    OR instr(text, 'vault://') > 0
    OR instr(text, 'file://') > 0
    OR instr(text, 'http://') > 0
    OR instr(text, 'https://') > 0
    OR instr(text, 'bearer ') > 0
    OR instr(text, 'basic ') > 0
    OR instr(text, 'token=') > 0
    OR instr(text, 'token:') > 0
    OR instr(text, 'password=') > 0
    OR instr(text, 'password:') > 0
    OR instr(text, 'api_key=') > 0
    OR instr(text, 'apikey=') > 0
    OR instr(text, 'access_token=') > 0
    OR instr(text, 'refresh_token=') > 0
    OR instr(text, 'session_token=') > 0
    OR instr(text, 'authorization=') > 0
    OR instr(text, 'client_secret=') > 0
    OR instr(text, 'private_key=') > 0
    OR instr(text, 'secret=') > 0
    OR instr(text, 'secret:') > 0
    OR instr(text, 'sk-live-') > 0
    OR instr(text, 'sk-proj-') > 0
    OR instr(text, 'sk-test-') > 0
    OR instr(text, 'sk-ant-') > 0
    OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
    OR text GLOB '*eyj*.*.*'
    OR instr(text, 'aiza') > 0
    OR normalized GLOB '*[a-z]:/*'
    OR normalized LIKE '%//%'
)
BEGIN
  SELECT RAISE(ABORT, 'skill source ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS c21_evidence_refs_hardened_insert
BEFORE INSERT ON learning_candidates
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.evidence_refs_json)
  WHERE type = 'text'
    AND EXISTS (
      SELECT 1 FROM (
        SELECT lower(CAST(value AS TEXT)) AS text,
          replace(replace(lower(CAST(value AS TEXT)), char(92), '/'), '://', ':--') AS normalized
      )
      WHERE instr(text, 'secret://') > 0
        OR instr(text, 'vault://') > 0
        OR instr(text, 'file://') > 0
        OR instr(text, 'http://') > 0
        OR instr(text, 'https://') > 0
        OR instr(text, 'bearer ') > 0
        OR instr(text, 'basic ') > 0
        OR instr(text, 'token=') > 0
        OR instr(text, 'token:') > 0
        OR instr(text, 'password=') > 0
        OR instr(text, 'password:') > 0
        OR instr(text, 'api_key=') > 0
        OR instr(text, 'apikey=') > 0
        OR instr(text, 'access_token=') > 0
        OR instr(text, 'refresh_token=') > 0
        OR instr(text, 'session_token=') > 0
        OR instr(text, 'authorization=') > 0
        OR instr(text, 'client_secret=') > 0
        OR instr(text, 'private_key=') > 0
        OR instr(text, 'secret=') > 0
        OR instr(text, 'secret:') > 0
        OR instr(text, 'sk-live-') > 0
        OR instr(text, 'sk-proj-') > 0
        OR instr(text, 'sk-test-') > 0
        OR instr(text, 'sk-ant-') > 0
        OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
        OR text GLOB '*eyj*.*.*'
        OR instr(text, 'aiza') > 0
        OR normalized GLOB '*[a-z]:/*'
        OR normalized LIKE '%//%'
    )
)
BEGIN
  SELECT RAISE(ABORT, 'learning evidence ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS c21_evidence_refs_hardened_update
BEFORE UPDATE OF evidence_refs_json ON learning_candidates
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.evidence_refs_json)
  WHERE type = 'text'
    AND EXISTS (
      SELECT 1 FROM (
        SELECT lower(CAST(value AS TEXT)) AS text,
          replace(replace(lower(CAST(value AS TEXT)), char(92), '/'), '://', ':--') AS normalized
      )
      WHERE instr(text, 'secret://') > 0
        OR instr(text, 'vault://') > 0
        OR instr(text, 'file://') > 0
        OR instr(text, 'http://') > 0
        OR instr(text, 'https://') > 0
        OR instr(text, 'bearer ') > 0
        OR instr(text, 'basic ') > 0
        OR instr(text, 'token=') > 0
        OR instr(text, 'token:') > 0
        OR instr(text, 'password=') > 0
        OR instr(text, 'password:') > 0
        OR instr(text, 'api_key=') > 0
        OR instr(text, 'apikey=') > 0
        OR instr(text, 'access_token=') > 0
        OR instr(text, 'refresh_token=') > 0
        OR instr(text, 'session_token=') > 0
        OR instr(text, 'authorization=') > 0
        OR instr(text, 'client_secret=') > 0
        OR instr(text, 'private_key=') > 0
        OR instr(text, 'secret=') > 0
        OR instr(text, 'secret:') > 0
        OR instr(text, 'sk-live-') > 0
        OR instr(text, 'sk-proj-') > 0
        OR instr(text, 'sk-test-') > 0
        OR instr(text, 'sk-ant-') > 0
        OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
        OR text GLOB '*eyj*.*.*'
        OR instr(text, 'aiza') > 0
        OR normalized GLOB '*[a-z]:/*'
        OR normalized LIKE '%//%'
    )
)
BEGIN
  SELECT RAISE(ABORT, 'learning evidence ref must be safe descriptor reference');
END;

CREATE TRIGGER IF NOT EXISTS c21_text_windows_drive_versions_insert
BEFORE INSERT ON skill_versions
WHEN replace(replace(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
BEGIN SELECT RAISE(ABORT, 'skill version text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_windows_drive_versions_update
BEFORE UPDATE OF diff_summary, approved_by ON skill_versions
WHEN replace(replace(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
BEGIN SELECT RAISE(ABORT, 'skill version text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_windows_drive_sources_insert
BEFORE INSERT ON skill_sources
WHEN replace(replace(lower(COALESCE(NEW.diff_summary, '')), char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
BEGIN SELECT RAISE(ABORT, 'skill source text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_windows_drive_scans_insert
BEFORE INSERT ON skill_scans
WHEN replace(replace(lower(COALESCE(NEW.findings_json, '')), char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
BEGIN SELECT RAISE(ABORT, 'skill scan text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_windows_drive_reviews_insert
BEFORE INSERT ON skill_reviews
WHEN replace(replace(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
BEGIN SELECT RAISE(ABORT, 'skill review text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_windows_drive_installations_insert
BEFORE INSERT ON skill_installations
WHEN replace(replace(lower(COALESCE(NEW.quarantine_reason, '')), char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
BEGIN SELECT RAISE(ABORT, 'skill installation text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_windows_drive_installations_update
BEFORE UPDATE OF quarantine_reason ON skill_installations
WHEN replace(replace(lower(COALESCE(NEW.quarantine_reason, '')), char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
BEGIN SELECT RAISE(ABORT, 'skill installation text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_windows_drive_invocations_insert
BEFORE INSERT ON skill_invocation_facts
WHEN replace(replace(lower(COALESCE(NEW.reason, '')), char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
BEGIN SELECT RAISE(ABORT, 'skill invocation text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_windows_drive_candidates_insert
BEFORE INSERT ON learning_candidates
WHEN replace(replace(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
BEGIN SELECT RAISE(ABORT, 'learning candidate text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_windows_drive_candidates_update
BEFORE UPDATE OF lesson, proposed_diff_summary ON learning_candidates
WHEN replace(replace(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
BEGIN SELECT RAISE(ABORT, 'learning candidate text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_windows_drive_commands_insert
BEFORE INSERT ON learning_commands
WHEN replace(replace(lower(COALESCE(NEW.reason, '')), char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
BEGIN SELECT RAISE(ABORT, 'learning command text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_skills_insert
BEFORE INSERT ON skills
WHEN replace(replace(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'skill text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_skills_update
BEFORE UPDATE OF name, description, quarantine_reason ON skills
WHEN replace(replace(lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'skill text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_versions_insert
BEFORE INSERT ON skill_versions
WHEN replace(replace(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'skill version text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_versions_update
BEFORE UPDATE OF diff_summary, approved_by ON skill_versions
WHEN replace(replace(lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'skill version text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_sources_insert
BEFORE INSERT ON skill_sources
WHEN replace(replace(lower(COALESCE(NEW.diff_summary, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'skill source text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_scans_insert
BEFORE INSERT ON skill_scans
WHEN replace(replace(lower(COALESCE(NEW.findings_json, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'skill scan text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_reviews_insert
BEFORE INSERT ON skill_reviews
WHEN replace(replace(lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'skill review text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_installations_insert
BEFORE INSERT ON skill_installations
WHEN replace(replace(lower(COALESCE(NEW.quarantine_reason, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'skill installation text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_installations_update
BEFORE UPDATE OF quarantine_reason ON skill_installations
WHEN replace(replace(lower(COALESCE(NEW.quarantine_reason, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'skill installation text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_invocations_insert
BEFORE INSERT ON skill_invocation_facts
WHEN replace(replace(lower(COALESCE(NEW.reason, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'skill invocation text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_candidates_insert
BEFORE INSERT ON learning_candidates
WHEN replace(replace(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'learning candidate text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_candidates_update
BEFORE UPDATE OF lesson, proposed_diff_summary ON learning_candidates
WHEN replace(replace(lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'learning candidate text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_text_unc_paths_commands_insert
BEFORE INSERT ON learning_commands
WHEN replace(replace(lower(COALESCE(NEW.reason, '')), char(92), '/'), '://', ':--') LIKE '%//%'
BEGIN SELECT RAISE(ABORT, 'learning command text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS skill_versions_text_hardened_insert
BEFORE INSERT ON skill_versions
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')) AS text)
    WHERE instr(text, 'secret://') > 0
      OR instr(text, 'vault://') > 0
      OR instr(text, 'file://') > 0
      OR instr(text, 'http://') > 0
      OR instr(text, 'https://') > 0
      OR instr(text, 'bearer ') > 0
      OR instr(text, 'basic ') > 0
      OR instr(text, 'token=') > 0
      OR instr(text, 'token:') > 0
      OR instr(text, 'password=') > 0
      OR instr(text, 'password:') > 0
      OR instr(text, 'passwd=') > 0
      OR instr(text, 'pwd=') > 0
      OR instr(text, 'api_key=') > 0
      OR instr(text, 'apikey=') > 0
      OR instr(text, 'access_token=') > 0
      OR instr(text, 'refresh_token=') > 0
      OR instr(text, 'session_token=') > 0
      OR instr(text, 'authorization=') > 0
      OR instr(text, 'client_secret=') > 0
      OR instr(text, 'private_key=') > 0
      OR instr(text, 'secret=') > 0
      OR instr(text, 'secret:') > 0
      OR instr(text, 'xoxb-') > 0
      OR instr(text, 'xoxp-') > 0
      OR instr(text, 'xoxa-') > 0
      OR instr(text, 'xoxr-') > 0
      OR instr(text, 'xoxs-') > 0
      OR instr(text, 'ghp_') > 0
      OR instr(text, 'gho_') > 0
      OR instr(text, 'ghu_') > 0
      OR instr(text, 'ghs_') > 0
      OR instr(text, 'ghr_') > 0
      OR instr(text, 'sk-live-') > 0
      OR instr(text, 'sk-proj-') > 0
      OR instr(text, 'sk-test-') > 0
      OR instr(text, 'sk-ant-') > 0
      OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*eyj*.*.*'
      OR instr(text, 'aiza') > 0
      OR text LIKE '/%'
      OR instr(text, ' /') > 0
      OR instr(text, char(9) || '/') > 0
      OR instr(text, char(10) || '/') > 0
      OR instr(text, char(13) || '/') > 0
      OR instr(text, char(34) || '/') > 0
      OR instr(text, char(39) || '/') > 0
      OR instr(text, '(/') > 0
      OR instr(text, '=/') > 0
      OR (instr(text, ':/') > 0 AND instr(text, '://') = 0)
      OR text GLOB '[a-z]:/*'
      OR text GLOB '* [a-z]:/*'
      OR text GLOB '*=[a-z]:/*'
      OR text GLOB '*([a-z]:/*'
      OR instr(text, '~/') > 0
      OR instr(text, '../') > 0
      OR instr(text, './') > 0
      OR instr(text, '%2e') > 0
      OR instr(text, '%2f') > 0
      OR instr(text, '%5c') > 0
      OR instr(text, '%25') > 0
  ) THEN RAISE(ABORT, 'skill version text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS skill_versions_text_hardened_update
BEFORE UPDATE OF diff_summary, approved_by ON skill_versions
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '')) AS text)
    WHERE instr(text, 'secret://') > 0
      OR instr(text, 'vault://') > 0
      OR instr(text, 'file://') > 0
      OR instr(text, 'http://') > 0
      OR instr(text, 'https://') > 0
      OR instr(text, 'bearer ') > 0
      OR instr(text, 'basic ') > 0
      OR instr(text, 'token=') > 0
      OR instr(text, 'token:') > 0
      OR instr(text, 'password=') > 0
      OR instr(text, 'password:') > 0
      OR instr(text, 'passwd=') > 0
      OR instr(text, 'pwd=') > 0
      OR instr(text, 'api_key=') > 0
      OR instr(text, 'apikey=') > 0
      OR instr(text, 'access_token=') > 0
      OR instr(text, 'refresh_token=') > 0
      OR instr(text, 'session_token=') > 0
      OR instr(text, 'authorization=') > 0
      OR instr(text, 'client_secret=') > 0
      OR instr(text, 'private_key=') > 0
      OR instr(text, 'secret=') > 0
      OR instr(text, 'secret:') > 0
      OR instr(text, 'xoxb-') > 0
      OR instr(text, 'xoxp-') > 0
      OR instr(text, 'xoxa-') > 0
      OR instr(text, 'xoxr-') > 0
      OR instr(text, 'xoxs-') > 0
      OR instr(text, 'ghp_') > 0
      OR instr(text, 'gho_') > 0
      OR instr(text, 'ghu_') > 0
      OR instr(text, 'ghs_') > 0
      OR instr(text, 'ghr_') > 0
      OR instr(text, 'sk-live-') > 0
      OR instr(text, 'sk-proj-') > 0
      OR instr(text, 'sk-test-') > 0
      OR instr(text, 'sk-ant-') > 0
      OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*eyj*.*.*'
      OR instr(text, 'aiza') > 0
      OR text LIKE '/%'
      OR instr(text, ' /') > 0
      OR instr(text, char(9) || '/') > 0
      OR instr(text, char(10) || '/') > 0
      OR instr(text, char(13) || '/') > 0
      OR instr(text, char(34) || '/') > 0
      OR instr(text, char(39) || '/') > 0
      OR instr(text, '(/') > 0
      OR instr(text, '=/') > 0
      OR (instr(text, ':/') > 0 AND instr(text, '://') = 0)
      OR text GLOB '[a-z]:/*'
      OR text GLOB '* [a-z]:/*'
      OR text GLOB '*=[a-z]:/*'
      OR text GLOB '*([a-z]:/*'
      OR instr(text, '~/') > 0
      OR instr(text, '../') > 0
      OR instr(text, './') > 0
      OR instr(text, '%2e') > 0
      OR instr(text, '%2f') > 0
      OR instr(text, '%5c') > 0
      OR instr(text, '%25') > 0
  ) THEN RAISE(ABORT, 'skill version text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c21_fact_text_hardened_skill_sources_insert
BEFORE INSERT ON skill_sources
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.diff_summary, '')) AS text)
    WHERE instr(text, 'secret://') > 0 OR instr(text, 'vault://') > 0 OR instr(text, 'file://') > 0 OR instr(text, 'http://') > 0 OR instr(text, 'https://') > 0
      OR instr(text, 'bearer ') > 0 OR instr(text, 'basic ') > 0 OR instr(text, 'token=') > 0 OR instr(text, 'token:') > 0 OR instr(text, 'password=') > 0 OR instr(text, 'password:') > 0
      OR instr(text, 'passwd=') > 0 OR instr(text, 'pwd=') > 0 OR instr(text, 'api_key=') > 0 OR instr(text, 'apikey=') > 0 OR instr(text, 'access_token=') > 0 OR instr(text, 'refresh_token=') > 0 OR instr(text, 'session_token=') > 0
      OR instr(text, 'authorization=') > 0 OR instr(text, 'client_secret=') > 0 OR instr(text, 'private_key=') > 0 OR instr(text, 'secret=') > 0 OR instr(text, 'secret:') > 0
      OR instr(text, 'xoxb-') > 0 OR instr(text, 'xoxp-') > 0 OR instr(text, 'xoxa-') > 0 OR instr(text, 'xoxr-') > 0 OR instr(text, 'xoxs-') > 0
      OR instr(text, 'ghp_') > 0 OR instr(text, 'gho_') > 0 OR instr(text, 'ghu_') > 0 OR instr(text, 'ghs_') > 0 OR instr(text, 'ghr_') > 0
      OR instr(text, 'sk-live-') > 0 OR instr(text, 'sk-proj-') > 0 OR instr(text, 'sk-test-') > 0 OR instr(text, 'sk-ant-') > 0
      OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*eyj*.*.*' OR instr(text, 'aiza') > 0
      OR text LIKE '/%' OR instr(text, ' /') > 0 OR instr(text, char(9) || '/') > 0 OR instr(text, char(10) || '/') > 0 OR instr(text, char(13) || '/') > 0 OR instr(text, char(34) || '/') > 0 OR instr(text, char(39) || '/') > 0
      OR instr(text, '(/') > 0 OR instr(text, '=/') > 0 OR (instr(text, ':/') > 0 AND instr(text, '://') = 0)
      OR text GLOB '[a-z]:/*' OR text GLOB '* [a-z]:/*' OR text GLOB '*=[a-z]:/*' OR text GLOB '*([a-z]:/*'
      OR instr(text, '~/') > 0 OR instr(text, '../') > 0 OR instr(text, './') > 0 OR instr(text, '%2e') > 0 OR instr(text, '%2f') > 0 OR instr(text, '%5c') > 0 OR instr(text, '%25') > 0
  ) THEN RAISE(ABORT, 'skill source text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c21_fact_text_hardened_skill_scans_insert
BEFORE INSERT ON skill_scans
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.findings_json, '')) AS text)
    WHERE instr(text, 'secret://') > 0 OR instr(text, 'vault://') > 0 OR instr(text, 'file://') > 0 OR instr(text, 'http://') > 0 OR instr(text, 'https://') > 0
      OR instr(text, 'bearer ') > 0 OR instr(text, 'basic ') > 0 OR instr(text, 'token=') > 0 OR instr(text, 'token:') > 0 OR instr(text, 'password=') > 0 OR instr(text, 'password:') > 0
      OR instr(text, 'passwd=') > 0 OR instr(text, 'pwd=') > 0 OR instr(text, 'api_key=') > 0 OR instr(text, 'apikey=') > 0 OR instr(text, 'access_token=') > 0 OR instr(text, 'refresh_token=') > 0 OR instr(text, 'session_token=') > 0
      OR instr(text, 'authorization=') > 0 OR instr(text, 'client_secret=') > 0 OR instr(text, 'private_key=') > 0 OR instr(text, 'secret=') > 0 OR instr(text, 'secret:') > 0
      OR instr(text, 'xoxb-') > 0 OR instr(text, 'xoxp-') > 0 OR instr(text, 'xoxa-') > 0 OR instr(text, 'xoxr-') > 0 OR instr(text, 'xoxs-') > 0
      OR instr(text, 'ghp_') > 0 OR instr(text, 'gho_') > 0 OR instr(text, 'ghu_') > 0 OR instr(text, 'ghs_') > 0 OR instr(text, 'ghr_') > 0
      OR instr(text, 'sk-live-') > 0 OR instr(text, 'sk-proj-') > 0 OR instr(text, 'sk-test-') > 0 OR instr(text, 'sk-ant-') > 0
      OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*eyj*.*.*' OR instr(text, 'aiza') > 0
      OR text LIKE '/%' OR instr(text, ' /') > 0 OR instr(text, char(9) || '/') > 0 OR instr(text, char(10) || '/') > 0 OR instr(text, char(13) || '/') > 0 OR instr(text, char(34) || '/') > 0 OR instr(text, char(39) || '/') > 0
      OR instr(text, '(/') > 0 OR instr(text, '=/') > 0 OR (instr(text, ':/') > 0 AND instr(text, '://') = 0)
      OR text GLOB '[a-z]:/*' OR text GLOB '* [a-z]:/*' OR text GLOB '*=[a-z]:/*' OR text GLOB '*([a-z]:/*'
      OR instr(text, '~/') > 0 OR instr(text, '../') > 0 OR instr(text, './') > 0 OR instr(text, '%2e') > 0 OR instr(text, '%2f') > 0 OR instr(text, '%5c') > 0 OR instr(text, '%25') > 0
  ) THEN RAISE(ABORT, 'skill scan text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c21_fact_text_hardened_skill_reviews_insert
BEFORE INSERT ON skill_reviews
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')) AS text)
    WHERE instr(text, 'secret://') > 0 OR instr(text, 'vault://') > 0 OR instr(text, 'file://') > 0 OR instr(text, 'http://') > 0 OR instr(text, 'https://') > 0
      OR instr(text, 'bearer ') > 0 OR instr(text, 'basic ') > 0 OR instr(text, 'token=') > 0 OR instr(text, 'token:') > 0 OR instr(text, 'password=') > 0 OR instr(text, 'password:') > 0
      OR instr(text, 'passwd=') > 0 OR instr(text, 'pwd=') > 0 OR instr(text, 'api_key=') > 0 OR instr(text, 'apikey=') > 0 OR instr(text, 'access_token=') > 0 OR instr(text, 'refresh_token=') > 0 OR instr(text, 'session_token=') > 0
      OR instr(text, 'authorization=') > 0 OR instr(text, 'client_secret=') > 0 OR instr(text, 'private_key=') > 0 OR instr(text, 'secret=') > 0 OR instr(text, 'secret:') > 0
      OR instr(text, 'xoxb-') > 0 OR instr(text, 'xoxp-') > 0 OR instr(text, 'xoxa-') > 0 OR instr(text, 'xoxr-') > 0 OR instr(text, 'xoxs-') > 0
      OR instr(text, 'ghp_') > 0 OR instr(text, 'gho_') > 0 OR instr(text, 'ghu_') > 0 OR instr(text, 'ghs_') > 0 OR instr(text, 'ghr_') > 0
      OR instr(text, 'sk-live-') > 0 OR instr(text, 'sk-proj-') > 0 OR instr(text, 'sk-test-') > 0 OR instr(text, 'sk-ant-') > 0
      OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*eyj*.*.*' OR instr(text, 'aiza') > 0
      OR text LIKE '/%' OR instr(text, ' /') > 0 OR instr(text, char(9) || '/') > 0 OR instr(text, char(10) || '/') > 0 OR instr(text, char(13) || '/') > 0 OR instr(text, char(34) || '/') > 0 OR instr(text, char(39) || '/') > 0
      OR instr(text, '(/') > 0 OR instr(text, '=/') > 0 OR (instr(text, ':/') > 0 AND instr(text, '://') = 0)
      OR text GLOB '[a-z]:/*' OR text GLOB '* [a-z]:/*' OR text GLOB '*=[a-z]:/*' OR text GLOB '*([a-z]:/*'
      OR instr(text, '~/') > 0 OR instr(text, '../') > 0 OR instr(text, './') > 0 OR instr(text, '%2e') > 0 OR instr(text, '%2f') > 0 OR instr(text, '%5c') > 0 OR instr(text, '%25') > 0
  ) THEN RAISE(ABORT, 'skill review text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c21_fact_text_hardened_skill_installations_insert
BEFORE INSERT ON skill_installations
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.quarantine_reason, '')) AS text)
    WHERE instr(text, 'secret://') > 0 OR instr(text, 'vault://') > 0 OR instr(text, 'file://') > 0 OR instr(text, 'http://') > 0 OR instr(text, 'https://') > 0
      OR instr(text, 'bearer ') > 0 OR instr(text, 'basic ') > 0 OR instr(text, 'token=') > 0 OR instr(text, 'token:') > 0 OR instr(text, 'password=') > 0 OR instr(text, 'password:') > 0
      OR instr(text, 'passwd=') > 0 OR instr(text, 'pwd=') > 0 OR instr(text, 'api_key=') > 0 OR instr(text, 'apikey=') > 0 OR instr(text, 'access_token=') > 0 OR instr(text, 'refresh_token=') > 0 OR instr(text, 'session_token=') > 0
      OR instr(text, 'authorization=') > 0 OR instr(text, 'client_secret=') > 0 OR instr(text, 'private_key=') > 0 OR instr(text, 'secret=') > 0 OR instr(text, 'secret:') > 0
      OR instr(text, 'xoxb-') > 0 OR instr(text, 'xoxp-') > 0 OR instr(text, 'xoxa-') > 0 OR instr(text, 'xoxr-') > 0 OR instr(text, 'xoxs-') > 0
      OR instr(text, 'ghp_') > 0 OR instr(text, 'gho_') > 0 OR instr(text, 'ghu_') > 0 OR instr(text, 'ghs_') > 0 OR instr(text, 'ghr_') > 0
      OR instr(text, 'sk-live-') > 0 OR instr(text, 'sk-proj-') > 0 OR instr(text, 'sk-test-') > 0 OR instr(text, 'sk-ant-') > 0
      OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*eyj*.*.*' OR instr(text, 'aiza') > 0
      OR text LIKE '/%' OR instr(text, ' /') > 0 OR instr(text, char(9) || '/') > 0 OR instr(text, char(10) || '/') > 0 OR instr(text, char(13) || '/') > 0 OR instr(text, char(34) || '/') > 0 OR instr(text, char(39) || '/') > 0
      OR instr(text, '(/') > 0 OR instr(text, '=/') > 0 OR (instr(text, ':/') > 0 AND instr(text, '://') = 0)
      OR text GLOB '[a-z]:/*' OR text GLOB '* [a-z]:/*' OR text GLOB '*=[a-z]:/*' OR text GLOB '*([a-z]:/*'
      OR instr(text, '~/') > 0 OR instr(text, '../') > 0 OR instr(text, './') > 0 OR instr(text, '%2e') > 0 OR instr(text, '%2f') > 0 OR instr(text, '%5c') > 0 OR instr(text, '%25') > 0
  ) THEN RAISE(ABORT, 'skill installation text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c21_fact_text_hardened_skill_installations_update
BEFORE UPDATE OF quarantine_reason ON skill_installations
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.quarantine_reason, '')) AS text)
    WHERE instr(text, 'secret://') > 0 OR instr(text, 'vault://') > 0 OR instr(text, 'file://') > 0 OR instr(text, 'http://') > 0 OR instr(text, 'https://') > 0
      OR instr(text, 'bearer ') > 0 OR instr(text, 'basic ') > 0 OR instr(text, 'token=') > 0 OR instr(text, 'token:') > 0 OR instr(text, 'password=') > 0 OR instr(text, 'password:') > 0
      OR instr(text, 'passwd=') > 0 OR instr(text, 'pwd=') > 0 OR instr(text, 'api_key=') > 0 OR instr(text, 'apikey=') > 0 OR instr(text, 'access_token=') > 0 OR instr(text, 'refresh_token=') > 0 OR instr(text, 'session_token=') > 0
      OR instr(text, 'authorization=') > 0 OR instr(text, 'client_secret=') > 0 OR instr(text, 'private_key=') > 0 OR instr(text, 'secret=') > 0 OR instr(text, 'secret:') > 0
      OR instr(text, 'xoxb-') > 0 OR instr(text, 'xoxp-') > 0 OR instr(text, 'xoxa-') > 0 OR instr(text, 'xoxr-') > 0 OR instr(text, 'xoxs-') > 0
      OR instr(text, 'ghp_') > 0 OR instr(text, 'gho_') > 0 OR instr(text, 'ghu_') > 0 OR instr(text, 'ghs_') > 0 OR instr(text, 'ghr_') > 0
      OR instr(text, 'sk-live-') > 0 OR instr(text, 'sk-proj-') > 0 OR instr(text, 'sk-test-') > 0 OR instr(text, 'sk-ant-') > 0
      OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*eyj*.*.*' OR instr(text, 'aiza') > 0
      OR text LIKE '/%' OR instr(text, ' /') > 0 OR instr(text, char(9) || '/') > 0 OR instr(text, char(10) || '/') > 0 OR instr(text, char(13) || '/') > 0 OR instr(text, char(34) || '/') > 0 OR instr(text, char(39) || '/') > 0
      OR instr(text, '(/') > 0 OR instr(text, '=/') > 0 OR (instr(text, ':/') > 0 AND instr(text, '://') = 0)
      OR text GLOB '[a-z]:/*' OR text GLOB '* [a-z]:/*' OR text GLOB '*=[a-z]:/*' OR text GLOB '*([a-z]:/*'
      OR instr(text, '~/') > 0 OR instr(text, '../') > 0 OR instr(text, './') > 0 OR instr(text, '%2e') > 0 OR instr(text, '%2f') > 0 OR instr(text, '%5c') > 0 OR instr(text, '%25') > 0
  ) THEN RAISE(ABORT, 'skill installation text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c21_fact_text_hardened_skill_invocations_insert
BEFORE INSERT ON skill_invocation_facts
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.reason, '')) AS text)
    WHERE instr(text, 'secret://') > 0 OR instr(text, 'vault://') > 0 OR instr(text, 'file://') > 0 OR instr(text, 'http://') > 0 OR instr(text, 'https://') > 0
      OR instr(text, 'bearer ') > 0 OR instr(text, 'basic ') > 0 OR instr(text, 'token=') > 0 OR instr(text, 'token:') > 0 OR instr(text, 'password=') > 0 OR instr(text, 'password:') > 0
      OR instr(text, 'passwd=') > 0 OR instr(text, 'pwd=') > 0 OR instr(text, 'api_key=') > 0 OR instr(text, 'apikey=') > 0 OR instr(text, 'access_token=') > 0 OR instr(text, 'refresh_token=') > 0 OR instr(text, 'session_token=') > 0
      OR instr(text, 'authorization=') > 0 OR instr(text, 'client_secret=') > 0 OR instr(text, 'private_key=') > 0 OR instr(text, 'secret=') > 0 OR instr(text, 'secret:') > 0
      OR instr(text, 'xoxb-') > 0 OR instr(text, 'xoxp-') > 0 OR instr(text, 'xoxa-') > 0 OR instr(text, 'xoxr-') > 0 OR instr(text, 'xoxs-') > 0
      OR instr(text, 'ghp_') > 0 OR instr(text, 'gho_') > 0 OR instr(text, 'ghu_') > 0 OR instr(text, 'ghs_') > 0 OR instr(text, 'ghr_') > 0
      OR instr(text, 'sk-live-') > 0 OR instr(text, 'sk-proj-') > 0 OR instr(text, 'sk-test-') > 0 OR instr(text, 'sk-ant-') > 0
      OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*eyj*.*.*' OR instr(text, 'aiza') > 0
      OR text LIKE '/%' OR instr(text, ' /') > 0 OR instr(text, char(9) || '/') > 0 OR instr(text, char(10) || '/') > 0 OR instr(text, char(13) || '/') > 0 OR instr(text, char(34) || '/') > 0 OR instr(text, char(39) || '/') > 0
      OR instr(text, '(/') > 0 OR instr(text, '=/') > 0 OR (instr(text, ':/') > 0 AND instr(text, '://') = 0)
      OR text GLOB '[a-z]:/*' OR text GLOB '* [a-z]:/*' OR text GLOB '*=[a-z]:/*' OR text GLOB '*([a-z]:/*'
      OR instr(text, '~/') > 0 OR instr(text, '../') > 0 OR instr(text, './') > 0 OR instr(text, '%2e') > 0 OR instr(text, '%2f') > 0 OR instr(text, '%5c') > 0 OR instr(text, '%25') > 0
  ) THEN RAISE(ABORT, 'skill invocation text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c21_fact_text_hardened_learning_candidates_insert
BEFORE INSERT ON learning_candidates
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')) AS text)
    WHERE instr(text, 'secret://') > 0 OR instr(text, 'vault://') > 0 OR instr(text, 'file://') > 0 OR instr(text, 'http://') > 0 OR instr(text, 'https://') > 0
      OR instr(text, 'bearer ') > 0 OR instr(text, 'basic ') > 0 OR instr(text, 'token=') > 0 OR instr(text, 'token:') > 0 OR instr(text, 'password=') > 0 OR instr(text, 'password:') > 0
      OR instr(text, 'passwd=') > 0 OR instr(text, 'pwd=') > 0 OR instr(text, 'api_key=') > 0 OR instr(text, 'apikey=') > 0 OR instr(text, 'access_token=') > 0 OR instr(text, 'refresh_token=') > 0 OR instr(text, 'session_token=') > 0
      OR instr(text, 'authorization=') > 0 OR instr(text, 'client_secret=') > 0 OR instr(text, 'private_key=') > 0 OR instr(text, 'secret=') > 0 OR instr(text, 'secret:') > 0
      OR instr(text, 'xoxb-') > 0 OR instr(text, 'xoxp-') > 0 OR instr(text, 'xoxa-') > 0 OR instr(text, 'xoxr-') > 0 OR instr(text, 'xoxs-') > 0
      OR instr(text, 'ghp_') > 0 OR instr(text, 'gho_') > 0 OR instr(text, 'ghu_') > 0 OR instr(text, 'ghs_') > 0 OR instr(text, 'ghr_') > 0
      OR instr(text, 'sk-live-') > 0 OR instr(text, 'sk-proj-') > 0 OR instr(text, 'sk-test-') > 0 OR instr(text, 'sk-ant-') > 0
      OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*eyj*.*.*' OR instr(text, 'aiza') > 0
      OR text LIKE '/%' OR instr(text, ' /') > 0 OR instr(text, char(9) || '/') > 0 OR instr(text, char(10) || '/') > 0 OR instr(text, char(13) || '/') > 0 OR instr(text, char(34) || '/') > 0 OR instr(text, char(39) || '/') > 0
      OR instr(text, '(/') > 0 OR instr(text, '=/') > 0 OR (instr(text, ':/') > 0 AND instr(text, '://') = 0)
      OR text GLOB '[a-z]:/*' OR text GLOB '* [a-z]:/*' OR text GLOB '*=[a-z]:/*' OR text GLOB '*([a-z]:/*'
      OR instr(text, '~/') > 0 OR instr(text, '../') > 0 OR instr(text, './') > 0 OR instr(text, '%2e') > 0 OR instr(text, '%2f') > 0 OR instr(text, '%5c') > 0 OR instr(text, '%25') > 0
  ) THEN RAISE(ABORT, 'learning candidate text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c21_fact_text_hardened_learning_candidates_update
BEFORE UPDATE OF lesson, proposed_diff_summary ON learning_candidates
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')) AS text)
    WHERE instr(text, 'secret://') > 0 OR instr(text, 'vault://') > 0 OR instr(text, 'file://') > 0 OR instr(text, 'http://') > 0 OR instr(text, 'https://') > 0
      OR instr(text, 'bearer ') > 0 OR instr(text, 'basic ') > 0 OR instr(text, 'token=') > 0 OR instr(text, 'token:') > 0 OR instr(text, 'password=') > 0 OR instr(text, 'password:') > 0
      OR instr(text, 'passwd=') > 0 OR instr(text, 'pwd=') > 0 OR instr(text, 'api_key=') > 0 OR instr(text, 'apikey=') > 0 OR instr(text, 'access_token=') > 0 OR instr(text, 'refresh_token=') > 0 OR instr(text, 'session_token=') > 0
      OR instr(text, 'authorization=') > 0 OR instr(text, 'client_secret=') > 0 OR instr(text, 'private_key=') > 0 OR instr(text, 'secret=') > 0 OR instr(text, 'secret:') > 0
      OR instr(text, 'xoxb-') > 0 OR instr(text, 'xoxp-') > 0 OR instr(text, 'xoxa-') > 0 OR instr(text, 'xoxr-') > 0 OR instr(text, 'xoxs-') > 0
      OR instr(text, 'ghp_') > 0 OR instr(text, 'gho_') > 0 OR instr(text, 'ghu_') > 0 OR instr(text, 'ghs_') > 0 OR instr(text, 'ghr_') > 0
      OR instr(text, 'sk-live-') > 0 OR instr(text, 'sk-proj-') > 0 OR instr(text, 'sk-test-') > 0 OR instr(text, 'sk-ant-') > 0
      OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*eyj*.*.*' OR instr(text, 'aiza') > 0
      OR text LIKE '/%' OR instr(text, ' /') > 0 OR instr(text, char(9) || '/') > 0 OR instr(text, char(10) || '/') > 0 OR instr(text, char(13) || '/') > 0 OR instr(text, char(34) || '/') > 0 OR instr(text, char(39) || '/') > 0
      OR instr(text, '(/') > 0 OR instr(text, '=/') > 0 OR (instr(text, ':/') > 0 AND instr(text, '://') = 0)
      OR text GLOB '[a-z]:/*' OR text GLOB '* [a-z]:/*' OR text GLOB '*=[a-z]:/*' OR text GLOB '*([a-z]:/*'
      OR instr(text, '~/') > 0 OR instr(text, '../') > 0 OR instr(text, './') > 0 OR instr(text, '%2e') > 0 OR instr(text, '%2f') > 0 OR instr(text, '%5c') > 0 OR instr(text, '%25') > 0
  ) THEN RAISE(ABORT, 'learning candidate text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c21_fact_text_hardened_learning_commands_insert
BEFORE INSERT ON learning_commands
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.reason, '')) AS text)
    WHERE instr(text, 'secret://') > 0 OR instr(text, 'vault://') > 0 OR instr(text, 'file://') > 0 OR instr(text, 'http://') > 0 OR instr(text, 'https://') > 0
      OR instr(text, 'bearer ') > 0 OR instr(text, 'basic ') > 0 OR instr(text, 'token=') > 0 OR instr(text, 'token:') > 0 OR instr(text, 'password=') > 0 OR instr(text, 'password:') > 0
      OR instr(text, 'passwd=') > 0 OR instr(text, 'pwd=') > 0 OR instr(text, 'api_key=') > 0 OR instr(text, 'apikey=') > 0 OR instr(text, 'access_token=') > 0 OR instr(text, 'refresh_token=') > 0 OR instr(text, 'session_token=') > 0
      OR instr(text, 'authorization=') > 0 OR instr(text, 'client_secret=') > 0 OR instr(text, 'private_key=') > 0 OR instr(text, 'secret=') > 0 OR instr(text, 'secret:') > 0
      OR instr(text, 'xoxb-') > 0 OR instr(text, 'xoxp-') > 0 OR instr(text, 'xoxa-') > 0 OR instr(text, 'xoxr-') > 0 OR instr(text, 'xoxs-') > 0
      OR instr(text, 'ghp_') > 0 OR instr(text, 'gho_') > 0 OR instr(text, 'ghu_') > 0 OR instr(text, 'ghs_') > 0 OR instr(text, 'ghr_') > 0
      OR instr(text, 'sk-live-') > 0 OR instr(text, 'sk-proj-') > 0 OR instr(text, 'sk-test-') > 0 OR instr(text, 'sk-ant-') > 0
      OR text GLOB '*akia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*asia[0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z][0-9a-z]*'
      OR text GLOB '*eyj*.*.*' OR instr(text, 'aiza') > 0
      OR text LIKE '/%' OR instr(text, ' /') > 0 OR instr(text, char(9) || '/') > 0 OR instr(text, char(10) || '/') > 0 OR instr(text, char(13) || '/') > 0 OR instr(text, char(34) || '/') > 0 OR instr(text, char(39) || '/') > 0
      OR instr(text, '(/') > 0 OR instr(text, '=/') > 0 OR (instr(text, ':/') > 0 AND instr(text, '://') = 0)
      OR text GLOB '[a-z]:/*' OR text GLOB '* [a-z]:/*' OR text GLOB '*=[a-z]:/*' OR text GLOB '*([a-z]:/*'
      OR instr(text, '~/') > 0 OR instr(text, '../') > 0 OR instr(text, './') > 0 OR instr(text, '%2e') > 0 OR instr(text, '%2f') > 0 OR instr(text, '%5c') > 0 OR instr(text, '%25') > 0
  ) THEN RAISE(ABORT, 'learning command text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_skills_insert
BEFORE INSERT ON skills
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'skill text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_skills_update
BEFORE UPDATE OF name, description, quarantine_reason ON skills
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quarantine_reason, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'skill text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_versions_insert
BEFORE INSERT ON skill_versions
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '') || ' ' || COALESCE(NEW.snapshot_ref, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'skill version text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_versions_update
BEFORE UPDATE OF diff_summary, approved_by, snapshot_ref ON skill_versions
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.diff_summary, '') || ' ' || COALESCE(NEW.approved_by, '') || ' ' || COALESCE(NEW.snapshot_ref, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'skill version text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_sources_insert
BEFORE INSERT ON skill_sources
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.source_ref, '') || ' ' || COALESCE(NEW.diff_summary, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'skill source text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_scans_insert
BEFORE INSERT ON skill_scans
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.findings_json, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'skill scan text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_reviews_insert
BEFORE INSERT ON skill_reviews
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.reviewer_ref, '') || ' ' || COALESCE(NEW.reason, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'skill review text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_installations_insert
BEFORE INSERT ON skill_installations
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.quarantine_reason, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'skill installation text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_installations_update
BEFORE UPDATE OF quarantine_reason ON skill_installations
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.quarantine_reason, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'skill installation text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_invocations_insert
BEFORE INSERT ON skill_invocation_facts
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.reason, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'skill invocation text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_candidates_insert
BEFORE INSERT ON learning_candidates
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'learning candidate text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_candidates_update
BEFORE UPDATE OF lesson, proposed_diff_summary ON learning_candidates
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.lesson, '') || ' ' || COALESCE(NEW.proposed_diff_summary, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'learning candidate text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_candidate_evidence_insert
BEFORE INSERT ON learning_candidates
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.evidence_refs_json)
  WHERE type = 'text'
    AND EXISTS (
      SELECT 1 FROM (SELECT lower(CAST(value AS TEXT)) AS text)
      WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
        OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
    )
)
BEGIN SELECT RAISE(ABORT, 'learning evidence ref must be safe descriptor reference'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_candidate_evidence_update
BEFORE UPDATE OF evidence_refs_json ON learning_candidates
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.evidence_refs_json)
  WHERE type = 'text'
    AND EXISTS (
      SELECT 1 FROM (SELECT lower(CAST(value AS TEXT)) AS text)
      WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
        OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
    )
)
BEGIN SELECT RAISE(ABORT, 'learning evidence ref must be safe descriptor reference'); END;

CREATE TRIGGER IF NOT EXISTS c21_single_colon_network_hardened_commands_insert
BEFORE INSERT ON learning_commands
WHEN EXISTS (
  SELECT 1 FROM (SELECT lower(COALESCE(NEW.reason, '')) AS text)
  WHERE instr(text, 'vault:') > 0 OR instr(text, 'credential:') > 0 OR instr(text, 'secret:') > 0
    OR instr(text, 'smb://') > 0 OR instr(text, 'nfs://') > 0 OR instr(text, 'afp://') > 0 OR instr(text, 'ftp://') > 0 OR instr(text, 'sftp://') > 0 OR instr(text, 'ssh://') > 0 OR instr(text, 'webdav://') > 0
)
BEGIN SELECT RAISE(ABORT, 'learning command text must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS skill_sources_append_only_update BEFORE UPDATE ON skill_sources BEGIN SELECT RAISE(ABORT, 'skill source facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS skill_sources_append_only_delete BEFORE DELETE ON skill_sources BEGIN SELECT RAISE(ABORT, 'skill source facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS skill_scans_append_only_update BEFORE UPDATE ON skill_scans BEGIN SELECT RAISE(ABORT, 'skill scan facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS skill_scans_append_only_delete BEFORE DELETE ON skill_scans BEGIN SELECT RAISE(ABORT, 'skill scan facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS skill_reviews_append_only_update BEFORE UPDATE ON skill_reviews BEGIN SELECT RAISE(ABORT, 'skill review facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS skill_reviews_append_only_delete BEFORE DELETE ON skill_reviews BEGIN SELECT RAISE(ABORT, 'skill review facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS skill_invocations_append_only_update BEFORE UPDATE ON skill_invocation_facts BEGIN SELECT RAISE(ABORT, 'skill invocation facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS skill_invocations_append_only_delete BEFORE DELETE ON skill_invocation_facts BEGIN SELECT RAISE(ABORT, 'skill invocation facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS learning_commands_append_only_update BEFORE UPDATE ON learning_commands BEGIN SELECT RAISE(ABORT, 'learning command facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS learning_commands_append_only_delete BEFORE DELETE ON learning_commands BEGIN SELECT RAISE(ABORT, 'learning command facts are append-only'); END;
