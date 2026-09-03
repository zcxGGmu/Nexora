import { z } from "zod";
import { TimestampSchema } from "./common.js";
import { containsSecretLikeText } from "./goal.js";
import { IdempotencyKeySchema } from "./gateway.js";
import { RunIdSchema, UlidSchema, WorkspaceIdSchema } from "./ids.js";
import { PayloadHashSchema } from "./policy.js";
import { DescriptorIdSchema } from "./registry.js";

const DEFAULT_IGNORABLE_CODE_POINT_PATTERN = /\p{Default_Ignorable_Code_Point}/u;

const DescriptorMetadataSchema = z.object({
  id: DescriptorIdSchema,
  workspace_id: WorkspaceIdSchema,
  schema_version: z.literal(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  revision: z.number().int().positive().default(1),
}).strict();

const FactMetadataSchema = z.object({
  id: UlidSchema,
  workspace_id: WorkspaceIdSchema,
  schema_version: z.literal(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
}).strict();

const SecretSafeTextSchema = (maximumLength: number): z.ZodType<string> => z.string().min(1).max(maximumLength)
  .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
  .refine((value) => !DEFAULT_IGNORABLE_CODE_POINT_PATTERN.test(value), "default-ignorable characters are not allowed");

const NullableSecretSafeTextSchema = (maximumLength: number): z.ZodType<string | null> => SecretSafeTextSchema(maximumLength).nullable();

const VoiceArtifactRefSchema = z.string().min(1).max(512)
  .regex(/^artifact:\/\/[A-Za-z0-9._~/-]+$/)
  .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
  .refine((value) => !hasUnsafePathSegments(value.slice("artifact://".length)), "artifact refs must not include traversal");

export const VoiceMicrophoneModeSchema = z.enum(["disabled"]);
export const VoiceSpeakerModeSchema = z.enum(["disabled"]);
export const VoiceProcessingModeSchema = z.enum(["descriptor_only"]);
export const WakeWordModeSchema = z.enum(["consent_required"]);
export const WallModeSchema = z.enum(["descriptor_only"]);
export const VoiceprintStorageSchema = z.enum(["disabled"]);
export const VoiceSessionModeSchema = z.enum(["conversation", "push_to_talk", "wall"]);
export const VoiceSessionStatusSchema = z.enum(["idle", "active", "paused", "interrupted", "stopped", "error"]);
export const TranscriptSourceKindSchema = z.enum(["stt_descriptor", "operator_text", "system_summary"]);
export const TranscriptLifecycleStatusSchema = z.enum(["retained", "delete_requested", "deleted", "export_requested", "exported"]);
export const VoiceCommandKindSchema = z.enum(["wake", "interrupt", "pause", "resume", "delete_transcript", "export_transcript"]);

export const VoiceInteractionBudgetSchema = z.object({
  max_turns: z.number().int().positive().max(1000),
  max_transcript_chars: z.number().int().positive().max(1_000_000),
}).strict();

export const TranscriptRetentionPolicySchema = z.object({
  transcript_retention_days: z.number().int().nonnegative().max(3650),
  audio_retention_days: z.literal(0),
  deletion_allowed: z.boolean(),
  export_allowed: z.boolean(),
  voiceprint_storage: VoiceprintStorageSchema,
}).strict();

export const AudioPolicySchema = DescriptorMetadataSchema.extend({
  name: SecretSafeTextSchema(160),
  microphone_mode: VoiceMicrophoneModeSchema,
  speaker_mode: VoiceSpeakerModeSchema,
  vad_mode: VoiceProcessingModeSchema,
  stt_mode: VoiceProcessingModeSchema,
  tts_mode: VoiceProcessingModeSchema,
  wake_word_mode: WakeWordModeSchema,
  wall_mode: WallModeSchema,
  retention: TranscriptRetentionPolicySchema,
  descriptor_only: z.literal(true),
}).strict();

export const WakeWordDescriptorSchema = DescriptorMetadataSchema.extend({
  phrase: SecretSafeTextSchema(64).refine((value) => value.trim().toLowerCase() === value, "wake word phrase must be normalized lowercase text"),
  locale: z.string().min(2).max(32).regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  sensitivity: z.number().min(0).max(1),
  consent_required: z.literal(true),
  local_only: z.literal(true),
  descriptor_only: z.literal(true),
}).strict();

export const VoiceSessionDescriptorSchema = FactMetadataSchema.extend({
  revision: z.number().int().positive().default(1),
  run_id: RunIdSchema,
  gateway_session_id: UlidSchema,
  audio_policy_id: DescriptorIdSchema,
  wake_word_id: DescriptorIdSchema.nullable(),
  name: SecretSafeTextSchema(160),
  mode: VoiceSessionModeSchema,
  status: VoiceSessionStatusSchema,
  locale: z.string().min(2).max(32).regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  turn_count: z.number().int().nonnegative(),
  interaction_budget: VoiceInteractionBudgetSchema,
  deadline_at: TimestampSchema,
  input_audio_ref: z.null(),
  output_audio_ref: z.null(),
  current_transcript_id: UlidSchema.nullable(),
  interrupted_at: TimestampSchema.nullable(),
  descriptor_only: z.literal(true),
}).strict().superRefine((session, context) => {
  if (session.mode === "wall" && session.wake_word_id === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["wake_word_id"], message: "wall mode requires an explicit wake word descriptor" });
  if (session.turn_count > session.interaction_budget.max_turns) context.addIssue({ code: z.ZodIssueCode.custom, path: ["turn_count"], message: "voice session turn_count cannot exceed max_turns" });
  if (session.status === "interrupted" && session.interrupted_at === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["interrupted_at"], message: "interrupted sessions require interrupted_at" });
  if (session.status !== "interrupted" && session.interrupted_at !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["interrupted_at"], message: "only interrupted sessions may carry interrupted_at" });
});

