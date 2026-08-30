import type { FastifyInstance } from "fastify";
import { DescriptorIdSchema } from "@nexora/contracts";
import { requestContext, requiredExpectedVersion, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { ControlRouteOptions } from "./index.js";
import { requireQueryScope, WorkspaceQuerySchema } from "./schemas.js";
import { z } from "zod";

const DescriptorParamsSchema = z.object({ id: DescriptorIdSchema }).strict();

export async function registerRegistryRoutes(app: FastifyInstance, options: ControlRouteOptions): Promise<void> {
  app.get("/v1/registry", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return options.queries.getRegistry(query.workspace_id);
  });

  app.get("/v1/registry/runtimes/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = DescriptorParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, runtime: options.queries.getRuntime(query.workspace_id, params.id) };
  });
  app.get("/v1/registry/providers/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = DescriptorParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, provider: options.queries.getProvider(query.workspace_id, params.id) };
  });
  app.get("/v1/registry/models/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = DescriptorParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, model: options.queries.getModel(query.workspace_id, params.id) };
  });
  app.get("/v1/registry/backends/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = DescriptorParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, backend: options.queries.getBackend(query.workspace_id, params.id) };
  });
  app.get("/v1/registry/tools/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = DescriptorParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, tool: options.queries.getTool(query.workspace_id, params.id) };
  });

  app.post("/v1/registry/runtimes", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.registryCommands.registerRuntime(request.body, context.actor, requiredIdempotencyKey(context)));
  });
  app.post("/v1/registry/providers", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.registryCommands.registerProvider(request.body, context.actor, requiredIdempotencyKey(context)));
  });
  app.post("/v1/registry/models", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.registryCommands.registerModel(request.body, context.actor, requiredIdempotencyKey(context)));
  });
  app.post("/v1/registry/backends", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.registryCommands.registerBackend(request.body, context.actor, requiredIdempotencyKey(context)));
  });
  app.post("/v1/registry/tools", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.registryCommands.registerTool(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.put("/v1/registry/runtimes/:id", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = DescriptorParamsSchema.parse(request.params);
    return reply.status(202).send(options.registryCommands.updateRuntime(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });
  app.put("/v1/registry/providers/:id", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = DescriptorParamsSchema.parse(request.params);
    return reply.status(202).send(options.registryCommands.updateProvider(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });
  app.put("/v1/registry/models/:id", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = DescriptorParamsSchema.parse(request.params);
    return reply.status(202).send(options.registryCommands.updateModel(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });
  app.put("/v1/registry/backends/:id", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = DescriptorParamsSchema.parse(request.params);
    return reply.status(202).send(options.registryCommands.updateBackend(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });
  app.put("/v1/registry/tools/:id", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = DescriptorParamsSchema.parse(request.params);
    return reply.status(202).send(options.registryCommands.updateTool(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });
}
