import { useState } from "react";
import type { JSX } from "react";

export type RunRecoveryAction = {
  readonly label: string;
  readonly impact: string;
  readonly sideEffectNote: string;
  readonly enabled: boolean;
};

export function RunActions(props: { readonly actions: readonly RunRecoveryAction[] }): JSX.Element {
  const [selectedAction, setSelectedAction] = useState<RunRecoveryAction | null>(null);
  return (
    <section className="panel" aria-labelledby="run-actions-title">
      <div className="panel-header">
        <h2 id="run-actions-title">Recovery actions</h2>
        <span className="status-badge status-badge--warning">Side effects preserved</span>
      </div>
      <div className="action-grid">
        {props.actions.map((action) => (
          <article className="action-card" key={action.label}>
            <button className="row-action" type="button" disabled={!action.enabled} onClick={() => setSelectedAction(action)}>{action.label}</button>
            {selectedAction?.label === action.label ? <p className="state-plane__action" aria-live="polite">{recoveryActionMessage(selectedAction)}</p> : null}
            <p>{action.impact}</p>
            <span className="state-plane__action">{action.sideEffectNote}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function recoveryActionMessage(action: RunRecoveryAction): string {
  return action.sideEffectNote === "Completed side effects remain recorded."
    ? `Recovery action selected: ${action.label}. ${action.sideEffectNote}`
    : `Recovery action selected: ${action.label}. ${action.sideEffectNote} Completed side effects remain recorded.`;
}
