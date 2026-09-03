import { z } from "zod";
import { TimestampSchema } from "./common.js";
import { containsSecretLikeText } from "./goal.js";
import { IdempotencyKeySchema } from "./gateway.js";
import { RunIdSchema, UlidSchema, WorkspaceIdSchema } from "./ids.js";
import { PayloadHashSchema } from "./policy.js";
import { DescriptorIdSchema } from "./registry.js";
import { containsPathLikeText } from "./skills.js";

const DEFAULT_IGNORABLE_CODE_POINT_PATTERN = /\p{Default_Ignorable_Code_Point}/u;
const STUDIO_REFERENCE_SCHEMES = new Set(["artifact", "workspace", "memory", "journal", "skill"]);

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

const StudioTextSchema = (maximumLength: number): z.ZodType<string> => z.string().min(1).max(maximumLength)
  .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
  .refine((value) => !containsPathLikeText(value), "local paths and credential refs are not allowed")
  .refine((value) => !DEFAULT_IGNORABLE_CODE_POINT_PATTERN.test(value), "default-ignorable characters are not allowed");

const StudioRefSchema = z.string().min(1).max(512)
  .regex(/^(?:artifact|workspace|memory|journal|skill):\/\/[A-Za-z0-9._~/#-]+$/)
  .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
  .refine((value) => !containsPathLikeText(value), "local paths and credential refs are not allowed")
  .refine((value) => !DEFAULT_IGNORABLE_CODE_POINT_PATTERN.test(value), "studio refs must not include zero-width format characters")
  .refine(isSafeStudioReference, "studio refs must stay inside descriptor namespaces");

export const MediaTypeSchema = z.enum(["video", "audio", "image", "document"]);
export const MediaModerationStatusSchema = z.enum(["needs_review", "approved", "rejected"]);
export const StudioSharePolicySchema = z.enum(["review_required", "disabled"]);
export const RenderJobStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export const RenderSideEffectPolicySchema = z.enum(["none"]);
export const NotebookSourcePolicySchema = z.enum(["snapshot_only"]);
export const NotebookGenerationPolicySchema = z.enum(["local_descriptor_only"]);
export const NotebookSourceKindSchema = z.enum(["artifact_snapshot", "manual_snapshot"]);
export const NotebookGenerationKindSchema = z.enum(["brief", "summary", "outline"]);
export const NotebookGenerationStatusSchema = z.enum(["draft", "needs_review", "approved", "rejected"]);
export const AvatarConsentStatusSchema = z.enum(["pending", "approved", "revoked"]);
export const AvatarVoiceCloneModeSchema = z.enum(["disabled"]);
export const AvatarRenderModeSchema = z.enum(["descriptor_only"]);
export const StudioCommandKindSchema = z.enum(["preview", "share", "rerender", "notebook_generate", "revoke_avatar"]);
export const StudioCommandTargetTypeSchema = z.enum(["media_artifact", "notebook", "avatar_profile"]);
export const StudioShareStatusSchema = z.enum(["pending_review", "approved", "denied", "expired"]);

export const MediaArtifactDescriptorSchema = FactMetadataSchema.extend({
  revision: z.number().int().positive().default(1),
  run_id: RunIdSchema,
  title: StudioTextSchema(200),
  media_type: MediaTypeSchema,
  source_refs: z.array(StudioRefSchema).min(1).max(128),
  prompt_ref: StudioRefSchema,
  model_ref: StudioRefSchema.nullable(),
  provider_ref: z.null(),
  codec: z.string().min(1).max(64).regex(/^[A-Za-z0-9:._-]+$/),
  duration_ms: z.number().int().positive().max(86_400_000),
  caption_ref: StudioRefSchema.nullable(),
  thumbnail_ref: StudioRefSchema.nullable(),
  preview_ref: StudioRefSchema.nullable(),
  render_version: z.number().int().positive(),
  moderation_status: MediaModerationStatusSchema,
  share_policy: StudioSharePolicySchema,
  temporary_url_expires_at: TimestampSchema.nullable(),
  descriptor_only: z.literal(true),
}).strict();

export const RenderJobDescriptorSchema = FactMetadataSchema.extend({
  media_artifact_id: UlidSchema,
  run_id: RunIdSchema,
  worker_descriptor_id: DescriptorIdSchema,
  status: RenderJobStatusSchema,
  input_hash: PayloadHashSchema,
  output_artifact_ref: StudioRefSchema.nullable(),
  retry_of_job_id: UlidSchema.nullable(),
  side_effect_policy: RenderSideEffectPolicySchema,
  descriptor_only: z.literal(true),
}).strict();

export const NotebookDescriptorSchema = DescriptorMetadataSchema.extend({
  run_id: RunIdSchema,
  title: StudioTextSchema(200),
  source_policy: NotebookSourcePolicySchema,
  generation_policy: NotebookGenerationPolicySchema,
  share_policy: StudioSharePolicySchema,
  descriptor_only: z.literal(true),
}).strict();

export const NotebookSourceDescriptorSchema = FactMetadataSchema.extend({
  notebook_id: DescriptorIdSchema,
  run_id: RunIdSchema,
  source_kind: NotebookSourceKindSchema,
  source_ref: StudioRefSchema,
  source_hash: PayloadHashSchema,
  snapshot_ref: StudioRefSchema,
  title: StudioTextSchema(200),
  descriptor_only: z.literal(true),
}).strict();

export const NotebookGenerationDescriptorSchema = FactMetadataSchema.extend({
  notebook_id: DescriptorIdSchema,
  run_id: RunIdSchema,
  source_ids: z.array(UlidSchema).min(1).max(128),
  generation_kind: NotebookGenerationKindSchema,
  prompt_ref: StudioRefSchema,
  output_ref: StudioRefSchema,
  citation_refs: z.array(StudioRefSchema).min(1).max(128),
  status: NotebookGenerationStatusSchema,
  descriptor_only: z.literal(true),
}).strict();

export const AvatarProfileDescriptorSchema = DescriptorMetadataSchema.extend({
  run_id: RunIdSchema,
  display_name: StudioTextSchema(160),
  consent_status: AvatarConsentStatusSchema,
  consent_artifact_ref: StudioRefSchema,
  face_source_hash: PayloadHashSchema,
  voice_source_hash: PayloadHashSchema,
  voice_clone_mode: AvatarVoiceCloneModeSchema,
  render_mode: AvatarRenderModeSchema,
  expires_at: TimestampSchema,
  revoked_at: TimestampSchema.nullable(),
  descriptor_only: z.literal(true),
}).strict().superRefine((avatar, context) => {
  if (avatar.consent_status === "revoked" && avatar.revoked_at === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revoked_at"], message: "revoked avatar profiles require revoked_at" });
  }
  if (avatar.consent_status !== "revoked" && avatar.revoked_at !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revoked_at"], message: "revoked_at is only valid for revoked avatars" });
  }
});

export const StudioCommandSchema = z.object({
  schema_version: z.literal(1),
  command_id: UlidSchema,
  workspace_id: WorkspaceIdSchema,
  run_id: RunIdSchema,
  kind: StudioCommandKindSchema,
  target_id: z.string().min(1).max(96),
  target_type: StudioCommandTargetTypeSchema,
  idempotency_key: IdempotencyKeySchema,
  expected_revision: z.number().int().positive(),
  reason: StudioTextSchema(1000),
  descriptor_only: z.literal(true),
  created_at: TimestampSchema,
}).strict().superRefine((command, context) => {
  if ((command.kind === "preview" || command.kind === "share" || command.kind === "rerender") && command.target_type !== "media_artifact") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["target_type"], message: "media commands require a media artifact target" });
  }
  if (command.kind === "notebook_generate" && command.target_type !== "notebook") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["target_type"], message: "notebook generation requires a notebook target" });
  }
  if (command.kind === "revoke_avatar" && command.target_type !== "avatar_profile") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["target_type"], message: "avatar revoke requires an avatar profile target" });
  }
});

