import type { FastifyInstance } from "fastify";
import { requestContext, requiredExpectedVersion, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { ControlRouteOptions } from "./index.js";
import { IdParamsSchema, requireQueryScope, RunParamsSchema, WorkspaceQuerySchema } from "./schemas.js";

export async function registerRunRoutes(app: FastifyInstance, options: ControlRouteOptions): Promise<void> {
  app.post("/v1/runs", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.commands.createRun(request.body, context.actor, requiredIdempotencyKey(context), context.trace_id));
  });
  app.post("/v1/runs/:id/:action", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = RunParamsSchema.parse(request.params);
    const key = requiredIdempotencyKey(context);
    const version = requiredExpectedVersion(context);
    if (params.action === "retry") return reply.status(202).send(options.commands.retryRun(request.body, params.id, context.actor, key, version, context.trace_id));
    const toStatus = params.action === "pause" ? "paused" : params.action === "resume" ? "running" : "cancelled";
    return reply.status(202).send(options.commands.transitionRun(request.body, params.id, context.actor, key, version, context.trace_id, toStatus));
  });
  app.get("/v1/runs", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, runs: options.queries.listRuns(query.workspace_id) };
  });
  app.get("/v1/runs/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = IdParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, ...options.queries.getRunDetail(query.workspace_id, params.id) };
  });
}
