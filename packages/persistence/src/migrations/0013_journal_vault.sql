CREATE TABLE IF NOT EXISTS vault_bridges (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('obsidian', 'omi', 'markdown_vault', 'manual')),
  root_ref TEXT NOT NULL CHECK (root_ref GLOB 'workspace://?*' OR root_ref GLOB 'artifact://?*' OR root_ref GLOB 'memory://?*' OR root_ref GLOB 'journal://?*'),
  access_mode TEXT NOT NULL CHECK (access_mode = 'read_only'),
  sync_status TEXT NOT NULL CHECK (sync_status IN ('not_indexed', 'indexed', 'stale', 'error')),
  graph_enabled INTEGER NOT NULL CHECK (graph_enabled IN (0, 1)),
  fts_enabled INTEGER NOT NULL CHECK (fts_enabled IN (0, 1)),
  allowed_source_kinds_json TEXT NOT NULL CHECK (json_valid(allowed_source_kinds_json)),
  last_indexed_at TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  vault_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_ids_json TEXT NOT NULL CHECK (json_valid(source_ids_json)),
  memory_candidate_ids_json TEXT NOT NULL CHECK (json_valid(memory_candidate_ids_json)),
  run_id TEXT,
  goal_loop_id TEXT,
  tags_json TEXT NOT NULL CHECK (json_valid(tags_json)),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, vault_id, entry_date),
  FOREIGN KEY (workspace_id, vault_id) REFERENCES vault_bridges(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, goal_loop_id) REFERENCES goal_loops(workspace_id, id)
);