export const TranscriptDescriptorSchema = FactMetadataSchema.extend({
  voice_session_id: UlidSchema,
  run_id: RunIdSchema,
  source_kind: TranscriptSourceKindSchema,
  transcript_ref: VoiceArtifactRefSchema,
  transcript_hash: PayloadHashSchema,
  audio_ref: z.null(),
  redacted: z.literal(true),
  lifecycle_status: TranscriptLifecycleStatusSchema,
  expires_at: TimestampSchema.nullable(),
  deleted_at: TimestampSchema.nullable(),
  export_ref: VoiceArtifactRefSchema.nullable(),
  descriptor_only: z.literal(true),
}).strict().superRefine((transcript, context) => {
  if (transcript.lifecycle_status === "deleted" && transcript.deleted_at === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["deleted_at"], message: "deleted transcripts require deleted_at" });
  if (transcript.lifecycle_status !== "deleted" && transcript.deleted_at !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["deleted_at"], message: "deleted_at is only valid for deleted transcripts" });
  if (transcript.lifecycle_status === "exported" && transcript.export_ref === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["export_ref"], message: "exported transcripts require export_ref" });
  if (transcript.lifecycle_status !== "exported" && transcript.export_ref !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["export_ref"], message: "export_ref is only valid for exported transcripts" });
});

export const VoiceCommandSchema = z.object({
  schema_version: z.literal(1),
  command_id: UlidSchema,
  workspace_id: WorkspaceIdSchema,
  voice_session_id: UlidSchema,
  run_id: RunIdSchema,
  kind: VoiceCommandKindSchema,
  idempotency_key: IdempotencyKeySchema,
  expected_revision: z.number().int().positive(),
  transcript_id: UlidSchema.nullable(),
  reason: NullableSecretSafeTextSchema(1000),
  descriptor_only: z.literal(true),
  created_at: TimestampSchema,
}).strict().superRefine((command, context) => {
  const lifecycleCommand = command.kind === "delete_transcript" || command.kind === "export_transcript";
  if (lifecycleCommand && command.transcript_id === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["transcript_id"], message: "transcript lifecycle commands require transcript_id" });
  if (!lifecycleCommand && command.transcript_id !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["transcript_id"], message: "session commands must not include transcript_id" });
});

