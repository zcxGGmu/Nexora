import { z } from "zod";
import {
  AvatarProfileDescriptorSchema,
  MediaArtifactDescriptorSchema,
  NotebookDescriptorSchema,
  NotebookGenerationDescriptorSchema,
  NotebookSourceDescriptorSchema,
  RenderJobDescriptorSchema,
  StudioCommandSchema,
  StudioShareDescriptorSchema,
  UlidSchema,
  WorkspaceIdSchema,
  type AvatarProfileDescriptor,
  type MediaArtifactDescriptor,
  type NotebookDescriptor,
  type NotebookGenerationDescriptor,
  type NotebookSourceDescriptor,
  type RenderJobDescriptor,
  type StudioCommand,
  type StudioShareDescriptor,
} from "@nexora/contracts";
import {
  AvatarProfileRepository,
  IdempotencyRepository,
  MediaArtifactRepository,
  NotebookGenerationRepository,
  NotebookRepository,
  NotebookSourceRepository,
  RenderJobRepository,
  StudioCommandRepository,
  StudioShareRepository,
  withTransaction,
  type IdempotencyRecord,
  type SqliteDatabase,
} from "@nexora/persistence";
import { assertScope, type PolicyActor } from "@nexora/policy";
import { accepted, requestHash } from "./command-helpers.js";
import type { AcceptedCommand, IdFactory } from "./command-service.js";
import { ApiHttpError } from "./errors.js";

export type StudioMediaServiceOptions = {
  readonly database: SqliteDatabase;
  readonly clock: { readonly now: () => string };
  readonly idFactory: IdFactory;
};

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

const WorkspaceOnlyInputSchema = z.object({ workspace_id: WorkspaceIdSchema }).passthrough();

const StudioCommandInputSchema = z.object({
  schema_version: z.literal(1),
  workspace_id: WorkspaceIdSchema,
  run_id: UlidSchema,
  kind: z.enum(["preview", "share", "rerender", "notebook_generate", "revoke_avatar"]),
  target_type: z.enum(["media_artifact", "notebook", "avatar_profile"]),
  target_id: z.string().min(1).max(96),
  reason: z.string().min(1).max(1000),
  descriptor_only: z.literal(true),
}).strict();

type StudioMediaRecord = MediaArtifactDescriptor | RenderJobDescriptor | NotebookDescriptor | NotebookSourceDescriptor | NotebookGenerationDescriptor | AvatarProfileDescriptor | StudioShareDescriptor;
type StudioRouteCommandKind = "preview" | "share" | "rerender" | "notebook_generate" | "revoke_avatar";
type StudioRouteTargetType = "media_artifact" | "notebook" | "avatar_profile";

export class StudioMediaService {
  private readonly idempotency: IdempotencyRepository;
  private readonly media: MediaArtifactRepository;
  private readonly renderJobs: RenderJobRepository;
  private readonly notebooks: NotebookRepository;
  private readonly notebookSources: NotebookSourceRepository;
  private readonly notebookGenerations: NotebookGenerationRepository;
  private readonly avatars: AvatarProfileRepository;
  private readonly shares: StudioShareRepository;
  private readonly commands: StudioCommandRepository;

  constructor(private readonly options: StudioMediaServiceOptions) {
    this.idempotency = new IdempotencyRepository(options.database);
    this.media = new MediaArtifactRepository(options.database);
    this.renderJobs = new RenderJobRepository(options.database);
    this.notebooks = new NotebookRepository(options.database);
    this.notebookSources = new NotebookSourceRepository(options.database);
    this.notebookGenerations = new NotebookGenerationRepository(options.database);
    this.avatars = new AvatarProfileRepository(options.database);
    this.shares = new StudioShareRepository(options.database);
    this.commands = new StudioCommandRepository(options.database);
  }

  list(workspaceId: string): StudioMediaProjection {
    const parsedWorkspace = WorkspaceIdSchema.parse(workspaceId);
    return {
      media_artifacts: this.media.list(parsedWorkspace),
      render_jobs: this.renderJobs.list(parsedWorkspace),
      notebooks: this.notebooks.list(parsedWorkspace),
      notebook_sources: this.notebookSources.list(parsedWorkspace),
      notebook_generations: this.notebookGenerations.list(parsedWorkspace),
      avatar_profiles: this.avatars.list(parsedWorkspace),
      shares: this.shares.list(parsedWorkspace),
      commands: this.commands.list(parsedWorkspace),
    };
  }

