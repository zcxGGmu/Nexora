import type { FastifyInstance } from "fastify";
import { requestContext, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { ControlRouteOptions } from "./index.js";
import { IdParamsSchema, requireQueryScope, WorkspaceQuerySchema } from "./schemas.js";

export async function registerGoalRoutes(app: FastifyInstance, options: ControlRouteOptions): Promise<void> {
  app.post("/v1/goals", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.commands.createGoal(request.body, context.actor, requiredIdempotencyKey(context)));
  });
  app.get("/v1/goals", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, goals: options.queries.listGoals(query.workspace_id) };
  });
  app.get("/v1/goals/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = IdParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, goal: options.queries.getGoal(query.workspace_id, params.id) };
  });
}
