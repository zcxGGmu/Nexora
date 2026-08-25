import type { FastifyInstance } from "fastify";

export type HealthRouteOptions = {
  readonly version: string;
};

type HealthResponse = {
  readonly status: "ok";
  readonly version: string;
  readonly checks: {
    readonly api: "ok";
    readonly db: "not_configured";
    readonly queue: "not_configured";
  };
};

export async function registerHealthRoute(
  app: FastifyInstance,
  options: HealthRouteOptions,
): Promise<void> {
  const response: HealthResponse = {
    status: "ok",
    version: options.version,
    checks: {
      api: "ok",
      db: "not_configured",
      queue: "not_configured",
    },
  };

  app.get("/v1/health", async () => response);
}
