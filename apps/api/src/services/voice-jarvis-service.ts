import { z } from "zod";
import {
  AudioPolicySchema,
  TranscriptDescriptorSchema,
  VoiceCommandSchema,
  VoiceSessionDescriptorSchema,
  WakeWordDescriptorSchema,
  UlidSchema,
  WorkspaceIdSchema,
  canTransitionVoiceSession,
  type AudioPolicy,
  type TranscriptDescriptor,
  type VoiceCommand,
  type VoiceSessionDescriptor,
  type WakeWordDescriptor,
} from "@nexora/contracts";
import {
  AudioPolicyRepository,
  IdempotencyRepository,
  VoiceCommandRepository,
  VoiceSessionRepository,
  VoiceTranscriptRepository,
  WakeWordRepository,
  withTransaction,
  type IdempotencyRecord,
  type SqliteDatabase,
} from "@nexora/persistence";
import { assertScope, type PolicyActor } from "@nexora/policy";
import { accepted, requestHash } from "./command-helpers.js";
import type { AcceptedCommand, IdFactory } from "./command-service.js";
import { ApiHttpError } from "./errors.js";

export type VoiceJarvisServiceOptions = {
  readonly database: SqliteDatabase;
  readonly clock: { readonly now: () => string };
  readonly idFactory: IdFactory;
};

export type VoiceJarvisSessionDetail = {
  readonly voice_session: VoiceSessionDescriptor;
  readonly audio_policy: AudioPolicy | null;
  readonly wake_word: WakeWordDescriptor | null;
  readonly transcripts: readonly TranscriptDescriptor[];
  readonly commands: readonly VoiceCommand[];
};

const SessionCommandInputSchema = z.object({
  schema_version: z.literal(1),
  workspace_id: WorkspaceIdSchema,
  run_id: UlidSchema,
  kind: z.enum(["wake", "interrupt", "pause", "resume"]),
  reason: z.string().min(1).max(1000).nullable().optional(),
  descriptor_only: z.literal(true),
}).strict();

const TranscriptCommandInputSchema = z.object({
  schema_version: z.literal(1),
  workspace_id: WorkspaceIdSchema,
  voice_session_id: UlidSchema,
  run_id: UlidSchema,
  kind: z.enum(["delete_transcript", "export_transcript"]),
  reason: z.string().min(1).max(1000).nullable().optional(),
  descriptor_only: z.literal(true),
}).strict();

const WorkspaceOnlyInputSchema = z.object({ workspace_id: WorkspaceIdSchema }).passthrough();

type SessionCommandKind = "wake" | "interrupt" | "pause" | "resume";
type TranscriptRouteAction = "delete" | "export";

export class VoiceJarvisService {
  private readonly idempotency: IdempotencyRepository;
  private readonly policies: AudioPolicyRepository;
  private readonly wakeWords: WakeWordRepository;
  private readonly sessions: VoiceSessionRepository;
  private readonly transcripts: VoiceTranscriptRepository;
  private readonly commands: VoiceCommandRepository;

  constructor(private readonly options: VoiceJarvisServiceOptions) {
    this.idempotency = new IdempotencyRepository(options.database);
    this.policies = new AudioPolicyRepository(options.database);
    this.wakeWords = new WakeWordRepository(options.database);
    this.sessions = new VoiceSessionRepository(options.database);
    this.transcripts = new VoiceTranscriptRepository(options.database);
    this.commands = new VoiceCommandRepository(options.database);
  }

  listSessions(workspaceId: string): readonly VoiceSessionDescriptor[] {
    return this.sessions.list(WorkspaceIdSchema.parse(workspaceId));
  }

  getSessionDetail(workspaceId: string, sessionId: string): VoiceJarvisSessionDetail {
    const session = this.requireSession(workspaceId, sessionId);
    return {
      voice_session: session,
      audio_policy: this.policies.get(session.workspace_id, session.audio_policy_id) ?? null,
      wake_word: session.wake_word_id === null ? null : this.wakeWords.get(session.workspace_id, session.wake_word_id) ?? null,
      transcripts: this.transcripts.listBySession(session.workspace_id, session.id),
      commands: this.commands.listBySession(session.workspace_id, session.id),
    };
  }

