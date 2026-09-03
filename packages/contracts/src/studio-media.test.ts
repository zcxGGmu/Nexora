import { describe, expect, it } from "vitest";
import {
  AvatarProfileDescriptorSchema,
  MediaArtifactDescriptorSchema,
  NotebookDescriptorSchema,
  NotebookGenerationDescriptorSchema,
  NotebookSourceDescriptorSchema,
  RenderJobDescriptorSchema,
  StudioCommandSchema,
  StudioShareDescriptorSchema,
  canShareMediaArtifact,
  canUseNotebookGenerationSource,
} from "./studio-media.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  media: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  renderJob: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  notebook: "notebook-c25-market-brief",
  notebookSource: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  generation: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  avatar: "avatar-c25-founder-demo",
  command: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
};

const TIME = "2026-09-04T04:00:00.000Z";
const LATER = "2026-09-04T04:05:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const meta = { workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME };

const mediaArtifact = {
  id: IDS.media,
  ...meta,
  revision: 1,
  run_id: IDS.run,
  title: "C25 source-backed video preview",
  media_type: "video",
  source_refs: ["artifact://research/c25/source-pack.json"],
  prompt_ref: "artifact://prompts/c25/video-script.md",
  model_ref: null,
  provider_ref: null,
  codec: "mp4:h264",
  duration_ms: 90_000,
  caption_ref: "artifact://media/c25/captions.vtt",
  thumbnail_ref: "artifact://media/c25/thumbnail.png",
  preview_ref: "artifact://media/c25/preview.mp4",
  render_version: 1,
  moderation_status: "needs_review",
  share_policy: "review_required",
  temporary_url_expires_at: null,
  descriptor_only: true,
};

const shareDescriptor = {
  id: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  ...meta,
  media_artifact_id: IDS.media,
  run_id: IDS.run,
  status: "pending_review",
  preview_ref: "artifact://media/c25/preview.mp4",
  expires_at: "2026-09-04T05:00:00.000Z",
  descriptor_only: true,
};

const renderJob = {
  id: IDS.renderJob,
  ...meta,
  media_artifact_id: IDS.media,
  run_id: IDS.run,
  worker_descriptor_id: "render-worker-c25-local-descriptor",
  status: "queued",
  input_hash: HASH,
  output_artifact_ref: null,
  retry_of_job_id: null,
  side_effect_policy: "none",
  descriptor_only: true,
};

const notebook = {
  id: IDS.notebook,
  ...meta,
  revision: 1,
  run_id: IDS.run,
  title: "C25 NotebookLM descriptor",
  source_policy: "snapshot_only",
  generation_policy: "local_descriptor_only",
  share_policy: "review_required",
  descriptor_only: true,
};

const notebookSource = {
  id: IDS.notebookSource,
  ...meta,
  notebook_id: IDS.notebook,
  run_id: IDS.run,
  source_kind: "artifact_snapshot",
  source_ref: "artifact://research/c25/source-pack.json",
  source_hash: HASH,
  snapshot_ref: "artifact://notebooks/c25/source-pack.snapshot.json",
  title: "Market source pack",
  descriptor_only: true,
};

const notebookGeneration = {
  id: IDS.generation,
  ...meta,
  notebook_id: IDS.notebook,
  run_id: IDS.run,
  source_ids: [IDS.notebookSource],
  generation_kind: "brief",
  prompt_ref: "artifact://prompts/c25/notebook-brief.md",
  output_ref: "artifact://notebooks/c25/generated-brief.md",
  citation_refs: ["artifact://notebooks/c25/source-pack.snapshot.json#p1"],
  status: "draft",
  descriptor_only: true,
};

const avatarProfile = {
  id: IDS.avatar,
  ...meta,
  revision: 1,
  run_id: IDS.run,
  workspace_id: IDS.workspace,
  display_name: "Founder avatar descriptor",
  consent_status: "approved",
  consent_artifact_ref: "artifact://avatars/c25/consent.json",
  face_source_hash: HASH,
  voice_source_hash: HASH,
  voice_clone_mode: "disabled",
  render_mode: "descriptor_only",
  expires_at: "2026-10-04T04:00:00.000Z",
  revoked_at: null,
  descriptor_only: true,
};

