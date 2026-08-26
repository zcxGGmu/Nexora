import { fileURLToPath } from "node:url";

import Fastify, { type FastifyInstance } from "fastify";
import packageMetadata from "../../../package.json" with { type: "json" };
import {
  EnvironmentValidationError,
  parseEnvironment,
} from "@nexora/config";

import { registerHealthRoute, type HealthRouteOptions } from "./routes/health.js";

export type ApiServerOptions = HealthRouteOptions;

export function createApiServer(options: ApiServerOptions): FastifyInstance {
  const app = Fastify({ logger: true });
  void app.register(registerHealthRoute, options);
  return app;
}

export async function startServer(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const app = createApiServer({ version: packageMetadata.version });

  try {
    await app.listen({ host: environment.apiHost, port: environment.apiPort });
  } catch (error) {
    await app.close();
    throw error;
  }
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
