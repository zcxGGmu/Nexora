import type { OperationalHealthProvider, OperationalHealth } from "@nexora/observability";
import type { FastifyInstance } from "fastify";

export type HealthRouteOptions = {
  readonly version: string;
  readonly projectionHealth?: ProjectionHealth | ProjectionHealthProvider;
  readonly operationalHealth?: OperationalHealth | OperationalHealthProvider;
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
    readonly db: "not_configured" | OperationalHealth["db"];
    readonly queue: "not_configured" | OperationalHealth["queue"];
    readonly event_store?: ProjectionHealth;
    readonly costs?: OperationalHealth["costs"];
    readonly egress?: OperationalHealth["egress"];
    readonly runs?: OperationalHealth["runs"];
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
      ...resolveOperationalHealth(options.operationalHealth),
      ...resolveProjectionHealth(options.projectionHealth),
    },
  } satisfies HealthResponse));
}

function resolveProjectionHealth(projectionHealth: ProjectionHealth | ProjectionHealthProvider | undefined): { readonly event_store?: ProjectionHealth } {
  if (projectionHealth === undefined) return {};
  return { event_store: typeof projectionHealth === "function" ? projectionHealth() : projectionHealth };
}

function resolveOperationalHealth(operationalHealth: OperationalHealth | OperationalHealthProvider | undefined): Partial<HealthResponse["checks"]> {
  if (operationalHealth === undefined) return {};
  const health = typeof operationalHealth === "function" ? operationalHealth() : operationalHealth;
  return { db: health.db, queue: health.queue, costs: health.costs, egress: health.egress, runs: health.runs };
}
