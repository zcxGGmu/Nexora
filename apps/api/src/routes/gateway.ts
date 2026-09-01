import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requestContext, requiredExpectedVersion, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { GatewayService } from "../services/gateway-service.js";
import type { ControlRouteOptions } from "./index.js";
import { requireQueryScope, WorkspaceQuerySchema } from "./schemas.js";

const DescriptorParamsSchema = z.object({ id: z.string().min(1).max(96) }).strict();
const SessionParamsSchema = z.object({ id: z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/) }).strict();
const ReceiptParamsSchema = z.object({ id: z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/) }).strict();
const MessageQuerySchema = WorkspaceQuerySchema.extend({ after: z.string().min(1).max(512).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).strict();
const DeliveryQuerySchema = WorkspaceQuerySchema.extend({ session_id: z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/).optional() }).strict();
const AllowlistQuerySchema = WorkspaceQuerySchema.extend({ channel_id: z.string().min(1).max(96).optional() }).strict();

export type GatewayRouteOptions = ControlRouteOptions & { readonly gateway: GatewayService };

export async function registerGatewayRoutes(app: FastifyInstance, options: GatewayRouteOptions): Promise<void> {
  app.get("/v1/gateways", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, gateways: options.gateway.listGateways(query.workspace_id) };
  });
  app.get("/v1/gateways/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = DescriptorParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, gateway: options.gateway.getGateway(query.workspace_id, params.id) };
  });
  app.post("/v1/gateways", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.gateway.registerGateway(request.body, context.actor, requiredIdempotencyKey(context)));
  });
  app.put("/v1/gateways/:id", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = DescriptorParamsSchema.parse(request.params);
    return reply.status(202).send(options.gateway.updateGateway(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });

  app.get("/v1/channels", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, channels: options.gateway.listChannels(query.workspace_id) };
  });
  app.get("/v1/channels/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = DescriptorParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, channel: options.gateway.getChannel(query.workspace_id, params.id) };
  });
  app.post("/v1/channels", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.gateway.registerChannel(request.body, context.actor, requiredIdempotencyKey(context)));
  });
  app.put("/v1/channels/:id", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = DescriptorParamsSchema.parse(request.params);
    return reply.status(202).send(options.gateway.updateChannel(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });

  app.get("/v1/sessions", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, sessions: options.gateway.listSessions(query.workspace_id) };
  });
  app.get("/v1/sessions/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = SessionParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, session: options.gateway.getSession(query.workspace_id, params.id) };
  });
  app.post("/v1/sessions", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.gateway.registerSession(request.body, context.actor, requiredIdempotencyKey(context)));
  });
  app.put("/v1/sessions/:id", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = SessionParamsSchema.parse(request.params);
    return reply.status(202).send(options.gateway.updateSession(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });

  for (const kind of ["pause", "steer", "resume"] as const) {
    app.post(`/v1/sessions/:id/${kind}`, async (request, reply) => {
      const context = requestContext(request, options.auth);
      const params = SessionParamsSchema.parse(request.params);
      return reply.status(202).send(options.gateway.commandSession(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context), kind));
    });
  }

  app.get("/v1/sessions/:id/messages", async (request) => {
    const context = requestContext(request, options.auth);
    const params = SessionParamsSchema.parse(request.params);
    const query = MessageQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    options.gateway.getSession(query.workspace_id, params.id);
    return { schema_version: 1, ...options.gateway.listMessages(query.workspace_id, params.id, query.after ?? null, query.limit) };
  });
  app.get("/v1/sessions/:id/cursor", async (request) => {
    const context = requestContext(request, options.auth);
    const params = SessionParamsSchema.parse(request.params);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    options.gateway.getSession(query.workspace_id, params.id);
    return { schema_version: 1, checkpoint: options.gateway.getCursor(query.workspace_id, params.id) };
  });
  app.post("/v1/sessions/:id/messages", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = SessionParamsSchema.parse(request.params);
    return reply.status(202).send(options.gateway.sendMessage(request.body, params.id, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/deliveries", async (request) => {
    const context = requestContext(request, options.auth);
    const query = DeliveryQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, deliveries: options.gateway.listDeliveries(query.workspace_id, query.session_id) };
  });
  app.get("/v1/deliveries/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = ReceiptParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, delivery: options.gateway.getDelivery(query.workspace_id, params.id) };
  });
  app.post("/v1/deliveries", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.gateway.recordDelivery(request.body, context.actor, requiredIdempotencyKey(context)));
  });
  app.get("/v1/allowlist", async (request) => {
    const context = requestContext(request, options.auth);
    const query = AllowlistQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, allowlist: options.gateway.listAllowlist(query.workspace_id, query.channel_id) };
  });
  app.post("/v1/allowlist", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.gateway.createAllowlist(request.body, context.actor, requiredIdempotencyKey(context)));
  });
}
