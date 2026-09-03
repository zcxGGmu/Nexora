import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { UlidSchema } from "@nexora/contracts";
import { requestContext, requiredExpectedVersion, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { BrowserComputerService } from "../services/browser-computer-service.js";
import type { ControlRouteOptions } from "./index.js";
import { requireQueryScope, WorkspaceQuerySchema } from "./schemas.js";

const BrowserComputerSessionParamsSchema = z.object({ id: UlidSchema }).strict();
const BrowserActionParamsSchema = z.object({ id: UlidSchema }).strict();
const BrowserAllowlistParamsSchema = z.object({ id: UlidSchema }).strict();
const BrowserApprovalParamsSchema = z.object({ id: UlidSchema }).strict();
const BrowserActionReceiptParamsSchema = z.object({ id: UlidSchema }).strict();
const BrowserSessionCommandParamsSchema = z.object({ id: UlidSchema, action: z.enum(["pause", "resume", "stop", "takeover"]) }).strict();

export type BrowserComputerRouteOptions = ControlRouteOptions & { readonly browserComputer: BrowserComputerService };

export async function registerBrowserComputerRoutes(app: FastifyInstance, options: BrowserComputerRouteOptions): Promise<void> {
  app.get("/v1/browser-sessions", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, sessions: options.browserComputer.listSessions(query.workspace_id) };
  });

  app.get("/v1/browser-sessions/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = BrowserComputerSessionParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, ...options.browserComputer.getSessionDetail(query.workspace_id, params.id) };
  });

  app.post("/v1/browser-sessions", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.browserComputer.registerSession(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.post("/v1/browser-actions", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.browserComputer.recordAction(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/browser-actions/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = BrowserActionParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, action_intent: options.browserComputer.getAction(query.workspace_id, params.id) };
  });

  app.post("/v1/browser-allowlist", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.browserComputer.createAllowlist(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/browser-allowlist/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = BrowserAllowlistParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, allowlist_entry: options.browserComputer.getAllowlistEntry(query.workspace_id, params.id) };
  });

  app.post("/v1/browser-actions/:id/approve", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = BrowserActionParamsSchema.parse(request.params);
    return reply.status(202).send(options.browserComputer.approveAction(params.id, request.body, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });

  app.get("/v1/browser-approvals/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = BrowserApprovalParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, approval: options.browserComputer.getApproval(query.workspace_id, params.id) };
  });

  app.get("/v1/browser-action-receipts/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = BrowserActionReceiptParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, action_receipt: options.browserComputer.getActionReceipt(query.workspace_id, params.id) };
  });

  app.post("/v1/browser-action-receipts/:id/acknowledge", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = BrowserActionReceiptParamsSchema.parse(request.params);
    return reply.status(202).send(options.browserComputer.acknowledgeReceipt(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context)));
  });

  app.post("/v1/browser-sessions/:id/:action", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = BrowserSessionCommandParamsSchema.parse(request.params);
    return reply.status(202).send(options.browserComputer.commandSession(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context), params.action));
  });
}
