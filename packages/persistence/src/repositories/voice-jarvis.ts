import {
  AudioPolicySchema,
  TranscriptDescriptorSchema,
  VoiceCommandSchema,
  VoiceSessionDescriptorSchema,
  WakeWordDescriptorSchema,
  canApplyTranscriptLifecycleCommand,
  canTransitionVoiceSession,
  type AudioPolicy,
  type TranscriptDescriptor,
  type VoiceCommand,
  type VoiceSessionDescriptor,
  type WakeWordDescriptor,
} from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { PersistenceError, json, readJson, readText, sqliteError, updateChanged } from "./utils.js";

export type VoiceCommandRecordResult = {
  readonly command: VoiceCommand;
  readonly replayed: boolean;
};

type TranscriptLifecycleCommandKind = "delete_transcript" | "export_transcript";
type SessionCommandKind = "wake" | "interrupt" | "pause" | "resume";

export class AudioPolicyRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): AudioPolicy {
    const parsed = AudioPolicySchema.parse(record);
    try {
      this.database.prepare("INSERT INTO voice_audio_policies(id, workspace_id, name, microphone_mode, speaker_mode, vad_mode, stt_mode, tts_mode, wake_word_mode, wall_mode, retention_json, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.name, parsed.microphone_mode, parsed.speaker_mode, parsed.vad_mode, parsed.stt_mode, parsed.tts_mode, parsed.wake_word_mode, parsed.wall_mode, json(parsed.retention), json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): AudioPolicy | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM voice_audio_policies WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : AudioPolicySchema.parse({ ...readJson(row["payload_json"], AudioPolicySchema), revision: readVersion(row["version"], "AudioPolicy") });
  }

  list(workspaceId: string): readonly AudioPolicy[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM voice_audio_policies WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId);
    return rows.map((row) => AudioPolicySchema.parse({ ...readJson(row["payload_json"], AudioPolicySchema), revision: readVersion(row["version"], "AudioPolicy") }));
  }
}

export class WakeWordRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): WakeWordDescriptor {
    const parsed = WakeWordDescriptorSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO voice_wake_words(id, workspace_id, phrase, locale, sensitivity, consent_required, local_only, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.phrase, parsed.locale, parsed.sensitivity, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): WakeWordDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM voice_wake_words WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : WakeWordDescriptorSchema.parse({ ...readJson(row["payload_json"], WakeWordDescriptorSchema), revision: readVersion(row["version"], "WakeWord") });
  }
}

export class VoiceSessionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): VoiceSessionDescriptor {
    const parsed = VoiceSessionDescriptorSchema.parse(record);
    requireInitialVoiceSession(parsed);
    try {
      this.database.prepare("INSERT INTO voice_sessions(id, workspace_id, run_id, gateway_session_id, audio_policy_id, wake_word_id, name, mode, status, locale, turn_count, interaction_budget_json, deadline_at, input_audio_ref, output_audio_ref, current_transcript_id, interrupted_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.run_id, parsed.gateway_session_id, parsed.audio_policy_id, parsed.wake_word_id, parsed.name, parsed.mode, parsed.status, parsed.locale, parsed.turn_count, json(parsed.interaction_budget), parsed.deadline_at, parsed.current_transcript_id, parsed.interrupted_at, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): VoiceSessionDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM voice_sessions WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readVoiceSession(row);
  }

  list(workspaceId: string): readonly VoiceSessionDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM voice_sessions WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId);
    return rows.map(readVoiceSession);
  }

  update(record: VoiceSessionDescriptor, expectedVersion: number): VoiceSessionDescriptor {
    const current = this.get(record.workspace_id, record.id);
    if (current === undefined) throw new PersistenceError("NOT_FOUND", "Voice session not found");
    if (current.revision !== expectedVersion) throw new PersistenceError("VERSION_CONFLICT", "Voice session version conflict");
    requireImmutableVoiceSessionFacts(current, record);
    if (!canTransitionVoiceSession(current.status, record.status) && current.status !== record.status) throw new PersistenceError("CONSTRAINT_VIOLATION", "Voice session state transition is invalid");
    const updated = VoiceSessionDescriptorSchema.parse({ ...record, revision: expectedVersion + 1 });
    requireCurrentTranscriptScope(this.database, updated);
    requireCommandBackedVoiceSessionUpdate(this.database, current, updated);
    try {
      const result = this.database.prepare("UPDATE voice_sessions SET status = ?, turn_count = ?, current_transcript_id = ?, interrupted_at = ?, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?").run(updated.status, updated.turn_count, updated.current_transcript_id, updated.interrupted_at, json(updated), updated.schema_version, updated.updated_at, updated.workspace_id, updated.id, expectedVersion);
      updateChanged(result, "VoiceSession");
      return updated;
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw sqliteError(error, "VERSION_CONFLICT");
    }
  }
}

