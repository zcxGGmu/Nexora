import type { SqliteDatabase } from "@nexora/persistence";
import { collectOperationalMetrics, type OperationalMetrics } from "./metrics.js";

export type DegradedOperationalHealth = {
  readonly db: { readonly status: "degraded"; readonly error_code: "OBSERVABILITY_READ_FAILED"; readonly message: string };
  readonly queue: { readonly status: "degraded"; readonly backlog: 0; readonly by_status: {} };
  readonly runs: { readonly by_status: {} };
  readonly costs: { readonly budgeted_runs: 0; readonly max_tokens: 0; readonly max_cost_usd: 0 };
  readonly egress: { readonly receipts: 0; readonly latest_created_at: null };
};

export type OperationalHealth = OperationalMetrics | DegradedOperationalHealth;
export type OperationalHealthProvider = () => OperationalHealth;

export function createOperationalHealth(database: SqliteDatabase, scope: { readonly workspace_id?: string } = {}): OperationalHealthProvider {
  return () => {
    try {
      return collectOperationalMetrics(database, scope);
    } catch (error) {
      if (error instanceof Error) return degradedHealth(error.message);
      throw error;
    }
  };
}

function degradedHealth(message: string): DegradedOperationalHealth {
  return {
    db: { status: "degraded", error_code: "OBSERVABILITY_READ_FAILED", message },
    queue: { status: "degraded", backlog: 0, by_status: {} },
    runs: { by_status: {} },
    costs: { budgeted_runs: 0, max_tokens: 0, max_cost_usd: 0 },
    egress: { receipts: 0, latest_created_at: null },
  };
}
