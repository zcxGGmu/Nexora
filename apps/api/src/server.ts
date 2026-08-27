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

import { createControlServices, type ControlServicesInput } from "./app.js";
import type { ControlAuthOptions, LocalAuthOptions } from "./plugins/auth.js";
import { registerControlRoutes } from "./routes/index.js";
import { registerHealthRoute, type HealthRouteOptions } from "./routes/health.js";

export type ApiServerOptions = HealthRouteOptions & {
  readonly database?: SqliteDatabase;
  readonly clock?: Clock;
  readonly idFactory?: ControlServicesInput["idFactory"];
  readonly auth?: ControlAuthOptions;
};

export function createApiServer(options: ApiServerOptions): FastifyInstance {
  const app = Fastify({ logger: true });
  void app.register(registerHealthRoute, options);
  if (options.database !== undefined && options.auth?.mode === "local") {
    const clock = options.clock ?? systemClock;
    const services = options.idFactory === undefined
      ? createControlServices({ database: options.database, clock })
      : createControlServices({ database: options.database, clock, idFactory: options.idFactory });
    void app.register(registerControlRoutes, { ...services, auth: options.auth });
  }
  return app;
}

export async function startServer(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const database = openDatabase(environment.dbPath);
  if (environment.migrationMode === "auto") migrate(database);
  if (environment.migrationMode === "validate") validateMigration(database);
  const auth = controlAuth(environment);
  const app = createApiServer({ version: packageMetadata.version, database, auth });
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