  getMediaArtifact(workspaceId: string, mediaId: string): MediaArtifactDescriptor {
    const mediaArtifact = this.media.get(WorkspaceIdSchema.parse(workspaceId), mediaId);
    if (mediaArtifact === undefined) throw notFound();
    return mediaArtifact;
  }

  getRenderJob(workspaceId: string, renderJobId: string): RenderJobDescriptor {
    const renderJob = this.renderJobs.get(WorkspaceIdSchema.parse(workspaceId), renderJobId);
    if (renderJob === undefined) throw notFound();
    return renderJob;
  }

  getNotebook(workspaceId: string, notebookId: string): NotebookDescriptor {
    const notebook = this.notebooks.get(WorkspaceIdSchema.parse(workspaceId), notebookId);
    if (notebook === undefined) throw notFound();
    return notebook;
  }

  getNotebookSource(workspaceId: string, sourceId: string): NotebookSourceDescriptor {
    const source = this.notebookSources.get(WorkspaceIdSchema.parse(workspaceId), sourceId);
    if (source === undefined) throw notFound();
    return source;
  }

  getNotebookGeneration(workspaceId: string, generationId: string): NotebookGenerationDescriptor {
    const generation = this.notebookGenerations.get(WorkspaceIdSchema.parse(workspaceId), generationId);
    if (generation === undefined) throw notFound();
    return generation;
  }

  getAvatarProfile(workspaceId: string, avatarId: string): AvatarProfileDescriptor {
    const avatar = this.avatars.get(WorkspaceIdSchema.parse(workspaceId), avatarId);
    if (avatar === undefined) throw notFound();
    return avatar;
  }

  getShare(workspaceId: string, shareId: string): StudioShareDescriptor {
    const share = this.shares.get(WorkspaceIdSchema.parse(workspaceId), shareId);
    if (share === undefined) throw notFound();
    return share;
  }

  getCommand(workspaceId: string, commandId: string): StudioCommand {
    const command = this.commands.get(WorkspaceIdSchema.parse(workspaceId), commandId);
    if (command === undefined) throw notFound();
    return command;
  }

  registerMediaArtifact(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const workspaceId = this.requireAdminForInput(input, actor);
    const mediaArtifact = MediaArtifactDescriptorSchema.parse(fillMissingTimestamps(input, now));
    if (mediaArtifact.workspace_id !== workspaceId) throw invalidScope();
    return this.register(mediaArtifact, idempotencyKey, "media_artifact", () => this.media.create(mediaArtifact));
  }

  registerNotebook(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const workspaceId = this.requireAdminForInput(input, actor);
    const notebook = NotebookDescriptorSchema.parse(fillMissingTimestamps(input, now));
    if (notebook.workspace_id !== workspaceId) throw invalidScope();
    return this.register(notebook, idempotencyKey, "notebook", () => this.notebooks.create(notebook));
  }

  registerRenderJob(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const workspaceId = this.requireAdminForInput(input, actor);
    const renderJob = RenderJobDescriptorSchema.parse(fillMissingTimestamps(input, now));
    if (renderJob.workspace_id !== workspaceId) throw invalidScope();
    return this.register(renderJob, idempotencyKey, "render_job", () => this.renderJobs.create(renderJob));
  }

  registerNotebookSource(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const workspaceId = this.requireAdminForInput(input, actor);
    const source = NotebookSourceDescriptorSchema.parse(fillMissingTimestamps(input, now));
    if (source.workspace_id !== workspaceId) throw invalidScope();
    return this.register(source, idempotencyKey, "notebook_source", () => this.notebookSources.create(source));
  }

  registerNotebookGeneration(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const workspaceId = this.requireAdminForInput(input, actor);
    const generation = NotebookGenerationDescriptorSchema.parse(fillMissingTimestamps(input, now));
    if (generation.workspace_id !== workspaceId) throw invalidScope();
    return this.register(generation, idempotencyKey, "notebook_generation", () => this.notebookGenerations.create(generation));
  }

  registerAvatarProfile(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const workspaceId = this.requireAdminForInput(input, actor);
    const avatar = AvatarProfileDescriptorSchema.parse(fillMissingTimestamps(input, now));
    if (avatar.workspace_id !== workspaceId) throw invalidScope();
    return this.register(avatar, idempotencyKey, "avatar_profile", () => this.avatars.create(avatar));
  }

