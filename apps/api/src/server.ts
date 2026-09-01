import { fileURLToPath } from "node:url";

import Fastify, { type FastifyInstance } from "fastify";
import packageMetadata from "../../../package.json" with { type: "json" };
import {
  EnvironmentValidationError,
  parseEnvironment,
  type NexoraEnvironment,
} from "@nexora/config";
import { migrate, openDatabase, validateMigration, type SqliteDatabase } from "@nexora/persistence";
import { systemClock, type Clock } from "@nexora/contracts";
import { createOperationalHealth } from "@nexora/observability";

import { createControlServices, type ControlServicesInput } from "./app.js";
import { LOCAL_SESSION_COOKIE_NAME, createLocalBearerToken, type ControlAuthOptions, type LocalAuthOptions } from "./plugins/auth.js";
import { registerControlRoutes } from "./routes/index.js";
import { registerHealthRoute, type HealthRouteOptions } from "./routes/health.js";

export type ApiServerOptions = HealthRouteOptions & {
  readonly database?: SqliteDatabase;
  readonly clock?: Clock;
  readonly idFactory?: ControlServicesInput["idFactory"];
  readonly auth?: ControlAuthOptions;
  readonly localSessionBootstrap?: { readonly enabled: boolean };
};

const LOCAL_BOOTSTRAP_WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const LOCAL_BOOTSTRAP_ACTOR_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";

export function createApiServer(options: ApiServerOptions): FastifyInstance {
  const app = Fastify({ logger: true });
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin !== undefined && isLocalMissionControlOrigin(origin)) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-credentials", "true");
      reply.header("vary", "Origin");
    }
    reply.header("access-control-allow-headers", "Authorization, Content-Type, Idempotency-Key, If-Match, Traceparent");
    reply.header("access-control-allow-methods", "GET, POST, PUT, OPTIONS");
    if (request.method === "OPTIONS") {
      await reply.status(204).send();
    }
  });
  void app.register(registerHealthRoute, healthRouteOptions(options));
  if (options.database !== undefined && options.auth?.mode === "local") {
    const clock = options.clock ?? systemClock;
    const services = options.idFactory === undefined
      ? createControlServices({ database: options.database, clock })
      : createControlServices({ database: options.database, clock, idFactory: options.idFactory });
    if (options.localSessionBootstrap?.enabled === true) registerLocalSessionBootstrap(app, options.auth);
    void app.register(registerControlRoutes, { ...services, auth: options.auth });
  }
  return app;
}

function isLocalMissionControlOrigin(origin: string): boolean {
  return origin === "http://127.0.0.1:4311"
    || origin === "http://127.0.0.1:4313"
    || origin === "http://localhost:4311"
    || origin === "http://localhost:4313";
}

function healthRouteOptions(options: ApiServerOptions): HealthRouteOptions {
  const base = options.projectionHealth === undefined ? { version: options.version } : { version: options.version, projectionHealth: options.projectionHealth };
  if (options.operationalHealth !== undefined) return { ...base, operationalHealth: options.operationalHealth };
  if (options.database !== undefined) return { ...base, operationalHealth: createOperationalHealth(options.database) };
  return base;
}

export async function startServer(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const database = openDatabase(environment.dbPath);
  if (environment.migrationMode === "auto") migrate(database);
  if (environment.migrationMode === "validate") validateMigration(database);
  const auth = controlAuth(environment);
  const app = createApiServer({ version: packageMetadata.version, database, auth, localSessionBootstrap: { enabled: environment.enableLocalSessionBootstrap } });
  app.addHook("onClose", () => {
    database.close();
  });

  try {
    await app.listen({ host: environment.apiHost, port: environment.apiPort });
  } catch (error) {
    await app.close();
    throw error;
  }
}

function registerLocalSessionBootstrap(app: FastifyInstance, auth: LocalAuthOptions): void {
  app.post("/v1/auth/local-session", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin === undefined || !isLocalMissionControlOrigin(origin) || !isLoopbackBootstrapRequest(request.ip, request.headers.host)) {
      return reply.status(403).send({ schema_version: 1, code: "SCOPE_DENIED", message: "Local loopback Mission Control request is required", retryable: false, required_action: "open_local_mission_control", trace_id: "00000000000000000000000000", details: [] });
    }
    const token = createLocalBearerToken({ workspace_id: LOCAL_BOOTSTRAP_WORKSPACE_ID, actor_id: LOCAL_BOOTSTRAP_ACTOR_ID, role: "Owner", tokenSecret: auth.tokenSecret }).replace(/^Bearer\s+/, "");
    reply.header("set-cookie", `${LOCAL_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);
    return reply.status(204).send();
  });
}

function isLoopbackBootstrapRequest(remoteAddress: string, host: string | string[] | undefined): boolean {
  return isLoopbackAddress(remoteAddress) && isLoopbackHost(host);
}

function isLoopbackHost(host: string | string[] | undefined): boolean {
  const value = firstHeader(host);
  if (value === undefined) return false;
  const hostname = hostnameFromHostHeader(value);
  return hostname !== undefined && isLoopbackAddress(hostname);
}

function hostnameFromHostHeader(host: string): string | undefined {
  const value = host.trim().toLowerCase();
  if (value === "") return undefined;
  if (value.startsWith("[")) {
    const closingBracket = value.indexOf("]");
    if (closingBracket < 1) return undefined;
    return value.slice(1, closingBracket);
  }
  const [hostname] = value.split(":");
  return hostname === undefined || hostname === "" ? undefined : hostname;
}

function isLoopbackAddress(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "localhost"
    || normalized === "::1"
    || normalized === "0:0:0:0:0:0:0:1"
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
    || /^::ffff:127\./.test(normalized);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function controlAuth(environment: NexoraEnvironment): LocalAuthOptions | { readonly mode: "disabled" } {
  if (environment.authMode === "disabled") return { mode: "disabled" };
  if (environment.controlTokenSecret === undefined) throw new EnvironmentValidationError(["NEXORA_CONTROL_TOKEN_SECRET"]);
  return { mode: "local", tokenSecret: environment.controlTokenSecret };
}

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === entryPath) {
  try {
    await startServer();
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      console.error(error.message);
    } else {
      console.error("Nexora API failed to start");
    }
    process.exitCode = 1;
  }
}