CREATE TABLE IF NOT EXISTS journal_sources (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  vault_id TEXT NOT NULL,
  journal_entry_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('manual', 'omi', 'obsidian', 'memory', 'artifact')),
  source_ref TEXT NOT NULL CHECK (source_ref GLOB 'workspace://?*' OR source_ref GLOB 'artifact://?*' OR source_ref GLOB 'memory://?*' OR source_ref GLOB 'journal://?*'),
  source_hash TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, vault_id) REFERENCES vault_bridges(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, journal_entry_id) REFERENCES journal_entries(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS journal_graph_indexes (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  vault_id TEXT NOT NULL,
  index_kind TEXT NOT NULL CHECK (index_kind IN ('graph', 'fts', 'graph_fts')),
  indexed_at TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  graph_hash TEXT NOT NULL,
  fts_hash TEXT NOT NULL,
  node_count INTEGER NOT NULL CHECK (node_count >= 0),
  edge_count INTEGER NOT NULL CHECK (edge_count >= 0),
  document_count INTEGER NOT NULL CHECK (document_count >= 0),
  stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, vault_id) REFERENCES vault_bridges(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS journal_memory_candidates (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  vault_id TEXT NOT NULL,
  journal_entry_id TEXT NOT NULL,
  source_ids_json TEXT NOT NULL CHECK (json_valid(source_ids_json)),
  candidate_kind TEXT NOT NULL CHECK (candidate_kind IN ('lesson', 'preference', 'decision', 'summary', 'sop')),
  proposed_path TEXT NOT NULL CHECK (proposed_path GLOB 'workspace://?*' OR proposed_path GLOB 'artifact://?*' OR proposed_path GLOB 'memory://?*' OR proposed_path GLOB 'journal://?*'),
  summary TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('R0', 'R1', 'R2', 'R3')),
  status TEXT NOT NULL CHECK (status IN ('needs_review', 'approved', 'rejected', 'writeback_pending', 'applied')),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, vault_id) REFERENCES vault_bridges(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, journal_entry_id) REFERENCES journal_entries(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS journal_writeback_requests (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  vault_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  target_ref TEXT NOT NULL CHECK (target_ref GLOB 'workspace://?*' OR target_ref GLOB 'artifact://?*' OR target_ref GLOB 'memory://?*' OR target_ref GLOB 'journal://?*'),
  diff_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'approved', 'rejected', 'cancelled')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  expected_target_revision INTEGER NOT NULL CHECK (expected_target_revision > 0),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, vault_id) REFERENCES vault_bridges(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, candidate_id) REFERENCES journal_memory_candidates(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS journal_writeback_decisions (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, request_id),
  FOREIGN KEY (workspace_id, request_id) REFERENCES journal_writeback_requests(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace_vault ON journal_entries(workspace_id, vault_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_sources_workspace_entry ON journal_sources(workspace_id, journal_entry_id, captured_at ASC);
CREATE INDEX IF NOT EXISTS idx_journal_graph_workspace_vault ON journal_graph_indexes(workspace_id, vault_id, indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_candidates_workspace_entry ON journal_memory_candidates(workspace_id, journal_entry_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_journal_writebacks_workspace_candidate ON journal_writeback_requests(workspace_id, candidate_id, requested_at DESC);

CREATE TRIGGER IF NOT EXISTS c22_vault_bridges_allowed_source_kinds_insert
BEFORE INSERT ON vault_bridges
WHEN json_type(NEW.allowed_source_kinds_json) != 'array'
  OR json_array_length(NEW.allowed_source_kinds_json) < 1
  OR json_array_length(NEW.allowed_source_kinds_json) > 16
  OR EXISTS (
    SELECT 1
    FROM json_each(NEW.allowed_source_kinds_json)
    WHERE type != 'text'
      OR value NOT IN ('manual', 'omi', 'obsidian', 'memory', 'artifact')
  )
BEGIN SELECT RAISE(ABORT, 'vault allowed source kinds must be valid journal source kinds'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_sources_allowed_kind_insert
BEFORE INSERT ON journal_sources
WHEN NOT EXISTS (
  SELECT 1
  FROM vault_bridges vault
  JOIN json_each(vault.allowed_source_kinds_json) allowed_kind
  WHERE vault.workspace_id = NEW.workspace_id
    AND vault.id = NEW.vault_id
    AND allowed_kind.value = NEW.source_kind
)
BEGIN SELECT RAISE(ABORT, 'journal source kind is not allowed by vault policy'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_graph_indexes_enabled_insert
BEFORE INSERT ON journal_graph_indexes
WHEN NOT EXISTS (
  SELECT 1
  FROM vault_bridges vault
  WHERE vault.workspace_id = NEW.workspace_id
    AND vault.id = NEW.vault_id
    AND (
      (NEW.index_kind = 'graph' AND vault.graph_enabled = 1)
      OR (NEW.index_kind = 'fts' AND vault.fts_enabled = 1)
      OR (NEW.index_kind = 'graph_fts' AND vault.graph_enabled = 1 AND vault.fts_enabled = 1)
    )
)
BEGIN SELECT RAISE(ABORT, 'journal graph or FTS index kind is not enabled by vault policy'); END;

CREATE TRIGGER IF NOT EXISTS c22_vault_bridges_payload_columns_match_insert
BEFORE INSERT ON vault_bridges
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.name') IS NOT NEW.name
  OR json_extract(NEW.payload_json, '$.kind') IS NOT NEW.kind
  OR json_extract(NEW.payload_json, '$.root_ref') IS NOT NEW.root_ref
  OR json_extract(NEW.payload_json, '$.access_mode') IS NOT NEW.access_mode
  OR json_extract(NEW.payload_json, '$.sync_status') IS NOT NEW.sync_status
  OR json_extract(NEW.payload_json, '$.graph_enabled') IS NOT NEW.graph_enabled
  OR json_extract(NEW.payload_json, '$.fts_enabled') IS NOT NEW.fts_enabled
  OR json_extract(NEW.payload_json, '$.allowed_source_kinds') IS NOT json(NEW.allowed_source_kinds_json)
  OR json_extract(NEW.payload_json, '$.last_indexed_at') IS NOT NEW.last_indexed_at
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'vault bridge payload must match normalized columns'); END;

CREATE TRIGGER IF NOT EXISTS c22_vault_bridges_payload_columns_match_update
BEFORE UPDATE ON vault_bridges
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.name') IS NOT NEW.name
  OR json_extract(NEW.payload_json, '$.kind') IS NOT NEW.kind
  OR json_extract(NEW.payload_json, '$.root_ref') IS NOT NEW.root_ref
  OR json_extract(NEW.payload_json, '$.access_mode') IS NOT NEW.access_mode
  OR json_extract(NEW.payload_json, '$.sync_status') IS NOT NEW.sync_status
  OR json_extract(NEW.payload_json, '$.graph_enabled') IS NOT NEW.graph_enabled
  OR json_extract(NEW.payload_json, '$.fts_enabled') IS NOT NEW.fts_enabled
  OR json_extract(NEW.payload_json, '$.allowed_source_kinds') IS NOT json(NEW.allowed_source_kinds_json)
  OR json_extract(NEW.payload_json, '$.last_indexed_at') IS NOT NEW.last_indexed_at
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'vault bridge payload must match normalized columns'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_entries_payload_columns_match_insert
BEFORE INSERT ON journal_entries
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.vault_id') IS NOT NEW.vault_id
  OR json_extract(NEW.payload_json, '$.entry_date') IS NOT NEW.entry_date
  OR json_extract(NEW.payload_json, '$.title') IS NOT NEW.title
  OR json_extract(NEW.payload_json, '$.summary') IS NOT NEW.summary
  OR json_extract(NEW.payload_json, '$.source_ids') IS NOT json(NEW.source_ids_json)
  OR json_extract(NEW.payload_json, '$.memory_candidate_ids') IS NOT json(NEW.memory_candidate_ids_json)
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.goal_loop_id') IS NOT NEW.goal_loop_id
  OR json_extract(NEW.payload_json, '$.tags') IS NOT json(NEW.tags_json)
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'journal entry payload must match normalized columns'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_entries_payload_columns_match_update
BEFORE UPDATE ON journal_entries
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.vault_id') IS NOT NEW.vault_id
  OR json_extract(NEW.payload_json, '$.entry_date') IS NOT NEW.entry_date
  OR json_extract(NEW.payload_json, '$.title') IS NOT NEW.title
  OR json_extract(NEW.payload_json, '$.summary') IS NOT NEW.summary
  OR json_extract(NEW.payload_json, '$.source_ids') IS NOT json(NEW.source_ids_json)
  OR json_extract(NEW.payload_json, '$.memory_candidate_ids') IS NOT json(NEW.memory_candidate_ids_json)
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.goal_loop_id') IS NOT NEW.goal_loop_id
  OR json_extract(NEW.payload_json, '$.tags') IS NOT json(NEW.tags_json)
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'journal entry payload must match normalized columns'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_sources_payload_columns_match_insert
BEFORE INSERT ON journal_sources
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.vault_id') IS NOT NEW.vault_id
  OR json_extract(NEW.payload_json, '$.journal_entry_id') IS NOT NEW.journal_entry_id
  OR json_extract(NEW.payload_json, '$.source_kind') IS NOT NEW.source_kind
  OR json_extract(NEW.payload_json, '$.source_ref') IS NOT NEW.source_ref
  OR json_extract(NEW.payload_json, '$.source_hash') IS NOT NEW.source_hash
  OR json_extract(NEW.payload_json, '$.captured_at') IS NOT NEW.captured_at
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'journal source payload must match normalized columns'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_graph_indexes_payload_columns_match_insert
BEFORE INSERT ON journal_graph_indexes
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.vault_id') IS NOT NEW.vault_id
  OR json_extract(NEW.payload_json, '$.index_kind') IS NOT NEW.index_kind
  OR json_extract(NEW.payload_json, '$.indexed_at') IS NOT NEW.indexed_at
  OR json_extract(NEW.payload_json, '$.source_hash') IS NOT NEW.source_hash
  OR json_extract(NEW.payload_json, '$.graph_hash') IS NOT NEW.graph_hash
  OR json_extract(NEW.payload_json, '$.fts_hash') IS NOT NEW.fts_hash
  OR json_extract(NEW.payload_json, '$.node_count') IS NOT NEW.node_count
  OR json_extract(NEW.payload_json, '$.edge_count') IS NOT NEW.edge_count
  OR json_extract(NEW.payload_json, '$.document_count') IS NOT NEW.document_count
  OR json_extract(NEW.payload_json, '$.stale') IS NOT NEW.stale
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'journal graph index payload must match normalized columns'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_candidates_payload_columns_match_insert
BEFORE INSERT ON journal_memory_candidates
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.vault_id') IS NOT NEW.vault_id
  OR json_extract(NEW.payload_json, '$.journal_entry_id') IS NOT NEW.journal_entry_id
  OR json_extract(NEW.payload_json, '$.source_ids') IS NOT json(NEW.source_ids_json)
  OR json_extract(NEW.payload_json, '$.candidate_kind') IS NOT NEW.candidate_kind
  OR json_extract(NEW.payload_json, '$.proposed_path') IS NOT NEW.proposed_path
  OR json_extract(NEW.payload_json, '$.summary') IS NOT NEW.summary
  OR json_extract(NEW.payload_json, '$.content_hash') IS NOT NEW.content_hash
  OR json_extract(NEW.payload_json, '$.risk_level') IS NOT NEW.risk_level
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'journal memory candidate payload must match normalized columns'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_payload_columns_match_insert
BEFORE INSERT ON journal_writeback_requests
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.vault_id') IS NOT NEW.vault_id
  OR json_extract(NEW.payload_json, '$.candidate_id') IS NOT NEW.candidate_id
  OR json_extract(NEW.payload_json, '$.target_ref') IS NOT NEW.target_ref
  OR json_extract(NEW.payload_json, '$.diff_hash') IS NOT NEW.diff_hash
  OR json_extract(NEW.payload_json, '$.reason') IS NOT NEW.reason
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.requested_by') IS NOT NEW.requested_by
  OR json_extract(NEW.payload_json, '$.requested_at') IS NOT NEW.requested_at
  OR json_extract(NEW.payload_json, '$.expected_target_revision') IS NOT NEW.expected_target_revision
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'journal writeback request payload must match normalized columns'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_payload_columns_match_update
BEFORE UPDATE ON journal_writeback_requests
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.vault_id') IS NOT NEW.vault_id
  OR json_extract(NEW.payload_json, '$.candidate_id') IS NOT NEW.candidate_id
  OR json_extract(NEW.payload_json, '$.target_ref') IS NOT NEW.target_ref
  OR json_extract(NEW.payload_json, '$.diff_hash') IS NOT NEW.diff_hash
  OR json_extract(NEW.payload_json, '$.reason') IS NOT NEW.reason
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.requested_by') IS NOT NEW.requested_by
  OR json_extract(NEW.payload_json, '$.requested_at') IS NOT NEW.requested_at
  OR json_extract(NEW.payload_json, '$.expected_target_revision') IS NOT NEW.expected_target_revision
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'journal writeback request payload must match normalized columns'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_decisions_payload_columns_match_insert
BEFORE INSERT ON journal_writeback_decisions
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.request_id') IS NOT NEW.request_id
  OR json_extract(NEW.payload_json, '$.decision') IS NOT NEW.decision
  OR json_extract(NEW.payload_json, '$.decided_by') IS NOT NEW.decided_by
  OR json_extract(NEW.payload_json, '$.decided_at') IS NOT NEW.decided_at
  OR json_extract(NEW.payload_json, '$.reason') IS NOT NEW.reason
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'journal writeback decision payload must match normalized columns'); END;

CREATE TRIGGER IF NOT EXISTS c22_vault_bridges_payload_known_keys_insert
BEFORE INSERT ON vault_bridges
WHEN json_type(NEW.payload_json) != 'object'
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json)) != (SELECT COUNT(DISTINCT payload_key.key) FROM json_each(NEW.payload_json) AS payload_key)
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json) AS payload_key
    WHERE payload_key.key NOT IN ('id', 'workspace_id', 'schema_version', 'created_at', 'updated_at', 'revision', 'name', 'kind', 'root_ref', 'access_mode', 'sync_status', 'graph_enabled', 'fts_enabled', 'allowed_source_kinds', 'last_indexed_at', 'descriptor_only')
  )
BEGIN SELECT RAISE(ABORT, 'vault bridge payload must not include unknown or duplicate fields'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_entries_payload_known_keys_insert
BEFORE INSERT ON journal_entries
WHEN json_type(NEW.payload_json) != 'object'
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json)) != (SELECT COUNT(DISTINCT payload_key.key) FROM json_each(NEW.payload_json) AS payload_key)
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json) AS payload_key
    WHERE payload_key.key NOT IN ('id', 'workspace_id', 'schema_version', 'created_at', 'updated_at', 'vault_id', 'entry_date', 'title', 'summary', 'source_ids', 'memory_candidate_ids', 'run_id', 'goal_loop_id', 'tags', 'descriptor_only')
  )
