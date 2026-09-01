import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requestContext, requiredExpectedVersion, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { ControlRouteOptions } from "./index.js";
import { IdParamsSchema, requireQueryScope, WorkspaceQuerySchema } from "./schemas.js";

const GoalLoopActionParamsSchema = IdParamsSchema.extend({ action: z.enum(["pause", "resume", "steer", "judge"]) }).strict();

export async function registerGoalModeRoutes(app: FastifyInstance, options: ControlRouteOptions): Promise<void> {
  app.post("/v1/goal-loops", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.commands.createGoalLoop(request.body, context.actor, requiredIdempotencyKey(context)));
  });
  app.get("/v1/goal-loops", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, goal_loops: options.queries.listGoalLoops(query.workspace_id) };
  });
  app.get("/v1/goal-loops/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = IdParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, ...options.queries.getGoalLoopDetail(query.workspace_id, params.id) };
  });
  app.post("/v1/goal-loops/:id/subgoals", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = IdParamsSchema.parse(request.params);
    return reply.status(202).send(options.commands.createSubgoalLoop(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });
  app.post("/v1/goal-loops/:id/:action", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = GoalLoopActionParamsSchema.parse(request.params);
    const key = requiredIdempotencyKey(context);
    const version = requiredExpectedVersion(context);
    if (params.action === "pause") return reply.status(202).send(options.commands.pauseGoalLoop(request.body, params.id, context.actor, key, version));
    if (params.action === "resume") return reply.status(202).send(options.commands.resumeGoalLoop(request.body, params.id, context.actor, key, version));
    if (params.action === "steer") return reply.status(202).send(options.commands.steerGoalLoop(request.body, params.id, context.actor, key, version));
    return reply.status(202).send(options.commands.recordGoalLoopJudge(request.body, params.id, context.actor, key, version));
  });
}
