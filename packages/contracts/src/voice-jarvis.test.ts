import { describe, expect, it } from "vitest";
import {
  AudioPolicySchema,
  TranscriptDescriptorSchema,
  VoiceCommandSchema,
  VoiceSessionDescriptorSchema,
  WakeWordDescriptorSchema,
  canApplyTranscriptLifecycleCommand,
  canTransitionVoiceSession,
} from "./voice-jarvis.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  gatewaySession: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  voiceSession: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  transcript: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  command: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  policy: "voice-policy-c24-jarvis",
  wakeWord: "wake-word-c24-jarvis",
};

const TIME = "2026-09-03T04:00:00.000Z";
const LATER = "2026-09-03T04:05:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const meta = { workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME };
const DEADLINE = "2026-09-03T05:00:00.000Z";

const retentionPolicy = {
  transcript_retention_days: 30,
  audio_retention_days: 0,
  deletion_allowed: true,
  export_allowed: true,
  voiceprint_storage: "disabled",
};

const audioPolicy = {
  id: IDS.policy,
  ...meta,
  revision: 1,
  name: "C24 Jarvis descriptor-only audio policy",
  microphone_mode: "disabled",
  speaker_mode: "disabled",
  vad_mode: "descriptor_only",
  stt_mode: "descriptor_only",
  tts_mode: "descriptor_only",
  wake_word_mode: "consent_required",
  wall_mode: "descriptor_only",
  retention: retentionPolicy,
  descriptor_only: true,
};

const wakeWord = {
  id: IDS.wakeWord,
  ...meta,
  revision: 1,
  phrase: "jarvis",
  locale: "en-US",
  sensitivity: 0.65,
  consent_required: true,
  local_only: true,
  descriptor_only: true,
};

const voiceSession = {
  id: IDS.voiceSession,
  ...meta,
  revision: 1,
  run_id: IDS.run,
  gateway_session_id: IDS.gatewaySession,
  audio_policy_id: IDS.policy,
  wake_word_id: IDS.wakeWord,
  name: "Jarvis wall mode control session",
  mode: "wall",
  status: "idle",
  locale: "en-US",
  turn_count: 0,
  interaction_budget: { max_turns: 12, max_transcript_chars: 20_000 },
  deadline_at: DEADLINE,
  input_audio_ref: null,
  output_audio_ref: null,
  current_transcript_id: null,
  interrupted_at: null,
  descriptor_only: true,
};

const transcript = {
  id: IDS.transcript,
  ...meta,
  voice_session_id: IDS.voiceSession,
  run_id: IDS.run,
  source_kind: "stt_descriptor",
  transcript_ref: "artifact://transcripts/c24/jarvis-turn-1.json",
  transcript_hash: HASH,
  audio_ref: null,
  redacted: true,
  lifecycle_status: "retained",
  expires_at: "2026-10-03T04:00:00.000Z",
  deleted_at: null,
  export_ref: null,
  descriptor_only: true,
};

const command = {
  schema_version: 1,
  command_id: IDS.command,
  workspace_id: IDS.workspace,
  voice_session_id: IDS.voiceSession,
  run_id: IDS.run,
  kind: "interrupt",
  idempotency_key: "voice:interrupt:c24",
  expected_revision: 1,
  transcript_id: null,
  reason: "Operator interrupted a descriptor-only Jarvis turn.",
  descriptor_only: true,
  created_at: TIME,
};