BEGIN SELECT RAISE(ABORT, 'journal entry payload must not include unknown or duplicate fields'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_sources_payload_known_keys_insert
BEFORE INSERT ON journal_sources
WHEN json_type(NEW.payload_json) != 'object'
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json)) != (SELECT COUNT(DISTINCT payload_key.key) FROM json_each(NEW.payload_json) AS payload_key)
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json) AS payload_key
    WHERE payload_key.key NOT IN ('id', 'workspace_id', 'schema_version', 'created_at', 'updated_at', 'vault_id', 'journal_entry_id', 'source_kind', 'source_ref', 'source_hash', 'captured_at', 'descriptor_only')
  )
BEGIN SELECT RAISE(ABORT, 'journal source payload must not include unknown or duplicate fields'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_graph_indexes_payload_known_keys_insert
BEFORE INSERT ON journal_graph_indexes
WHEN json_type(NEW.payload_json) != 'object'
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json)) != (SELECT COUNT(DISTINCT payload_key.key) FROM json_each(NEW.payload_json) AS payload_key)
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json) AS payload_key
    WHERE payload_key.key NOT IN ('id', 'workspace_id', 'schema_version', 'created_at', 'updated_at', 'vault_id', 'index_kind', 'indexed_at', 'source_hash', 'graph_hash', 'fts_hash', 'node_count', 'edge_count', 'document_count', 'stale', 'descriptor_only')
  )
BEGIN SELECT RAISE(ABORT, 'journal graph index payload must not include unknown or duplicate fields'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_candidates_payload_known_keys_insert
BEFORE INSERT ON journal_memory_candidates
WHEN json_type(NEW.payload_json) != 'object'
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json)) != (SELECT COUNT(DISTINCT payload_key.key) FROM json_each(NEW.payload_json) AS payload_key)
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json) AS payload_key
    WHERE payload_key.key NOT IN ('id', 'workspace_id', 'schema_version', 'created_at', 'updated_at', 'vault_id', 'journal_entry_id', 'source_ids', 'candidate_kind', 'proposed_path', 'summary', 'content_hash', 'risk_level', 'status', 'descriptor_only')
  )
BEGIN SELECT RAISE(ABORT, 'journal memory candidate payload must not include unknown or duplicate fields'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_payload_known_keys_insert
BEFORE INSERT ON journal_writeback_requests
WHEN json_type(NEW.payload_json) != 'object'
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json)) != (SELECT COUNT(DISTINCT payload_key.key) FROM json_each(NEW.payload_json) AS payload_key)
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json) AS payload_key
    WHERE payload_key.key NOT IN ('id', 'workspace_id', 'schema_version', 'created_at', 'updated_at', 'revision', 'vault_id', 'candidate_id', 'target_ref', 'diff_hash', 'reason', 'status', 'requested_by', 'requested_at', 'expected_target_revision', 'descriptor_only')
  )
BEGIN SELECT RAISE(ABORT, 'journal writeback request payload must not include unknown or duplicate fields'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_payload_known_keys_update
BEFORE UPDATE OF payload_json ON journal_writeback_requests
WHEN json_type(NEW.payload_json) != 'object'
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json)) != (SELECT COUNT(DISTINCT payload_key.key) FROM json_each(NEW.payload_json) AS payload_key)
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json) AS payload_key
    WHERE payload_key.key NOT IN ('id', 'workspace_id', 'schema_version', 'created_at', 'updated_at', 'revision', 'vault_id', 'candidate_id', 'target_ref', 'diff_hash', 'reason', 'status', 'requested_by', 'requested_at', 'expected_target_revision', 'descriptor_only')
  )
BEGIN SELECT RAISE(ABORT, 'journal writeback request payload must not include unknown or duplicate fields'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_decisions_payload_known_keys_insert
BEFORE INSERT ON journal_writeback_decisions
WHEN json_type(NEW.payload_json) != 'object'
  OR (SELECT COUNT(*) FROM json_each(NEW.payload_json)) != (SELECT COUNT(DISTINCT payload_key.key) FROM json_each(NEW.payload_json) AS payload_key)
  OR EXISTS (
    SELECT 1 FROM json_each(NEW.payload_json) AS payload_key
    WHERE payload_key.key NOT IN ('id', 'workspace_id', 'schema_version', 'created_at', 'updated_at', 'request_id', 'decision', 'decided_by', 'decided_at', 'reason', 'descriptor_only')
  )
BEGIN SELECT RAISE(ABORT, 'journal writeback decision payload must not include unknown or duplicate fields'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_entries_goal_run_scope_insert
BEFORE INSERT ON journal_entries
WHEN (NEW.run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM runs WHERE workspace_id = NEW.workspace_id AND id = NEW.run_id
  ))
  OR (NEW.goal_loop_id IS NOT NULL AND NEW.run_id IS NULL)
  OR (NEW.goal_loop_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM goal_loops
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.goal_loop_id
      AND run_id = NEW.run_id
  ))
BEGIN SELECT RAISE(ABORT, 'journal entry run/goal scope mismatch'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_entries_goal_run_scope_update
BEFORE UPDATE OF workspace_id, run_id, goal_loop_id ON journal_entries
WHEN (NEW.run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM runs WHERE workspace_id = NEW.workspace_id AND id = NEW.run_id
  ))
  OR (NEW.goal_loop_id IS NOT NULL AND NEW.run_id IS NULL)
  OR (NEW.goal_loop_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM goal_loops
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.goal_loop_id
      AND run_id = NEW.run_id
  ))