  getTranscript(workspaceId: string, transcriptId: string): TranscriptDescriptor {
    const transcript = this.transcripts.get(WorkspaceIdSchema.parse(workspaceId), transcriptId);
    if (transcript === undefined) throw notFound();
    return transcript;
  }

  getCommand(workspaceId: string, commandId: string): VoiceCommand {
    const command = this.commands.get(WorkspaceIdSchema.parse(workspaceId), commandId);
    if (command === undefined) throw notFound();
    return command;
  }

  registerSession(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const workspaceId = this.requireAdminForInput(input, actor);
    const session = VoiceSessionDescriptorSchema.parse(fillMissingTimestamps(input, now));
    if (session.workspace_id !== workspaceId) throw invalidScope();
    if (!isInitialVoiceSession(session)) throw invalidInitialSession();
    return withTransaction(this.options.database, () => {
      const reservation = this.idempotency.reserveOrGet({ workspace_id: session.workspace_id, idempotency_key: idempotencyKey, request_hash: requestHash(stripMetadataTimestamps(session)), resource_type: "voice_session", resource_id: session.id, created_at: now });
      if (reservation.kind === "existing") {
        requireIdempotentResource(reservation.record, "voice_session", session.id);
        return accepted({ command_id: idempotencyKey, object_type: "voice_session", object_id: reservation.record.resource_id, workspace_id: session.workspace_id });
      }
      this.ensureAudioPolicy(session.workspace_id, session.audio_policy_id, now);
      this.ensureWakeWord(session.workspace_id, session.wake_word_id, now);
      this.sessions.create(session);
      return accepted({ command_id: idempotencyKey, object_type: "voice_session", object_id: session.id, workspace_id: session.workspace_id });
    });
  }

  recordTranscript(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const workspaceId = this.requireAdminForInput(input, actor);
    const transcript = TranscriptDescriptorSchema.parse(fillMissingTimestamps(input, now));
    if (transcript.workspace_id !== workspaceId) throw invalidScope();
    if (transcript.lifecycle_status !== "retained") throw invalidTranscriptLifecycle();
    return withTransaction(this.options.database, () => {
      const reservation = this.idempotency.reserveOrGet({ workspace_id: transcript.workspace_id, idempotency_key: idempotencyKey, request_hash: requestHash(stripMetadataTimestamps(transcript)), resource_type: "voice_transcript", resource_id: transcript.id, created_at: now });
      if (reservation.kind === "existing") {
        requireIdempotentResource(reservation.record, "voice_transcript", transcript.id);
        return accepted({ command_id: idempotencyKey, object_type: "voice_transcript", object_id: reservation.record.resource_id, workspace_id: transcript.workspace_id });
      }
      this.transcripts.record(transcript);
      return accepted({ command_id: idempotencyKey, object_type: "voice_transcript", object_id: transcript.id, workspace_id: transcript.workspace_id });
    });
  }

  commandSession(input: unknown, sessionId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number, kind: SessionCommandKind): AcceptedCommand {
    const workspaceId = this.requireAdminForInput(input, actor);
    const body = SessionCommandInputSchema.parse(input);
    if (body.kind !== kind || body.workspace_id !== workspaceId) throw invalidScope();
    return withTransaction(this.options.database, () => {
      const session = this.requireSession(body.workspace_id, sessionId);
      if (session.run_id !== body.run_id) throw invalidScope();
      const requestDigest = requestHash({ ...body, session_id: sessionId, expected_version: expectedVersion });
      const existingReservation = this.idempotency.get(body.workspace_id, idempotencyKey);
      if (existingReservation !== undefined) {
        if (existingReservation.request_hash !== requestDigest || existingReservation.resource_type !== "voice_command") throw idempotencyConflict();
        if (this.commands.get(body.workspace_id, existingReservation.resource_id) === undefined) throw idempotencyConflict();
        return accepted({ command_id: idempotencyKey, object_type: "voice_command", object_id: existingReservation.resource_id, workspace_id: body.workspace_id });
      }
      if (session.revision !== expectedVersion) throw versionConflict();
      const nextStatus = statusAfterSessionCommand(session.status, kind);
      if (!canTransitionVoiceSession(session.status, nextStatus)) throw invalidState();
      const resourceId = this.options.idFactory();
      const reservation = this.idempotency.reserveOrGet({ workspace_id: body.workspace_id, idempotency_key: idempotencyKey, request_hash: requestDigest, resource_type: "voice_command", resource_id: resourceId, created_at: this.now() });
      const command = VoiceCommandSchema.parse({ ...body, command_id: reservation.record.resource_id, voice_session_id: sessionId, idempotency_key: idempotencyKey, expected_revision: expectedVersion, transcript_id: null, reason: body.reason ?? null, created_at: this.now() });
      this.commands.record(command);
      const updated = VoiceSessionDescriptorSchema.parse({
        ...session,
        status: nextStatus,
        turn_count: kind === "wake" ? session.turn_count + 1 : session.turn_count,
        interrupted_at: nextStatus === "interrupted" ? this.now() : null,
        updated_at: this.now(),
      });
      this.sessions.update(updated, expectedVersion);
      return accepted({ command_id: idempotencyKey, object_type: "voice_command", object_id: command.command_id, workspace_id: command.workspace_id });
    });
  }