export type TranscriptRetentionPolicy = z.infer<typeof TranscriptRetentionPolicySchema>;
export type VoiceInteractionBudget = z.infer<typeof VoiceInteractionBudgetSchema>;
export type AudioPolicy = z.infer<typeof AudioPolicySchema>;
export type WakeWordDescriptor = z.infer<typeof WakeWordDescriptorSchema>;
export type VoiceSessionDescriptor = z.infer<typeof VoiceSessionDescriptorSchema>;
export type TranscriptDescriptor = z.infer<typeof TranscriptDescriptorSchema>;
export type VoiceCommand = z.infer<typeof VoiceCommandSchema>;
export type VoiceSessionStatus = z.infer<typeof VoiceSessionStatusSchema>;

export type TranscriptLifecycleDecision =
  | { readonly allowed: true; readonly code: "TRANSCRIPT_DELETE_ALLOWED" | "TRANSCRIPT_EXPORT_ALLOWED" }
  | { readonly allowed: false; readonly code: "TRANSCRIPT_DELETE_DISABLED" | "TRANSCRIPT_EXPORT_DISABLED" | "TRANSCRIPT_ALREADY_FINAL" | "TRANSCRIPT_SCOPE_MISMATCH" | "TRANSCRIPT_COMMAND_MISMATCH" };

const VOICE_SESSION_TRANSITIONS: Readonly<Record<VoiceSessionStatus, readonly VoiceSessionStatus[]>> = {
  idle: ["active", "paused", "stopped", "error"],
  active: ["idle", "paused", "interrupted", "stopped", "error"],
  paused: ["idle", "active", "stopped", "error"],
  interrupted: ["active", "paused", "stopped", "error"],
  stopped: [],
  error: ["stopped"],
};

export function canTransitionVoiceSession(from: VoiceSessionStatus, to: VoiceSessionStatus): boolean {
  VoiceSessionStatusSchema.parse(from);
  VoiceSessionStatusSchema.parse(to);
  return VOICE_SESSION_TRANSITIONS[from].includes(to);
}

export function canApplyTranscriptLifecycleCommand(command: VoiceCommand, transcript: TranscriptDescriptor, policy: AudioPolicy): TranscriptLifecycleDecision {
  const parsedCommand = VoiceCommandSchema.parse(command);
  const parsedTranscript = TranscriptDescriptorSchema.parse(transcript);
  const parsedPolicy = AudioPolicySchema.parse(policy);
  if (parsedCommand.workspace_id !== parsedTranscript.workspace_id || parsedCommand.workspace_id !== parsedPolicy.workspace_id || parsedCommand.voice_session_id !== parsedTranscript.voice_session_id || parsedCommand.transcript_id !== parsedTranscript.id) {
    return { allowed: false, code: "TRANSCRIPT_SCOPE_MISMATCH" };
  }
  if (parsedTranscript.lifecycle_status !== "retained") return { allowed: false, code: "TRANSCRIPT_ALREADY_FINAL" };
  if (parsedCommand.kind === "delete_transcript") {
    if (!parsedPolicy.retention.deletion_allowed) return { allowed: false, code: "TRANSCRIPT_DELETE_DISABLED" };
    return { allowed: true, code: "TRANSCRIPT_DELETE_ALLOWED" };
  }
  if (parsedCommand.kind === "export_transcript") {
    if (!parsedPolicy.retention.export_allowed) return { allowed: false, code: "TRANSCRIPT_EXPORT_DISABLED" };
    return { allowed: true, code: "TRANSCRIPT_EXPORT_ALLOWED" };
  }
  return { allowed: false, code: "TRANSCRIPT_COMMAND_MISMATCH" };
}

function hasUnsafePathSegments(value: string): boolean {
  const decoded = decodeRepeatedly(value);
  if (decoded.includes("\\")) return true;
  return decoded.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function decodeRepeatedly(value: string): string {
  let current = value;
  for (let count = 0; count < 3; count += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) return decoded;
      current = decoded;
    } catch {
      return current;
    }
  }
  return current;
}
