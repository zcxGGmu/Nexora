import type { FastifyInstance } from "fastify";
import { requestContext, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { ControlRouteOptions } from "./index.js";
import { IdParamsSchema, requireQueryScope, WorkspaceQuerySchema } from "./schemas.js";

export async function registerScheduleRoutes(app: FastifyInstance, options: ControlRouteOptions): Promise<void> {
  app.post("/v1/schedules", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.scheduleCommands.createSchedule(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/schedules", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, schedules: options.queries.listSchedules(query.workspace_id) };
  });

  app.get("/v1/schedules/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = IdParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, schedule: options.queries.getSchedule(query.workspace_id, params.id) };
  });

  app.get("/v1/schedules/:id/occurrences", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = IdParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, occurrences: options.queries.listScheduleOccurrences(query.workspace_id, params.id) };
  });
}
