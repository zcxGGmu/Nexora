CREATE TABLE IF NOT EXISTS media_artifacts (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('video', 'audio', 'image', 'document')),
  title TEXT NOT NULL,
  preview_ref TEXT,
  source_refs_json TEXT NOT NULL CHECK (json_valid(source_refs_json)),
  prompt_ref TEXT NOT NULL,
  model_ref TEXT,
  provider_ref TEXT CHECK (provider_ref IS NULL),
  codec TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  caption_ref TEXT,
  thumbnail_ref TEXT,
  render_version INTEGER NOT NULL CHECK (render_version > 0),
  moderation_status TEXT NOT NULL CHECK (moderation_status IN ('needs_review', 'approved', 'rejected')),
  share_policy TEXT NOT NULL CHECK (share_policy IN ('review_required', 'disabled')),
  temporary_url_expires_at TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media_render_jobs (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  media_artifact_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  worker_descriptor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  input_hash TEXT NOT NULL,
  output_artifact_ref TEXT,
  retry_of_job_id TEXT,
  side_effect_policy TEXT NOT NULL CHECK (side_effect_policy = 'none'),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, media_artifact_id) REFERENCES media_artifacts(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_policy TEXT NOT NULL CHECK (source_policy = 'snapshot_only'),
  generation_policy TEXT NOT NULL CHECK (generation_policy = 'local_descriptor_only'),
  share_policy TEXT NOT NULL CHECK (share_policy IN ('review_required', 'disabled')),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notebook_sources (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  notebook_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('artifact_snapshot', 'manual_snapshot')),
  source_ref TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  snapshot_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, notebook_id) REFERENCES notebooks(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notebook_generations (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  notebook_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_ids_json TEXT NOT NULL CHECK (json_valid(source_ids_json)),
  generation_kind TEXT NOT NULL CHECK (generation_kind IN ('brief', 'summary', 'outline')),
  prompt_ref TEXT NOT NULL,
  output_ref TEXT NOT NULL,
  citation_refs_json TEXT NOT NULL CHECK (json_valid(citation_refs_json)),
  status TEXT NOT NULL CHECK (status IN ('draft', 'needs_review', 'approved', 'rejected')),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, notebook_id) REFERENCES notebooks(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS avatar_profiles (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  consent_status TEXT NOT NULL CHECK (consent_status IN ('pending', 'approved', 'revoked')),
  consent_artifact_ref TEXT NOT NULL,
  face_source_hash TEXT NOT NULL,
  voice_source_hash TEXT NOT NULL,
  voice_clone_mode TEXT NOT NULL CHECK (voice_clone_mode = 'disabled'),
  render_mode TEXT NOT NULL CHECK (render_mode = 'descriptor_only'),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK ((consent_status = 'revoked' AND revoked_at IS NOT NULL) OR (consent_status != 'revoked' AND revoked_at IS NULL)),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS studio_shares (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  media_artifact_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'approved', 'denied', 'expired')),
  preview_ref TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, media_artifact_id) REFERENCES media_artifacts(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS studio_commands (
  command_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('preview', 'share', 'rerender', 'notebook_generate', 'revoke_avatar')),
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('media_artifact', 'notebook', 'avatar_profile')),
  idempotency_key TEXT NOT NULL,
  expected_revision INTEGER NOT NULL CHECK (expected_revision > 0),
  reason TEXT NOT NULL,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, command_id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_c25_media_artifacts_workspace ON media_artifacts(workspace_id, updated_at DESC, id ASC);
CREATE INDEX IF NOT EXISTS idx_c25_render_jobs_media ON media_render_jobs(workspace_id, media_artifact_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_c25_notebook_sources_notebook ON notebook_sources(workspace_id, notebook_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_c25_notebook_generations_notebook ON notebook_generations(workspace_id, notebook_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_c25_studio_shares_media ON studio_shares(workspace_id, media_artifact_id, created_at ASC);

CREATE TRIGGER IF NOT EXISTS c25_media_artifacts_payload_json_insert
BEFORE INSERT ON media_artifacts
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.media_type') IS NOT NEW.media_type
  OR json_extract(NEW.payload_json, '$.title') IS NOT NEW.title
  OR json_extract(NEW.payload_json, '$.preview_ref') IS NOT NEW.preview_ref
  OR json_extract(NEW.payload_json, '$.source_refs') IS NOT json(NEW.source_refs_json)
  OR json_extract(NEW.payload_json, '$.prompt_ref') IS NOT NEW.prompt_ref
  OR json_extract(NEW.payload_json, '$.model_ref') IS NOT NEW.model_ref
  OR json_extract(NEW.payload_json, '$.provider_ref') IS NOT NEW.provider_ref
  OR json_extract(NEW.payload_json, '$.codec') IS NOT NEW.codec
  OR json_extract(NEW.payload_json, '$.duration_ms') IS NOT NEW.duration_ms
  OR json_extract(NEW.payload_json, '$.caption_ref') IS NOT NEW.caption_ref
  OR json_extract(NEW.payload_json, '$.thumbnail_ref') IS NOT NEW.thumbnail_ref
  OR json_extract(NEW.payload_json, '$.render_version') IS NOT NEW.render_version
  OR json_extract(NEW.payload_json, '$.moderation_status') IS NOT NEW.moderation_status
  OR json_extract(NEW.payload_json, '$.share_policy') IS NOT NEW.share_policy
  OR json_extract(NEW.payload_json, '$.temporary_url_expires_at') IS NOT NEW.temporary_url_expires_at
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'media artifact payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_render_jobs_payload_json_insert
BEFORE INSERT ON media_render_jobs
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.media_artifact_id') IS NOT NEW.media_artifact_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.worker_descriptor_id') IS NOT NEW.worker_descriptor_id
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.input_hash') IS NOT NEW.input_hash
  OR json_extract(NEW.payload_json, '$.output_artifact_ref') IS NOT NEW.output_artifact_ref
  OR json_extract(NEW.payload_json, '$.retry_of_job_id') IS NOT NEW.retry_of_job_id
  OR json_extract(NEW.payload_json, '$.side_effect_policy') IS NOT NEW.side_effect_policy
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'render job payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_notebooks_payload_json_insert
BEFORE INSERT ON notebooks
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.source_policy') IS NOT NEW.source_policy
  OR json_extract(NEW.payload_json, '$.generation_policy') IS NOT NEW.generation_policy
  OR json_extract(NEW.payload_json, '$.share_policy') IS NOT NEW.share_policy
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'notebook payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_notebook_sources_payload_json_insert
BEFORE INSERT ON notebook_sources
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.notebook_id') IS NOT NEW.notebook_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.source_kind') IS NOT NEW.source_kind
  OR json_extract(NEW.payload_json, '$.source_ref') IS NOT NEW.source_ref
  OR json_extract(NEW.payload_json, '$.source_hash') IS NOT NEW.source_hash
  OR json_extract(NEW.payload_json, '$.snapshot_ref') IS NOT NEW.snapshot_ref
  OR json_extract(NEW.payload_json, '$.title') IS NOT NEW.title
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'notebook source payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_notebook_generations_payload_json_insert
BEFORE INSERT ON notebook_generations
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.notebook_id') IS NOT NEW.notebook_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.source_ids') IS NOT json(NEW.source_ids_json)
  OR json_extract(NEW.payload_json, '$.generation_kind') IS NOT NEW.generation_kind
  OR json_extract(NEW.payload_json, '$.prompt_ref') IS NOT NEW.prompt_ref
  OR json_extract(NEW.payload_json, '$.output_ref') IS NOT NEW.output_ref
  OR json_extract(NEW.payload_json, '$.citation_refs') IS NOT json(NEW.citation_refs_json)
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'notebook generation payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_avatar_profiles_payload_json_insert
BEFORE INSERT ON avatar_profiles
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.display_name') IS NOT NEW.display_name
  OR json_extract(NEW.payload_json, '$.consent_status') IS NOT NEW.consent_status
  OR json_extract(NEW.payload_json, '$.consent_artifact_ref') IS NOT NEW.consent_artifact_ref
  OR json_extract(NEW.payload_json, '$.face_source_hash') IS NOT NEW.face_source_hash
  OR json_extract(NEW.payload_json, '$.voice_source_hash') IS NOT NEW.voice_source_hash
  OR json_extract(NEW.payload_json, '$.voice_clone_mode') IS NOT NEW.voice_clone_mode
  OR json_extract(NEW.payload_json, '$.render_mode') IS NOT NEW.render_mode
  OR json_extract(NEW.payload_json, '$.expires_at') IS NOT NEW.expires_at
  OR json_extract(NEW.payload_json, '$.revoked_at') IS NOT NEW.revoked_at
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'avatar profile payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_studio_shares_payload_json_insert
BEFORE INSERT ON studio_shares
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.media_artifact_id') IS NOT NEW.media_artifact_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.preview_ref') IS NOT NEW.preview_ref
  OR json_extract(NEW.payload_json, '$.expires_at') IS NOT NEW.expires_at
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'studio share payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_studio_commands_payload_json_insert
BEFORE INSERT ON studio_commands
WHEN json_extract(NEW.payload_json, '$.command_id') IS NOT NEW.command_id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.kind') IS NOT NEW.kind
  OR json_extract(NEW.payload_json, '$.target_id') IS NOT NEW.target_id
  OR json_extract(NEW.payload_json, '$.target_type') IS NOT NEW.target_type
  OR json_extract(NEW.payload_json, '$.idempotency_key') IS NOT NEW.idempotency_key
  OR json_extract(NEW.payload_json, '$.expected_revision') IS NOT NEW.expected_revision
  OR json_extract(NEW.payload_json, '$.reason') IS NOT NEW.reason
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
BEGIN SELECT RAISE(ABORT, 'studio command payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_notebook_generations_source_scope_insert
BEFORE INSERT ON notebook_generations
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.source_ids_json) source_id
  WHERE NOT EXISTS (
    SELECT 1 FROM notebook_sources source
    WHERE source.workspace_id = NEW.workspace_id
      AND source.notebook_id = NEW.notebook_id
      AND source.run_id = NEW.run_id
      AND source.id = source_id.value
  )
)
BEGIN SELECT RAISE(ABORT, 'notebook generation source scope failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_render_jobs_media_run_scope_insert
BEFORE INSERT ON media_render_jobs
WHEN NOT EXISTS (
  SELECT 1 FROM media_artifacts artifact
  WHERE artifact.workspace_id = NEW.workspace_id
    AND artifact.id = NEW.media_artifact_id
    AND artifact.run_id = NEW.run_id
)
BEGIN SELECT RAISE(ABORT, 'render job media run scope failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_notebook_sources_notebook_run_scope_insert
BEFORE INSERT ON notebook_sources
WHEN NOT EXISTS (
  SELECT 1 FROM notebooks notebook
  WHERE notebook.workspace_id = NEW.workspace_id
    AND notebook.id = NEW.notebook_id
    AND notebook.run_id = NEW.run_id
)
BEGIN SELECT RAISE(ABORT, 'notebook source run scope failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_notebook_generations_notebook_run_scope_insert
BEFORE INSERT ON notebook_generations
WHEN NOT EXISTS (
  SELECT 1 FROM notebooks notebook
  WHERE notebook.workspace_id = NEW.workspace_id
    AND notebook.id = NEW.notebook_id
    AND notebook.run_id = NEW.run_id
)
BEGIN SELECT RAISE(ABORT, 'notebook generation run scope failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_studio_shares_media_run_scope_insert
BEFORE INSERT ON studio_shares
WHEN NOT EXISTS (
  SELECT 1 FROM media_artifacts artifact
  WHERE artifact.workspace_id = NEW.workspace_id
    AND artifact.id = NEW.media_artifact_id
    AND artifact.run_id = NEW.run_id
)
BEGIN SELECT RAISE(ABORT, 'studio share media run scope failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_studio_commands_kind_shape_insert
BEFORE INSERT ON studio_commands
WHEN (NEW.kind IN ('preview', 'share', 'rerender') AND NEW.target_type != 'media_artifact')
  OR (NEW.kind = 'notebook_generate' AND NEW.target_type != 'notebook')
  OR (NEW.kind = 'revoke_avatar' AND NEW.target_type != 'avatar_profile')
BEGIN SELECT RAISE(ABORT, 'studio command target kind mismatch'); END;

CREATE TRIGGER IF NOT EXISTS c25_studio_commands_target_scope_insert
BEFORE INSERT ON studio_commands
WHEN (NEW.target_type = 'media_artifact' AND NOT EXISTS (
    SELECT 1 FROM media_artifacts artifact
    WHERE artifact.workspace_id = NEW.workspace_id
      AND artifact.id = NEW.target_id
      AND artifact.run_id = NEW.run_id
      AND artifact.version = NEW.expected_revision
  ))
  OR (NEW.target_type = 'notebook' AND NOT EXISTS (
    SELECT 1 FROM notebooks notebook
    WHERE notebook.workspace_id = NEW.workspace_id
      AND notebook.id = NEW.target_id
      AND notebook.run_id = NEW.run_id
      AND notebook.version = NEW.expected_revision
  ))
  OR (NEW.target_type = 'avatar_profile' AND NOT EXISTS (
    SELECT 1 FROM avatar_profiles avatar
    WHERE avatar.workspace_id = NEW.workspace_id
      AND avatar.id = NEW.target_id
      AND avatar.run_id = NEW.run_id
      AND avatar.version = NEW.expected_revision
  ))
BEGIN SELECT RAISE(ABORT, 'studio command target scope failed'); END;

CREATE TRIGGER IF NOT EXISTS c25_media_artifacts_ref_safe_insert
BEFORE INSERT ON media_artifacts
WHEN (NEW.preview_ref IS NOT NULL AND NOT (NEW.preview_ref GLOB 'artifact://*' OR NEW.preview_ref GLOB 'workspace://*' OR NEW.preview_ref GLOB 'memory://*' OR NEW.preview_ref GLOB 'journal://*' OR NEW.preview_ref GLOB 'skill://*'))
  OR NOT (NEW.prompt_ref GLOB 'artifact://*' OR NEW.prompt_ref GLOB 'workspace://*' OR NEW.prompt_ref GLOB 'memory://*' OR NEW.prompt_ref GLOB 'journal://*' OR NEW.prompt_ref GLOB 'skill://*')
  OR (NEW.caption_ref IS NOT NULL AND NOT (NEW.caption_ref GLOB 'artifact://*' OR NEW.caption_ref GLOB 'workspace://*' OR NEW.caption_ref GLOB 'memory://*' OR NEW.caption_ref GLOB 'journal://*' OR NEW.caption_ref GLOB 'skill://*'))
  OR (NEW.thumbnail_ref IS NOT NULL AND NOT (NEW.thumbnail_ref GLOB 'artifact://*' OR NEW.thumbnail_ref GLOB 'workspace://*' OR NEW.thumbnail_ref GLOB 'memory://*' OR NEW.thumbnail_ref GLOB 'journal://*' OR NEW.thumbnail_ref GLOB 'skill://*'))
  OR (NEW.model_ref IS NOT NULL AND NOT (NEW.model_ref GLOB 'artifact://*' OR NEW.model_ref GLOB 'workspace://*' OR NEW.model_ref GLOB 'memory://*' OR NEW.model_ref GLOB 'journal://*' OR NEW.model_ref GLOB 'skill://*'))
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%file://%'
  OR lower(NEW.payload_json) LIKE '%http://%'
  OR lower(NEW.payload_json) LIKE '%https://%'
  OR lower(NEW.payload_json) LIKE '%token=%'
BEGIN SELECT RAISE(ABORT, 'media artifact refs rejected'); END;

CREATE TRIGGER IF NOT EXISTS c25_notebook_sources_ref_safe_insert
BEFORE INSERT ON notebook_sources
WHEN NOT (NEW.source_ref GLOB 'artifact://*' OR NEW.source_ref GLOB 'workspace://*' OR NEW.source_ref GLOB 'memory://*' OR NEW.source_ref GLOB 'journal://*' OR NEW.source_ref GLOB 'skill://*')
  OR NOT (NEW.snapshot_ref GLOB 'artifact://*' OR NEW.snapshot_ref GLOB 'workspace://*' OR NEW.snapshot_ref GLOB 'memory://*' OR NEW.snapshot_ref GLOB 'journal://*' OR NEW.snapshot_ref GLOB 'skill://*')
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%file://%'
  OR lower(NEW.payload_json) LIKE '%http://%'
  OR lower(NEW.payload_json) LIKE '%https://%'
  OR lower(NEW.payload_json) LIKE '%token=%'
BEGIN SELECT RAISE(ABORT, 'notebook source refs rejected'); END;

CREATE TRIGGER IF NOT EXISTS c25_avatar_profiles_ref_safe_insert
BEFORE INSERT ON avatar_profiles
WHEN NOT (NEW.consent_artifact_ref GLOB 'artifact://*' OR NEW.consent_artifact_ref GLOB 'workspace://*' OR NEW.consent_artifact_ref GLOB 'memory://*' OR NEW.consent_artifact_ref GLOB 'journal://*' OR NEW.consent_artifact_ref GLOB 'skill://*')
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%file://%'
  OR lower(NEW.payload_json) LIKE '%http://%'
  OR lower(NEW.payload_json) LIKE '%https://%'
  OR lower(NEW.payload_json) LIKE '%token=%'
BEGIN SELECT RAISE(ABORT, 'avatar profile refs rejected'); END;

CREATE TRIGGER IF NOT EXISTS c25_media_artifacts_ref_text_safe_insert
BEFORE INSERT ON media_artifacts
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (
      SELECT NEW.preview_ref AS ref WHERE NEW.preview_ref IS NOT NULL
      UNION ALL SELECT NEW.prompt_ref
      UNION ALL SELECT NEW.model_ref WHERE NEW.model_ref IS NOT NULL
      UNION ALL SELECT NEW.caption_ref WHERE NEW.caption_ref IS NOT NULL
      UNION ALL SELECT NEW.thumbnail_ref WHERE NEW.thumbnail_ref IS NOT NULL
      UNION ALL SELECT value FROM json_each(NEW.source_refs_json)
    ) refs
    WHERE typeof(ref) != 'text'
      OR NOT (ref GLOB 'artifact://?*' OR ref GLOB 'workspace://?*' OR ref GLOB 'memory://?*' OR ref GLOB 'journal://?*' OR ref GLOB 'skill://?*')
      OR instr(ref, '%') > 0 OR instr(ref, char(92)) > 0 OR instr(ref, ' ') > 0 OR instr(ref, char(9)) > 0 OR instr(ref, char(10)) > 0 OR instr(ref, char(13)) > 0
      OR instr(ref, char(173)) > 0 OR instr(ref, char(847)) > 0 OR instr(ref, char(1564)) > 0 OR instr(ref, char(6158)) > 0 OR instr(ref, char(8203)) > 0 OR instr(ref, char(8204)) > 0 OR instr(ref, char(8205)) > 0 OR instr(ref, char(8206)) > 0 OR instr(ref, char(8207)) > 0 OR instr(ref, char(8288)) > 0 OR instr(ref, char(8289)) > 0 OR instr(ref, char(8290)) > 0 OR instr(ref, char(8291)) > 0 OR instr(ref, char(8292)) > 0 OR instr(ref, char(65039)) > 0 OR instr(ref, char(917601)) > 0
      OR instr(substr(ref, instr(ref, '://') + 3), '://') > 0
      OR instr(substr(ref, instr(ref, '://') + 3), '//') > 0
      OR substr(ref, instr(ref, '://') + 3) GLOB '/*'
      OR substr(ref, instr(ref, '://') + 3) GLOB '*[^A-Za-z0-9._~/#-]*'
      OR substr(ref, instr(ref, '://') + 3) IN ('.', '..')
      OR substr(ref, instr(ref, '://') + 3) GLOB './*'
      OR substr(ref, instr(ref, '://') + 3) GLOB '../*'
      OR substr(ref, instr(ref, '://') + 3) GLOB '*/./*'
      OR substr(ref, instr(ref, '://') + 3) GLOB '*/../*'
      OR substr(ref, instr(ref, '://') + 3) GLOB '*/.'
      OR substr(ref, instr(ref, '://') + 3) GLOB '*/..'
  ) THEN RAISE(ABORT, 'media artifact refs normalized rejected') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.source_refs_json, '') || ' ' || COALESCE(NEW.prompt_ref, '') || ' ' || COALESCE(NEW.model_ref, '') || ' ' || COALESCE(NEW.caption_ref, '') || ' ' || COALESCE(NEW.thumbnail_ref, '') || ' ' || COALESCE(NEW.preview_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0
      OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0
      OR instr(combined, 'bearer ') > 0 OR instr(combined, 'api_key') > 0 OR instr(combined, 'api-key') > 0 OR instr(combined, 'access_token') > 0 OR instr(combined, 'access-token') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'private_key') > 0 OR instr(combined, 'private-key') > 0 OR instr(combined, 'client_secret') > 0 OR instr(combined, 'client-secret') > 0
      OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0
      OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0
      OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0
      OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'media artifact normalized text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c25_render_jobs_ref_text_safe_insert
BEFORE INSERT ON media_render_jobs
BEGIN
  SELECT CASE WHEN NEW.output_artifact_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM (SELECT NEW.output_artifact_ref AS ref)
    WHERE NOT (ref GLOB 'artifact://?*' OR ref GLOB 'workspace://?*' OR ref GLOB 'memory://?*' OR ref GLOB 'journal://?*' OR ref GLOB 'skill://?*')
      OR instr(ref, '%') > 0 OR instr(ref, char(92)) > 0 OR instr(ref, ' ') > 0 OR instr(substr(ref, instr(ref, '://') + 3), '://') > 0 OR instr(substr(ref, instr(ref, '://') + 3), '//') > 0 OR substr(ref, instr(ref, '://') + 3) GLOB '/*' OR substr(ref, instr(ref, '://') + 3) GLOB '*[^A-Za-z0-9._~/#-]*' OR substr(ref, instr(ref, '://') + 3) IN ('.', '..') OR substr(ref, instr(ref, '://') + 3) GLOB './*' OR substr(ref, instr(ref, '://') + 3) GLOB '../*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/./*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/../*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/.' OR substr(ref, instr(ref, '://') + 3) GLOB '*/..'
  ) THEN RAISE(ABORT, 'render job refs normalized rejected') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.worker_descriptor_id, '') || ' ' || COALESCE(NEW.output_artifact_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*' OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'api_key') > 0 OR instr(combined, 'api-key') > 0 OR instr(combined, 'access_token') > 0 OR instr(combined, 'access-token') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'private_key') > 0 OR instr(combined, 'private-key') > 0 OR instr(combined, 'client_secret') > 0 OR instr(combined, 'client-secret') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'render job normalized text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c25_notebooks_ref_text_safe_insert
BEFORE INSERT ON notebooks
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*' OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'api_key') > 0 OR instr(combined, 'api-key') > 0 OR instr(combined, 'access_token') > 0 OR instr(combined, 'access-token') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'private_key') > 0 OR instr(combined, 'private-key') > 0 OR instr(combined, 'client_secret') > 0 OR instr(combined, 'client-secret') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'notebook normalized text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c25_notebook_sources_ref_text_safe_insert
BEFORE INSERT ON notebook_sources
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT NEW.source_ref AS ref UNION ALL SELECT NEW.snapshot_ref) refs
    WHERE NOT (ref GLOB 'artifact://?*' OR ref GLOB 'workspace://?*' OR ref GLOB 'memory://?*' OR ref GLOB 'journal://?*' OR ref GLOB 'skill://?*')
      OR instr(ref, '%') > 0 OR instr(ref, char(92)) > 0 OR instr(ref, ' ') > 0 OR instr(substr(ref, instr(ref, '://') + 3), '://') > 0 OR instr(substr(ref, instr(ref, '://') + 3), '//') > 0 OR substr(ref, instr(ref, '://') + 3) GLOB '/*' OR substr(ref, instr(ref, '://') + 3) GLOB '*[^A-Za-z0-9._~/#-]*' OR substr(ref, instr(ref, '://') + 3) IN ('.', '..') OR substr(ref, instr(ref, '://') + 3) GLOB './*' OR substr(ref, instr(ref, '://') + 3) GLOB '../*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/./*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/../*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/.' OR substr(ref, instr(ref, '://') + 3) GLOB '*/..'
  ) THEN RAISE(ABORT, 'notebook source refs normalized rejected') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.source_ref, '') || ' ' || COALESCE(NEW.snapshot_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*' OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'api_key') > 0 OR instr(combined, 'api-key') > 0 OR instr(combined, 'access_token') > 0 OR instr(combined, 'access-token') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'private_key') > 0 OR instr(combined, 'private-key') > 0 OR instr(combined, 'client_secret') > 0 OR instr(combined, 'client-secret') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'notebook source normalized text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c25_notebook_generations_ref_text_safe_insert
BEFORE INSERT ON notebook_generations
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT NEW.prompt_ref AS ref UNION ALL SELECT NEW.output_ref UNION ALL SELECT value FROM json_each(NEW.citation_refs_json)) refs
    WHERE typeof(ref) != 'text'
      OR NOT (ref GLOB 'artifact://?*' OR ref GLOB 'workspace://?*' OR ref GLOB 'memory://?*' OR ref GLOB 'journal://?*' OR ref GLOB 'skill://?*')
      OR instr(ref, '%') > 0 OR instr(ref, char(92)) > 0 OR instr(ref, ' ') > 0 OR instr(substr(ref, instr(ref, '://') + 3), '://') > 0 OR instr(substr(ref, instr(ref, '://') + 3), '//') > 0 OR substr(ref, instr(ref, '://') + 3) GLOB '/*' OR substr(ref, instr(ref, '://') + 3) GLOB '*[^A-Za-z0-9._~/#-]*' OR substr(ref, instr(ref, '://') + 3) IN ('.', '..') OR substr(ref, instr(ref, '://') + 3) GLOB './*' OR substr(ref, instr(ref, '://') + 3) GLOB '../*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/./*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/../*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/.' OR substr(ref, instr(ref, '://') + 3) GLOB '*/..'
  ) THEN RAISE(ABORT, 'notebook generation refs normalized rejected') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.prompt_ref, '') || ' ' || COALESCE(NEW.output_ref, '') || ' ' || COALESCE(NEW.citation_refs_json, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*' OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'api_key') > 0 OR instr(combined, 'api-key') > 0 OR instr(combined, 'access_token') > 0 OR instr(combined, 'access-token') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'private_key') > 0 OR instr(combined, 'private-key') > 0 OR instr(combined, 'client_secret') > 0 OR instr(combined, 'client-secret') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'notebook generation normalized text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c25_avatar_profiles_ref_text_safe_insert
BEFORE INSERT ON avatar_profiles
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT NEW.consent_artifact_ref AS ref)
    WHERE NOT (ref GLOB 'artifact://?*' OR ref GLOB 'workspace://?*' OR ref GLOB 'memory://?*' OR ref GLOB 'journal://?*' OR ref GLOB 'skill://?*')
      OR instr(ref, '%') > 0 OR instr(ref, char(92)) > 0 OR instr(ref, ' ') > 0 OR instr(ref, char(8203)) > 0 OR instr(substr(ref, instr(ref, '://') + 3), '://') > 0 OR instr(substr(ref, instr(ref, '://') + 3), '//') > 0 OR substr(ref, instr(ref, '://') + 3) GLOB '/*' OR substr(ref, instr(ref, '://') + 3) GLOB '*[^A-Za-z0-9._~/#-]*' OR substr(ref, instr(ref, '://') + 3) IN ('.', '..') OR substr(ref, instr(ref, '://') + 3) GLOB './*' OR substr(ref, instr(ref, '://') + 3) GLOB '../*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/./*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/../*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/.' OR substr(ref, instr(ref, '://') + 3) GLOB '*/..'
  ) THEN RAISE(ABORT, 'avatar profile refs normalized rejected') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.display_name, '') || ' ' || COALESCE(NEW.consent_artifact_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*' OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'api_key') > 0 OR instr(combined, 'api-key') > 0 OR instr(combined, 'access_token') > 0 OR instr(combined, 'access-token') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'private_key') > 0 OR instr(combined, 'private-key') > 0 OR instr(combined, 'client_secret') > 0 OR instr(combined, 'client-secret') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'avatar profile normalized text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c25_studio_shares_ref_text_safe_insert
BEFORE INSERT ON studio_shares
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT NEW.preview_ref AS ref)
    WHERE NOT (ref GLOB 'artifact://?*' OR ref GLOB 'workspace://?*' OR ref GLOB 'memory://?*' OR ref GLOB 'journal://?*' OR ref GLOB 'skill://?*')
      OR instr(ref, '%') > 0 OR instr(ref, char(92)) > 0 OR instr(ref, ' ') > 0 OR instr(substr(ref, instr(ref, '://') + 3), '://') > 0 OR instr(substr(ref, instr(ref, '://') + 3), '//') > 0 OR substr(ref, instr(ref, '://') + 3) GLOB '/*' OR substr(ref, instr(ref, '://') + 3) GLOB '*[^A-Za-z0-9._~/#-]*' OR substr(ref, instr(ref, '://') + 3) IN ('.', '..') OR substr(ref, instr(ref, '://') + 3) GLOB './*' OR substr(ref, instr(ref, '://') + 3) GLOB '../*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/./*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/../*' OR substr(ref, instr(ref, '://') + 3) GLOB '*/.' OR substr(ref, instr(ref, '://') + 3) GLOB '*/..'
  ) THEN RAISE(ABORT, 'studio share refs normalized rejected') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.preview_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*' OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'api_key') > 0 OR instr(combined, 'api-key') > 0 OR instr(combined, 'access_token') > 0 OR instr(combined, 'access-token') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'private_key') > 0 OR instr(combined, 'private-key') > 0 OR instr(combined, 'client_secret') > 0 OR instr(combined, 'client-secret') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'studio share normalized text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c25_studio_commands_ref_text_safe_insert
