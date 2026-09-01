import type { FastifyInstance } from "fastify";
import { errorResponse, toApiHttpError } from "../services/errors.js";
import type { LocalAuthOptions } from "../plugins/auth.js";
import type { CommandService } from "../services/command-service.js";
import type { QueryService } from "../services/query-service.js";
import type { ScheduleCommandService } from "../services/schedule-service.js";
import type { RegistryCommandService } from "../services/registry-service.js";
import type { SseService } from "../services/sse-service.js";
import type { GatewayService } from "../services/gateway-service.js";
import { traceId } from "../plugins/request-context.js";
import { registerAgentRoutes } from "./agents.js";
import { registerArtifactRoutes } from "./artifacts.js";
import { registerEventRoutes } from "./events.js";
import { registerGoalRoutes } from "./goals.js";
import { registerMemoryRoutes } from "./memory.js";
import { registerReviewRoutes } from "./reviews.js";
import { registerRunRoutes } from "./runs.js";
import { registerScheduleRoutes } from "./schedules.js";
import { registerTicketRoutes } from "./tickets.js";
import { registerRegistryRoutes } from "./registry.js";
import { registerGatewayRoutes } from "./gateway.js";

export type ControlRouteOptions = {
  readonly commands: CommandService;
  readonly queries: QueryService;
  readonly scheduleCommands: ScheduleCommandService;
  readonly registryCommands: RegistryCommandService;
  readonly sse: SseService;
  readonly auth: LocalAuthOptions;
  readonly gateway: GatewayService;
};

export async function registerControlRoutes(app: FastifyInstance, options: ControlRouteOptions): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    const mapped = toApiHttpError(error);
    void reply.status(mapped.status_code).send(errorResponse(mapped, traceId(request.headers["traceparent"])));
  });
  await app.register(registerAgentRoutes, options);
  await app.register(registerGoalRoutes, options);
  await app.register(registerTicketRoutes, options);
  await app.register(registerRunRoutes, options);
  await app.register(registerScheduleRoutes, options);
  await app.register(registerArtifactRoutes, options);
  await app.register(registerReviewRoutes, options);
  await app.register(registerMemoryRoutes, options);
  await app.register(registerEventRoutes, options);
  await app.register(registerRegistryRoutes, options);
  await app.register(registerGatewayRoutes, options);
}