export class VoiceTranscriptRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): TranscriptDescriptor {
    const parsed = TranscriptDescriptorSchema.parse(record);
    requireInitialTranscriptLifecycle(parsed);
    requireTranscriptSessionScope(this.database, parsed);
    try {
      this.database.prepare("INSERT INTO voice_transcripts(id, workspace_id, voice_session_id, run_id, source_kind, transcript_ref, transcript_hash, audio_ref, redacted, lifecycle_status, expires_at, deleted_at, export_ref, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.voice_session_id, parsed.run_id, parsed.source_kind, parsed.transcript_ref, parsed.transcript_hash, parsed.lifecycle_status, parsed.expires_at, parsed.deleted_at, parsed.export_ref, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): TranscriptDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json FROM voice_transcripts WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readVoiceTranscript(this.database, row);
  }

  listBySession(workspaceId: string, sessionId: string): readonly TranscriptDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json FROM voice_transcripts WHERE workspace_id = ? AND voice_session_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, sessionId);
    return rows.map((row) => readVoiceTranscript(this.database, row));
  }
}

export class VoiceCommandRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): VoiceCommandRecordResult {
    const parsed = VoiceCommandSchema.parse(record);
    const existing = this.getByIdempotencyKey(parsed.workspace_id, parsed.idempotency_key);
    if (existing !== undefined) {
      if (voiceCommandFingerprint(existing) !== voiceCommandFingerprint(parsed)) throw new PersistenceError("IDEMPOTENCY_KEY_REUSED", "Voice command idempotency key was reused with a different payload");
      return { command: existing, replayed: true };
    }
    const session = new VoiceSessionRepository(this.database).get(parsed.workspace_id, parsed.voice_session_id);
    if (session === undefined || session.run_id !== parsed.run_id) throw new PersistenceError("CONSTRAINT_VIOLATION", "Voice command must match session scope");
    if (session.revision !== parsed.expected_revision) throw new PersistenceError("VERSION_CONFLICT", "Voice command session revision conflict");
    this.requireTranscriptLifecyclePolicy(parsed);
    try {
      this.database.prepare("INSERT INTO voice_commands(command_id, workspace_id, voice_session_id, run_id, kind, idempotency_key, expected_revision, transcript_id, reason, descriptor_only, payload_json, schema_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)").run(parsed.command_id, parsed.workspace_id, parsed.voice_session_id, parsed.run_id, parsed.kind, parsed.idempotency_key, parsed.expected_revision, parsed.transcript_id, parsed.reason, json(parsed), parsed.schema_version, parsed.created_at);
      return { command: parsed, replayed: false };
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listBySession(workspaceId: string, sessionId: string): readonly VoiceCommand[] {
    const rows = this.database.prepare("SELECT payload_json FROM voice_commands WHERE workspace_id = ? AND voice_session_id = ? ORDER BY created_at ASC, command_id ASC").all(workspaceId, sessionId);
    return rows.map((row) => readJson(row["payload_json"], VoiceCommandSchema));
  }

  get(workspaceId: string, commandId: string): VoiceCommand | undefined {
    const row = this.database.prepare("SELECT payload_json FROM voice_commands WHERE workspace_id = ? AND command_id = ?").get(workspaceId, commandId);
    return row === undefined ? undefined : readJson(row["payload_json"], VoiceCommandSchema);
  }

  private getByIdempotencyKey(workspaceId: string, idempotencyKey: string): VoiceCommand | undefined {
    const row = this.database.prepare("SELECT payload_json FROM voice_commands WHERE workspace_id = ? AND idempotency_key = ?").get(workspaceId, idempotencyKey);
    return row === undefined ? undefined : readJson(row["payload_json"], VoiceCommandSchema);
  }

  private requireTranscriptLifecyclePolicy(command: VoiceCommand): void {
    if (command.kind !== "delete_transcript" && command.kind !== "export_transcript") return;
    const transcriptId = command.transcript_id;
    if (transcriptId === null) throw new PersistenceError("CONSTRAINT_VIOLATION", "Voice transcript lifecycle command requires a transcript");
    const transcript = new VoiceTranscriptRepository(this.database).get(command.workspace_id, transcriptId);
    if (transcript === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Voice transcript lifecycle command must reference an existing transcript");
    const session = new VoiceSessionRepository(this.database).get(command.workspace_id, command.voice_session_id);
    if (session === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Voice transcript lifecycle command must reference an existing session");
    const policy = new AudioPolicyRepository(this.database).get(command.workspace_id, session.audio_policy_id);
    if (policy === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Voice transcript lifecycle command must reference an audio policy");
    const decision = canApplyTranscriptLifecycleCommand(command, transcript, policy);
    if (!decision.allowed) throw new PersistenceError("CONSTRAINT_VIOLATION", `Voice transcript lifecycle policy disabled or invalid: ${decision.code}`);
  }
}

function readVoiceSession(row: Record<string, unknown>): VoiceSessionDescriptor {
  return VoiceSessionDescriptorSchema.parse({ ...readJson(row["payload_json"], VoiceSessionDescriptorSchema), revision: readVersion(row["version"], "VoiceSession") });
}

function readVoiceTranscript(database: SqliteDatabase, row: Record<string, unknown>): TranscriptDescriptor {
  const transcript = readJson(row["payload_json"], TranscriptDescriptorSchema);
  const lifecycleCommand = findTranscriptLifecycleCommand(database, transcript);
  if (lifecycleCommand === undefined) return transcript;
  return TranscriptDescriptorSchema.parse({
    ...transcript,
    lifecycle_status: lifecycleCommand === "delete_transcript" ? "delete_requested" : "export_requested",
    deleted_at: null,
    export_ref: null,
  });
}

function findTranscriptLifecycleCommand(database: SqliteDatabase, transcript: TranscriptDescriptor): TranscriptLifecycleCommandKind | undefined {
  const row = database.prepare("SELECT kind FROM voice_commands WHERE workspace_id = ? AND voice_session_id = ? AND transcript_id = ? AND kind IN ('delete_transcript', 'export_transcript') ORDER BY created_at ASC, command_id ASC LIMIT 1").get(transcript.workspace_id, transcript.voice_session_id, transcript.id);
  if (row === undefined) return undefined;
  const kind = readText(row["kind"]);
  if (kind === "delete_transcript" || kind === "export_transcript") return kind;
  throw new PersistenceError("CONSTRAINT_VIOLATION", "Voice transcript lifecycle command kind is invalid");
}

function requireInitialTranscriptLifecycle(transcript: TranscriptDescriptor): void {
  if (transcript.lifecycle_status !== "retained") throw new PersistenceError("CONSTRAINT_VIOLATION", "Initial voice transcript facts must be retained");
}

function requireInitialVoiceSession(session: VoiceSessionDescriptor): void {
  if (session.status !== "idle" || session.turn_count !== 0 || session.current_transcript_id !== null || session.interrupted_at !== null) {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Initial voice session must be idle with zero turns and no current transcript");
  }
}

function requireTranscriptSessionScope(database: SqliteDatabase, transcript: TranscriptDescriptor): void {
  const session = new VoiceSessionRepository(database).get(transcript.workspace_id, transcript.voice_session_id);
  if (session === undefined || session.run_id !== transcript.run_id) throw new PersistenceError("CONSTRAINT_VIOLATION", "Voice transcript must match session scope");
}

function requireCurrentTranscriptScope(database: SqliteDatabase, session: VoiceSessionDescriptor): void {
  if (session.current_transcript_id === null) return;
  const row = database.prepare("SELECT 1 AS found FROM voice_transcripts WHERE workspace_id = ? AND id = ? AND voice_session_id = ? AND run_id = ?").get(session.workspace_id, session.current_transcript_id, session.id, session.run_id);
  if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Voice session current transcript must match session scope");
}

function requireCommandBackedVoiceSessionUpdate(database: SqliteDatabase, current: VoiceSessionDescriptor, next: VoiceSessionDescriptor): void {
  const allowedKinds = commandKindsForVoiceSessionUpdate(current, next);
  if (allowedKinds.length === 0) throw new PersistenceError("CONSTRAINT_VIOLATION", "Voice session update requires an append-only command fact");
  const rows = database.prepare("SELECT kind FROM voice_commands WHERE workspace_id = ? AND voice_session_id = ? AND run_id = ? AND expected_revision = ?").all(current.workspace_id, current.id, current.run_id, current.revision);
  const matchingCommand = rows.some((row) => {
    const kind = readSessionCommandKind(row["kind"]);
    return kind !== undefined && allowedKinds.includes(kind);
  });
  if (!matchingCommand) throw new PersistenceError("CONSTRAINT_VIOLATION", "Voice session update requires an append-only command fact");
}

function requireImmutableVoiceSessionFacts(current: VoiceSessionDescriptor, next: VoiceSessionDescriptor): void {
  if (current.run_id !== next.run_id || current.gateway_session_id !== next.gateway_session_id || current.audio_policy_id !== next.audio_policy_id || current.wake_word_id !== next.wake_word_id || current.name !== next.name || current.mode !== next.mode || current.locale !== next.locale || json(current.interaction_budget) !== json(next.interaction_budget) || current.deadline_at !== next.deadline_at || current.created_at !== next.created_at || current.descriptor_only !== next.descriptor_only || current.schema_version !== next.schema_version) {
    throw new PersistenceError("VERSION_CONFLICT", "Voice session immutable facts changed");
  }
}

function commandKindsForVoiceSessionUpdate(current: VoiceSessionDescriptor, next: VoiceSessionDescriptor): readonly SessionCommandKind[] {
  if (next.status === "active" && next.turn_count === current.turn_count + 1 && next.interrupted_at === null) return ["wake"];
  if (next.status === "paused" && next.turn_count === current.turn_count && next.interrupted_at === null) return ["pause"];
  if (next.status === "interrupted" && next.turn_count === current.turn_count && next.interrupted_at !== null) return ["interrupt"];
  if (next.status === "active" && next.turn_count === current.turn_count && next.interrupted_at === null && (current.status === "paused" || current.status === "interrupted")) return ["resume"];
  return [];
}

function readSessionCommandKind(value: unknown): SessionCommandKind | undefined {
  const text = readText(value);
  if (text === "wake" || text === "interrupt" || text === "pause" || text === "resume") return text;
  return undefined;
}

function voiceCommandFingerprint(command: VoiceCommand): string {
  return json({
    command_id: command.command_id,
    workspace_id: command.workspace_id,
    voice_session_id: command.voice_session_id,
    run_id: command.run_id,
    kind: command.kind,
    idempotency_key: command.idempotency_key,
    expected_revision: command.expected_revision,
    transcript_id: command.transcript_id,
    reason: command.reason,
    descriptor_only: command.descriptor_only,
    schema_version: command.schema_version,
  });
}

function readVersion(value: unknown, entity: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "bigint" && value > 0n) return Number(value);
  throw new PersistenceError("CONSTRAINT_VIOLATION", `${entity} version column is invalid`);
}
