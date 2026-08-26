import { OrchestrationError } from "./errors.js";

export type Budget = {
  readonly max_tokens: number;
  readonly max_cost_usd: number;
  readonly max_duration_seconds: number;
};

export type Usage = {
  readonly tokens: number;
  readonly cost_usd: number;
  readonly duration_seconds: number;
};

export type BudgetDecision =
  | { readonly allowed: true; readonly remaining: Usage }
  | { readonly allowed: false; readonly exceeded: readonly ("tokens" | "cost_usd" | "duration_seconds")[] };

export function evaluateBudget(budget: Budget, usage: Usage, next: Usage = { tokens: 0, cost_usd: 0, duration_seconds: 0 }): BudgetDecision {
  validateBudget(budget);
  validateUsage("usage", usage);
  validateUsage("next", next);
  const exceeded: Array<"tokens" | "cost_usd" | "duration_seconds"> = [];
  if (usage.tokens + next.tokens > budget.max_tokens) exceeded.push("tokens");
  if (usage.cost_usd + next.cost_usd > budget.max_cost_usd) exceeded.push("cost_usd");
  if (usage.duration_seconds + next.duration_seconds > budget.max_duration_seconds) exceeded.push("duration_seconds");
  if (exceeded.length > 0) return { allowed: false, exceeded };
  return {
    allowed: true,
    remaining: {
      tokens: budget.max_tokens - usage.tokens - next.tokens,
      cost_usd: budget.max_cost_usd - usage.cost_usd - next.cost_usd,
      duration_seconds: budget.max_duration_seconds - usage.duration_seconds - next.duration_seconds,
    },
  };
}

function validateBudget(value: Budget): void {
  validateAmount("budget.max_tokens", value.max_tokens, true);
  validateAmount("budget.max_cost_usd", value.max_cost_usd, false);
  validateAmount("budget.max_duration_seconds", value.max_duration_seconds, true);
}

function validateUsage(name: string, value: Usage): void {
  validateAmount(`${name}.tokens`, value.tokens, true);
  validateAmount(`${name}.cost_usd`, value.cost_usd, false);
  validateAmount(`${name}.duration_seconds`, value.duration_seconds, true);
}

function validateAmount(field: string, amount: number, integer: boolean): void {
  if (!Number.isFinite(amount) || amount < 0 || (integer && !Number.isInteger(amount))) throw new OrchestrationError("BUDGET_EXCEEDED", `${field} must be finite and non-negative${integer ? " integer" : ""}`);
}

export function assertBudget(budget: Budget, usage: Usage, next?: Usage): Usage {
  const decision = evaluateBudget(budget, usage, next);
  if (!decision.allowed) throw new OrchestrationError("BUDGET_EXCEEDED", `Budget exceeded: ${decision.exceeded.join(",")}`);
  return decision.remaining;
}
