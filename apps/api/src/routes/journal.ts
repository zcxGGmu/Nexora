import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DescriptorIdSchema, UlidSchema } from "@nexora/contracts";
import { requestContext, requiredExpectedVersion, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { JournalService } from "../services/journal-service.js";
import type { ControlRouteOptions } from "./index.js";
import { requireQueryScope, WorkspaceQuerySchema } from "./schemas.js";

const VaultParamsSchema = z.object({ id: DescriptorIdSchema }).strict();
const JournalFactParamsSchema = z.object({ id: UlidSchema }).strict();
const WritebackParamsSchema = z.object({ id: UlidSchema }).strict();

export type JournalRouteOptions = ControlRouteOptions & { readonly journal: JournalService };

export async function registerJournalRoutes(app: FastifyInstance, options: JournalRouteOptions): Promise<void> {
  app.get("/v1/vaults", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, vaults: options.queries.listVaults(query.workspace_id) };
  });

  app.get("/v1/vaults/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = VaultParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, ...options.queries.getJournalVaultDetail(query.workspace_id, params.id) };
  });

  app.post("/v1/vaults", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.journal.registerVault(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.post("/v1/journal/entries", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.journal.createEntry(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/journal/entries/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = JournalFactParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, entry: options.queries.getJournalEntry(query.workspace_id, params.id) };
  });

  app.post("/v1/journal/sources", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.journal.recordSource(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/journal/sources/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = JournalFactParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, source: options.queries.getJournalSource(query.workspace_id, params.id) };
  });

  app.post("/v1/journal/graph-indexes", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.journal.recordGraphIndex(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/journal/graph-indexes/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = JournalFactParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, graph_index: options.queries.getJournalGraphIndex(query.workspace_id, params.id) };
  });

  app.post("/v1/journal/memory-candidates", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.journal.createMemoryCandidate(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/journal/memory-candidates/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = JournalFactParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, memory_candidate: options.queries.getJournalMemoryCandidate(query.workspace_id, params.id) };
  });

  app.post("/v1/journal/writebacks", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.journal.requestWriteback(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/journal/writebacks/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = WritebackParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, writeback_request: options.queries.getJournalWritebackRequest(query.workspace_id, params.id) };
  });

  for (const decision of ["approve", "reject"] as const) {
    app.post(`/v1/journal/writebacks/:id/${decision}`, async (request, reply) => {
      const context = requestContext(request, options.auth);
      const params = WritebackParamsSchema.parse(request.params);
      return reply.status(202).send(options.journal.decideWriteback(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context), decision));
    });
  }
}
