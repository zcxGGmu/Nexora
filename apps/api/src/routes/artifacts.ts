import type { FastifyInstance } from "fastify";
import { requestContext } from "../plugins/request-context.js";
import type { ControlRouteOptions } from "./index.js";
import { IdParamsSchema, requireQueryScope, VersionedArtifactQuerySchema, WorkspaceQuerySchema } from "./schemas.js";

export async function registerArtifactRoutes(app: FastifyInstance, options: ControlRouteOptions): Promise<void> {
  app.get("/v1/artifacts", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "artifact:read", query.workspace_id);
    return { schema_version: 1, artifacts: options.queries.listArtifacts(query.workspace_id) };
  });
  app.get("/v1/artifacts/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = VersionedArtifactQuerySchema.parse(request.query);
    const params = IdParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "artifact:read", query.workspace_id);
    return { schema_version: 1, artifact: options.queries.getArtifact(query.workspace_id, params.id, query.version) };
  });
  app.get("/v1/receipts", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "artifact:read", query.workspace_id);
    return { schema_version: 1, receipts: options.queries.listReceipts(query.workspace_id), egress_receipts: options.queries.listEgressReceipts(query.workspace_id) };
  });
  app.get("/v1/receipts/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = IdParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "artifact:read", query.workspace_id);
    return { schema_version: 1, receipt: options.queries.getReceipt(query.workspace_id, params.id) };
  });
  app.get("/v1/egress-receipts/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = IdParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "artifact:read", query.workspace_id);
    return { schema_version: 1, egress_receipt: options.queries.getEgressReceipt(query.workspace_id, params.id) };
  });
}