  commandTranscript(input: unknown, transcriptId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number, action: TranscriptRouteAction): AcceptedCommand {
    const workspaceId = this.requireAdminForInput(input, actor);
    const body = TranscriptCommandInputSchema.parse(input);
    const kind = action === "delete" ? "delete_transcript" : "export_transcript";
    if (body.kind !== kind || body.workspace_id !== workspaceId) throw invalidScope();
    return withTransaction(this.options.database, () => {
      const session = this.requireSession(body.workspace_id, body.voice_session_id);
      if (session.run_id !== body.run_id) throw invalidScope();
      const requestDigest = requestHash({ ...body, transcript_id: transcriptId, expected_version: expectedVersion });
      const existingReservation = this.idempotency.get(body.workspace_id, idempotencyKey);
      if (existingReservation !== undefined) {
        if (existingReservation.request_hash !== requestDigest || existingReservation.resource_type !== "voice_command") throw idempotencyConflict();
        if (this.commands.get(body.workspace_id, existingReservation.resource_id) === undefined) throw idempotencyConflict();
        return accepted({ command_id: idempotencyKey, object_type: "voice_command", object_id: existingReservation.resource_id, workspace_id: body.workspace_id });
      }
      if (session.revision !== expectedVersion) throw versionConflict();
      const resourceId = this.options.idFactory();
      const reservation = this.idempotency.reserveOrGet({ workspace_id: body.workspace_id, idempotency_key: idempotencyKey, request_hash: requestDigest, resource_type: "voice_command", resource_id: resourceId, created_at: this.now() });
      const command = VoiceCommandSchema.parse({ ...body, command_id: reservation.record.resource_id, idempotency_key: idempotencyKey, expected_revision: expectedVersion, transcript_id: transcriptId, reason: body.reason ?? null, created_at: this.now() });
      this.commands.record(command);
      return accepted({ command_id: idempotencyKey, object_type: "voice_command", object_id: command.command_id, workspace_id: command.workspace_id });
    });
  }

  private ensureAudioPolicy(workspaceId: string, policyId: string, now: string): void {
    if (this.policies.get(workspaceId, policyId) !== undefined) return;
    this.policies.create(AudioPolicySchema.parse({
      id: policyId,
      workspace_id: workspaceId,
      schema_version: 1,
      created_at: now,
      updated_at: now,
      revision: 1,
      name: "Voice/Jarvis default descriptor-only audio policy",
      microphone_mode: "disabled",
      speaker_mode: "disabled",
      vad_mode: "descriptor_only",
      stt_mode: "descriptor_only",
      tts_mode: "descriptor_only",
      wake_word_mode: "consent_required",
      wall_mode: "descriptor_only",
      retention: { transcript_retention_days: 30, audio_retention_days: 0, deletion_allowed: true, export_allowed: true, voiceprint_storage: "disabled" },
      descriptor_only: true,
    }));
  }

