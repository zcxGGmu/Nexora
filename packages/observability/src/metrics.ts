import type { SqliteDatabase } from "@nexora/persistence";
import { summarizeRunBudgets, type CostSummary } from "./cost.js";

export type MetricsScope = {
  readonly workspace_id?: string;
};

export type StatusCounts = Readonly<Record<string, number>>;

export type QueueMetrics = {
  readonly status: "ok" | "degraded";
  readonly backlog: number;
  readonly by_status: StatusCounts;
};

export type RunMetrics = {
  readonly by_status: StatusCounts;
};

export type EgressMetrics = {
  readonly receipts: number;
  readonly latest_created_at: string | null;
};

export type DatabaseMetrics = {
  readonly status: "ok";
  readonly migration_version: number;
};

export type OperationalMetrics = {
  readonly db: DatabaseMetrics;
  readonly queue: QueueMetrics;
  readonly runs: RunMetrics;
  readonly costs: CostSummary;
  readonly egress: EgressMetrics;
};

export function collectOperationalMetrics(database: SqliteDatabase, scope: MetricsScope = {}): OperationalMetrics {
  const queueCounts = statusCounts({ database, table: "queue_jobs", scope });
  return {
    db: { status: "ok", migration_version: migrationVersion(database) },
    queue: { status: "ok", backlog: backlog(queueCounts), by_status: queueCounts },
    runs: { by_status: statusCounts({ database, table: "runs", scope }) },
    costs: summarizeRunBudgets(database, scope),
    egress: egressMetrics(database, scope),
  };
}

function statusCounts(input: { readonly database: SqliteDatabase; readonly table: "queue_jobs" | "runs"; readonly scope: MetricsScope }): StatusCounts {
  const rows = input.scope.workspace_id === undefined
    ? input.database.prepare(`SELECT status, COUNT(*) AS count FROM ${input.table} GROUP BY status ORDER BY status ASC`).all()
    : input.database.prepare(`SELECT status, COUNT(*) AS count FROM ${input.table} WHERE workspace_id = ? GROUP BY status ORDER BY status ASC`).all(input.scope.workspace_id);
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const status = readText(row["status"]);
    counts[status] = readInteger(row["count"]);
  }
  return counts;
}

function egressMetrics(database: SqliteDatabase, scope: MetricsScope): EgressMetrics {
  const row = scope.workspace_id === undefined
    ? database.prepare("SELECT COUNT(*) AS receipts, MAX(created_at) AS latest_created_at FROM egress_receipts").get()
    : database.prepare("SELECT COUNT(*) AS receipts, MAX(created_at) AS latest_created_at FROM egress_receipts WHERE workspace_id = ?").get(scope.workspace_id);
  return { receipts: readInteger(row?.["receipts"]), latest_created_at: readNullableText(row?.["latest_created_at"]) };
}

function backlog(counts: StatusCounts): number {
  return (counts["queued"] ?? 0) + (counts["leased"] ?? 0) + (counts["cancel_requested"] ?? 0);
}

function migrationVersion(database: SqliteDatabase): number {
  const row = database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
  return readInteger(row?.["version"]);
}

function readText(value: unknown): string {
  if (typeof value !== "string") throw new ObservabilityReadError("Expected text column");
  return value;
}

function readNullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return readText(value);
}

function readInteger(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint" && Number.isSafeInteger(Number(value))) return Number(value);
  throw new ObservabilityReadError("Expected integer column");
}

export class ObservabilityReadError extends Error {
  readonly name = "ObservabilityReadError";
}
