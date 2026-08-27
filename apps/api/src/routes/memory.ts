import type { FastifyInstance } from "fastify";
import { requestContext, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { ControlRouteOptions } from "./index.js";
import { IdParamsSchema, requireQueryScope, WorkspaceQuerySchema } from "./schemas.js";

export async function registerMemoryRoutes(app: FastifyInstance, options: ControlRouteOptions): Promise<void> {
  app.post("/v1/memory/:id/resolve", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = IdParamsSchema.parse(request.params);
    return reply.status(202).send(options.commands.resolveMemory(request.body, params.id, context.actor, requiredIdempotencyKey(context)));
  });
  app.get("/v1/memory", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "memory:read", query.workspace_id);
    return { schema_version: 1, memory: options.queries.listMemory(query.workspace_id) };
  });
  app.get("/v1/memory/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = IdParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "memory:read", query.workspace_id);
    return { schema_version: 1, memory: options.queries.getMemory(query.workspace_id, params.id) };
  });
}
