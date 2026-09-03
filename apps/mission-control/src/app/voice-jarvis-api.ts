import {
  AudioPolicySchema,
  TranscriptDescriptorSchema,
  VoiceCommandSchema,
  VoiceSessionDescriptorSchema,
  WakeWordDescriptorSchema,
  WorkspaceIdSchema,
  z,
  type AudioPolicy,
  type TranscriptDescriptor,
  type VoiceCommand,
  type VoiceSessionDescriptor,
  type VoiceSessionStatus,
  type WakeWordDescriptor,
} from "@nexora/contracts";

import { controlApi, readControlProjection } from "./query-client.js";

const LOCAL_WORKSPACE_ALIASES = {
  "ws-demo": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "ws-a": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "ws-b": "01BRZ3NDEKTSV4RRFFQ69G5FAV",
} as const;

const VoiceSessionListResponseSchema = z.object({
  schema_version: z.literal(1).optional(),
  sessions: z.array(VoiceSessionDescriptorSchema),
}).passthrough();

const VoiceSessionDetailResponseSchema = z.object({
  schema_version: z.literal(1).optional(),
  voice_session: VoiceSessionDescriptorSchema,
  audio_policy: AudioPolicySchema.nullable(),
  wake_word: WakeWordDescriptorSchema.nullable(),
  transcripts: z.array(TranscriptDescriptorSchema),
  commands: z.array(VoiceCommandSchema),
}).passthrough();

export type VoiceJarvisSessionDetail = {
  readonly schema_version: 1;
  readonly voice_session: VoiceSessionDescriptor;
  readonly audio_policy: AudioPolicy | null;
  readonly wake_word: WakeWordDescriptor | null;
  readonly transcripts: readonly TranscriptDescriptor[];
  readonly commands: readonly VoiceCommand[];
};

export type VoiceJarvisProjection = {
  readonly sessions: readonly VoiceSessionDescriptor[];
  readonly details: readonly VoiceJarvisSessionDetail[];
};

export type VoiceJarvisWorkspaceResolution =
  | { readonly kind: "resolved"; readonly workspace_id: string }
  | { readonly kind: "invalid"; readonly input: string };

export type VoiceJarvisProjectionReader = (path: string, workspace: string) => Promise<unknown>;

export type VoiceJarvisPostOptions = {
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
};

export type VoiceJarvisCommandWriter = {
  readonly post: (path: string, options: VoiceJarvisPostOptions) => Promise<unknown>;
};

export type VoiceJarvisSessionCommandKind = "wake" | "interrupt" | "pause" | "resume";
export type VoiceJarvisTranscriptCommandKind = "delete_transcript" | "export_transcript";

export type VoiceJarvisSessionCommandInput = {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly run_id: string;
  readonly kind: VoiceJarvisSessionCommandKind;
  readonly expected_revision: number;
  readonly reason: string;
};

export type VoiceJarvisTranscriptCommandInput = {
  readonly workspace_id: string;
  readonly transcript_id: string;
  readonly voice_session_id: string;
  readonly run_id: string;
  readonly kind: VoiceJarvisTranscriptCommandKind;
  readonly expected_revision: number;
  readonly reason: string;
};

export type VoiceJarvisSessionSummary = {
  readonly id: string;
  readonly name: string;
  readonly mode: VoiceSessionDescriptor["mode"];
  readonly status: VoiceSessionStatus;
  readonly revision: number;
  readonly runId: string;
  readonly gatewaySessionId: string;
  readonly locale: string;
  readonly turnCount: number;
  readonly maxTurns: number;
  readonly maxTranscriptChars: number;
  readonly deadlineAt: string;
  readonly currentTranscriptId: string | null;
};

export type VoiceJarvisTranscriptSummary = {
  readonly id: string;
  readonly sourceKind: TranscriptDescriptor["source_kind"];
  readonly transcriptRef: string;
  readonly transcriptHash: string;
  readonly lifecycleStatus: TranscriptDescriptor["lifecycle_status"];
  readonly expiresAt: string | null;
  readonly deletedAt: string | null;
  readonly exportRef: string | null;
  readonly redacted: true;
  readonly audioRef: null;
};

