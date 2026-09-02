import type { FastifyInstance } from "fastify";
import { DescriptorIdSchema } from "@nexora/contracts";
import { requestContext, requiredExpectedVersion, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { ControlRouteOptions } from "./index.js";
import { requireQueryScope, WorkspaceQuerySchema } from "./schemas.js";
import { z } from "zod";

const SkillParamsSchema = z.object({ id: DescriptorIdSchema }).strict();

export async function registerSkillsLearningRoutes(app: FastifyInstance, options: ControlRouteOptions): Promise<void> {
  app.get("/v1/skills", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, skills: options.queries.listSkills(query.workspace_id) };
  });

  app.get("/v1/skills/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = SkillParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, ...options.queries.getSkillDetail(query.workspace_id, params.id) };
  });

  app.post("/v1/learning/candidates", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.skills.createLearningCandidate(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.post("/v1/skills/:id/install", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = SkillParamsSchema.parse(request.params);
    return reply.status(202).send(options.skills.installSkill(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });

  app.post("/v1/skills/:id/approve", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = SkillParamsSchema.parse(request.params);
    return reply.status(202).send(options.skills.approveSkill(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });

  app.post("/v1/skills/:id/revoke", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = SkillParamsSchema.parse(request.params);
    return reply.status(202).send(options.skills.revokeSkill(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });

  app.post("/v1/skills/:id/quarantine", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = SkillParamsSchema.parse(request.params);
    return reply.status(202).send(options.skills.quarantineSkill(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });

  app.post("/v1/skills/:id/rollback", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = SkillParamsSchema.parse(request.params);
    return reply.status(202).send(options.skills.rollbackSkill(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });
}
