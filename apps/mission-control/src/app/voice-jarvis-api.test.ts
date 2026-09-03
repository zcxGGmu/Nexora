import { describe, expect, it } from "vitest";
import {
  AudioPolicySchema,
  TranscriptDescriptorSchema,
  VoiceCommandSchema,
  VoiceSessionDescriptorSchema,
  WakeWordDescriptorSchema,
} from "@nexora/contracts";
import {
  buildVoiceJarvisControlView,
  fetchVoiceJarvisProjection,
  resolveVoiceJarvisWorkspace,
  sendTranscriptLifecycleCommand,
  sendVoiceSessionCommand,
  workspaceIdForVoiceJarvisApi,
  type VoiceJarvisCommandWriter,
  type VoiceJarvisPostOptions,
  type VoiceJarvisProjection,
} from "./voice-jarvis-api.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const OTHER_WORKSPACE_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const GATEWAY_SESSION_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const VOICE_SESSION_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const TRANSCRIPT_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const COMMAND_ID = "01GRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-09-04T01:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("C24 Voice/Jarvis API projection", () => {
  it("maps live API descriptors into voice policy wake transcript and command facts", () => {
    const view = buildVoiceJarvisControlView(projection(), WORKSPACE_ID);

    expect(view.workspaceId).toBe(WORKSPACE_ID);
    expect(view.sessions).toEqual([expect.objectContaining({ id: VOICE_SESSION_ID, mode: "wall", status: "active", turnCount: 1, maxTurns: 12 })]);
    expect(view.audio).toMatchObject({ microphoneMode: "disabled", speakerMode: "disabled", sttMode: "descriptor_only", ttsMode: "descriptor_only", voiceprintStorage: "disabled" });
    expect(view.wakeWord).toMatchObject({ phrase: "jarvis", consentRequired: true, localOnly: true });
    expect(view.transcripts).toMatchObject({ total: 1, redacted: 1, retained: 1, audioRefsDisabled: true });
    expect(view.commands).toMatchObject({ total: 1, latestKind: "wake" });
  });

  it("filters cross-workspace details before building the control view", () => {
    const crossWorkspaceSession = voiceSessionForWorkspace(OTHER_WORKSPACE_ID, "01HRZ3NDEKTSV4RRFFQ69H5FAV");
    const view = buildVoiceJarvisControlView({ sessions: [voiceSession(), crossWorkspaceSession], details: [{ ...detail(), voice_session: crossWorkspaceSession }] }, WORKSPACE_ID);

    expect(view.sessions).toEqual([]);
    expect(view.audio.microphoneMode).toBe("disabled");
    expect(view.transcripts.total).toBe(0);
  });

  it("reads the list route then session details from the control API", async () => {
    const requested: string[] = [];
    const read = (path: string): Promise<unknown> => {
      requested.push(path);
      if (path === "/v1/voice-sessions") return Promise.resolve({ schema_version: 1, sessions: [voiceSession()] });
      if (path === `/v1/voice-sessions/${VOICE_SESSION_ID}`) return Promise.resolve(detail());
      throw new Error(`Unexpected path ${path}`);
    };

    const liveProjection = await fetchVoiceJarvisProjection(WORKSPACE_ID, read);

    expect(liveProjection.details).toHaveLength(1);
    expect(requested).toEqual(["/v1/voice-sessions", `/v1/voice-sessions/${VOICE_SESSION_ID}`]);
  });

  it("writes descriptor-only session and transcript lifecycle commands with If-Match", async () => {
    const calls: PostCall[] = [];
    const writer = createWriter(calls);

    await sendVoiceSessionCommand({ workspace_id: WORKSPACE_ID, session_id: VOICE_SESSION_ID, run_id: RUN_ID, kind: "interrupt", expected_revision: 2, reason: "Operator interrupted descriptor-only Jarvis." }, "voice:interrupt:c24", writer);
    await sendTranscriptLifecycleCommand({ workspace_id: WORKSPACE_ID, transcript_id: TRANSCRIPT_ID, voice_session_id: VOICE_SESSION_ID, run_id: RUN_ID, kind: "delete_transcript", expected_revision: 3, reason: "Operator requested descriptor-only transcript deletion." }, "voice:delete:c24", writer);

    expect(calls).toEqual([
      { path: `/v1/voice-sessions/${VOICE_SESSION_ID}/interrupt`, headers: { "Idempotency-Key": "voice:interrupt:c24", "If-Match": "2" }, json: { schema_version: 1, workspace_id: WORKSPACE_ID, run_id: RUN_ID, kind: "interrupt", reason: "Operator interrupted descriptor-only Jarvis.", descriptor_only: true } },
      { path: `/v1/voice-transcripts/${TRANSCRIPT_ID}/delete`, headers: { "Idempotency-Key": "voice:delete:c24", "If-Match": "3" }, json: { schema_version: 1, workspace_id: WORKSPACE_ID, voice_session_id: VOICE_SESSION_ID, run_id: RUN_ID, kind: "delete_transcript", reason: "Operator requested descriptor-only transcript deletion.", descriptor_only: true } },
    ]);
  });

  it("resolves local demo aliases without accepting arbitrary workspace strings", () => {
    expect(workspaceIdForVoiceJarvisApi("ws-demo")).toBe(WORKSPACE_ID);
    expect(workspaceIdForVoiceJarvisApi("ws-a")).toBe(WORKSPACE_ID);
    expect(workspaceIdForVoiceJarvisApi("ws-b")).toBe(OTHER_WORKSPACE_ID);
    expect(resolveVoiceJarvisWorkspace(WORKSPACE_ID)).toEqual({ kind: "resolved", workspace_id: WORKSPACE_ID });
    expect(resolveVoiceJarvisWorkspace("voice-demo")).toEqual({ kind: "invalid", input: "voice-demo" });
  });
});

