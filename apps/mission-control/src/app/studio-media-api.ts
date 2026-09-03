import {
  AvatarProfileDescriptorSchema,
  MediaArtifactDescriptorSchema,
  NotebookDescriptorSchema,
  NotebookGenerationDescriptorSchema,
  NotebookSourceDescriptorSchema,
  RenderJobDescriptorSchema,
  StudioCommandSchema,
  StudioShareDescriptorSchema,
  WorkspaceIdSchema,
  z,
  type AvatarProfileDescriptor,
  type MediaArtifactDescriptor,
  type NotebookDescriptor,
  type NotebookGenerationDescriptor,
  type NotebookSourceDescriptor,
  type RenderJobDescriptor,
  type StudioCommand,
  type StudioShareDescriptor,
} from "@nexora/contracts";
import { controlApi, readControlProjection } from "./query-client.js";

const LOCAL_WORKSPACE_ALIASES = {
  "ws-demo": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "ws-a": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "ws-b": "01BRZ3NDEKTSV4RRFFQ69G5FAV",
} as const;

const StudioMediaProjectionResponseSchema = z.object({
  schema_version: z.literal(1).optional(),
  media_artifacts: z.array(MediaArtifactDescriptorSchema),
  render_jobs: z.array(RenderJobDescriptorSchema).default([]),
  notebooks: z.array(NotebookDescriptorSchema),
  notebook_sources: z.array(NotebookSourceDescriptorSchema).default([]),
  notebook_generations: z.array(NotebookGenerationDescriptorSchema).default([]),
  avatar_profiles: z.array(AvatarProfileDescriptorSchema),
  shares: z.array(StudioShareDescriptorSchema).default([]),
  commands: z.array(StudioCommandSchema).default([]),
}).passthrough();

export type StudioMediaProjection = {
  readonly media_artifacts: readonly MediaArtifactDescriptor[];
  readonly render_jobs: readonly RenderJobDescriptor[];
  readonly notebooks: readonly NotebookDescriptor[];
  readonly notebook_sources: readonly NotebookSourceDescriptor[];
  readonly notebook_generations: readonly NotebookGenerationDescriptor[];
  readonly avatar_profiles: readonly AvatarProfileDescriptor[];
  readonly shares: readonly StudioShareDescriptor[];
  readonly commands: readonly StudioCommand[];
};

export type StudioMediaWorkspaceResolution =
  | { readonly kind: "resolved"; readonly workspace_id: string }
  | { readonly kind: "invalid"; readonly input: string };

export type StudioMediaProjectionReader = (path: string, workspace: string) => Promise<unknown>;

export type StudioMediaPostOptions = {
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
};

export type StudioMediaCommandWriter = {
  readonly post: (path: string, options: StudioMediaPostOptions) => Promise<unknown>;
};

export type StudioMediaCommandKind = "preview" | "share" | "rerender" | "notebook_generate" | "revoke_avatar";

export type StudioMediaCommandInput = {
  readonly workspace_id: string;
  readonly run_id: string;
  readonly target_id: string;
  readonly target_type: "media_artifact" | "notebook" | "avatar_profile";
  readonly kind: StudioMediaCommandKind;
  readonly expected_revision: number;
  readonly reason: string;
};

export type StudioMediaControlView = {
  readonly workspaceId: string;
  readonly mediaArtifacts: readonly MediaArtifactSummary[];
  readonly renderJobs: readonly RenderJobSummary[];
  readonly notebooks: readonly NotebookSummary[];
  readonly notebookSources: readonly NotebookSourceSummary[];
  readonly notebookGenerations: readonly NotebookGenerationSummary[];
  readonly avatarProfiles: readonly AvatarSummary[];
  readonly shares: readonly StudioShareSummary[];
  readonly commands: readonly StudioCommandSummary[];
  readonly selected: {
    readonly mediaId: string;
    readonly renderJobId: string;
    readonly notebookId: string;
    readonly notebookSourceId: string;
    readonly notebookGenerationId: string;
    readonly avatarId: string;
    readonly shareId: string;
  };
};

export type MediaArtifactSummary = {
  readonly id: string;
  readonly title: string;
  readonly mediaType: MediaArtifactDescriptor["media_type"];
  readonly revision: number;
  readonly runId: string;
  readonly moderationStatus: MediaArtifactDescriptor["moderation_status"];
  readonly sharePolicy: MediaArtifactDescriptor["share_policy"];
  readonly previewRef: string | null;
  readonly renderVersion: number;
  readonly temporaryUrlExpiresAt: string | null;
  readonly descriptorOnly: true;
};

export type RenderJobSummary = {
  readonly id: string;
  readonly mediaArtifactId: string;
  readonly runId: string;
  readonly workerDescriptorId: string;
  readonly status: RenderJobDescriptor["status"];
  readonly inputHash: string;
  readonly outputArtifactRef: string | null;
  readonly sideEffectPolicy: "none";
  readonly descriptorOnly: true;
};

