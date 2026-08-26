import type { FastifyInstance } from "fastify";

export type HealthRouteOptions = {
  readonly version: string;
  readonly projectionHealth?: ProjectionHealth | ProjectionHealthProvider;
};

type ProjectionHealth = {
  readonly status: "ok" | "degraded";
  readonly projection_lag: number;
};

type ProjectionHealthProvider = () => ProjectionHealth;

type HealthResponse = {
  readonly status: "ok";
  readonly version: string;
  readonly checks: {
    readonly api: "ok";
    readonly db: "not_configured";
    readonly queue: "not_configured";
    readonly event_store?: ProjectionHealth;
  };
};

export async function registerHealthRoute(
  app: FastifyInstance,
  options: HealthRouteOptions,
): Promise<void> {
  app.get("/v1/health", async () => ({
    status: "ok",
    version: options.version,
    checks: {
      api: "ok",
      db: "not_configured",
      queue: "not_configured",
      ...resolveProjectionHealth(options.projectionHealth),
    },
  } satisfies HealthResponse));
}

function resolveProjectionHealth(projectionHealth: ProjectionHealth | ProjectionHealthProvider | undefined): { readonly event_store?: ProjectionHealth } {
  if (projectionHealth === undefined) return {};
  return { event_store: typeof projectionHealth === "function" ? projectionHealth() : projectionHealth };
}