export const StudioShareDescriptorSchema = FactMetadataSchema.extend({
  media_artifact_id: UlidSchema,
  run_id: RunIdSchema,
  status: StudioShareStatusSchema,
  preview_ref: StudioRefSchema,
  expires_at: TimestampSchema,
  descriptor_only: z.literal(true),
}).strict();

export type MediaArtifactDescriptor = z.infer<typeof MediaArtifactDescriptorSchema>;
export type RenderJobDescriptor = z.infer<typeof RenderJobDescriptorSchema>;
export type NotebookDescriptor = z.infer<typeof NotebookDescriptorSchema>;
export type NotebookSourceDescriptor = z.infer<typeof NotebookSourceDescriptorSchema>;
export type NotebookGenerationDescriptor = z.infer<typeof NotebookGenerationDescriptorSchema>;
export type AvatarProfileDescriptor = z.infer<typeof AvatarProfileDescriptorSchema>;
export type StudioCommand = z.infer<typeof StudioCommandSchema>;
export type StudioShareDescriptor = z.infer<typeof StudioShareDescriptorSchema>;
export type StudioCommandKind = z.infer<typeof StudioCommandKindSchema>;
export type StudioCommandTargetType = z.infer<typeof StudioCommandTargetTypeSchema>;

export type StudioGateDecision =
  | { readonly allowed: true; readonly code: "MEDIA_SHARE_ALLOWED" | "NOTEBOOK_SOURCE_BOUND" }
  | { readonly allowed: false; readonly code: "MEDIA_MODERATION_REQUIRED" | "MEDIA_SHARE_DISABLED" | "MEDIA_PREVIEW_EXPIRED" | "MEDIA_PREVIEW_MISSING" | "NOTEBOOK_SOURCE_SCOPE_MISMATCH" | "NOTEBOOK_SOURCE_NOT_LISTED" };

