import { describe, expect, it } from "vitest";
import { z } from "zod";
import { VoiceSessionDescriptorSchema } from "@nexora/contracts";
import type { SqliteDatabase } from "@nexora/persistence";
import { createLocalBearerToken } from "../plugins/auth.js";
import { requestHash } from "../services/command-helpers.js";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, seedRun, TIME, TOKEN_SECRET } from "./test-fixtures.js";

const VOICE_SESSION_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const TRANSCRIPT_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";

const AcceptedCommandSchema = z.object({ schema_version: z.literal(1), command_id: z.string(), status: z.literal("accepted"), object_type: z.string(), object_id: z.string(), status_url: z.string() }).passthrough();
const ErrorSchema = z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), required_action: z.string() }).passthrough();

describe("C24 Voice/Jarvis API", () => {
  it("Given voice session descriptor When owner posts it twice Then the API accepts idempotent descriptor-only setup", async () => {
    const fixture = createControlFixture([IDS.event1, IDS.event2]);
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture.database);
      const first = await fixture.api.inject({ method: "POST", url: "/v1/voice-sessions", headers: commandHeaders("voice:session:c24"), payload: voiceSession() });
      const replay = await fixture.api.inject({ method: "POST", url: "/v1/voice-sessions", headers: commandHeaders("voice:session:c24"), payload: voiceSession() });
      const viewer = await fixture.api.inject({ method: "POST", url: "/v1/voice-sessions", headers: { authorization: viewerHeader(), "idempotency-key": "voice:session:viewer" }, payload: voiceSession() });
      const list = await fixture.api.inject({ method: "GET", url: `/v1/voice-sessions?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/voice-sessions/${VOICE_SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });

      expect(first.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(replay.json())).toEqual(AcceptedCommandSchema.parse(first.json()));
      expect(viewer.statusCode).toBe(403);
      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject({ schema_version: 1, sessions: [expect.objectContaining({ id: VOICE_SESSION_ID, descriptor_only: true })] });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ voice_session: { id: VOICE_SESSION_ID, mode: "wall", descriptor_only: true }, audio_policy: { microphone_mode: "disabled" }, wake_word: { phrase: "jarvis" } });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given transcript and control commands When posted Then If-Match idempotency and append-only command facts are preserved", async () => {
    const fixture = createControlFixture([IDS.event1, IDS.event2, IDS.otherStep, IDS.lease, "01SRZ3NDEKTSV4RRFFQ69S5FAV"]);
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture.database);
      await fixture.api.inject({ method: "POST", url: "/v1/voice-sessions", headers: commandHeaders("voice:session:commands"), payload: voiceSession() });
      const transcript = await fixture.api.inject({ method: "POST", url: "/v1/voice-transcripts", headers: commandHeaders("voice:transcript:c24"), payload: transcriptPayload() });
      const wake = await fixture.api.inject({ method: "POST", url: `/v1/voice-sessions/${VOICE_SESSION_ID}/wake`, headers: commandHeaders("voice:wake:c24", "1"), payload: sessionCommand("wake") });
      const interrupt = await fixture.api.inject({ method: "POST", url: `/v1/voice-sessions/${VOICE_SESSION_ID}/interrupt`, headers: commandHeaders("voice:interrupt:c24", "2"), payload: sessionCommand("interrupt") });
      const stalePause = await fixture.api.inject({ method: "POST", url: `/v1/voice-sessions/${VOICE_SESSION_ID}/pause`, headers: commandHeaders("voice:pause:stale", "2"), payload: sessionCommand("pause") });
      const deletion = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: `/v1/voice-transcripts/${TRANSCRIPT_ID}/delete`, headers: commandHeaders("voice:delete:c24", "3"), payload: transcriptCommand("delete_transcript") })).json());
      const deletionReplay = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: `/v1/voice-transcripts/${TRANSCRIPT_ID}/delete`, headers: commandHeaders("voice:delete:c24", "3"), payload: transcriptCommand("delete_transcript") })).json());
      const resume = await fixture.api.inject({ method: "POST", url: `/v1/voice-sessions/${VOICE_SESSION_ID}/resume`, headers: commandHeaders("voice:resume:c24", "3"), payload: sessionCommand("resume") });
      const deletionLateReplay = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: `/v1/voice-transcripts/${TRANSCRIPT_ID}/delete`, headers: commandHeaders("voice:delete:c24", "3"), payload: transcriptCommand("delete_transcript") })).json());
      const conflictingExport = await fixture.api.inject({ method: "POST", url: `/v1/voice-transcripts/${TRANSCRIPT_ID}/export`, headers: commandHeaders("voice:export:conflict", "4"), payload: transcriptCommand("export_transcript") });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/voice-sessions/${VOICE_SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });

      expect(transcript.statusCode).toBe(202);
      expect(wake.statusCode).toBe(202);
      expect(interrupt.statusCode).toBe(202);
      expect(stalePause.statusCode).toBe(409);
      expect(resume.statusCode).toBe(202);
      expect(conflictingExport.statusCode).toBe(409);
      expect(deletionReplay).toEqual(deletion);
      expect(deletionLateReplay).toEqual(deletion);
      expect(detail.json()).toMatchObject({ voice_session: { status: "active", revision: 4 }, transcripts: [expect.objectContaining({ id: TRANSCRIPT_ID, audio_ref: null, lifecycle_status: "delete_requested" })], commands: expect.arrayContaining([expect.objectContaining({ kind: "wake" }), expect.objectContaining({ kind: "interrupt" }), expect.objectContaining({ kind: "delete_transcript" }), expect.objectContaining({ kind: "resume" })]) });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given unsafe voice input or non-admin caller When posted Then errors do not leak secrets", async () => {
    const fixture = createControlFixture();
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture.database);
      const unsafeSession = await fixture.api.inject({ method: "POST", url: "/v1/voice-sessions", headers: commandHeaders("voice:session:secret"), payload: { ...voiceSession(), name: "secret://voice/live-token" } });
      const unsafeTranscript = await fixture.api.inject({ method: "POST", url: "/v1/voice-transcripts", headers: commandHeaders("voice:transcript:secret"), payload: { ...transcriptPayload(), transcript_ref: "artifact://transcripts/c24/token%3Dabcd1234.json" } });
      const unsafeCurrentTranscript = await fixture.api.inject({ method: "POST", url: "/v1/voice-sessions", headers: commandHeaders("voice:session:current-transcript"), payload: { ...voiceSession(), current_transcript_id: TRANSCRIPT_ID } });
      const viewerDenied = await fixture.api.inject({ method: "POST", url: "/v1/voice-sessions", headers: { authorization: viewerHeader(), "idempotency-key": "voice:viewer:c24" }, payload: { ...voiceSession(), name: "secret://voice/live-token" } });

      expect(unsafeSession.statusCode).toBe(400);
      expect(unsafeTranscript.statusCode).toBe(400);
      expect(unsafeCurrentTranscript.statusCode).toBe(400);
      expect(viewerDenied.statusCode).toBe(403);
      expect(ErrorSchema.parse(viewerDenied.json())).toMatchObject({ code: "SCOPE_DENIED" });
      expect(JSON.stringify([unsafeSession.json(), unsafeTranscript.json(), unsafeCurrentTranscript.json(), viewerDenied.json()])).not.toContain("live-token");
      expect(JSON.stringify([unsafeSession.json(), unsafeTranscript.json(), unsafeCurrentTranscript.json(), viewerDenied.json()])).not.toContain("abcd1234");
      expect(JSON.stringify([unsafeSession.json(), unsafeTranscript.json(), unsafeCurrentTranscript.json(), viewerDenied.json()])).not.toContain("secret://");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an existing idempotency reservation When type or resource differs Then session registration rejects replay", async () => {
    const fixture = createControlFixture();
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture.database);
      insertIdempotencyReservation(fixture.database, "voice:session:wrong-type", "voice_transcript", TRANSCRIPT_ID);
      insertIdempotencyReservation(fixture.database, "voice:session:wrong-id", "voice_session", TRANSCRIPT_ID);

      const wrongType = await fixture.api.inject({ method: "POST", url: "/v1/voice-sessions", headers: commandHeaders("voice:session:wrong-type"), payload: voiceSession() });
      const wrongId = await fixture.api.inject({ method: "POST", url: "/v1/voice-sessions", headers: commandHeaders("voice:session:wrong-id"), payload: voiceSession() });

      expect(wrongType.statusCode).toBe(409);
      expect(wrongId.statusCode).toBe(409);
      expect(ErrorSchema.parse(wrongType.json())).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
      expect(ErrorSchema.parse(wrongId.json())).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    } finally {
      await closeControlFixture(fixture);
    }
  });
});

function commandHeaders(idempotencyKey: string, ifMatch?: string): Record<string, string> {
  return ifMatch === undefined
    ? { authorization: ownerHeader(), "idempotency-key": idempotencyKey, traceparent: IDS.owner }
    : { authorization: ownerHeader(), "idempotency-key": idempotencyKey, "if-match": ifMatch, traceparent: IDS.owner };
}

function viewerHeader(): string {
  return createLocalBearerToken({ workspace_id: IDS.workspace, actor_id: IDS.owner, role: "Viewer", tokenSecret: TOKEN_SECRET });
}

function seedGatewaySession(database: SqliteDatabase): void {
  database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES ('gateway-c24-voice', ?, 'Gateway C24 Voice', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME, TIME);
  database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES ('channel-c24-voice', ?, 'gateway-c24-voice', 'Channel C24 Voice', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'gateway-c24-voice', 'channel-c24-voice', NULL, ?, NULL, 'foreground', 'active', 'turn-1', NULL, ?, '{}', 1, ?, ?)").run(IDS.event0, IDS.workspace, IDS.run, TIME, TIME, TIME);
}

function voiceSession(): object {
  return { id: VOICE_SESSION_ID, workspace_id: IDS.workspace, schema_version: 1, revision: 1, run_id: IDS.run, gateway_session_id: IDS.event0, audio_policy_id: "voice-policy-c24-jarvis", wake_word_id: "wake-word-c24-jarvis", name: "Jarvis wall mode control session", mode: "wall", status: "idle", locale: "en-US", turn_count: 0, interaction_budget: { max_turns: 12, max_transcript_chars: 20_000 }, deadline_at: "2026-09-03T05:00:00.000Z", input_audio_ref: null, output_audio_ref: null, current_transcript_id: null, interrupted_at: null, descriptor_only: true };
}

function transcriptPayload(): object {
  return { id: TRANSCRIPT_ID, workspace_id: IDS.workspace, schema_version: 1, voice_session_id: VOICE_SESSION_ID, run_id: IDS.run, source_kind: "stt_descriptor", transcript_ref: "artifact://transcripts/c24/jarvis-turn-1.json", transcript_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", audio_ref: null, redacted: true, lifecycle_status: "retained", expires_at: "2026-10-03T04:00:00.000Z", deleted_at: null, export_ref: null, descriptor_only: true };
}

function sessionCommand(kind: "interrupt" | "pause" | "resume" | "wake"): object {
  return { schema_version: 1, workspace_id: IDS.workspace, run_id: IDS.run, kind, reason: `Operator requested ${kind}.`, descriptor_only: true };
}

function transcriptCommand(kind: "delete_transcript" | "export_transcript"): object {
  return { schema_version: 1, workspace_id: IDS.workspace, voice_session_id: VOICE_SESSION_ID, run_id: IDS.run, kind, reason: `Operator requested ${kind}.`, descriptor_only: true };
}

function insertIdempotencyReservation(database: SqliteDatabase, idempotencyKey: string, resourceType: string, resourceId: string): void {
  const parsedSession = VoiceSessionDescriptorSchema.parse({ ...voiceSession(), created_at: TIME, updated_at: TIME });
  const { created_at: _createdAt, updated_at: _updatedAt, ...stableSession } = parsedSession;
  void _createdAt;
  void _updatedAt;
  database.prepare("INSERT INTO idempotency_records(workspace_id, idempotency_key, request_hash, resource_type, resource_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(IDS.workspace, idempotencyKey, requestHash(stableSession), resourceType, resourceId, TIME);
}