describe("C24 Voice/Jarvis contracts", () => {
  it("Given voice descriptors When parsed Then audio input output provider and voiceprint side effects are disabled", () => {
    expect(AudioPolicySchema.parse(audioPolicy)).toMatchObject({
      microphone_mode: "disabled",
      speaker_mode: "disabled",
      stt_mode: "descriptor_only",
      tts_mode: "descriptor_only",
      retention: { audio_retention_days: 0, voiceprint_storage: "disabled" },
      descriptor_only: true,
    });
    expect(WakeWordDescriptorSchema.parse(wakeWord)).toMatchObject({ phrase: "jarvis", consent_required: true, local_only: true });
    expect(VoiceSessionDescriptorSchema.parse(voiceSession)).toMatchObject({ mode: "wall", status: "idle", turn_count: 0, interaction_budget: { max_turns: 12 }, deadline_at: DEADLINE, input_audio_ref: null, output_audio_ref: null });
    expect(AudioPolicySchema.safeParse({ ...audioPolicy, microphone_mode: "enabled" }).success).toBe(false);
    expect(AudioPolicySchema.safeParse({ ...audioPolicy, tts_mode: "provider_live" }).success).toBe(false);
    expect(AudioPolicySchema.safeParse({ ...audioPolicy, voice_provider_ref: "secret://voice/live-token" }).success).toBe(false);
    expect(VoiceSessionDescriptorSchema.safeParse({ ...voiceSession, input_audio_ref: "file:///Users/zq/private.wav" }).success).toBe(false);
  });

  it("Given malformed descriptors When parsed Then unknown fields unsafe refs and secret-shaped text are rejected", () => {
    expect(VoiceSessionDescriptorSchema.safeParse({ ...voiceSession, unknown: "field" }).success).toBe(false);
    expect(VoiceSessionDescriptorSchema.safeParse({ ...voiceSession, turn_count: 13 }).success).toBe(false);
    expect(WakeWordDescriptorSchema.safeParse({ ...wakeWord, phrase: "jarvis token=abcd1234" }).success).toBe(false);
    expect(AudioPolicySchema.safeParse({ ...audioPolicy, name: "Use secret://voice/provider" }).success).toBe(false);
    expect(TranscriptDescriptorSchema.safeParse({ ...transcript, transcript_ref: "artifact://transcripts/c24/../raw.json" }).success).toBe(false);
    expect(VoiceCommandSchema.safeParse({ ...command, reason: "Use xoxb-123-456-secret" }).success).toBe(false);
  });

  it("Given wake word and wall mode descriptors When parsed Then consent and descriptor-only boundaries are explicit", () => {
    expect(WakeWordDescriptorSchema.safeParse({ ...wakeWord, consent_required: false }).success).toBe(false);
    expect(WakeWordDescriptorSchema.safeParse({ ...wakeWord, local_only: false }).success).toBe(false);
    expect(VoiceSessionDescriptorSchema.safeParse({ ...voiceSession, mode: "wall", wake_word_id: null }).success).toBe(false);
    expect(VoiceSessionDescriptorSchema.safeParse({ ...voiceSession, mode: "conversation", wake_word_id: null }).success).toBe(true);
    expect(VoiceSessionDescriptorSchema.safeParse({ ...voiceSession, descriptor_only: false }).success).toBe(false);
  });

  it("Given transcript descriptors When parsed Then retention deletion and export lifecycle are auditable without raw audio", () => {
    expect(TranscriptDescriptorSchema.parse(transcript)).toMatchObject({ audio_ref: null, redacted: true, lifecycle_status: "retained" });
    expect(TranscriptDescriptorSchema.safeParse({ ...transcript, audio_ref: "artifact://audio/c24/raw.wav" }).success).toBe(false);
    expect(TranscriptDescriptorSchema.safeParse({ ...transcript, redacted: false }).success).toBe(false);
    expect(TranscriptDescriptorSchema.safeParse({ ...transcript, lifecycle_status: "deleted", deleted_at: null }).success).toBe(false);
    expect(TranscriptDescriptorSchema.safeParse({ ...transcript, lifecycle_status: "exported", export_ref: null }).success).toBe(false);
    expect(TranscriptDescriptorSchema.safeParse({ ...transcript, lifecycle_status: "exported", export_ref: "artifact://exports/c24/transcript.json", updated_at: LATER }).success).toBe(true);
  });

  it("Given voice commands When parsed Then interrupt pause resume delete and export stay descriptor-only and revision gated", () => {
    expect(VoiceCommandSchema.parse(command)).toMatchObject({ kind: "interrupt", descriptor_only: true, expected_revision: 1 });
    expect(VoiceCommandSchema.safeParse({ ...command, kind: "pause", transcript_id: IDS.transcript }).success).toBe(false);
    expect(VoiceCommandSchema.safeParse({ ...command, kind: "delete_transcript", transcript_id: null }).success).toBe(false);
    expect(VoiceCommandSchema.safeParse({ ...command, kind: "export_transcript", transcript_id: null }).success).toBe(false);
    expect(VoiceCommandSchema.safeParse({ ...command, kind: "delete_transcript", transcript_id: IDS.transcript }).success).toBe(true);
    expect(VoiceCommandSchema.safeParse({ ...command, kind: "export_transcript", transcript_id: IDS.transcript }).success).toBe(true);
    expect(VoiceCommandSchema.safeParse({ ...command, kind: "resume", expected_revision: 0 }).success).toBe(false);
  });

  it("Given voice session states When transitioning Then realtime interrupt pause resume and terminal boundaries are enforced", () => {
    expect(canTransitionVoiceSession("idle", "active")).toBe(true);
    expect(canTransitionVoiceSession("active", "interrupted")).toBe(true);
    expect(canTransitionVoiceSession("interrupted", "active")).toBe(true);
    expect(canTransitionVoiceSession("active", "paused")).toBe(true);
    expect(canTransitionVoiceSession("paused", "idle")).toBe(true);
    expect(canTransitionVoiceSession("idle", "stopped")).toBe(true);
    expect(canTransitionVoiceSession("stopped", "active")).toBe(false);
    expect(canTransitionVoiceSession("error", "active")).toBe(false);
  });

  it("Given transcript lifecycle commands When evaluated Then policy controls delete and export availability", () => {
    const parsedPolicy = AudioPolicySchema.parse(audioPolicy);
    const parsedTranscript = TranscriptDescriptorSchema.parse(transcript);
    const deleteCommand = VoiceCommandSchema.parse({ ...command, kind: "delete_transcript", transcript_id: IDS.transcript });
    const exportCommand = VoiceCommandSchema.parse({ ...command, kind: "export_transcript", transcript_id: IDS.transcript });
    const noDeletePolicy = AudioPolicySchema.parse({ ...audioPolicy, retention: { ...retentionPolicy, deletion_allowed: false } });
    const noExportPolicy = AudioPolicySchema.parse({ ...audioPolicy, retention: { ...retentionPolicy, export_allowed: false } });

    expect(canApplyTranscriptLifecycleCommand(deleteCommand, parsedTranscript, parsedPolicy)).toEqual({ allowed: true, code: "TRANSCRIPT_DELETE_ALLOWED" });
    expect(canApplyTranscriptLifecycleCommand(exportCommand, parsedTranscript, parsedPolicy)).toEqual({ allowed: true, code: "TRANSCRIPT_EXPORT_ALLOWED" });
    expect(canApplyTranscriptLifecycleCommand(deleteCommand, parsedTranscript, noDeletePolicy)).toEqual({ allowed: false, code: "TRANSCRIPT_DELETE_DISABLED" });
    expect(canApplyTranscriptLifecycleCommand(exportCommand, parsedTranscript, noExportPolicy)).toEqual({ allowed: false, code: "TRANSCRIPT_EXPORT_DISABLED" });
    const mismatchedTranscript = TranscriptDescriptorSchema.parse({ ...transcript, workspace_id: IDS.run });
    expect(canApplyTranscriptLifecycleCommand(deleteCommand, mismatchedTranscript, parsedPolicy)).toEqual({ allowed: false, code: "TRANSCRIPT_SCOPE_MISMATCH" });
    const requestedTranscript = TranscriptDescriptorSchema.parse({ ...transcript, lifecycle_status: "delete_requested", updated_at: LATER });
    expect(canApplyTranscriptLifecycleCommand(exportCommand, requestedTranscript, parsedPolicy)).toEqual({ allowed: false, code: "TRANSCRIPT_ALREADY_FINAL" });
  });
});