BEGIN SELECT RAISE(ABORT, 'journal entry run/goal scope mismatch'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_sources_entry_listing_insert
BEFORE INSERT ON journal_sources
WHEN NOT EXISTS (
  SELECT 1 FROM journal_entries entry
  WHERE entry.workspace_id = NEW.workspace_id
    AND entry.vault_id = NEW.vault_id
    AND entry.id = NEW.journal_entry_id
    AND EXISTS (SELECT 1 FROM json_each(entry.source_ids_json) WHERE value = NEW.id)
)
BEGIN SELECT RAISE(ABORT, 'journal source must be listed by journal entry'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_candidates_entry_listing_insert
BEFORE INSERT ON journal_memory_candidates
WHEN NOT EXISTS (
  SELECT 1 FROM journal_entries entry
  WHERE entry.workspace_id = NEW.workspace_id
    AND entry.vault_id = NEW.vault_id
    AND entry.id = NEW.journal_entry_id
    AND EXISTS (SELECT 1 FROM json_each(entry.memory_candidate_ids_json) WHERE value = NEW.id)
)
BEGIN SELECT RAISE(ABORT, 'journal memory candidate must be listed by journal entry'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_candidates_sources_scope_insert
BEFORE INSERT ON journal_memory_candidates
WHEN (SELECT COUNT(*) FROM json_each(NEW.source_ids_json)) != (
  SELECT COUNT(*) FROM journal_sources source
  JOIN json_each(NEW.source_ids_json) listed ON listed.value = source.id
  WHERE source.workspace_id = NEW.workspace_id
    AND source.vault_id = NEW.vault_id
    AND source.journal_entry_id = NEW.journal_entry_id
)
BEGIN SELECT RAISE(ABORT, 'journal memory candidate source scope mismatch'); END;

CREATE TRIGGER IF NOT EXISTS c22_vault_bridges_ref_shape_insert
BEFORE INSERT ON vault_bridges
WHEN NOT (
  ((substr(NEW.root_ref, 1, 12) = 'workspace://' AND length(NEW.root_ref) > 12)
    OR (substr(NEW.root_ref, 1, 11) = 'artifact://' AND length(NEW.root_ref) > 11)
    OR (substr(NEW.root_ref, 1, 9) = 'memory://' AND length(NEW.root_ref) > 9)
    OR (substr(NEW.root_ref, 1, 10) = 'journal://' AND length(NEW.root_ref) > 10))
  AND instr(NEW.root_ref, ' ') = 0
  AND instr(NEW.root_ref, char(9)) = 0
  AND instr(NEW.root_ref, char(10)) = 0
  AND instr(NEW.root_ref, char(11)) = 0
  AND instr(NEW.root_ref, char(12)) = 0
  AND instr(NEW.root_ref, char(13)) = 0
  AND instr(NEW.root_ref, char(847)) = 0
  AND instr(NEW.root_ref, char(160)) = 0
  AND instr(NEW.root_ref, char(5760)) = 0
  AND instr(NEW.root_ref, char(6158)) = 0
  AND instr(NEW.root_ref, char(8192)) = 0
  AND instr(NEW.root_ref, char(8193)) = 0
  AND instr(NEW.root_ref, char(8194)) = 0
  AND instr(NEW.root_ref, char(8195)) = 0
  AND instr(NEW.root_ref, char(8196)) = 0
  AND instr(NEW.root_ref, char(8197)) = 0
  AND instr(NEW.root_ref, char(8198)) = 0
  AND instr(NEW.root_ref, char(8199)) = 0
  AND instr(NEW.root_ref, char(8200)) = 0
  AND instr(NEW.root_ref, char(8201)) = 0
  AND instr(NEW.root_ref, char(8202)) = 0
  AND instr(NEW.root_ref, char(8203)) = 0
  AND instr(NEW.root_ref, char(8204)) = 0
  AND instr(NEW.root_ref, char(8205)) = 0
  AND instr(NEW.root_ref, char(8206)) = 0
  AND instr(NEW.root_ref, char(8207)) = 0
  AND instr(NEW.root_ref, char(8232)) = 0
  AND instr(NEW.root_ref, char(8233)) = 0
  AND instr(NEW.root_ref, char(8239)) = 0
  AND instr(NEW.root_ref, char(8287)) = 0
  AND instr(NEW.root_ref, char(8288)) = 0
  AND instr(NEW.root_ref, char(8289)) = 0
  AND instr(NEW.root_ref, char(8290)) = 0
  AND instr(NEW.root_ref, char(8291)) = 0
  AND instr(NEW.root_ref, char(8292)) = 0
  AND instr(NEW.root_ref, char(12288)) = 0
  AND instr(NEW.root_ref, char(65279)) = 0
  AND NEW.root_ref NOT GLOB '*[^-A-Za-z0-9._~:/]*'
  AND instr(NEW.root_ref, char(92)) = 0
  AND instr(substr(NEW.root_ref, instr(NEW.root_ref, '://') + 3), ':') = 0
  AND instr(substr(NEW.root_ref, instr(NEW.root_ref, '://') + 3), '://') = 0
  AND instr(substr(NEW.root_ref, instr(NEW.root_ref, '://') + 3), '//') = 0
  AND substr(NEW.root_ref, instr(NEW.root_ref, '://') + 3) NOT IN ('.', '..', '~')
  AND substr(NEW.root_ref, instr(NEW.root_ref, '://') + 3, 1) != '/'
  AND substr(NEW.root_ref, instr(NEW.root_ref, '://') + 3, 2) NOT IN ('~/', './')
  AND substr(NEW.root_ref, instr(NEW.root_ref, '://') + 3, 3) != '../'
  AND instr(substr(NEW.root_ref, instr(NEW.root_ref, '://') + 3), '/./') = 0
  AND instr(substr(NEW.root_ref, instr(NEW.root_ref, '://') + 3), '/../') = 0
  AND substr(substr(NEW.root_ref, instr(NEW.root_ref, '://') + 3), -2) != '/.'
  AND substr(substr(NEW.root_ref, instr(NEW.root_ref, '://') + 3), -3) != '/..'
  AND instr(lower(NEW.root_ref), '%2e') = 0
  AND instr(lower(NEW.root_ref), '%2f') = 0
  AND instr(lower(NEW.root_ref), '%5c') = 0
  AND instr(lower(NEW.root_ref), '%25') = 0
)
BEGIN SELECT RAISE(ABORT, 'journal descriptor reference must use lowercase descriptor namespace and safe path'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_sources_ref_shape_insert
BEFORE INSERT ON journal_sources
WHEN NOT (
  ((substr(NEW.source_ref, 1, 12) = 'workspace://' AND length(NEW.source_ref) > 12)
    OR (substr(NEW.source_ref, 1, 11) = 'artifact://' AND length(NEW.source_ref) > 11)
    OR (substr(NEW.source_ref, 1, 9) = 'memory://' AND length(NEW.source_ref) > 9)
    OR (substr(NEW.source_ref, 1, 10) = 'journal://' AND length(NEW.source_ref) > 10))
  AND instr(NEW.source_ref, ' ') = 0
  AND instr(NEW.source_ref, char(9)) = 0
  AND instr(NEW.source_ref, char(10)) = 0
  AND instr(NEW.source_ref, char(11)) = 0
  AND instr(NEW.source_ref, char(12)) = 0
  AND instr(NEW.source_ref, char(13)) = 0
  AND instr(NEW.source_ref, char(847)) = 0
  AND instr(NEW.source_ref, char(160)) = 0
  AND instr(NEW.source_ref, char(5760)) = 0
  AND instr(NEW.source_ref, char(6158)) = 0
  AND instr(NEW.source_ref, char(8192)) = 0
  AND instr(NEW.source_ref, char(8193)) = 0
  AND instr(NEW.source_ref, char(8194)) = 0
  AND instr(NEW.source_ref, char(8195)) = 0
  AND instr(NEW.source_ref, char(8196)) = 0
  AND instr(NEW.source_ref, char(8197)) = 0
  AND instr(NEW.source_ref, char(8198)) = 0
  AND instr(NEW.source_ref, char(8199)) = 0
  AND instr(NEW.source_ref, char(8200)) = 0
  AND instr(NEW.source_ref, char(8201)) = 0
  AND instr(NEW.source_ref, char(8202)) = 0
  AND instr(NEW.source_ref, char(8203)) = 0
  AND instr(NEW.source_ref, char(8204)) = 0
  AND instr(NEW.source_ref, char(8205)) = 0
  AND instr(NEW.source_ref, char(8206)) = 0
  AND instr(NEW.source_ref, char(8207)) = 0
  AND instr(NEW.source_ref, char(8232)) = 0
  AND instr(NEW.source_ref, char(8233)) = 0
  AND instr(NEW.source_ref, char(8239)) = 0
  AND instr(NEW.source_ref, char(8287)) = 0
  AND instr(NEW.source_ref, char(8288)) = 0
  AND instr(NEW.source_ref, char(8289)) = 0
  AND instr(NEW.source_ref, char(8290)) = 0
  AND instr(NEW.source_ref, char(8291)) = 0
  AND instr(NEW.source_ref, char(8292)) = 0
  AND instr(NEW.source_ref, char(12288)) = 0
  AND instr(NEW.source_ref, char(65279)) = 0
  AND NEW.source_ref NOT GLOB '*[^-A-Za-z0-9._~:/]*'
  AND instr(NEW.source_ref, char(92)) = 0
  AND instr(substr(NEW.source_ref, instr(NEW.source_ref, '://') + 3), ':') = 0
  AND instr(substr(NEW.source_ref, instr(NEW.source_ref, '://') + 3), '://') = 0
  AND instr(substr(NEW.source_ref, instr(NEW.source_ref, '://') + 3), '//') = 0
  AND substr(NEW.source_ref, instr(NEW.source_ref, '://') + 3) NOT IN ('.', '..', '~')
  AND substr(NEW.source_ref, instr(NEW.source_ref, '://') + 3, 1) != '/'
  AND substr(NEW.source_ref, instr(NEW.source_ref, '://') + 3, 2) NOT IN ('~/', './')
  AND substr(NEW.source_ref, instr(NEW.source_ref, '://') + 3, 3) != '../'
  AND instr(substr(NEW.source_ref, instr(NEW.source_ref, '://') + 3), '/./') = 0
  AND instr(substr(NEW.source_ref, instr(NEW.source_ref, '://') + 3), '/../') = 0
  AND substr(substr(NEW.source_ref, instr(NEW.source_ref, '://') + 3), -2) != '/.'
  AND substr(substr(NEW.source_ref, instr(NEW.source_ref, '://') + 3), -3) != '/..'
  AND instr(lower(NEW.source_ref), '%2e') = 0
  AND instr(lower(NEW.source_ref), '%2f') = 0
  AND instr(lower(NEW.source_ref), '%5c') = 0
  AND instr(lower(NEW.source_ref), '%25') = 0
)
BEGIN SELECT RAISE(ABORT, 'journal descriptor reference must use lowercase descriptor namespace and safe path'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_candidates_ref_shape_insert
BEFORE INSERT ON journal_memory_candidates
WHEN NOT (
  ((substr(NEW.proposed_path, 1, 12) = 'workspace://' AND length(NEW.proposed_path) > 12)
    OR (substr(NEW.proposed_path, 1, 11) = 'artifact://' AND length(NEW.proposed_path) > 11)
    OR (substr(NEW.proposed_path, 1, 9) = 'memory://' AND length(NEW.proposed_path) > 9)
    OR (substr(NEW.proposed_path, 1, 10) = 'journal://' AND length(NEW.proposed_path) > 10))
  AND instr(NEW.proposed_path, ' ') = 0
  AND instr(NEW.proposed_path, char(9)) = 0
  AND instr(NEW.proposed_path, char(10)) = 0
  AND instr(NEW.proposed_path, char(11)) = 0
  AND instr(NEW.proposed_path, char(12)) = 0
  AND instr(NEW.proposed_path, char(13)) = 0
  AND instr(NEW.proposed_path, char(847)) = 0
  AND instr(NEW.proposed_path, char(160)) = 0
  AND instr(NEW.proposed_path, char(5760)) = 0
  AND instr(NEW.proposed_path, char(6158)) = 0
  AND instr(NEW.proposed_path, char(8192)) = 0
  AND instr(NEW.proposed_path, char(8193)) = 0
  AND instr(NEW.proposed_path, char(8194)) = 0
  AND instr(NEW.proposed_path, char(8195)) = 0
  AND instr(NEW.proposed_path, char(8196)) = 0
  AND instr(NEW.proposed_path, char(8197)) = 0
  AND instr(NEW.proposed_path, char(8198)) = 0
  AND instr(NEW.proposed_path, char(8199)) = 0
  AND instr(NEW.proposed_path, char(8200)) = 0
  AND instr(NEW.proposed_path, char(8201)) = 0
  AND instr(NEW.proposed_path, char(8202)) = 0
  AND instr(NEW.proposed_path, char(8203)) = 0
  AND instr(NEW.proposed_path, char(8204)) = 0
  AND instr(NEW.proposed_path, char(8205)) = 0
  AND instr(NEW.proposed_path, char(8206)) = 0
  AND instr(NEW.proposed_path, char(8207)) = 0
  AND instr(NEW.proposed_path, char(8232)) = 0
  AND instr(NEW.proposed_path, char(8233)) = 0
  AND instr(NEW.proposed_path, char(8239)) = 0
  AND instr(NEW.proposed_path, char(8287)) = 0
  AND instr(NEW.proposed_path, char(8288)) = 0
  AND instr(NEW.proposed_path, char(8289)) = 0
  AND instr(NEW.proposed_path, char(8290)) = 0
  AND instr(NEW.proposed_path, char(8291)) = 0
  AND instr(NEW.proposed_path, char(8292)) = 0
  AND instr(NEW.proposed_path, char(12288)) = 0
  AND instr(NEW.proposed_path, char(65279)) = 0
  AND NEW.proposed_path NOT GLOB '*[^-A-Za-z0-9._~:/]*'
  AND instr(NEW.proposed_path, char(92)) = 0
  AND instr(substr(NEW.proposed_path, instr(NEW.proposed_path, '://') + 3), ':') = 0
  AND instr(substr(NEW.proposed_path, instr(NEW.proposed_path, '://') + 3), '://') = 0
  AND instr(substr(NEW.proposed_path, instr(NEW.proposed_path, '://') + 3), '//') = 0
  AND substr(NEW.proposed_path, instr(NEW.proposed_path, '://') + 3) NOT IN ('.', '..', '~')
  AND substr(NEW.proposed_path, instr(NEW.proposed_path, '://') + 3, 1) != '/'
  AND substr(NEW.proposed_path, instr(NEW.proposed_path, '://') + 3, 2) NOT IN ('~/', './')
  AND substr(NEW.proposed_path, instr(NEW.proposed_path, '://') + 3, 3) != '../'
  AND instr(substr(NEW.proposed_path, instr(NEW.proposed_path, '://') + 3), '/./') = 0
  AND instr(substr(NEW.proposed_path, instr(NEW.proposed_path, '://') + 3), '/../') = 0
  AND substr(substr(NEW.proposed_path, instr(NEW.proposed_path, '://') + 3), -2) != '/.'
  AND substr(substr(NEW.proposed_path, instr(NEW.proposed_path, '://') + 3), -3) != '/..'
  AND instr(lower(NEW.proposed_path), '%2e') = 0
  AND instr(lower(NEW.proposed_path), '%2f') = 0
  AND instr(lower(NEW.proposed_path), '%5c') = 0
  AND instr(lower(NEW.proposed_path), '%25') = 0
)
BEGIN SELECT RAISE(ABORT, 'journal descriptor reference must use lowercase descriptor namespace and safe path'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_ref_shape_insert
BEFORE INSERT ON journal_writeback_requests
WHEN NOT (
  ((substr(NEW.target_ref, 1, 12) = 'workspace://' AND length(NEW.target_ref) > 12)
    OR (substr(NEW.target_ref, 1, 11) = 'artifact://' AND length(NEW.target_ref) > 11)
    OR (substr(NEW.target_ref, 1, 9) = 'memory://' AND length(NEW.target_ref) > 9)
    OR (substr(NEW.target_ref, 1, 10) = 'journal://' AND length(NEW.target_ref) > 10))
  AND instr(NEW.target_ref, ' ') = 0
  AND instr(NEW.target_ref, char(9)) = 0
  AND instr(NEW.target_ref, char(10)) = 0
  AND instr(NEW.target_ref, char(11)) = 0
  AND instr(NEW.target_ref, char(12)) = 0
  AND instr(NEW.target_ref, char(13)) = 0
  AND instr(NEW.target_ref, char(847)) = 0
  AND instr(NEW.target_ref, char(160)) = 0
  AND instr(NEW.target_ref, char(5760)) = 0
  AND instr(NEW.target_ref, char(6158)) = 0
  AND instr(NEW.target_ref, char(8192)) = 0
  AND instr(NEW.target_ref, char(8193)) = 0
  AND instr(NEW.target_ref, char(8194)) = 0
  AND instr(NEW.target_ref, char(8195)) = 0
  AND instr(NEW.target_ref, char(8196)) = 0
  AND instr(NEW.target_ref, char(8197)) = 0
  AND instr(NEW.target_ref, char(8198)) = 0
  AND instr(NEW.target_ref, char(8199)) = 0
  AND instr(NEW.target_ref, char(8200)) = 0
  AND instr(NEW.target_ref, char(8201)) = 0
  AND instr(NEW.target_ref, char(8202)) = 0
  AND instr(NEW.target_ref, char(8203)) = 0
  AND instr(NEW.target_ref, char(8204)) = 0
  AND instr(NEW.target_ref, char(8205)) = 0
  AND instr(NEW.target_ref, char(8206)) = 0
  AND instr(NEW.target_ref, char(8207)) = 0
  AND instr(NEW.target_ref, char(8232)) = 0
  AND instr(NEW.target_ref, char(8233)) = 0
  AND instr(NEW.target_ref, char(8239)) = 0
  AND instr(NEW.target_ref, char(8287)) = 0
  AND instr(NEW.target_ref, char(8288)) = 0
  AND instr(NEW.target_ref, char(8289)) = 0
  AND instr(NEW.target_ref, char(8290)) = 0
  AND instr(NEW.target_ref, char(8291)) = 0
  AND instr(NEW.target_ref, char(8292)) = 0
  AND instr(NEW.target_ref, char(12288)) = 0
  AND instr(NEW.target_ref, char(65279)) = 0
  AND NEW.target_ref NOT GLOB '*[^-A-Za-z0-9._~:/]*'
  AND instr(NEW.target_ref, char(92)) = 0
  AND instr(substr(NEW.target_ref, instr(NEW.target_ref, '://') + 3), ':') = 0
  AND instr(substr(NEW.target_ref, instr(NEW.target_ref, '://') + 3), '://') = 0
  AND instr(substr(NEW.target_ref, instr(NEW.target_ref, '://') + 3), '//') = 0
  AND substr(NEW.target_ref, instr(NEW.target_ref, '://') + 3) NOT IN ('.', '..', '~')
  AND substr(NEW.target_ref, instr(NEW.target_ref, '://') + 3, 1) != '/'
  AND substr(NEW.target_ref, instr(NEW.target_ref, '://') + 3, 2) NOT IN ('~/', './')
  AND substr(NEW.target_ref, instr(NEW.target_ref, '://') + 3, 3) != '../'
  AND instr(substr(NEW.target_ref, instr(NEW.target_ref, '://') + 3), '/./') = 0
  AND instr(substr(NEW.target_ref, instr(NEW.target_ref, '://') + 3), '/../') = 0
  AND substr(substr(NEW.target_ref, instr(NEW.target_ref, '://') + 3), -2) != '/.'
  AND substr(substr(NEW.target_ref, instr(NEW.target_ref, '://') + 3), -3) != '/..'
  AND instr(lower(NEW.target_ref), '%2e') = 0
  AND instr(lower(NEW.target_ref), '%2f') = 0
  AND instr(lower(NEW.target_ref), '%5c') = 0
  AND instr(lower(NEW.target_ref), '%25') = 0
)
BEGIN SELECT RAISE(ABORT, 'journal descriptor reference must use lowercase descriptor namespace and safe path'); END;

CREATE TRIGGER IF NOT EXISTS c22_vault_bridges_text_safe_insert
BEFORE INSERT ON vault_bridges
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.root_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'basic ') > 0 OR instr(combined, 'xoxb-') > 0 OR instr(combined, 'xoxp-') > 0 OR instr(combined, 'ghp_') > 0 OR instr(combined, 'sk-live-') > 0 OR instr(combined, 'sk-proj-') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR instr(combined, '%2e') > 0 OR instr(combined, '%2f') > 0 OR instr(combined, '%5c') > 0 OR instr(combined, '%25') > 0 OR instr(combined, char(92) || char(92)) > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'vault bridge text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_entries_text_safe_insert
BEFORE INSERT ON journal_entries
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.tags_json, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'basic ') > 0 OR instr(combined, 'xoxb-') > 0 OR instr(combined, 'xoxp-') > 0 OR instr(combined, 'ghp_') > 0 OR instr(combined, 'sk-live-') > 0 OR instr(combined, 'sk-proj-') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR instr(combined, '%2e') > 0 OR instr(combined, '%2f') > 0 OR instr(combined, '%5c') > 0 OR instr(combined, '%25') > 0 OR instr(combined, char(92) || char(92)) > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'journal entry text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_entries_text_safe_update
BEFORE UPDATE OF title, summary, tags_json, payload_json ON journal_entries
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.tags_json, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'basic ') > 0 OR instr(combined, 'xoxb-') > 0 OR instr(combined, 'xoxp-') > 0 OR instr(combined, 'ghp_') > 0 OR instr(combined, 'sk-live-') > 0 OR instr(combined, 'sk-proj-') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR instr(combined, '%2e') > 0 OR instr(combined, '%2f') > 0 OR instr(combined, '%5c') > 0 OR instr(combined, '%25') > 0 OR instr(combined, char(92) || char(92)) > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'journal entry text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_sources_text_safe_insert
BEFORE INSERT ON journal_sources
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.source_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'basic ') > 0 OR instr(combined, 'xoxb-') > 0 OR instr(combined, 'xoxp-') > 0 OR instr(combined, 'ghp_') > 0 OR instr(combined, 'sk-live-') > 0 OR instr(combined, 'sk-proj-') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR instr(combined, '%2e') > 0 OR instr(combined, '%2f') > 0 OR instr(combined, '%5c') > 0 OR instr(combined, '%25') > 0 OR instr(combined, char(92) || char(92)) > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'journal source text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_graph_indexes_text_safe_insert
BEFORE INSERT ON journal_graph_indexes
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'basic ') > 0 OR instr(combined, 'xoxb-') > 0 OR instr(combined, 'xoxp-') > 0 OR instr(combined, 'ghp_') > 0 OR instr(combined, 'sk-live-') > 0 OR instr(combined, 'sk-proj-') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR instr(combined, '%2e') > 0 OR instr(combined, '%2f') > 0 OR instr(combined, '%5c') > 0 OR instr(combined, '%25') > 0 OR instr(combined, char(92) || char(92)) > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'journal graph index text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_candidates_text_safe_insert
BEFORE INSERT ON journal_memory_candidates
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.proposed_path, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'basic ') > 0 OR instr(combined, 'xoxb-') > 0 OR instr(combined, 'xoxp-') > 0 OR instr(combined, 'ghp_') > 0 OR instr(combined, 'sk-live-') > 0 OR instr(combined, 'sk-proj-') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR instr(combined, '%2e') > 0 OR instr(combined, '%2f') > 0 OR instr(combined, '%5c') > 0 OR instr(combined, '%25') > 0 OR instr(combined, char(92) || char(92)) > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'journal memory candidate text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_text_safe_insert
BEFORE INSERT ON journal_writeback_requests
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.target_ref, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.requested_by, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'basic ') > 0 OR instr(combined, 'xoxb-') > 0 OR instr(combined, 'xoxp-') > 0 OR instr(combined, 'ghp_') > 0 OR instr(combined, 'sk-live-') > 0 OR instr(combined, 'sk-proj-') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR instr(combined, '%2e') > 0 OR instr(combined, '%2f') > 0 OR instr(combined, '%5c') > 0 OR instr(combined, '%25') > 0 OR instr(combined, char(92) || char(92)) > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'journal writeback request text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_text_safe_update
BEFORE UPDATE OF target_ref, reason, requested_by, payload_json ON journal_writeback_requests
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.target_ref, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.requested_by, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'basic ') > 0 OR instr(combined, 'xoxb-') > 0 OR instr(combined, 'xoxp-') > 0 OR instr(combined, 'ghp_') > 0 OR instr(combined, 'sk-live-') > 0 OR instr(combined, 'sk-proj-') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR instr(combined, '%2e') > 0 OR instr(combined, '%2f') > 0 OR instr(combined, '%5c') > 0 OR instr(combined, '%25') > 0 OR instr(combined, char(92) || char(92)) > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'journal writeback request text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_decisions_text_safe_insert
BEFORE INSERT ON journal_writeback_decisions
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.decided_by, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'basic ') > 0 OR instr(combined, 'xoxb-') > 0 OR instr(combined, 'xoxp-') > 0 OR instr(combined, 'ghp_') > 0 OR instr(combined, 'sk-live-') > 0 OR instr(combined, 'sk-proj-') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR instr(combined, '%2e') > 0 OR instr(combined, '%2f') > 0 OR instr(combined, '%5c') > 0 OR instr(combined, '%25') > 0 OR instr(combined, char(92) || char(92)) > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'journal writeback decision text must not include secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_vault_bridges_encoded_secret_safe_insert
BEFORE INSERT ON vault_bridges
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.root_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, '%3d') > 0 OR instr(combined, '%3a') > 0
  ) THEN RAISE(ABORT, 'vault bridge text must not include percent-encoded secret markers') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_entries_encoded_secret_safe_insert
