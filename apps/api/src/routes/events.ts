import type { FastifyInstance } from "fastify";
import { requestContext } from "../plugins/request-context.js";
import type { ControlRouteOptions } from "./index.js";
import { EventQuerySchema, IdParamsSchema, requireQueryScope } from "./schemas.js";

export async function registerEventRoutes(app: FastifyInstance, options: ControlRouteOptions): Promise<void> {
  app.get("/v1/runs/:id/events", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = IdParamsSchema.parse(request.params);
    const query = EventQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    options.queries.getRunDetail(query.workspace_id, params.id);
    const body = options.sse.stream({
      workspace_id: query.workspace_id,
      run_id: params.id,
      after: query.after ?? null,
      last_event_id: lastEventId(request.headers["last-event-id"]),
      limit: query.limit,
      step_id: query.step_id ?? null,
    });
    return reply.header("content-type", "text/event-stream; charset=utf-8").header("cache-control", "no-cache").send(body);
  });
}

function lastEventId(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