BEFORE INSERT ON studio_commands
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.target_id, '') || ' ' || COALESCE(NEW.idempotency_key, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*' OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0 OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0 OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0 OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0 OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0 OR instr(combined, 'bearer ') > 0 OR instr(combined, 'api_key') > 0 OR instr(combined, 'api-key') > 0 OR instr(combined, 'access_token') > 0 OR instr(combined, 'access-token') > 0 OR instr(combined, 'authorization=') > 0 OR instr(combined, 'private_key') > 0 OR instr(combined, 'private-key') > 0 OR instr(combined, 'client_secret') > 0 OR instr(combined, 'client-secret') > 0 OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0 OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0 OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0 OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
  ) THEN RAISE(ABORT, 'studio command normalized text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c25_media_artifacts_no_update BEFORE UPDATE ON media_artifacts BEGIN SELECT RAISE(ABORT, 'media artifacts are immutable descriptors'); END;
CREATE TRIGGER IF NOT EXISTS c25_media_artifacts_no_delete BEFORE DELETE ON media_artifacts BEGIN SELECT RAISE(ABORT, 'media artifacts are immutable descriptors'); END;
CREATE TRIGGER IF NOT EXISTS c25_render_jobs_no_update BEFORE UPDATE ON media_render_jobs BEGIN SELECT RAISE(ABORT, 'render jobs are append-only command facts'); END;
CREATE TRIGGER IF NOT EXISTS c25_render_jobs_no_delete BEFORE DELETE ON media_render_jobs BEGIN SELECT RAISE(ABORT, 'render jobs are append-only command facts'); END;
CREATE TRIGGER IF NOT EXISTS c25_notebooks_no_update BEFORE UPDATE ON notebooks BEGIN SELECT RAISE(ABORT, 'notebooks are immutable descriptors'); END;
CREATE TRIGGER IF NOT EXISTS c25_notebooks_no_delete BEFORE DELETE ON notebooks BEGIN SELECT RAISE(ABORT, 'notebooks are immutable descriptors'); END;
CREATE TRIGGER IF NOT EXISTS c25_notebook_sources_no_update BEFORE UPDATE ON notebook_sources BEGIN SELECT RAISE(ABORT, 'notebook sources are append-only facts'); END;
CREATE TRIGGER IF NOT EXISTS c25_notebook_sources_no_delete BEFORE DELETE ON notebook_sources BEGIN SELECT RAISE(ABORT, 'notebook sources are append-only facts'); END;
CREATE TRIGGER IF NOT EXISTS c25_notebook_generations_no_update BEFORE UPDATE ON notebook_generations BEGIN SELECT RAISE(ABORT, 'notebook generations are append-only facts'); END;
CREATE TRIGGER IF NOT EXISTS c25_notebook_generations_no_delete BEFORE DELETE ON notebook_generations BEGIN SELECT RAISE(ABORT, 'notebook generations are append-only facts'); END;
CREATE TRIGGER IF NOT EXISTS c25_avatar_profiles_no_update BEFORE UPDATE ON avatar_profiles BEGIN SELECT RAISE(ABORT, 'avatar profiles are immutable descriptors'); END;
CREATE TRIGGER IF NOT EXISTS c25_avatar_profiles_no_delete BEFORE DELETE ON avatar_profiles BEGIN SELECT RAISE(ABORT, 'avatar profiles are immutable descriptors'); END;
CREATE TRIGGER IF NOT EXISTS c25_studio_shares_no_update BEFORE UPDATE ON studio_shares BEGIN SELECT RAISE(ABORT, 'studio shares are append-only facts'); END;
CREATE TRIGGER IF NOT EXISTS c25_studio_shares_no_delete BEFORE DELETE ON studio_shares BEGIN SELECT RAISE(ABORT, 'studio shares are append-only facts'); END;
CREATE TRIGGER IF NOT EXISTS c25_studio_commands_no_update BEFORE UPDATE ON studio_commands BEGIN SELECT RAISE(ABORT, 'studio commands are append-only facts'); END;
CREATE TRIGGER IF NOT EXISTS c25_studio_commands_no_delete BEFORE DELETE ON studio_commands BEGIN SELECT RAISE(ABORT, 'studio commands are append-only facts'); END;