  private ensureWakeWord(workspaceId: string, wakeWordId: string | null, now: string): void {
    if (wakeWordId === null || this.wakeWords.get(workspaceId, wakeWordId) !== undefined) return;
    this.wakeWords.create(WakeWordDescriptorSchema.parse({
      id: wakeWordId,
      workspace_id: workspaceId,
      schema_version: 1,
      created_at: now,
      updated_at: now,
      revision: 1,
      phrase: "jarvis",
      locale: "en-US",
      sensitivity: 0.65,
      consent_required: true,
      local_only: true,
      descriptor_only: true,
    }));
  }

  private requireSession(workspaceId: string, sessionId: string): VoiceSessionDescriptor {
    const session = this.sessions.get(WorkspaceIdSchema.parse(workspaceId), sessionId);
    if (session === undefined) throw notFound();
    return session;
  }

  private requireAdmin(actor: PolicyActor, workspaceId: string): void {
    const decision = assertScope({ actor, action: "workspace:admin", enforcement_point: "api", requested_scope: { kind: "workspace", id: WorkspaceIdSchema.parse(workspaceId) } });
    if (!decision.allowed) throw new ApiHttpError({ status_code: 403, code: decision.code, message: decision.reason, retryable: false, required_action: decision.required_action });
  }

  private requireAdminForInput(input: unknown, actor: PolicyActor): string {
    const workspaceId = WorkspaceOnlyInputSchema.parse(input).workspace_id;
    this.requireAdmin(actor, workspaceId);
    return workspaceId;
  }

  private now(): string { return this.options.clock.now(); }
}

function fillMissingTimestamps(input: unknown, timestamp: string): unknown {
  const object = z.record(z.string(), z.unknown()).parse(input);
  return { ...object, created_at: object["created_at"] ?? timestamp, updated_at: object["updated_at"] ?? timestamp };
}

function stripMetadataTimestamps<TRecord extends { readonly created_at: string; readonly updated_at: string }>(record: TRecord): Omit<TRecord, "created_at" | "updated_at"> {
  const { created_at: _createdAt, updated_at: _updatedAt, ...stable } = record;
  void _createdAt;
  void _updatedAt;
  return stable;
}

function statusAfterSessionCommand(current: VoiceSessionDescriptor["status"], kind: SessionCommandKind): VoiceSessionDescriptor["status"] {
  if (kind === "wake" || kind === "resume") return "active";
  if (kind === "pause") return "paused";
  if (kind === "interrupt") return "interrupted";
  return current;
}

function isInitialVoiceSession(session: VoiceSessionDescriptor): boolean {
  return session.status === "idle" && session.turn_count === 0 && session.current_transcript_id === null && session.interrupted_at === null;
}

function requireIdempotentResource(record: IdempotencyRecord, resourceType: string, resourceId: string): void {
  if (record.resource_type !== resourceType || record.resource_id !== resourceId) throw idempotencyConflict();
}

function notFound(): ApiHttpError { return new ApiHttpError({ status_code: 404, code: "SCOPE_DENIED", message: "Resource not found", retryable: false, required_action: "check_scope" }); }
function invalidScope(): ApiHttpError { return new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Request scope does not match voice resource", retryable: false, required_action: "correct_request" }); }
function versionConflict(): ApiHttpError { return new ApiHttpError({ status_code: 409, code: "VERSION_CONFLICT", message: "Voice/Jarvis revision is stale", retryable: true, required_action: "refresh_state" }); }
function idempotencyConflict(): ApiHttpError { return new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency key was reused with a different voice request", retryable: false, required_action: "use_new_idempotency_key" }); }
function invalidState(): ApiHttpError { return new ApiHttpError({ status_code: 409, code: "INVALID_STATE_TRANSITION", message: "Voice/Jarvis session state does not allow this command", retryable: false, required_action: "refresh_state" }); }
function invalidTranscriptLifecycle(): ApiHttpError { return new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Initial Voice/Jarvis transcript lifecycle must be retained", retryable: false, required_action: "correct_request" }); }
function invalidInitialSession(): ApiHttpError { return new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Initial Voice/Jarvis sessions must be idle with zero turns and no current transcript", retryable: false, required_action: "correct_request" }); }
