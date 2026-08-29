import { RunSchema } from "@nexora/contracts";
import type { SqliteDatabase } from "@nexora/persistence";

export type CostScope = {
  readonly workspace_id?: string;
};

export type CostSummary = {
  readonly budgeted_runs: number;
  readonly max_tokens: number;
  readonly max_cost_usd: number;
};

export function summarizeRunBudgets(database: SqliteDatabase, scope: CostScope = {}): CostSummary {
  const rows = scope.workspace_id === undefined
    ? database.prepare("SELECT payload_json FROM runs").all()
    : database.prepare("SELECT payload_json FROM runs WHERE workspace_id = ?").all(scope.workspace_id);
  let budgetedRuns = 0;
  let maxTokens = 0;
  let maxCostUsd = 0;
  for (const row of rows) {
    const payload = row["payload_json"];
    if (typeof payload !== "string") continue;
    const parsed = RunSchema.safeParse(JSON.parse(payload));
    if (!parsed.success) continue;
    budgetedRuns += 1;
    maxTokens += parsed.data.budget.max_tokens;
    maxCostUsd += parsed.data.budget.max_cost_usd;
  }
  return { budgeted_runs: budgetedRuns, max_tokens: maxTokens, max_cost_usd: maxCostUsd };
}
