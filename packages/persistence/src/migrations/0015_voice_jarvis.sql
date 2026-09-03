CREATE TABLE IF NOT EXISTS voice_audio_policies (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  microphone_mode TEXT NOT NULL CHECK (microphone_mode = 'disabled'),
  speaker_mode TEXT NOT NULL CHECK (speaker_mode = 'disabled'),
  vad_mode TEXT NOT NULL CHECK (vad_mode = 'descriptor_only'),
  stt_mode TEXT NOT NULL CHECK (stt_mode = 'descriptor_only'),
  tts_mode TEXT NOT NULL CHECK (tts_mode = 'descriptor_only'),
  wake_word_mode TEXT NOT NULL CHECK (wake_word_mode = 'consent_required'),
  wall_mode TEXT NOT NULL CHECK (wall_mode = 'descriptor_only'),
  retention_json TEXT NOT NULL CHECK (json_valid(retention_json)),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS voice_wake_words (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  phrase TEXT NOT NULL,
  locale TEXT NOT NULL,
  sensitivity REAL NOT NULL CHECK (sensitivity >= 0 AND sensitivity <= 1),
  consent_required INTEGER NOT NULL DEFAULT 1 CHECK (consent_required = 1),
  local_only INTEGER NOT NULL DEFAULT 1 CHECK (local_only = 1),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS voice_sessions (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  gateway_session_id TEXT NOT NULL,
  audio_policy_id TEXT NOT NULL,
  wake_word_id TEXT,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('conversation', 'push_to_talk', 'wall')),
  status TEXT NOT NULL CHECK (status IN ('idle', 'active', 'paused', 'interrupted', 'stopped', 'error')),
  locale TEXT NOT NULL,
  turn_count INTEGER NOT NULL CHECK (turn_count >= 0),
  interaction_budget_json TEXT NOT NULL CHECK (json_valid(interaction_budget_json)),
  deadline_at TEXT NOT NULL,
  input_audio_ref TEXT CHECK (input_audio_ref IS NULL),
  output_audio_ref TEXT CHECK (output_audio_ref IS NULL),
  current_transcript_id TEXT,
  interrupted_at TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK (mode != 'wall' OR wake_word_id IS NOT NULL),
  CHECK ((status = 'interrupted' AND interrupted_at IS NOT NULL) OR (status != 'interrupted' AND interrupted_at IS NULL)),
  CHECK (turn_count <= json_extract(interaction_budget_json, '$.max_turns')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, gateway_session_id) REFERENCES sessions(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, audio_policy_id) REFERENCES voice_audio_policies(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, wake_word_id) REFERENCES voice_wake_words(workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS voice_transcripts (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  voice_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('stt_descriptor', 'operator_text', 'system_summary')),
  transcript_ref TEXT NOT NULL,
  transcript_hash TEXT NOT NULL,
  audio_ref TEXT CHECK (audio_ref IS NULL),
  redacted INTEGER NOT NULL DEFAULT 1 CHECK (redacted = 1),
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('retained', 'delete_requested', 'deleted', 'export_requested', 'exported')),
  expires_at TEXT,
  deleted_at TEXT,
  export_ref TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK ((lifecycle_status = 'deleted' AND deleted_at IS NOT NULL) OR (lifecycle_status != 'deleted' AND deleted_at IS NULL)),
  CHECK ((lifecycle_status = 'exported' AND export_ref IS NOT NULL) OR (lifecycle_status != 'exported' AND export_ref IS NULL)),
  FOREIGN KEY (workspace_id, voice_session_id) REFERENCES voice_sessions(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS voice_commands (
  command_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  voice_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('wake', 'interrupt', 'pause', 'resume', 'delete_transcript', 'export_transcript')),
  idempotency_key TEXT NOT NULL,
  expected_revision INTEGER NOT NULL CHECK (expected_revision > 0),
  transcript_id TEXT,
  reason TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, command_id),
  UNIQUE (workspace_id, idempotency_key),
  CHECK ((kind IN ('delete_transcript', 'export_transcript') AND transcript_id IS NOT NULL) OR (kind NOT IN ('delete_transcript', 'export_transcript') AND transcript_id IS NULL)),
  FOREIGN KEY (workspace_id, voice_session_id) REFERENCES voice_sessions(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, transcript_id) REFERENCES voice_transcripts(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_c24_voice_sessions_workspace_status ON voice_sessions(workspace_id, status, mode);
CREATE INDEX IF NOT EXISTS idx_c24_voice_transcripts_session ON voice_transcripts(workspace_id, voice_session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_c24_voice_commands_session ON voice_commands(workspace_id, voice_session_id, created_at ASC);

CREATE TRIGGER IF NOT EXISTS c24_voice_audio_policies_retention_insert
BEFORE INSERT ON voice_audio_policies
WHEN json_extract(NEW.retention_json, '$.audio_retention_days') IS NOT 0
  OR json_extract(NEW.retention_json, '$.voiceprint_storage') IS NOT 'disabled'
  OR json_type(NEW.retention_json, '$.deletion_allowed') NOT IN ('true', 'false')
  OR json_type(NEW.retention_json, '$.export_allowed') NOT IN ('true', 'false')
BEGIN SELECT RAISE(ABORT, 'voice audio policy retention descriptor boundary failed'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_audio_policies_payload_json_insert
BEFORE INSERT ON voice_audio_policies
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.name') IS NOT NEW.name
  OR json_extract(NEW.payload_json, '$.microphone_mode') IS NOT NEW.microphone_mode
  OR json_extract(NEW.payload_json, '$.speaker_mode') IS NOT NEW.speaker_mode
  OR json_extract(NEW.payload_json, '$.vad_mode') IS NOT NEW.vad_mode
  OR json_extract(NEW.payload_json, '$.stt_mode') IS NOT NEW.stt_mode
  OR json_extract(NEW.payload_json, '$.tts_mode') IS NOT NEW.tts_mode
  OR json_extract(NEW.payload_json, '$.wake_word_mode') IS NOT NEW.wake_word_mode
  OR json_extract(NEW.payload_json, '$.wall_mode') IS NOT NEW.wall_mode
  OR json_extract(NEW.payload_json, '$.retention') IS NOT json(NEW.retention_json)
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'voice audio policy payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_audio_policies_secret_safe_text_insert
BEFORE INSERT ON voice_audio_policies
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
  OR lower(NEW.name) LIKE '%vault:%'
  OR lower(NEW.name) LIKE '%token%3d%'
  OR lower(NEW.payload_json) LIKE '%bearer %'
  OR lower(NEW.payload_json) LIKE '%api_key%'
  OR lower(NEW.payload_json) LIKE '%api-key%'
  OR lower(NEW.payload_json) LIKE '%access_token%'
  OR lower(NEW.payload_json) LIKE '%access-token%'
  OR lower(NEW.payload_json) LIKE '%authorization%'
  OR lower(NEW.payload_json) LIKE '%private_key%'
  OR lower(NEW.payload_json) LIKE '%private-key%'
  OR lower(NEW.payload_json) LIKE '%client_secret%'
  OR lower(NEW.payload_json) LIKE '%client-secret%'
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%credential:%'
  OR lower(NEW.payload_json) LIKE '%vault:%'
  OR lower(NEW.payload_json) LIKE '%token%3d%'
BEGIN SELECT RAISE(ABORT, 'voice jarvis secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_audio_policies_normalized_text_safe_insert
BEFORE INSERT ON voice_audio_policies
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0
      OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
      OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0
      OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0
      OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0
      OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0
      OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0
      OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
      OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'voice jarvis normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c24_voice_wake_words_secret_safe_text_insert
BEFORE INSERT ON voice_wake_words
WHEN lower(NEW.phrase) LIKE '%bearer %'
  OR lower(NEW.phrase) LIKE '%basic %'
  OR lower(NEW.phrase) LIKE '%api_key%'
  OR lower(NEW.phrase) LIKE '%api-key%'
  OR lower(NEW.phrase) LIKE '%access_token%'
  OR lower(NEW.phrase) LIKE '%access-token%'
  OR lower(NEW.phrase) LIKE '%authorization%'
  OR lower(NEW.phrase) LIKE '%private_key%'
  OR lower(NEW.phrase) LIKE '%private-key%'
  OR lower(NEW.phrase) LIKE '%client_secret%'
  OR lower(NEW.phrase) LIKE '%client-secret%'
  OR lower(NEW.phrase) LIKE '%refresh_token%'
  OR lower(NEW.phrase) LIKE '%refresh-token%'
  OR lower(NEW.phrase) LIKE '%session_token%'
  OR lower(NEW.phrase) LIKE '%session-token%'
  OR lower(NEW.phrase) LIKE '%token=%'
  OR lower(NEW.phrase) LIKE '%password=%'
  OR lower(NEW.phrase) LIKE '%passwd=%'
  OR lower(NEW.phrase) LIKE '%pwd=%'
  OR lower(NEW.phrase) LIKE '%secret://%'
  OR lower(NEW.phrase) LIKE '%credential:%'
  OR lower(NEW.phrase) LIKE '%vault:%'
  OR lower(NEW.phrase) LIKE '%token%3d%'
  OR lower(NEW.payload_json) LIKE '%bearer %'
  OR lower(NEW.payload_json) LIKE '%api_key%'
  OR lower(NEW.payload_json) LIKE '%api-key%'
  OR lower(NEW.payload_json) LIKE '%access_token%'
  OR lower(NEW.payload_json) LIKE '%access-token%'
  OR lower(NEW.payload_json) LIKE '%authorization%'
  OR lower(NEW.payload_json) LIKE '%private_key%'
  OR lower(NEW.payload_json) LIKE '%private-key%'
  OR lower(NEW.payload_json) LIKE '%client_secret%'
  OR lower(NEW.payload_json) LIKE '%client-secret%'
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%credential:%'
  OR lower(NEW.payload_json) LIKE '%vault:%'
  OR lower(NEW.payload_json) LIKE '%token%3d%'
BEGIN SELECT RAISE(ABORT, 'voice jarvis secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_wake_words_normalized_text_safe_insert
BEFORE INSERT ON voice_wake_words
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.phrase, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0
      OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
      OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0
      OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0
      OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0
      OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0
      OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0
      OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
      OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'voice jarvis normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c24_voice_wake_words_payload_json_insert
BEFORE INSERT ON voice_wake_words
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.phrase') IS NOT NEW.phrase
  OR json_extract(NEW.payload_json, '$.locale') IS NOT NEW.locale
  OR json_extract(NEW.payload_json, '$.sensitivity') IS NOT NEW.sensitivity
  OR json_extract(NEW.payload_json, '$.consent_required') IS NOT 1
  OR json_extract(NEW.payload_json, '$.local_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'voice wake word payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_sessions_gateway_scope_insert
BEFORE INSERT ON voice_sessions
WHEN NOT EXISTS (
  SELECT 1 FROM sessions gateway_session
  WHERE gateway_session.workspace_id = NEW.workspace_id
    AND gateway_session.id = NEW.gateway_session_id
    AND gateway_session.run_id = NEW.run_id
)
BEGIN SELECT RAISE(ABORT, 'voice session must match gateway session run scope'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_sessions_current_transcript_initial_insert
BEFORE INSERT ON voice_sessions
WHEN NEW.current_transcript_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'initial voice session current transcript must be null'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_sessions_initial_state_insert
BEFORE INSERT ON voice_sessions
WHEN NEW.status != 'idle'
  OR NEW.turn_count != 0
  OR NEW.current_transcript_id IS NOT NULL
  OR NEW.interrupted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'initial voice session must be idle with zero turns and no transcript'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_sessions_payload_json_insert
BEFORE INSERT ON voice_sessions
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.gateway_session_id') IS NOT NEW.gateway_session_id
  OR json_extract(NEW.payload_json, '$.audio_policy_id') IS NOT NEW.audio_policy_id
  OR json_extract(NEW.payload_json, '$.wake_word_id') IS NOT NEW.wake_word_id
  OR json_extract(NEW.payload_json, '$.name') IS NOT NEW.name
  OR json_extract(NEW.payload_json, '$.mode') IS NOT NEW.mode
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.locale') IS NOT NEW.locale
  OR json_extract(NEW.payload_json, '$.turn_count') IS NOT NEW.turn_count
  OR json_extract(NEW.payload_json, '$.interaction_budget') IS NOT json(NEW.interaction_budget_json)
  OR json_extract(NEW.payload_json, '$.deadline_at') IS NOT NEW.deadline_at
  OR json_extract(NEW.payload_json, '$.input_audio_ref') IS NOT NEW.input_audio_ref
  OR json_extract(NEW.payload_json, '$.output_audio_ref') IS NOT NEW.output_audio_ref
  OR json_extract(NEW.payload_json, '$.current_transcript_id') IS NOT NEW.current_transcript_id
  OR json_extract(NEW.payload_json, '$.interrupted_at') IS NOT NEW.interrupted_at
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'voice session payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_sessions_secret_safe_text_insert
BEFORE INSERT ON voice_sessions
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
  OR lower(NEW.name) LIKE '%vault:%'
  OR lower(NEW.name) LIKE '%token%3d%'
  OR lower(NEW.payload_json) LIKE '%bearer %'
  OR lower(NEW.payload_json) LIKE '%api_key%'
  OR lower(NEW.payload_json) LIKE '%api-key%'
  OR lower(NEW.payload_json) LIKE '%access_token%'
  OR lower(NEW.payload_json) LIKE '%access-token%'
  OR lower(NEW.payload_json) LIKE '%authorization%'
  OR lower(NEW.payload_json) LIKE '%private_key%'
  OR lower(NEW.payload_json) LIKE '%private-key%'
  OR lower(NEW.payload_json) LIKE '%client_secret%'
  OR lower(NEW.payload_json) LIKE '%client-secret%'
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%credential:%'
  OR lower(NEW.payload_json) LIKE '%vault:%'
  OR lower(NEW.payload_json) LIKE '%token%3d%'
BEGIN SELECT RAISE(ABORT, 'voice jarvis secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_sessions_normalized_text_safe_insert
BEFORE INSERT ON voice_sessions
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0
      OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
      OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0
      OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0
      OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0
      OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0
      OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0
      OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
      OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'voice jarvis normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c24_voice_sessions_guarded_update
BEFORE UPDATE ON voice_sessions
WHEN NEW.workspace_id != OLD.workspace_id
  OR NEW.id != OLD.id
  OR NEW.run_id != OLD.run_id
  OR NEW.gateway_session_id != OLD.gateway_session_id
  OR NEW.audio_policy_id != OLD.audio_policy_id
  OR COALESCE(NEW.wake_word_id, '') != COALESCE(OLD.wake_word_id, '')
  OR NEW.name != OLD.name
  OR NEW.mode != OLD.mode
  OR NEW.locale != OLD.locale
  OR NEW.interaction_budget_json != OLD.interaction_budget_json
  OR NEW.deadline_at != OLD.deadline_at
  OR NEW.created_at != OLD.created_at
  OR NEW.descriptor_only != OLD.descriptor_only
  OR NEW.schema_version != OLD.schema_version
  OR NEW.version != OLD.version + 1
  OR NEW.input_audio_ref IS NOT NULL
  OR NEW.output_audio_ref IS NOT NULL
  OR NOT (
    NEW.status = OLD.status
    OR (OLD.status = 'idle' AND NEW.status IN ('active', 'paused', 'stopped', 'error'))
    OR (OLD.status = 'active' AND NEW.status IN ('idle', 'paused', 'interrupted', 'stopped', 'error'))
    OR (OLD.status = 'paused' AND NEW.status IN ('idle', 'active', 'stopped', 'error'))
    OR (OLD.status = 'interrupted' AND NEW.status IN ('active', 'paused', 'stopped', 'error'))
    OR (OLD.status = 'error' AND NEW.status = 'stopped')
  )
  OR json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.gateway_session_id') IS NOT NEW.gateway_session_id
  OR json_extract(NEW.payload_json, '$.audio_policy_id') IS NOT NEW.audio_policy_id
  OR json_extract(NEW.payload_json, '$.wake_word_id') IS NOT NEW.wake_word_id
  OR json_extract(NEW.payload_json, '$.name') IS NOT NEW.name
  OR json_extract(NEW.payload_json, '$.mode') IS NOT NEW.mode
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.locale') IS NOT NEW.locale
  OR json_extract(NEW.payload_json, '$.turn_count') IS NOT NEW.turn_count
  OR json_extract(NEW.payload_json, '$.interaction_budget') IS NOT json(NEW.interaction_budget_json)
  OR json_extract(NEW.payload_json, '$.deadline_at') IS NOT NEW.deadline_at
  OR json_extract(NEW.payload_json, '$.input_audio_ref') IS NOT NEW.input_audio_ref
  OR json_extract(NEW.payload_json, '$.output_audio_ref') IS NOT NEW.output_audio_ref
  OR json_extract(NEW.payload_json, '$.current_transcript_id') IS NOT NEW.current_transcript_id
  OR json_extract(NEW.payload_json, '$.interrupted_at') IS NOT NEW.interrupted_at
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.revision') IS NOT NEW.version
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'voice session guarded update failed'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_sessions_current_transcript_scope_update
BEFORE UPDATE ON voice_sessions
WHEN NEW.current_transcript_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM voice_transcripts transcript
    WHERE transcript.workspace_id = NEW.workspace_id
      AND transcript.id = NEW.current_transcript_id
      AND transcript.voice_session_id = NEW.id
      AND transcript.run_id = NEW.run_id
  )
BEGIN SELECT RAISE(ABORT, 'voice session current transcript scope constraint failed'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_sessions_command_backing_update
BEFORE UPDATE ON voice_sessions
WHEN NOT EXISTS (
  SELECT 1 FROM voice_commands command
  WHERE command.workspace_id = OLD.workspace_id
    AND command.voice_session_id = OLD.id
    AND command.run_id = OLD.run_id
    AND command.expected_revision = OLD.version
    AND (
      (command.kind = 'wake' AND NEW.status = 'active' AND NEW.turn_count = OLD.turn_count + 1 AND NEW.interrupted_at IS NULL)
      OR (command.kind = 'pause' AND NEW.status = 'paused' AND NEW.turn_count = OLD.turn_count AND NEW.interrupted_at IS NULL)
      OR (command.kind = 'interrupt' AND NEW.status = 'interrupted' AND NEW.turn_count = OLD.turn_count AND NEW.interrupted_at IS NOT NULL)
      OR (command.kind = 'resume' AND OLD.status IN ('paused', 'interrupted') AND NEW.status = 'active' AND NEW.turn_count = OLD.turn_count AND NEW.interrupted_at IS NULL)
    )
)
BEGIN SELECT RAISE(ABORT, 'voice session update requires append-only command backing'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_sessions_normalized_text_safe_update
BEFORE UPDATE ON voice_sessions
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0
      OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
      OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0
      OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0
      OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0
      OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0
      OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0
      OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
      OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'voice jarvis normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c24_voice_audio_policies_no_update
BEFORE UPDATE ON voice_audio_policies
BEGIN SELECT RAISE(ABORT, 'voice audio policy facts are immutable'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_audio_policies_no_delete
BEFORE DELETE ON voice_audio_policies
BEGIN SELECT RAISE(ABORT, 'voice audio policy facts are immutable'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_wake_words_no_update
BEFORE UPDATE ON voice_wake_words
BEGIN SELECT RAISE(ABORT, 'voice wake word facts are immutable'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_wake_words_no_delete
BEFORE DELETE ON voice_wake_words
BEGIN SELECT RAISE(ABORT, 'voice wake word facts are immutable'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_transcripts_scope_insert
BEFORE INSERT ON voice_transcripts
WHEN NOT EXISTS (
  SELECT 1 FROM voice_sessions session
  WHERE session.workspace_id = NEW.workspace_id
    AND session.id = NEW.voice_session_id
    AND session.run_id = NEW.run_id
)
BEGIN SELECT RAISE(ABORT, 'voice transcript must match session run scope'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_transcripts_initial_lifecycle_insert
BEFORE INSERT ON voice_transcripts
WHEN NEW.lifecycle_status != 'retained'
  OR NEW.deleted_at IS NOT NULL
  OR NEW.export_ref IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'initial voice transcript lifecycle must be retained'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_transcripts_artifact_ref_shape_insert
BEFORE INSERT ON voice_transcripts
WHEN substr(NEW.transcript_ref, 1, 11) != 'artifact://'
  OR length(NEW.transcript_ref) <= 11
  OR substr(NEW.transcript_ref, 12) GLOB '*[^-A-Za-z0-9._~/]*'
  OR substr(NEW.transcript_ref, 12, 1) = '/'
  OR substr(NEW.transcript_ref, length(NEW.transcript_ref), 1) = '/'
  OR instr(substr(NEW.transcript_ref, 12), '//') > 0
  OR instr('/' || substr(NEW.transcript_ref, 12) || '/', '/../') > 0
  OR instr('/' || substr(NEW.transcript_ref, 12) || '/', '/./') > 0
  OR instr(substr(NEW.transcript_ref, 12), '://') > 0
  OR (NEW.export_ref IS NOT NULL AND (
    substr(NEW.export_ref, 1, 11) != 'artifact://'
    OR length(NEW.export_ref) <= 11
    OR substr(NEW.export_ref, 12) GLOB '*[^-A-Za-z0-9._~/]*'
    OR substr(NEW.export_ref, 12, 1) = '/'
    OR substr(NEW.export_ref, length(NEW.export_ref), 1) = '/'
    OR instr(substr(NEW.export_ref, 12), '//') > 0
    OR instr('/' || substr(NEW.export_ref, 12) || '/', '/../') > 0
    OR instr('/' || substr(NEW.export_ref, 12) || '/', '/./') > 0
    OR instr(substr(NEW.export_ref, 12), '://') > 0
  ))
BEGIN SELECT RAISE(ABORT, 'voice transcript artifact ref shape rejected'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_transcripts_secret_safe_text_insert
BEFORE INSERT ON voice_transcripts
WHEN NEW.transcript_ref NOT GLOB 'artifact://*'
  OR instr(NEW.transcript_ref, '..') > 0
  OR instr(NEW.transcript_ref, '\') > 0
  OR lower(NEW.transcript_ref) LIKE '%bearer %'
  OR lower(NEW.transcript_ref) LIKE '%basic %'
  OR lower(NEW.transcript_ref) LIKE '%api_key%'
  OR lower(NEW.transcript_ref) LIKE '%api-key%'
  OR lower(NEW.transcript_ref) LIKE '%access_token%'
  OR lower(NEW.transcript_ref) LIKE '%access-token%'
  OR lower(NEW.transcript_ref) LIKE '%authorization%'
  OR lower(NEW.transcript_ref) LIKE '%private_key%'
  OR lower(NEW.transcript_ref) LIKE '%private-key%'
  OR lower(NEW.transcript_ref) LIKE '%client_secret%'
  OR lower(NEW.transcript_ref) LIKE '%client-secret%'
  OR lower(NEW.transcript_ref) LIKE '%refresh_token%'
  OR lower(NEW.transcript_ref) LIKE '%refresh-token%'
  OR lower(NEW.transcript_ref) LIKE '%session_token%'
  OR lower(NEW.transcript_ref) LIKE '%session-token%'
  OR lower(NEW.transcript_ref) LIKE '%token=%'
  OR lower(NEW.transcript_ref) LIKE '%password=%'
  OR lower(NEW.transcript_ref) LIKE '%passwd=%'
  OR lower(NEW.transcript_ref) LIKE '%pwd=%'
  OR lower(NEW.transcript_ref) LIKE '%secret://%'
  OR lower(NEW.transcript_ref) LIKE '%credential:%'
  OR lower(NEW.transcript_ref) LIKE '%vault:%'
  OR lower(NEW.transcript_ref) LIKE '%token%3d%'
  OR lower(NEW.transcript_ref) LIKE '%password%3d%'
  OR lower(COALESCE(NEW.export_ref, '')) LIKE '%secret://%'
  OR lower(COALESCE(NEW.export_ref, '')) LIKE '%token=%'
  OR lower(COALESCE(NEW.export_ref, '')) LIKE '%token%3d%'
  OR lower(NEW.payload_json) LIKE '%bearer %'
  OR lower(NEW.payload_json) LIKE '%api_key%'
  OR lower(NEW.payload_json) LIKE '%api-key%'
  OR lower(NEW.payload_json) LIKE '%access_token%'
  OR lower(NEW.payload_json) LIKE '%access-token%'
  OR lower(NEW.payload_json) LIKE '%authorization%'
  OR lower(NEW.payload_json) LIKE '%private_key%'
  OR lower(NEW.payload_json) LIKE '%private-key%'
  OR lower(NEW.payload_json) LIKE '%client_secret%'
  OR lower(NEW.payload_json) LIKE '%client-secret%'
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%credential:%'
  OR lower(NEW.payload_json) LIKE '%vault:%'
  OR lower(NEW.payload_json) LIKE '%token%3d%'
  OR lower(NEW.payload_json) LIKE '%password%3d%'
BEGIN SELECT RAISE(ABORT, 'voice jarvis secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_transcripts_normalized_text_safe_insert
BEFORE INSERT ON voice_transcripts
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.transcript_ref, '') || ' ' || COALESCE(NEW.export_ref, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0
      OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
      OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0
      OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0
      OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0
      OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0
      OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0
      OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
      OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'voice jarvis normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c24_voice_transcripts_payload_json_insert
BEFORE INSERT ON voice_transcripts
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.voice_session_id') IS NOT NEW.voice_session_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.source_kind') IS NOT NEW.source_kind
  OR json_extract(NEW.payload_json, '$.transcript_ref') IS NOT NEW.transcript_ref
  OR json_extract(NEW.payload_json, '$.transcript_hash') IS NOT NEW.transcript_hash
  OR json_extract(NEW.payload_json, '$.audio_ref') IS NOT NEW.audio_ref
  OR json_extract(NEW.payload_json, '$.redacted') IS NOT 1
  OR json_extract(NEW.payload_json, '$.lifecycle_status') IS NOT NEW.lifecycle_status
  OR json_extract(NEW.payload_json, '$.expires_at') IS NOT NEW.expires_at
  OR json_extract(NEW.payload_json, '$.deleted_at') IS NOT NEW.deleted_at
  OR json_extract(NEW.payload_json, '$.export_ref') IS NOT NEW.export_ref
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN SELECT RAISE(ABORT, 'voice transcript payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_commands_session_scope_insert
BEFORE INSERT ON voice_commands
WHEN NOT EXISTS (
  SELECT 1 FROM voice_sessions session
  WHERE session.workspace_id = NEW.workspace_id
    AND session.id = NEW.voice_session_id
    AND session.run_id = NEW.run_id
    AND session.version = NEW.expected_revision
)
BEGIN SELECT RAISE(ABORT, 'voice command session scope or revision constraint failed'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_commands_transcript_scope_insert
BEFORE INSERT ON voice_commands
WHEN NEW.transcript_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM voice_transcripts transcript
    WHERE transcript.workspace_id = NEW.workspace_id
      AND transcript.id = NEW.transcript_id
      AND transcript.voice_session_id = NEW.voice_session_id
      AND transcript.run_id = NEW.run_id
  )
BEGIN SELECT RAISE(ABORT, 'voice command transcript scope constraint failed'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_commands_lifecycle_policy_insert
BEFORE INSERT ON voice_commands
WHEN (NEW.kind = 'delete_transcript' AND EXISTS (
    SELECT 1 FROM voice_sessions session
    JOIN voice_audio_policies policy ON policy.workspace_id = session.workspace_id AND policy.id = session.audio_policy_id
    WHERE session.workspace_id = NEW.workspace_id
      AND session.id = NEW.voice_session_id
      AND json_extract(policy.retention_json, '$.deletion_allowed') IS NOT 1
  ))
  OR (NEW.kind = 'export_transcript' AND EXISTS (
    SELECT 1 FROM voice_sessions session
    JOIN voice_audio_policies policy ON policy.workspace_id = session.workspace_id AND policy.id = session.audio_policy_id
    WHERE session.workspace_id = NEW.workspace_id
      AND session.id = NEW.voice_session_id
      AND json_extract(policy.retention_json, '$.export_allowed') IS NOT 1
  ))
BEGIN SELECT RAISE(ABORT, 'voice transcript lifecycle policy disabled'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_commands_single_lifecycle_insert
BEFORE INSERT ON voice_commands
WHEN NEW.kind IN ('delete_transcript', 'export_transcript')
  AND EXISTS (
    SELECT 1 FROM voice_commands existing
    WHERE existing.workspace_id = NEW.workspace_id
      AND existing.voice_session_id = NEW.voice_session_id
      AND existing.transcript_id = NEW.transcript_id
      AND existing.kind IN ('delete_transcript', 'export_transcript')
  )
BEGIN SELECT RAISE(ABORT, 'voice transcript lifecycle command already recorded'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_commands_secret_safe_text_insert
BEFORE INSERT ON voice_commands
WHEN NEW.idempotency_key LIKE '%/%'
  OR NEW.idempotency_key LIKE '%\%'
  OR NEW.idempotency_key LIKE '% %'
  OR lower(NEW.idempotency_key) LIKE '%bearer %'
  OR lower(NEW.idempotency_key) LIKE '%api_key%'
  OR lower(NEW.idempotency_key) LIKE '%api-key%'
  OR lower(NEW.idempotency_key) LIKE '%access_token%'
  OR lower(NEW.idempotency_key) LIKE '%access-token%'
  OR lower(NEW.idempotency_key) LIKE '%authorization%'
  OR lower(NEW.idempotency_key) LIKE '%private_key%'
  OR lower(NEW.idempotency_key) LIKE '%private-key%'
  OR lower(NEW.idempotency_key) LIKE '%client_secret%'
  OR lower(NEW.idempotency_key) LIKE '%client-secret%'
  OR lower(NEW.idempotency_key) LIKE '%refresh_token%'
  OR lower(NEW.idempotency_key) LIKE '%refresh-token%'
  OR lower(NEW.idempotency_key) LIKE '%session_token%'
  OR lower(NEW.idempotency_key) LIKE '%session-token%'
  OR lower(NEW.idempotency_key) LIKE '%token=%'
  OR lower(NEW.idempotency_key) LIKE '%password=%'
  OR lower(NEW.idempotency_key) LIKE '%passwd=%'
  OR lower(NEW.idempotency_key) LIKE '%pwd=%'
  OR lower(NEW.idempotency_key) LIKE '%secret://%'
  OR lower(NEW.idempotency_key) LIKE '%credential:%'
  OR lower(NEW.idempotency_key) LIKE '%vault:%'
  OR lower(NEW.idempotency_key) LIKE '%token%3d%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%bearer %'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%basic %'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%api_key%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%api-key%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%access_token%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%access-token%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%authorization%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%private_key%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%private-key%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%client_secret%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%client-secret%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%refresh_token%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%refresh-token%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%session_token%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%session-token%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%token=%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%password=%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%passwd=%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%pwd=%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%secret://%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%credential:%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%vault:%'
  OR lower(COALESCE(NEW.reason, '')) LIKE '%token%3d%'
  OR lower(NEW.payload_json) LIKE '%bearer %'
  OR lower(NEW.payload_json) LIKE '%api_key%'
  OR lower(NEW.payload_json) LIKE '%api-key%'
  OR lower(NEW.payload_json) LIKE '%access_token%'
  OR lower(NEW.payload_json) LIKE '%access-token%'
  OR lower(NEW.payload_json) LIKE '%authorization%'
  OR lower(NEW.payload_json) LIKE '%private_key%'
  OR lower(NEW.payload_json) LIKE '%private-key%'
  OR lower(NEW.payload_json) LIKE '%client_secret%'
  OR lower(NEW.payload_json) LIKE '%client-secret%'
  OR lower(NEW.payload_json) LIKE '%secret://%'
  OR lower(NEW.payload_json) LIKE '%credential:%'
  OR lower(NEW.payload_json) LIKE '%vault:%'
  OR lower(NEW.payload_json) LIKE '%token%3d%'
BEGIN SELECT RAISE(ABORT, 'voice jarvis secret-shaped text rejected'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_commands_normalized_text_safe_insert
BEFORE INSERT ON voice_commands
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT lower(COALESCE(NEW.idempotency_key, '') || ' ' || COALESCE(NEW.reason, '') || ' ' || COALESCE(NEW.payload_json, '')) AS combined)
    WHERE combined GLOB '*%[0-9a-f][0-9a-f]*'
      OR instr(combined, char(173)) > 0 OR instr(combined, char(847)) > 0 OR instr(combined, char(1564)) > 0 OR instr(combined, char(6158)) > 0
      OR instr(combined, char(8203)) > 0 OR instr(combined, char(8204)) > 0 OR instr(combined, char(8205)) > 0 OR instr(combined, char(8206)) > 0 OR instr(combined, char(8207)) > 0
      OR instr(combined, char(8288)) > 0 OR instr(combined, char(8289)) > 0 OR instr(combined, char(8290)) > 0 OR instr(combined, char(8291)) > 0 OR instr(combined, char(8292)) > 0
      OR instr(combined, char(65039)) > 0 OR instr(combined, char(917601)) > 0
      OR instr(combined, '\u00ad') > 0 OR instr(combined, '\u034f') > 0 OR instr(combined, '\u061c') > 0 OR instr(combined, '\u180e') > 0
      OR instr(combined, '\u200b') > 0 OR instr(combined, '\u200c') > 0 OR instr(combined, '\u200d') > 0 OR instr(combined, '\u200e') > 0 OR instr(combined, '\u200f') > 0
      OR instr(combined, '\u2060') > 0 OR instr(combined, '\u2061') > 0 OR instr(combined, '\u2062') > 0 OR instr(combined, '\u2063') > 0 OR instr(combined, '\u2064') > 0 OR instr(combined, '\ufe0f') > 0
      OR instr(combined, 'secret://') > 0 OR instr(combined, 'file://') > 0 OR instr(combined, 'vault://') > 0 OR instr(combined, 'http://') > 0 OR instr(combined, 'https://') > 0
      OR instr(combined, 'token=') > 0 OR instr(combined, 'token:') > 0 OR instr(combined, 'password=') > 0 OR instr(combined, 'password:') > 0 OR instr(combined, 'passwd=') > 0 OR instr(combined, 'pwd=') > 0
      OR instr(combined, 'api_key=') > 0 OR instr(combined, 'apikey=') > 0 OR instr(combined, 'access_token=') > 0 OR instr(combined, 'client_secret=') > 0 OR instr(combined, 'private_key=') > 0 OR instr(combined, 'authorization=') > 0
      OR instr(combined, '/users/') > 0 OR instr(combined, '/home/') > 0 OR instr(combined, '/private/') > 0 OR instr(combined, '/etc/') > 0 OR instr(combined, '/opt/') > 0 OR instr(combined, '~/') > 0
      OR instr(combined, '../') > 0 OR instr(combined, './') > 0 OR instr(combined, '=/') > 0 OR instr(combined, '=~/') > 0 OR instr(combined, ':///') > 0
      OR replace(replace(combined, char(92), '/'), '://', ':--') GLOB '*[a-z]:/*'
      OR instr(replace(replace(replace(replace(replace(combined, 'workspace://', ''), 'artifact://', ''), 'memory://', ''), 'journal://', ''), 'skill://', ''), '://') > 0
  ) THEN RAISE(ABORT, 'voice jarvis normalized secret-shaped text rejected') END;
END;

CREATE TRIGGER IF NOT EXISTS c24_voice_commands_payload_json_insert
BEFORE INSERT ON voice_commands
WHEN json_extract(NEW.payload_json, '$.command_id') IS NOT NEW.command_id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.voice_session_id') IS NOT NEW.voice_session_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.kind') IS NOT NEW.kind
  OR json_extract(NEW.payload_json, '$.idempotency_key') IS NOT NEW.idempotency_key
  OR json_extract(NEW.payload_json, '$.expected_revision') IS NOT NEW.expected_revision
  OR json_extract(NEW.payload_json, '$.transcript_id') IS NOT NEW.transcript_id
  OR json_extract(NEW.payload_json, '$.reason') IS NOT NEW.reason
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
BEGIN SELECT RAISE(ABORT, 'voice command payload parity failed'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_transcripts_no_update
BEFORE UPDATE ON voice_transcripts
BEGIN SELECT RAISE(ABORT, 'voice transcript facts are append-only'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_transcripts_no_delete
BEFORE DELETE ON voice_transcripts
BEGIN SELECT RAISE(ABORT, 'voice transcript facts are append-only'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_commands_no_update
BEFORE UPDATE ON voice_commands
BEGIN SELECT RAISE(ABORT, 'voice command facts are append-only'); END;

CREATE TRIGGER IF NOT EXISTS c24_voice_commands_no_delete
BEFORE DELETE ON voice_commands
BEGIN SELECT RAISE(ABORT, 'voice command facts are append-only'); END;
