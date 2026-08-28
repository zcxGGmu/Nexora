import type { JSX } from "react";

export type ReviewEvidence = {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly state: string;
};

export function EvidencePanel(props: { readonly evidence: readonly ReviewEvidence[]; readonly judge: string; readonly cost: string }): JSX.Element {
  return (
    <section className="panel" aria-labelledby="review-evidence-title">
      <div className="panel-header">
        <h2 id="review-evidence-title">Source Receipts</h2>
        <span className="mono meta">Cost {props.cost}</span>
      </div>
      <div className="row-list">
        <article className="work-row">
          <div><h3>Judge {props.judge}</h3><p className="row-meta">Independent evaluator attached before decision.</p></div>
          <span className="status-badge status-badge--success">Available</span>
        </article>
        {props.evidence.map((item) => (
          <article className="work-row" key={item.id}>
            <div><h3>{item.label}</h3><p className="row-meta">{item.state}</p></div>
            <a className="row-action" href={item.href}>Open receipt</a>
          </article>
        ))}
      </div>
    </section>
  );
}