type PostCall = {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
};

function createWriter(calls: PostCall[]): VoiceJarvisCommandWriter {
  return {
    post: (path: string, options: VoiceJarvisPostOptions): Promise<unknown> => {
      calls.push({ path, headers: options.headers, json: options.json });
      return Promise.resolve({});
    },
  };
}

function projection(): VoiceJarvisProjection {
  return { sessions: [voiceSession()], details: [detail()] };
}

function detail(): VoiceJarvisProjection["details"][number] {
  return {
    schema_version: 1,
    voice_session: voiceSession(),
    audio_policy: audioPolicy(),
    wake_word: wakeWord(),
    transcripts: [transcript()],
    commands: [command()],
  };
}

function voiceSession(): VoiceJarvisProjection["sessions"][number] {
  return voiceSessionForWorkspace(WORKSPACE_ID, VOICE_SESSION_ID);
}

function voiceSessionForWorkspace(workspaceId: string, sessionId: string): VoiceJarvisProjection["sessions"][number] {
  return VoiceSessionDescriptorSchema.parse({ id: sessionId, workspace_id: workspaceId, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 2, run_id: RUN_ID, gateway_session_id: GATEWAY_SESSION_ID, audio_policy_id: "voice-policy-c24-jarvis", wake_word_id: "wake-word-c24-jarvis", name: "Jarvis wall mode control session", mode: "wall", status: "active", locale: "en-US", turn_count: 1, interaction_budget: { max_turns: 12, max_transcript_chars: 20_000 }, deadline_at: "2026-09-04T02:00:00.000Z", input_audio_ref: null, output_audio_ref: null, current_transcript_id: TRANSCRIPT_ID, interrupted_at: null, descriptor_only: true });
}

function audioPolicy(): NonNullable<VoiceJarvisProjection["details"][number]["audio_policy"]> {
  return AudioPolicySchema.parse({ id: "voice-policy-c24-jarvis", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, name: "C24 Jarvis descriptor-only audio policy", microphone_mode: "disabled", speaker_mode: "disabled", vad_mode: "descriptor_only", stt_mode: "descriptor_only", tts_mode: "descriptor_only", wake_word_mode: "consent_required", wall_mode: "descriptor_only", retention: { transcript_retention_days: 30, audio_retention_days: 0, deletion_allowed: true, export_allowed: true, voiceprint_storage: "disabled" }, descriptor_only: true });
}

function wakeWord(): NonNullable<VoiceJarvisProjection["details"][number]["wake_word"]> {
  return WakeWordDescriptorSchema.parse({ id: "wake-word-c24-jarvis", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, phrase: "jarvis", locale: "en-US", sensitivity: 0.65, consent_required: true, local_only: true, descriptor_only: true });
}

function transcript(): VoiceJarvisProjection["details"][number]["transcripts"][number] {
  return TranscriptDescriptorSchema.parse({ id: TRANSCRIPT_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, voice_session_id: VOICE_SESSION_ID, run_id: RUN_ID, source_kind: "stt_descriptor", transcript_ref: "artifact://transcripts/c24/jarvis-turn-1.json", transcript_hash: HASH, audio_ref: null, redacted: true, lifecycle_status: "retained", expires_at: "2026-10-04T01:00:00.000Z", deleted_at: null, export_ref: null, descriptor_only: true });
}

function command(): VoiceJarvisProjection["details"][number]["commands"][number] {
  return VoiceCommandSchema.parse({ schema_version: 1, command_id: COMMAND_ID, workspace_id: WORKSPACE_ID, voice_session_id: VOICE_SESSION_ID, run_id: RUN_ID, kind: "wake", idempotency_key: "voice:wake:c24", expected_revision: 1, transcript_id: null, reason: "Wake Jarvis descriptor-only session.", descriptor_only: true, created_at: TIME });
}