BEFORE INSERT ON journal_entries
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.tags_json, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, '%3d') > 0 OR instr(combined, '%3a') > 0
  ) THEN RAISE(ABORT, 'journal entry text must not include percent-encoded secret markers') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_entries_encoded_secret_safe_update
BEFORE UPDATE OF title, summary, tags_json, payload_json ON journal_entries
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.tags_json, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, '%3d') > 0 OR instr(combined, '%3a') > 0
  ) THEN RAISE(ABORT, 'journal entry text must not include percent-encoded secret markers') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_sources_encoded_secret_safe_insert
BEFORE INSERT ON journal_sources
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.source_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, '%3d') > 0 OR instr(combined, '%3a') > 0
  ) THEN RAISE(ABORT, 'journal source text must not include percent-encoded secret markers') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_graph_indexes_encoded_secret_safe_insert
BEFORE INSERT ON journal_graph_indexes
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, '%3d') > 0 OR instr(combined, '%3a') > 0
  ) THEN RAISE(ABORT, 'journal graph index text must not include percent-encoded secret markers') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_candidates_encoded_secret_safe_insert
BEFORE INSERT ON journal_memory_candidates
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.proposed_path, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, '%3d') > 0 OR instr(combined, '%3a') > 0
  ) THEN RAISE(ABORT, 'journal memory candidate text must not include percent-encoded secret markers') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_encoded_secret_safe_insert
