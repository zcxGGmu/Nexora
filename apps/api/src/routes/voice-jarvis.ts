import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { UlidSchema } from "@nexora/contracts";
import { requestContext, requiredExpectedVersion, requiredIdempotencyKey } from "../plugins/request-context.js";
import type { VoiceJarvisService } from "../services/voice-jarvis-service.js";
import type { ControlRouteOptions } from "./index.js";
import { requireQueryScope, WorkspaceQuerySchema } from "./schemas.js";

const VoiceSessionParamsSchema = z.object({ id: UlidSchema }).strict();
const VoiceCommandParamsSchema = z.object({ id: UlidSchema }).strict();
const VoiceTranscriptParamsSchema = z.object({ id: UlidSchema }).strict();
const VoiceSessionCommandParamsSchema = z.object({ id: UlidSchema, action: z.enum(["wake", "interrupt", "pause", "resume"]) }).strict();
const VoiceTranscriptCommandParamsSchema = z.object({ id: UlidSchema, action: z.enum(["delete", "export"]) }).strict();

export type VoiceJarvisRouteOptions = ControlRouteOptions & { readonly voiceJarvis: VoiceJarvisService };

export async function registerVoiceJarvisRoutes(app: FastifyInstance, options: VoiceJarvisRouteOptions): Promise<void> {
  app.get("/v1/voice-sessions", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, sessions: options.voiceJarvis.listSessions(query.workspace_id) };
  });

  app.post("/v1/voice-sessions", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.voiceJarvis.registerSession(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/voice-sessions/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = VoiceSessionParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, ...options.voiceJarvis.getSessionDetail(query.workspace_id, params.id) };
  });

  app.post("/v1/voice-transcripts", async (request, reply) => {
    const context = requestContext(request, options.auth);
    return reply.status(202).send(options.voiceJarvis.recordTranscript(request.body, context.actor, requiredIdempotencyKey(context)));
  });

  app.get("/v1/voice-transcripts/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = VoiceTranscriptParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, transcript: options.voiceJarvis.getTranscript(query.workspace_id, params.id) };
  });

  app.get("/v1/voice-commands/:id", async (request) => {
    const context = requestContext(request, options.auth);
    const query = WorkspaceQuerySchema.parse(request.query);
    const params = VoiceCommandParamsSchema.parse(request.params);
    requireQueryScope(context.actor, "run:read", query.workspace_id);
    return { schema_version: 1, command: options.voiceJarvis.getCommand(query.workspace_id, params.id) };
  });

  app.post("/v1/voice-sessions/:id/:action", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = VoiceSessionCommandParamsSchema.parse(request.params);
    return reply.status(202).send(options.voiceJarvis.commandSession(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context), params.action));
  });

  app.post("/v1/voice-transcripts/:id/:action", async (request, reply) => {
    const context = requestContext(request, options.auth);
    const params = VoiceTranscriptCommandParamsSchema.parse(request.params);
    return reply.status(202).send(options.voiceJarvis.commandTranscript(request.body, params.id, context.actor, requiredIdempotencyKey(context), requiredExpectedVersion(context), params.action));
  });
}