  registerShare(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const workspaceId = this.requireAdminForInput(input, actor);
    const share = StudioShareDescriptorSchema.parse(fillMissingTimestamps(input, now));
    if (share.workspace_id !== workspaceId) throw invalidScope();
    return this.register(share, idempotencyKey, "studio_share", () => this.shares.create(share));
  }

  command(input: unknown, actor: PolicyActor, idempotencyKey: string, expectedVersion: number, route: { readonly targetId: string; readonly kind: StudioRouteCommandKind; readonly targetType: StudioRouteTargetType }): AcceptedCommand {
    const workspaceId = this.requireAdminForInput(input, actor);
    const body = StudioCommandInputSchema.parse(input);
    if (body.workspace_id !== workspaceId || body.kind !== route.kind || body.target_type !== route.targetType || body.target_id !== route.targetId) throw invalidScope();
    return withTransaction(this.options.database, () => {
      const digest = requestHash({ ...body, expected_revision: expectedVersion });
      const existingReservation = this.idempotency.get(body.workspace_id, idempotencyKey);
      if (existingReservation !== undefined) {
        if (existingReservation.request_hash !== digest || existingReservation.resource_type !== "studio_command") throw idempotencyConflict();
        if (this.commands.get(body.workspace_id, existingReservation.resource_id) === undefined) throw idempotencyConflict();
        return accepted({ command_id: idempotencyKey, object_type: "studio_command", object_id: existingReservation.resource_id, workspace_id: body.workspace_id });
      }
      const commandId = this.options.idFactory();
      const reservation = this.idempotency.reserveOrGet({ workspace_id: body.workspace_id, idempotency_key: idempotencyKey, request_hash: digest, resource_type: "studio_command", resource_id: commandId, created_at: this.now() });
      const command = StudioCommandSchema.parse({ ...body, command_id: reservation.record.resource_id, idempotency_key: idempotencyKey, expected_revision: expectedVersion, created_at: this.now() });
      this.commands.record(command);
      return accepted({ command_id: idempotencyKey, object_type: "studio_command", object_id: command.command_id, workspace_id: command.workspace_id });
    });
  }

  private register<TRecord extends StudioMediaRecord>(record: TRecord, idempotencyKey: string, objectType: string, create: () => unknown): AcceptedCommand {
    return withTransaction(this.options.database, () => {
      const reservation = this.idempotency.reserveOrGet({ workspace_id: record.workspace_id, idempotency_key: idempotencyKey, request_hash: requestHash(stripMetadataTimestamps(record)), resource_type: objectType, resource_id: record.id, created_at: this.now() });
      if (reservation.kind === "existing") {
        requireIdempotentResource(reservation.record, objectType, record.id);
        return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: reservation.record.resource_id, workspace_id: record.workspace_id });
      }
      create();
      return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: record.id, workspace_id: record.workspace_id });
    });
  }

  private requireAdminForInput(input: unknown, actor: PolicyActor): string {
    const workspaceId = WorkspaceOnlyInputSchema.parse(input).workspace_id;
    const decision = assertScope({ actor, action: "workspace:admin", enforcement_point: "api", requested_scope: { kind: "workspace", id: workspaceId } });
    if (!decision.allowed) throw new ApiHttpError({ status_code: 403, code: decision.code, message: decision.reason, retryable: false, required_action: decision.required_action });
    return workspaceId;
  }

  private now(): string { return this.options.clock.now(); }
}

function fillMissingTimestamps(input: unknown, now: string): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
  return { created_at: now, updated_at: now, ...input };
}

function stripMetadataTimestamps<T extends StudioMediaRecord>(record: T): Omit<T, "created_at" | "updated_at"> {
  const { created_at: _createdAt, updated_at: _updatedAt, ...stable } = record;
  void _createdAt;
  void _updatedAt;
  return stable;
}

function requireIdempotentResource(record: IdempotencyRecord, resourceType: string, resourceId: string): void {
  if (record.resource_type !== resourceType || record.resource_id !== resourceId) throw idempotencyConflict();
}

function invalidScope(): ApiHttpError {
  return new ApiHttpError({ status_code: 403, code: "SCOPE_DENIED", message: "Studio media request scope is invalid", retryable: false, required_action: "check_scope" });
}

function idempotencyConflict(): ApiHttpError {
  return new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency key was reused for another studio media request", retryable: false, required_action: "use_new_idempotency_key" });
}

function notFound(): ApiHttpError {
  return new ApiHttpError({ status_code: 404, code: "SCOPE_DENIED", message: "Resource not found", retryable: false, required_action: "check_scope" });
}