export type NotebookSummary = {
  readonly id: string;
  readonly title: string;
  readonly revision: number;
  readonly runId: string;
  readonly sourcePolicy: NotebookDescriptor["source_policy"];
  readonly generationPolicy: NotebookDescriptor["generation_policy"];
  readonly sharePolicy: NotebookDescriptor["share_policy"];
  readonly descriptorOnly: true;
};

export type NotebookSourceSummary = {
  readonly id: string;
  readonly notebookId: string;
  readonly runId: string;
  readonly sourceKind: NotebookSourceDescriptor["source_kind"];
  readonly sourceRef: string;
  readonly sourceHash: string;
  readonly snapshotRef: string;
  readonly title: string;
  readonly descriptorOnly: true;
};

export type NotebookGenerationSummary = {
  readonly id: string;
  readonly notebookId: string;
  readonly runId: string;
  readonly sourceIds: readonly string[];
  readonly generationKind: NotebookGenerationDescriptor["generation_kind"];
  readonly outputRef: string;
  readonly citationRefs: readonly string[];
  readonly status: NotebookGenerationDescriptor["status"];
  readonly descriptorOnly: true;
};

export type AvatarSummary = {
  readonly id: string;
  readonly displayName: string;
  readonly revision: number;
  readonly runId: string;
  readonly consentStatus: AvatarProfileDescriptor["consent_status"];
  readonly consentArtifactRef: string;
  readonly voiceCloneMode: AvatarProfileDescriptor["voice_clone_mode"];
  readonly renderMode: AvatarProfileDescriptor["render_mode"];
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly descriptorOnly: true;
};

export type StudioShareSummary = {
  readonly id: string;
  readonly mediaArtifactId: string;
  readonly runId: string;
  readonly status: StudioShareDescriptor["status"];
  readonly previewRef: string;
  readonly expiresAt: string;
  readonly descriptorOnly: true;
};

export type StudioCommandSummary = {
  readonly id: string;
  readonly kind: StudioCommand["kind"];
  readonly targetId: string;
  readonly targetType: StudioCommand["target_type"];
  readonly expectedRevision: number;
  readonly reason: string;
  readonly createdAt: string;
};

export async function fetchStudioMediaProjection(workspaceId: string, read: StudioMediaProjectionReader = readControlProjection): Promise<StudioMediaProjection> {
  const projection = StudioMediaProjectionResponseSchema.parse(await read("/v1/studio", workspaceId));
  return {
    media_artifacts: projection.media_artifacts,
    render_jobs: projection.render_jobs,
    notebooks: projection.notebooks,
    notebook_sources: projection.notebook_sources,
    notebook_generations: projection.notebook_generations,
    avatar_profiles: projection.avatar_profiles,
    shares: projection.shares,
    commands: projection.commands,
  };
}

export function buildStudioMediaControlView(projection: StudioMediaProjection, workspaceId: string): StudioMediaControlView {
  const mediaArtifacts = projection.media_artifacts.filter((media) => media.workspace_id === workspaceId).map(mediaSummary);
  const renderJobs = projection.render_jobs.filter((job) => job.workspace_id === workspaceId).map(renderJobSummary);
  const notebooks = projection.notebooks.filter((notebook) => notebook.workspace_id === workspaceId).map(notebookSummary);
  const notebookSources = projection.notebook_sources.filter((source) => source.workspace_id === workspaceId).map(notebookSourceSummary);
  const notebookGenerations = projection.notebook_generations.filter((generation) => generation.workspace_id === workspaceId).map(notebookGenerationSummary);
  const avatarProfiles = projection.avatar_profiles.filter((avatar) => avatar.workspace_id === workspaceId).map(avatarSummary);
  const shares = projection.shares.filter((share) => share.workspace_id === workspaceId).map(shareSummary);
  const commands = projection.commands.filter((command) => command.workspace_id === workspaceId).map(commandSummary);
  return {
    workspaceId,
    mediaArtifacts,
    renderJobs,
    notebooks,
    notebookSources,
    notebookGenerations,
    avatarProfiles,
    shares,
    commands,
    selected: {
      mediaId: mediaArtifacts[0]?.id ?? "missing-media",
      renderJobId: renderJobs[0]?.id ?? "missing-render-job",
      notebookId: notebooks[0]?.id ?? "missing-notebook",
      notebookSourceId: notebookSources[0]?.id ?? "missing-notebook-source",
      notebookGenerationId: notebookGenerations[0]?.id ?? "missing-notebook-generation",
      avatarId: avatarProfiles[0]?.id ?? "missing-avatar",
      shareId: shares[0]?.id ?? "missing-share",
    },
  };
}