BEFORE INSERT ON journal_writeback_requests
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.target_ref, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.requested_by, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, '%3d') > 0 OR instr(combined, '%3a') > 0
  ) THEN RAISE(ABORT, 'journal writeback request text must not include percent-encoded secret markers') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_encoded_secret_safe_update
BEFORE UPDATE OF target_ref, reason, requested_by, payload_json ON journal_writeback_requests
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.target_ref, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.requested_by, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, '%3d') > 0 OR instr(combined, '%3a') > 0
  ) THEN RAISE(ABORT, 'journal writeback request text must not include percent-encoded secret markers') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_decisions_encoded_secret_safe_insert
BEFORE INSERT ON journal_writeback_decisions
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.decided_by, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, '%3d') > 0 OR instr(combined, '%3a') > 0
  ) THEN RAISE(ABORT, 'journal writeback decision text must not include percent-encoded secret markers') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_vault_bridges_normalized_text_safe_insert
BEFORE INSERT ON vault_bridges
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.root_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR combined GLOB '*%[0-9a-f][0-9a-f]*' OR substr(combined, 1, 1) = '/' OR instr(combined, ' /') > 0 OR instr(combined, '"/') > 0 OR instr(combined, '(/') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'vault bridge descriptor text must not include normalized secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_entries_normalized_text_safe_insert
BEFORE INSERT ON journal_entries
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.tags_json, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR combined GLOB '*%[0-9a-f][0-9a-f]*' OR substr(combined, 1, 1) = '/' OR instr(combined, ' /') > 0 OR instr(combined, '"/') > 0 OR instr(combined, '(/') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'journal entry descriptor text must not include normalized secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_entries_normalized_text_safe_update
BEFORE UPDATE OF title, summary, tags_json, payload_json ON journal_entries
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.tags_json, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR combined GLOB '*%[0-9a-f][0-9a-f]*' OR substr(combined, 1, 1) = '/' OR instr(combined, ' /') > 0 OR instr(combined, '"/') > 0 OR instr(combined, '(/') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'journal entry descriptor text must not include normalized secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_sources_normalized_text_safe_insert
BEFORE INSERT ON journal_sources
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.source_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR combined GLOB '*%[0-9a-f][0-9a-f]*' OR substr(combined, 1, 1) = '/' OR instr(combined, ' /') > 0 OR instr(combined, '"/') > 0 OR instr(combined, '(/') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'journal source descriptor text must not include normalized secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_graph_indexes_normalized_text_safe_insert
BEFORE INSERT ON journal_graph_indexes
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR combined GLOB '*%[0-9a-f][0-9a-f]*' OR substr(combined, 1, 1) = '/' OR instr(combined, ' /') > 0 OR instr(combined, '"/') > 0 OR instr(combined, '(/') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'journal graph index descriptor text must not include normalized secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_journal_candidates_normalized_text_safe_insert
BEFORE INSERT ON journal_memory_candidates
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.proposed_path, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR combined GLOB '*%[0-9a-f][0-9a-f]*' OR substr(combined, 1, 1) = '/' OR instr(combined, ' /') > 0 OR instr(combined, '"/') > 0 OR instr(combined, '(/') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'journal memory candidate descriptor text must not include normalized secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_normalized_text_safe_insert
BEFORE INSERT ON journal_writeback_requests
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.target_ref, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.requested_by, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR combined GLOB '*%[0-9a-f][0-9a-f]*' OR substr(combined, 1, 1) = '/' OR instr(combined, ' /') > 0 OR instr(combined, '"/') > 0 OR instr(combined, '(/') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'journal writeback request descriptor text must not include normalized secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_normalized_text_safe_update
BEFORE UPDATE OF target_ref, reason, requested_by, payload_json ON journal_writeback_requests
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.target_ref, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.requested_by, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR combined GLOB '*%[0-9a-f][0-9a-f]*' OR substr(combined, 1, 1) = '/' OR instr(combined, ' /') > 0 OR instr(combined, '"/') > 0 OR instr(combined, '(/') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'journal writeback request descriptor text must not include normalized secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_decisions_normalized_text_safe_insert
BEFORE INSERT ON journal_writeback_decisions
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.decided_by, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR combined GLOB '*%[0-9a-f][0-9a-f]*' OR substr(combined, 1, 1) = '/' OR instr(combined, ' /') > 0 OR instr(combined, '"/') > 0 OR instr(combined, '(/') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'journal writeback decision descriptor text must not include normalized secret or path-shaped content') END;
END;