export type VoiceJarvisCommandSummary = {
  readonly id: string;
  readonly kind: VoiceCommand["kind"];
  readonly expectedRevision: number;
  readonly transcriptId: string | null;
  readonly reason: string | null;
  readonly createdAt: string;
};

export type VoiceJarvisControlView = {
  readonly workspaceId: string;
  readonly sessions: readonly VoiceJarvisSessionSummary[];
  readonly selected: {
    readonly sessionId: string;
    readonly transcriptId: string;
    readonly commandId: string;
  };
  readonly audio: {
    readonly policyId: string;
    readonly name: string;
    readonly microphoneMode: AudioPolicy["microphone_mode"];
    readonly speakerMode: AudioPolicy["speaker_mode"];
    readonly vadMode: AudioPolicy["vad_mode"];
    readonly sttMode: AudioPolicy["stt_mode"];
    readonly ttsMode: AudioPolicy["tts_mode"];
    readonly wakeWordMode: AudioPolicy["wake_word_mode"];
    readonly wallMode: AudioPolicy["wall_mode"];
    readonly transcriptRetentionDays: number;
    readonly audioRetentionDays: 0;
    readonly deletionAllowed: boolean;
    readonly exportAllowed: boolean;
    readonly voiceprintStorage: AudioPolicy["retention"]["voiceprint_storage"];
    readonly descriptorOnly: true;
  };
  readonly wakeWord: {
    readonly id: string;
    readonly phrase: string;
    readonly locale: string;
    readonly sensitivity: number;
    readonly consentRequired: true;
    readonly localOnly: true;
  } | null;
  readonly transcripts: {
    readonly total: number;
    readonly redacted: number;
    readonly retained: number;
    readonly deleteRequested: number;
    readonly exportRequested: number;
    readonly final: number;
    readonly audioRefsDisabled: boolean;
    readonly items: readonly VoiceJarvisTranscriptSummary[];
  };
  readonly commands: {
    readonly total: number;
    readonly latestKind: VoiceCommand["kind"] | "none";
    readonly items: readonly VoiceJarvisCommandSummary[];
  };
};

export async function fetchVoiceJarvisProjection(workspaceId: string, read: VoiceJarvisProjectionReader = readControlProjection): Promise<VoiceJarvisProjection> {
  const list = VoiceSessionListResponseSchema.parse(await read("/v1/voice-sessions", workspaceId));
  const details = await Promise.all(list.sessions.map(async (session) => {
    const detail = VoiceSessionDetailResponseSchema.parse(await read(`/v1/voice-sessions/${encodeURIComponent(session.id)}`, workspaceId));
    const normalized: VoiceJarvisSessionDetail = { ...detail, schema_version: 1 };
    return normalized;
  }));
  return { sessions: list.sessions, details };
}

export function buildVoiceJarvisControlView(projection: VoiceJarvisProjection, workspaceId: string): VoiceJarvisControlView {
  const details = projection.details.filter((detail) => detail.voice_session.workspace_id === workspaceId);
  const selectedDetail = details[0];
  if (selectedDetail === undefined) return emptyVoiceJarvisControlView(workspaceId);
  const transcripts = selectedDetail.transcripts;
  const commands = selectedDetail.commands;
  const selectedTranscript = transcripts[0];
  const selectedCommand = commands[0];
  return {
    workspaceId,
    sessions: details.map((detail) => sessionSummary(detail.voice_session)),
    selected: {
      sessionId: selectedDetail.voice_session.id,
      transcriptId: selectedTranscript?.id ?? "missing-transcript",
      commandId: selectedCommand?.command_id ?? "missing-command",
    },
    audio: audioSummary(selectedDetail.audio_policy),
    wakeWord: wakeWordSummary(selectedDetail.wake_word),
    transcripts: transcriptCollectionSummary(transcripts),
    commands: commandCollectionSummary(commands),
  };
}

