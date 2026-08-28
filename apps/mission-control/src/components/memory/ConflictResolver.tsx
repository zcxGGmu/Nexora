import type { JSX } from "react";

export type MemoryConflict = {
  readonly noteId: string;
  readonly currentVersion: string;
  readonly candidateVersion: string;
  readonly rollbackTarget: string;
  readonly summary: string;
};

export function ConflictResolver(props: { readonly conflict: MemoryConflict }): JSX.Element {
  return (
    <section className="panel decision-sheet" aria-labelledby="memory-conflict-title">
      <div className="panel-header">
        <h2 id="memory-conflict-title">Conflict Resolver</h2>
        <span className="status-badge status-badge--warning">Review candidate version</span>
      </div>
      <p>{props.conflict.summary}</p>
      <dl className="fact-grid">
        <div><dt>Current</dt><dd>{props.conflict.currentVersion}</dd></div>
        <div><dt>Candidate</dt><dd>{props.conflict.candidateVersion}</dd></div>
        <div><dt>Rollback</dt><dd>Rollback to {props.conflict.rollbackTarget}</dd></div>
      </dl>
      <p className="state-plane__action">Never silently overwrite memory.</p>
      <div className="button-row">
        <button className="primary-action" type="button">Open diff</button>
        <button className="row-action" type="button">Rollback to {props.conflict.rollbackTarget}</button>
      </div>
    </section>
  );
}
