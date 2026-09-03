import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DescriptorIdSchema, UlidSchema } from "@nexora/contracts";
import { requestContext, requiredExpectedVersion, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { StudioMediaService } from "../services/studio-media-service.js";
import type { ControlRouteOptions } from "./index.js";
import { requireQueryScope, WorkspaceQuerySchema } from "./schemas.js";

const MediaParamsSchema = z.object({ id: UlidSchema }).strict();
const RenderJobParamsSchema = z.object({ id: UlidSchema }).strict();
const NotebookParamsSchema = z.object({ id: DescriptorIdSchema }).strict();
const NotebookFactParamsSchema = z.object({ id: UlidSchema }).strict();
const AvatarParamsSchema = z.object({ id: DescriptorIdSchema }).strict();
const StudioShareParamsSchema = z.object({ id: UlidSchema }).strict();
const StudioCommandParamsSchema = z.object({ id: UlidSchema }).strict();

export type StudioMediaRouteOptions = ControlRouteOptions & { readonly studioMedia: StudioMediaService };

export async function registerStudioMediaRoutes(app: FastifyInstance, options: StudioMediaRouteOptions): Promise<void> {
  app.get("/v1/studio", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, ...options.studioMedia.list(query.workspace_id) };
  });

  app.post("/v1/studio/media-artifacts", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.studioMedia.registerMediaArtifact(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.post("/v1/studio/render-jobs", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.studioMedia.registerRenderJob(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/studio/render-jobs/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = RenderJobParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, render_job: options.studioMedia.getRenderJob(query.workspace_id, params.id) };
  });

  app.get("/v1/studio/media-artifacts/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = MediaParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, media_artifact: options.studioMedia.getMediaArtifact(query.workspace_id, params.id) };
  });

  app.post("/v1/studio/notebooks", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.studioMedia.registerNotebook(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.post("/v1/studio/notebook-sources", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.studioMedia.registerNotebookSource(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/studio/notebook-sources/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = NotebookFactParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, notebook_source: options.studioMedia.getNotebookSource(query.workspace_id, params.id) };
  });

  app.post("/v1/studio/notebook-generations", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.studioMedia.registerNotebookGeneration(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/studio/notebook-generations/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = NotebookFactParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, notebook_generation: options.studioMedia.getNotebookGeneration(query.workspace_id, params.id) };
  });

  app.get("/v1/studio/notebooks/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = NotebookParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, notebook: options.studioMedia.getNotebook(query.workspace_id, params.id) };
  });

  app.post("/v1/studio/avatar-profiles", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.studioMedia.registerAvatarProfile(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.post("/v1/studio/shares", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.studioMedia.registerShare(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/studio/shares/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = StudioShareParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, share: options.studioMedia.getShare(query.workspace_id, params.id) };
  });

  app.get("/v1/studio/avatar-profiles/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = AvatarParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, avatar_profile: options.studioMedia.getAvatarProfile(query.workspace_id, params.id) };
  });

  app.get("/v1/studio/commands/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = StudioCommandParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, command: options.studioMedia.getCommand(query.workspace_id, params.id) };
  });

  app.post("/v1/studio/media-artifacts/:id/preview", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = MediaParamsSchema.parse(request.params);
    return reply.status(202).send(options.studioMedia.command(request.body, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context), { targetId: params.id, targetType: "media_artifact", kind: "preview" }));
  });

  app.post("/v1/studio/media-artifacts/:id/share", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = MediaParamsSchema.parse(request.params);
    return reply.status(202).send(options.studioMedia.command(request.body, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context), { targetId: params.id, targetType: "media_artifact", kind: "share" }));
  });

  app.post("/v1/studio/media-artifacts/:id/rerender", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = MediaParamsSchema.parse(request.params);
    return reply.status(202).send(options.studioMedia.command(request.body, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context), { targetId: params.id, targetType: "media_artifact", kind: "rerender" }));
  });

  app.post("/v1/studio/media-artifacts/:id/render", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = MediaParamsSchema.parse(request.params);
    return reply.status(202).send(options.studioMedia.command(request.body, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context), { targetId: params.id, targetType: "media_artifact", kind: "rerender" }));
  });

  app.post("/v1/studio/notebooks/:id/generate", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = NotebookParamsSchema.parse(request.params);
    return reply.status(202).send(options.studioMedia.command(request.body, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context), { targetId: params.id, targetType: "notebook", kind: "notebook_generate" }));
  });

  app.post("/v1/studio/avatar-profiles/:id/revoke", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = AvatarParamsSchema.parse(request.params);
    return reply.status(202).send(options.studioMedia.command(request.body, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context), { targetId: params.id, targetType: "avatar_profile", kind: "revoke_avatar" }));
  });
}