export async function sendVoiceSessionCommand(input: VoiceJarvisSessionCommandInput, idempotencyKey: string, writer: VoiceJarvisCommandWriter = controlApi): Promise<void> {
  await writer.post(`/v1/voice-sessions/${encodeURIComponent(input.session_id)}/${input.kind}`, {
    headers: { "Idempotency-Key": idempotencyKey, "If-Match": String(input.expected_revision) },
    json: { schema_version: 1, workspace_id: input.workspace_id, run_id: input.run_id, kind: input.kind, reason: input.reason, descriptor_only: true },
  });
}

export async function sendTranscriptLifecycleCommand(input: VoiceJarvisTranscriptCommandInput, idempotencyKey: string, writer: VoiceJarvisCommandWriter = controlApi): Promise<void> {
  const action = input.kind === "delete_transcript" ? "delete" : "export";
  await writer.post(`/v1/voice-transcripts/${encodeURIComponent(input.transcript_id)}/${action}`, {
    headers: { "Idempotency-Key": idempotencyKey, "If-Match": String(input.expected_revision) },
    json: { schema_version: 1, workspace_id: input.workspace_id, voice_session_id: input.voice_session_id, run_id: input.run_id, kind: input.kind, reason: input.reason, descriptor_only: true },
  });
}

export function workspaceIdForVoiceJarvisApi(workspaceId: string): string {
  const resolution = resolveVoiceJarvisWorkspace(workspaceId);
  switch (resolution.kind) {
    case "resolved":
      return resolution.workspace_id;
    case "invalid":
      throw new Error("Voice/Jarvis workspace must be a workspace ULID or known local demo alias");
    default:
      return assertNever(resolution);
  }
}

export function resolveVoiceJarvisWorkspace(workspaceId: string): VoiceJarvisWorkspaceResolution {
  const alias = demoWorkspaceAlias(workspaceId);
  const parsed = WorkspaceIdSchema.safeParse(alias ?? workspaceId);
  if (!parsed.success) return { kind: "invalid", input: workspaceId };
  return { kind: "resolved", workspace_id: parsed.data };
}

export function shouldUseVoiceJarvisFallback(error: unknown): boolean {
  if (hasHttpStatus(error)) return false;
  return error instanceof TypeError && import.meta.env["VITE_NEXORA_VOICE_JARVIS_OFFLINE_FIXTURE"] === "1";
}

function sessionSummary(session: VoiceSessionDescriptor): VoiceJarvisSessionSummary {
  return {
    id: session.id,
    name: session.name,
    mode: session.mode,
    status: session.status,
    revision: session.revision,
    runId: session.run_id,
    gatewaySessionId: session.gateway_session_id,
    locale: session.locale,
    turnCount: session.turn_count,
    maxTurns: session.interaction_budget.max_turns,
    maxTranscriptChars: session.interaction_budget.max_transcript_chars,
    deadlineAt: session.deadline_at,
    currentTranscriptId: session.current_transcript_id,
  };
}

function audioSummary(policy: AudioPolicy | null): VoiceJarvisControlView["audio"] {
  if (policy === null) {
    return {
      policyId: "missing-policy",
      name: "Missing audio policy",
      microphoneMode: "disabled",
      speakerMode: "disabled",
      vadMode: "descriptor_only",
      sttMode: "descriptor_only",
      ttsMode: "descriptor_only",
      wakeWordMode: "consent_required",
      wallMode: "descriptor_only",
      transcriptRetentionDays: 0,
      audioRetentionDays: 0,
      deletionAllowed: false,
      exportAllowed: false,
      voiceprintStorage: "disabled",
      descriptorOnly: true,
    };
  }
  return {
    policyId: policy.id,
    name: policy.name,
    microphoneMode: policy.microphone_mode,
    speakerMode: policy.speaker_mode,
    vadMode: policy.vad_mode,
    sttMode: policy.stt_mode,
    ttsMode: policy.tts_mode,
    wakeWordMode: policy.wake_word_mode,
    wallMode: policy.wall_mode,
    transcriptRetentionDays: policy.retention.transcript_retention_days,
    audioRetentionDays: policy.retention.audio_retention_days,
    deletionAllowed: policy.retention.deletion_allowed,
    exportAllowed: policy.retention.export_allowed,
    voiceprintStorage: policy.retention.voiceprint_storage,
    descriptorOnly: policy.descriptor_only,
  };
}

