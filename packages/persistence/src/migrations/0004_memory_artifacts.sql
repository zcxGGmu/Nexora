CREATE TABLE IF NOT EXISTS memory_notes (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  path TEXT NOT NULL,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('workspace', 'run', 'ticket')),
  scope_id TEXT NOT NULL,
  current_version INTEGER NOT NULL CHECK (current_version > 0),
  trust_state TEXT NOT NULL CHECK (trust_state IN ('trusted', 'unverified', 'conflict', 'superseded')),
  source_refs_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, path)
);

CREATE TABLE IF NOT EXISTS memory_versions (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  note_id TEXT NOT NULL,
  path TEXT NOT NULL,
  note_version INTEGER NOT NULL CHECK (note_version > 0),
  content_hash TEXT NOT NULL,
  content_ref TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  trust_state TEXT NOT NULL CHECK (trust_state IN ('trusted', 'unverified', 'conflict', 'superseded')),
  provenance_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'candidate', 'rolled_back')),
  conflict_group_id TEXT,
  review_id TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, note_id, note_version),
  UNIQUE (workspace_id, content_ref),
  FOREIGN KEY (workspace_id, note_id) REFERENCES memory_notes(workspace_id, id)
);

CREATE TABLE IF NOT EXISTS memory_snapshots (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  snapshot_version INTEGER NOT NULL CHECK (snapshot_version > 0),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS artifact_versions (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  artifact_id TEXT NOT NULL,
  artifact_version INTEGER NOT NULL CHECK (artifact_version > 0),
  content_type TEXT NOT NULL CHECK (content_type IN ('markdown', 'json', 'html', 'text', 'image', 'video', 'binary')),
  content_hash TEXT NOT NULL,
  content_ref TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  source_ticket TEXT NOT NULL,
  source_run TEXT NOT NULL,
  source_agent TEXT NOT NULL,
  model TEXT NOT NULL,
  receipt_refs_json TEXT NOT NULL,
  judge_ref TEXT,
  review_ref TEXT,
  parent_artifact_refs_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, artifact_id, artifact_version),
  UNIQUE (workspace_id, content_ref),
  FOREIGN KEY (workspace_id, source_ticket) REFERENCES tickets(workspace_id, id),
  FOREIGN KEY (workspace_id, source_run) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, source_agent) REFERENCES agents(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_memory_notes_scope ON memory_notes(workspace_id, scope_kind, scope_id, path);
CREATE INDEX IF NOT EXISTS idx_memory_versions_conflict ON memory_versions(workspace_id, status, conflict_group_id);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_run ON artifact_versions(workspace_id, source_run, artifact_version);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_receipts ON artifact_versions(workspace_id, source_run, content_hash);

CREATE TRIGGER IF NOT EXISTS memory_versions_no_update
BEFORE UPDATE ON memory_versions
BEGIN
  SELECT RAISE(ABORT, 'memory versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS memory_versions_no_delete
BEFORE DELETE ON memory_versions
BEGIN
  SELECT RAISE(ABORT, 'memory versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS artifact_versions_no_update
BEFORE UPDATE ON artifact_versions
BEGIN
  SELECT RAISE(ABORT, 'artifact versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS artifact_versions_no_delete
BEFORE DELETE ON artifact_versions
BEGIN
  SELECT RAISE(ABORT, 'artifact versions are immutable');
END;
