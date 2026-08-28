import type { JSX } from "react";

export type RunBudget = {
  readonly usedLabel: string;
  readonly limitLabel: string;
  readonly remainingLabel: string;
  readonly policy: string;
};

export function BudgetPanel(props: { readonly budget: RunBudget }): JSX.Element {
  return (
    <section className="panel metric-panel" aria-labelledby="run-budget-title">
      <div className="panel-header">
        <h2 id="run-budget-title">Budget</h2>
        <span className="status-badge status-badge--warning">Guarded</span>
      </div>
      <dl className="fact-grid">
        <div><dt>Used</dt><dd>Budget used {props.budget.usedLabel} of {props.budget.limitLabel}</dd></div>
        <div><dt>Remaining</dt><dd>{props.budget.remainingLabel}</dd></div>
        <div><dt>Policy</dt><dd>{props.budget.policy}</dd></div>
      </dl>
    </section>
  );
}
