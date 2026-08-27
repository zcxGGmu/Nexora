import type { FastifyInstance } from "fastify";
import { requestContext, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { ControlRouteOptions } from "./index.js";
import { IdParamsSchema, requireQueryScope, VersionedReviewQuerySchema, WorkspaceQuerySchema } from "./schemas.js";

export async function registerReviewRoutes(app: FastifyInstance, options: ControlRouteOptions): Promise<void> {
  app.post("/v1/reviews/:id/decision", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = IdParamsSchema.parse(request.params);
    return reply.status(202).send(options.commands.decideReview(request.body, params.id, context.actor, requiredIdempotencyKey(context)));
  });
  app.get("/v1/reviews", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "artifact:read", query.workspace_id);
    return { schema_version: 1, reviews: options.queries.listReviews(query.workspace_id) };
  });
  app.get("/v1/reviews/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = VersionedReviewQuerySchema.parse(request.query);
    const params = IdParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "artifact:read", query.workspace_id);
    return { schema_version: 1, review: options.queries.getReview(query.workspace_id, params.id, query.review_version) };
  });
}