export function canShareMediaArtifact(media: MediaArtifactDescriptor, now: string): StudioGateDecision {
  const parsedMedia = MediaArtifactDescriptorSchema.parse(media);
  const parsedNow = TimestampSchema.parse(now);
  if (parsedMedia.share_policy === "disabled") return { allowed: false, code: "MEDIA_SHARE_DISABLED" };
  if (parsedMedia.moderation_status !== "approved") return { allowed: false, code: "MEDIA_MODERATION_REQUIRED" };
  if (parsedMedia.preview_ref === null) return { allowed: false, code: "MEDIA_PREVIEW_MISSING" };
  if (parsedMedia.temporary_url_expires_at !== null && parsedMedia.temporary_url_expires_at < parsedNow) return { allowed: false, code: "MEDIA_PREVIEW_EXPIRED" };
  return { allowed: true, code: "MEDIA_SHARE_ALLOWED" };
}

export function canUseNotebookGenerationSource(generation: NotebookGenerationDescriptor, source: NotebookSourceDescriptor): StudioGateDecision {
  const parsedGeneration = NotebookGenerationDescriptorSchema.parse(generation);
  const parsedSource = NotebookSourceDescriptorSchema.parse(source);
  if (parsedGeneration.workspace_id !== parsedSource.workspace_id || parsedGeneration.notebook_id !== parsedSource.notebook_id || parsedGeneration.run_id !== parsedSource.run_id) {
    return { allowed: false, code: "NOTEBOOK_SOURCE_SCOPE_MISMATCH" };
  }
  if (!parsedGeneration.source_ids.includes(parsedSource.id)) return { allowed: false, code: "NOTEBOOK_SOURCE_NOT_LISTED" };
  return { allowed: true, code: "NOTEBOOK_SOURCE_BOUND" };
}

function isSafeStudioReference(reference: string): boolean {
  const separator = reference.indexOf("://");
  if (separator < 0) return false;
  const scheme = reference.slice(0, separator);
  if (!STUDIO_REFERENCE_SCHEMES.has(scheme)) return false;
  const decodedPath = decodeRepeatedly(reference.slice(separator + 3)).replace(/\\/g, "/");
  if (decodedPath.includes("://") || decodedPath.includes("//") || decodedPath.startsWith("/") || decodedPath.startsWith("~/") || /^[A-Za-z]:\//.test(decodedPath)) return false;
  return !decodedPath.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
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