function wakeWordSummary(wakeWord: WakeWordDescriptor | null): VoiceJarvisControlView["wakeWord"] {
  if (wakeWord === null) return null;
  return {
    id: wakeWord.id,
    phrase: wakeWord.phrase,
    locale: wakeWord.locale,
    sensitivity: wakeWord.sensitivity,
    consentRequired: wakeWord.consent_required,
    localOnly: wakeWord.local_only,
  };
}

function transcriptCollectionSummary(transcripts: readonly TranscriptDescriptor[]): VoiceJarvisControlView["transcripts"] {
  return {
    total: transcripts.length,
    redacted: transcripts.filter((transcript) => transcript.redacted).length,
    retained: transcripts.filter((transcript) => transcript.lifecycle_status === "retained").length,
    deleteRequested: transcripts.filter((transcript) => transcript.lifecycle_status === "delete_requested").length,
    exportRequested: transcripts.filter((transcript) => transcript.lifecycle_status === "export_requested").length,
    final: transcripts.filter((transcript) => transcript.lifecycle_status === "deleted" || transcript.lifecycle_status === "exported").length,
    audioRefsDisabled: transcripts.every((transcript) => transcript.audio_ref === null),
    items: transcripts.map(transcriptSummary),
  };
}

function transcriptSummary(transcript: TranscriptDescriptor): VoiceJarvisTranscriptSummary {
  return {
    id: transcript.id,
    sourceKind: transcript.source_kind,
    transcriptRef: transcript.transcript_ref,
    transcriptHash: transcript.transcript_hash,
    lifecycleStatus: transcript.lifecycle_status,
    expiresAt: transcript.expires_at,
    deletedAt: transcript.deleted_at,
    exportRef: transcript.export_ref,
    redacted: transcript.redacted,
    audioRef: transcript.audio_ref,
  };
}

function commandCollectionSummary(commands: readonly VoiceCommand[]): VoiceJarvisControlView["commands"] {
  const latest = [...commands].sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
  return { total: commands.length, latestKind: latest?.kind ?? "none", items: commands.map(commandSummary) };
}

function commandSummary(command: VoiceCommand): VoiceJarvisCommandSummary {
  return {
    id: command.command_id,
    kind: command.kind,
    expectedRevision: command.expected_revision,
    transcriptId: command.transcript_id,
    reason: command.reason,
    createdAt: command.created_at,
  };
}

function emptyVoiceJarvisControlView(workspaceId: string): VoiceJarvisControlView {
  return {
    workspaceId,
    sessions: [],
    selected: { sessionId: "missing-session", transcriptId: "missing-transcript", commandId: "missing-command" },
    audio: audioSummary(null),
    wakeWord: null,
    transcripts: { total: 0, redacted: 0, retained: 0, deleteRequested: 0, exportRequested: 0, final: 0, audioRefsDisabled: true, items: [] },
    commands: { total: 0, latestKind: "none", items: [] },
  };
}

function hasHttpStatus(error: unknown): error is { readonly response: { readonly status: number } } {
  return typeof error === "object"
    && error !== null
    && "response" in error
    && typeof error.response === "object"
    && error.response !== null
    && "status" in error.response
    && typeof error.response.status === "number";
}

function demoWorkspaceAlias(workspaceId: string): string | undefined {
  switch (workspaceId) {
    case "ws-demo":
      return LOCAL_WORKSPACE_ALIASES["ws-demo"];
    case "ws-a":
      return LOCAL_WORKSPACE_ALIASES["ws-a"];
    case "ws-b":
      return LOCAL_WORKSPACE_ALIASES["ws-b"];
    default:
      return undefined;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Voice/Jarvis workspace resolution ${String(value)}`);
}