export async function sendStudioMediaCommand(input: StudioMediaCommandInput, idempotencyKey: string, writer: StudioMediaCommandWriter = controlApi): Promise<void> {
  await writer.post(commandPath(input), {
    headers: { "Idempotency-Key": idempotencyKey, "If-Match": String(input.expected_revision) },
    json: { schema_version: 1, workspace_id: input.workspace_id, run_id: input.run_id, kind: input.kind, target_type: input.target_type, target_id: input.target_id, reason: input.reason, descriptor_only: true },
  });
}

export function resolveStudioMediaWorkspace(workspaceId: string): StudioMediaWorkspaceResolution {
  const alias = demoWorkspaceAlias(workspaceId);
  const parsed = WorkspaceIdSchema.safeParse(alias ?? workspaceId);
  if (!parsed.success) return { kind: "invalid", input: workspaceId };
  return { kind: "resolved", workspace_id: parsed.data };
}

export function shouldUseStudioMediaFallback(error: unknown): boolean {
  if (hasHttpStatus(error)) return false;
  return error instanceof TypeError && import.meta.env["VITE_NEXORA_STUDIO_MEDIA_OFFLINE_FIXTURE"] === "1";
}

function commandPath(input: StudioMediaCommandInput): string {
  if (input.kind === "notebook_generate") return `/v1/studio/notebooks/${encodeURIComponent(input.target_id)}/generate`;
  if (input.kind === "revoke_avatar") return `/v1/studio/avatar-profiles/${encodeURIComponent(input.target_id)}/revoke`;
  return `/v1/studio/media-artifacts/${encodeURIComponent(input.target_id)}/${input.kind}`;
}

function mediaSummary(media: MediaArtifactDescriptor): MediaArtifactSummary {
  return {
    id: media.id,
    title: media.title,
    mediaType: media.media_type,
    revision: media.revision,
    runId: media.run_id,
    moderationStatus: media.moderation_status,
    sharePolicy: media.share_policy,
    previewRef: media.preview_ref,
    renderVersion: media.render_version,
    temporaryUrlExpiresAt: media.temporary_url_expires_at,
    descriptorOnly: media.descriptor_only,
  };
}

function renderJobSummary(job: RenderJobDescriptor): RenderJobSummary {
  return {
    id: job.id,
    mediaArtifactId: job.media_artifact_id,
    runId: job.run_id,
    workerDescriptorId: job.worker_descriptor_id,
    status: job.status,
    inputHash: job.input_hash,
    outputArtifactRef: job.output_artifact_ref,
    sideEffectPolicy: job.side_effect_policy,
    descriptorOnly: job.descriptor_only,
  };
}

function notebookSummary(notebook: NotebookDescriptor): NotebookSummary {
  return {
    id: notebook.id,
    title: notebook.title,
    revision: notebook.revision,
    runId: notebook.run_id,
    sourcePolicy: notebook.source_policy,
    generationPolicy: notebook.generation_policy,
    sharePolicy: notebook.share_policy,
    descriptorOnly: notebook.descriptor_only,
  };
}

function notebookSourceSummary(source: NotebookSourceDescriptor): NotebookSourceSummary {
  return {
    id: source.id,
    notebookId: source.notebook_id,
    runId: source.run_id,
    sourceKind: source.source_kind,
    sourceRef: source.source_ref,
    sourceHash: source.source_hash,
    snapshotRef: source.snapshot_ref,
    title: source.title,
    descriptorOnly: source.descriptor_only,
  };
}

function notebookGenerationSummary(generation: NotebookGenerationDescriptor): NotebookGenerationSummary {
  return {
    id: generation.id,
    notebookId: generation.notebook_id,
    runId: generation.run_id,
    sourceIds: generation.source_ids,
    generationKind: generation.generation_kind,
    outputRef: generation.output_ref,
    citationRefs: generation.citation_refs,
    status: generation.status,
    descriptorOnly: generation.descriptor_only,
  };
}

function avatarSummary(avatar: AvatarProfileDescriptor): AvatarSummary {
  return {
    id: avatar.id,
    displayName: avatar.display_name,
    revision: avatar.revision,
    runId: avatar.run_id,
    consentStatus: avatar.consent_status,
    consentArtifactRef: avatar.consent_artifact_ref,
    voiceCloneMode: avatar.voice_clone_mode,
    renderMode: avatar.render_mode,
    expiresAt: avatar.expires_at,
    revokedAt: avatar.revoked_at,
    descriptorOnly: avatar.descriptor_only,
  };
}

function shareSummary(share: StudioShareDescriptor): StudioShareSummary {
  return {
    id: share.id,
    mediaArtifactId: share.media_artifact_id,
    runId: share.run_id,
    status: share.status,
    previewRef: share.preview_ref,
    expiresAt: share.expires_at,
    descriptorOnly: share.descriptor_only,
  };
}

function commandSummary(command: StudioCommand): StudioCommandSummary {
  return { id: command.command_id, kind: command.kind, targetId: command.target_id, targetType: command.target_type, expectedRevision: command.expected_revision, reason: command.reason, createdAt: command.created_at };
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