describe("C25 Studio/Media/NotebookLM/Avatar contracts", () => {
  it("Given media and render descriptors When parsed Then assets stay source-backed and descriptor-only", () => {
    expect(MediaArtifactDescriptorSchema.parse(mediaArtifact)).toMatchObject({ descriptor_only: true, media_type: "video", moderation_status: "needs_review", share_policy: "review_required" });
    expect(RenderJobDescriptorSchema.parse(renderJob)).toMatchObject({ status: "queued", side_effect_policy: "none", descriptor_only: true });
    expect(MediaArtifactDescriptorSchema.safeParse({ ...mediaArtifact, provider_ref: "secret://media/live-token" }).success).toBe(false);
    expect(MediaArtifactDescriptorSchema.safeParse({ ...mediaArtifact, preview_ref: "https://temporary.example/preview.mp4" }).success).toBe(false);
    expect(RenderJobDescriptorSchema.safeParse({ ...renderJob, side_effect_policy: "provider_render" }).success).toBe(false);
  });

  it("Given notebook descriptors When parsed Then NotebookLM is represented by local snapshots and citations only", () => {
    expect(NotebookDescriptorSchema.parse(notebook)).toMatchObject({ source_policy: "snapshot_only", generation_policy: "local_descriptor_only" });
    expect(NotebookSourceDescriptorSchema.parse(notebookSource)).toMatchObject({ source_kind: "artifact_snapshot", descriptor_only: true });
    expect(NotebookGenerationDescriptorSchema.parse(notebookGeneration)).toMatchObject({ status: "draft", source_ids: [IDS.notebookSource] });
    expect(NotebookSourceDescriptorSchema.safeParse({ ...notebookSource, source_ref: "https://docs.google.com/document/d/real" }).success).toBe(false);
    expect(NotebookGenerationDescriptorSchema.safeParse({ ...notebookGeneration, output_ref: "secret://notebook/output" }).success).toBe(false);
  });

  it("Given avatar profile descriptors When parsed Then consent expiry and disabled voice cloning are explicit", () => {
    expect(AvatarProfileDescriptorSchema.parse(avatarProfile)).toMatchObject({ run_id: IDS.run, consent_status: "approved", voice_clone_mode: "disabled", render_mode: "descriptor_only" });
    expect(AvatarProfileDescriptorSchema.safeParse({ ...avatarProfile, run_id: undefined }).success).toBe(false);
    expect(AvatarProfileDescriptorSchema.safeParse({ ...avatarProfile, consent_artifact_ref: "file:///Users/zq/private-consent.mov" }).success).toBe(false);
    expect(AvatarProfileDescriptorSchema.safeParse({ ...avatarProfile, voice_clone_mode: "provider_clone" }).success).toBe(false);
    expect(AvatarProfileDescriptorSchema.safeParse({ ...avatarProfile, revoked_at: LATER, consent_status: "approved" }).success).toBe(false);
  });

  it("Given studio commands When parsed Then preview share rerender and generation are idempotent local control facts", () => {
    const command = StudioCommandSchema.parse({ schema_version: 1, command_id: IDS.command, workspace_id: IDS.workspace, run_id: IDS.run, kind: "rerender", target_id: IDS.media, target_type: "media_artifact", idempotency_key: "studio:rerender:c25", expected_revision: 1, reason: "Retry failed descriptor render", descriptor_only: true, created_at: TIME });
    expect(command).toMatchObject({ kind: "rerender", target_type: "media_artifact", descriptor_only: true });
    expect(StudioCommandSchema.safeParse({ ...command, kind: "publish", idempotency_key: "studio:publish:c25" }).success).toBe(false);
    expect(StudioCommandSchema.safeParse({ ...command, reason: "token=abcd1234" }).success).toBe(false);
  });

  it("Given share and notebook generation checks When evaluated Then moderation source and expiry gates are enforced", () => {
    expect(canShareMediaArtifact(MediaArtifactDescriptorSchema.parse({ ...mediaArtifact, moderation_status: "approved" }), TIME)).toEqual({ allowed: true, code: "MEDIA_SHARE_ALLOWED" });
    expect(canShareMediaArtifact(MediaArtifactDescriptorSchema.parse(mediaArtifact), TIME)).toEqual({ allowed: false, code: "MEDIA_MODERATION_REQUIRED" });
    expect(canShareMediaArtifact(MediaArtifactDescriptorSchema.parse({ ...mediaArtifact, moderation_status: "approved", temporary_url_expires_at: "2026-09-04T03:00:00.000Z" }), TIME)).toEqual({ allowed: false, code: "MEDIA_PREVIEW_EXPIRED" });
    expect(canUseNotebookGenerationSource(NotebookGenerationDescriptorSchema.parse(notebookGeneration), NotebookSourceDescriptorSchema.parse(notebookSource))).toEqual({ allowed: true, code: "NOTEBOOK_SOURCE_BOUND" });
    expect(canUseNotebookGenerationSource(NotebookGenerationDescriptorSchema.parse(notebookGeneration), NotebookSourceDescriptorSchema.parse({ ...notebookSource, workspace_id: IDS.run }))).toEqual({ allowed: false, code: "NOTEBOOK_SOURCE_SCOPE_MISMATCH" });
  });

  it("Given share descriptors When parsed Then review state and temporary preview expiry are append-only control facts", () => {
    expect(StudioShareDescriptorSchema.parse(shareDescriptor)).toMatchObject({ media_artifact_id: IDS.media, status: "pending_review", descriptor_only: true });
    expect(StudioShareDescriptorSchema.safeParse({ ...shareDescriptor, preview_ref: "https://cdn.example.com/live-preview.mp4" }).success).toBe(false);
    expect(StudioShareDescriptorSchema.safeParse({ ...shareDescriptor, status: "published" }).success).toBe(false);
  });
});