CREATE TRIGGER IF NOT EXISTS c22_vault_bridges_safe_insert BEFORE INSERT ON vault_bridges
WHEN lower(NEW.root_ref) LIKE '%file://%' OR lower(NEW.root_ref) LIKE '%secret://%' OR lower(NEW.root_ref) LIKE '%vault:%' OR instr(NEW.root_ref, '..') > 0 OR lower(NEW.root_ref) LIKE '%token=%' OR lower(NEW.name) LIKE '%token=%'
BEGIN SELECT RAISE(ABORT, 'vault bridge descriptor must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_sources_safe_insert BEFORE INSERT ON journal_sources
WHEN lower(NEW.source_ref) LIKE '%file://%' OR lower(NEW.source_ref) LIKE '%secret://%' OR lower(NEW.source_ref) LIKE '%vault:%' OR lower(NEW.source_ref) LIKE 'http%' OR instr(NEW.source_ref, '..') > 0 OR lower(NEW.source_ref) LIKE '%token=%'
BEGIN SELECT RAISE(ABORT, 'journal source ref must be safe descriptor reference'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_candidates_safe_insert BEFORE INSERT ON journal_memory_candidates
WHEN lower(NEW.proposed_path) LIKE '%file://%' OR lower(NEW.proposed_path) LIKE '%secret://%' OR lower(NEW.proposed_path) LIKE '%vault:%' OR instr(NEW.proposed_path, '..') > 0 OR lower(NEW.proposed_path) LIKE '%token=%' OR lower(NEW.summary) LIKE '%secret://%' OR lower(NEW.summary) LIKE '%token=%'
BEGIN SELECT RAISE(ABORT, 'journal memory candidate must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c22_journal_candidates_pending_insert BEFORE INSERT ON journal_memory_candidates
WHEN NEW.status != 'needs_review'
BEGIN SELECT RAISE(ABORT, 'journal memory candidates must start in needs_review'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_safe_insert BEFORE INSERT ON journal_writeback_requests
WHEN lower(NEW.target_ref) LIKE '%file://%' OR lower(NEW.target_ref) LIKE '%secret://%' OR lower(NEW.target_ref) LIKE '%vault:%' OR instr(NEW.target_ref, '..') > 0 OR lower(NEW.target_ref) LIKE '%token=%' OR lower(NEW.reason) LIKE '%secret://%' OR lower(NEW.reason) LIKE '%token=%'
BEGIN SELECT RAISE(ABORT, 'journal writeback request must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_pending_insert BEFORE INSERT ON journal_writeback_requests
WHEN NEW.status != 'pending_review'
BEGIN SELECT RAISE(ABORT, 'journal writeback requests must start in pending_review'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_candidate_scope_insert BEFORE INSERT ON journal_writeback_requests
WHEN NOT EXISTS (
  SELECT 1
  FROM journal_memory_candidates candidate
  WHERE candidate.workspace_id = NEW.workspace_id
    AND candidate.vault_id = NEW.vault_id
    AND candidate.id = NEW.candidate_id
)
BEGIN SELECT RAISE(ABORT, 'journal writeback candidate vault scope mismatch'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_target_root_insert BEFORE INSERT ON journal_writeback_requests
WHEN ((substr(NEW.target_ref, 1, 12) = 'workspace://' AND length(NEW.target_ref) > 12)
    OR (substr(NEW.target_ref, 1, 11) = 'artifact://' AND length(NEW.target_ref) > 11)
    OR (substr(NEW.target_ref, 1, 9) = 'memory://' AND length(NEW.target_ref) > 9)
    OR (substr(NEW.target_ref, 1, 10) = 'journal://' AND length(NEW.target_ref) > 10))
  AND NOT EXISTS (
    SELECT 1
    FROM vault_bridges vault
    WHERE vault.workspace_id = NEW.workspace_id
      AND vault.id = NEW.vault_id
      AND (NEW.target_ref = vault.root_ref OR substr(NEW.target_ref, 1, length(vault.root_ref) + 1) = vault.root_ref || '/')
  )
BEGIN SELECT RAISE(ABORT, 'journal writeback target must stay inside vault root'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_requests_safe_update BEFORE UPDATE ON journal_writeback_requests
WHEN NEW.workspace_id != OLD.workspace_id
  OR NEW.id != OLD.id
  OR NEW.vault_id != OLD.vault_id
  OR NEW.candidate_id != OLD.candidate_id
  OR NEW.target_ref != OLD.target_ref
  OR NEW.diff_hash != OLD.diff_hash
  OR NEW.reason != OLD.reason
  OR NEW.requested_by != OLD.requested_by
  OR NEW.requested_at != OLD.requested_at
  OR NEW.expected_target_revision != OLD.expected_target_revision
  OR NEW.version != OLD.version + 1
  OR lower(NEW.target_ref) LIKE '%file://%'
  OR lower(NEW.target_ref) LIKE '%secret://%'
  OR lower(NEW.target_ref) LIKE '%vault:%'
  OR instr(NEW.target_ref, '..') > 0
  OR lower(NEW.target_ref) LIKE '%token=%'
  OR lower(NEW.reason) LIKE '%secret://%'
  OR lower(NEW.reason) LIKE '%token=%'
  OR OLD.status != 'pending_review'
  OR NEW.status NOT IN ('approved', 'rejected')
  OR (NEW.status = 'approved' AND NOT EXISTS (
    SELECT 1 FROM journal_writeback_decisions decision
    WHERE decision.workspace_id = NEW.workspace_id
      AND decision.request_id = NEW.id
      AND decision.decision = 'approve'
  ))
  OR (NEW.status = 'rejected' AND NOT EXISTS (
    SELECT 1 FROM journal_writeback_decisions decision
    WHERE decision.workspace_id = NEW.workspace_id
      AND decision.request_id = NEW.id
      AND decision.decision = 'reject'
  ))
BEGIN SELECT RAISE(ABORT, 'journal writeback request updates require matching approval facts and immutable scope'); END;

CREATE TRIGGER IF NOT EXISTS c22_writeback_decisions_safe_insert BEFORE INSERT ON journal_writeback_decisions
WHEN lower(NEW.reason) LIKE '%file://%' OR lower(NEW.reason) LIKE '%secret://%' OR lower(NEW.reason) LIKE '%vault:%' OR lower(NEW.reason) LIKE '%token=%'
BEGIN SELECT RAISE(ABORT, 'journal writeback decision must not include secret or path-shaped content'); END;

CREATE TRIGGER IF NOT EXISTS vault_bridges_no_update BEFORE UPDATE ON vault_bridges BEGIN SELECT RAISE(ABORT, 'vault bridge facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS vault_bridges_no_delete BEFORE DELETE ON vault_bridges BEGIN SELECT RAISE(ABORT, 'vault bridge facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_entries_no_update BEFORE UPDATE ON journal_entries BEGIN SELECT RAISE(ABORT, 'journal entry facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_entries_no_delete BEFORE DELETE ON journal_entries BEGIN SELECT RAISE(ABORT, 'journal entry facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_sources_no_update BEFORE UPDATE ON journal_sources BEGIN SELECT RAISE(ABORT, 'journal source facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_sources_no_delete BEFORE DELETE ON journal_sources BEGIN SELECT RAISE(ABORT, 'journal source facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_graph_indexes_no_update BEFORE UPDATE ON journal_graph_indexes BEGIN SELECT RAISE(ABORT, 'journal graph index facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_graph_indexes_no_delete BEFORE DELETE ON journal_graph_indexes BEGIN SELECT RAISE(ABORT, 'journal graph index facts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_memory_candidates_no_update BEFORE UPDATE ON journal_memory_candidates BEGIN SELECT RAISE(ABORT, 'journal memory candidates are append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_memory_candidates_no_delete BEFORE DELETE ON journal_memory_candidates BEGIN SELECT RAISE(ABORT, 'journal memory candidates are append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_writeback_requests_terminal_no_update BEFORE UPDATE ON journal_writeback_requests WHEN OLD.status IN ('approved', 'rejected', 'cancelled') BEGIN SELECT RAISE(ABORT, 'journal writeback terminal requests are append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_writeback_requests_no_delete BEFORE DELETE ON journal_writeback_requests BEGIN SELECT RAISE(ABORT, 'journal writeback requests are append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_writeback_decisions_no_update BEFORE UPDATE ON journal_writeback_decisions BEGIN SELECT RAISE(ABORT, 'journal writeback decisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS journal_writeback_decisions_no_delete BEFORE DELETE ON journal_writeback_decisions BEGIN SELECT RAISE(ABORT, 'journal writeback decisions are append-only'); END;
