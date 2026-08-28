import type { JSX } from "react";

type WorkflowStationView = {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly summary: string;
};

export type WorkflowTemplateView = {
  readonly id: string;
  readonly title: string;
  readonly trigger: string;
  readonly stations: readonly WorkflowStationView[];
  readonly qualityGates: readonly string[];
  readonly failurePolicy: readonly string[];
  readonly startHref: string;
};

export type WorkflowRunView = {
  readonly id: string;
  readonly status: string;
  readonly sourceFile: string;
  readonly judge: string;
  readonly publishBoundary: string;
  readonly reviewState: string;
  readonly handoffExpiry: string;
  readonly reviewHref: string;
};

export const seoWorkflowTemplateFixture: WorkflowTemplateView = {
  failurePolicy: ["retry failed step only", "publish disabled", "unknown side effect reconcile"],
  id: "seo_draft_v1",
  qualityGates: ["source data present", "claims have sources", "no invented metrics", "canonical URL present", "internal links checked"],
  startHref: "/workflows/seo_draft_v1/runs/seo-run-demo?workspace=ws-demo&tab=run",
  stations: [
    { id: "gsc_fixture", label: "GSC fixture", kind: "fixture", summary: "Reads the checked-in Search Console fixture only." },
    { id: "opportunity", label: "Opportunity selector", kind: "transform", summary: "Chooses the source-backed query and URL pair." },
    { id: "draft", label: "Draft writer", kind: "draft_writer", summary: "Writes Markdown with a source receipt section." },
    { id: "judge", label: "Independent Judge", kind: "judge", summary: "Checks claims, metrics, canonical URL, and links." },
    { id: "human_review", label: "Human Review", kind: "review_gate", summary: "Stops at a pending R2 review before publishing." },
  ],
  title: "SEO draft workflow with independent judge",
  trigger: "manual or schedule, site scope required",
};

export const seoWorkflowRunFixture: WorkflowRunView = {
  handoffExpiry: "handoff expires 2026-08-29 04:00 UTC",
  id: "seo-run-demo",
  judge: "Judge pass",
  publishBoundary: "No publish or indexing call executed",
  reviewHref: "/review/rev-r2?workspace=ws-demo&tab=evidence",
  reviewState: "Review pending",
  sourceFile: "fixtures/gsc/acme-2026-08-28.json",
  status: "waiting_review",
};

export function WorkflowPage(props: { readonly view: WorkflowTemplateView }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Workflow Studio</p>
        <h1 id="route-title">Workflow Studio</h1>
        <p>{props.view.title} keeps SEO generation source-backed, judged independently, and stopped before publish side effects.</p>
      </header>
      <section className="workspace-grid">
        <section className="panel" aria-labelledby="workflow-summary-title">
          <div className="panel-header"><h2 id="workflow-summary-title">{props.view.id}</h2><span className="status-badge status-badge--info">site scoped</span></div>
          <dl className="fact-grid">
            <div><dt>Trigger</dt><dd>{props.view.trigger}</dd></div>
            <div><dt>Failure policy</dt><dd>{props.view.failurePolicy.join(" | ")}</dd></div>
          </dl>
          <div className="padded-row"><a className="primary-action" href={props.view.startHref}>Start SEO draft run</a></div>
        </section>
        <ListPanel items={props.view.qualityGates} title="Quality gates" titleId="workflow-quality-gates-title" />
      </section>
      <section className="panel" aria-labelledby="workflow-stations-title">
        <div className="panel-header"><h2 id="workflow-stations-title">Stations</h2><span className="mono meta">{props.view.stations.length}</span></div>
        <div className="row-list">
          {props.view.stations.map((station) => (
            <article className="work-row" key={station.id}>
              <div>
                <h3>{station.label}</h3>
                <div className="row-meta">{station.kind} | <span className="mono">{station.id}</span></div>
                <p>{station.summary}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function WorkflowRunPage(props: { readonly view: WorkflowRunView }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Workflow Run</p>
        <h1 id="route-title">SEO Draft Run</h1>
        <p>The run has created a draft artifact, passed independent judge checks, and is waiting for a human review decision.</p>
      </header>
      <section className="workspace-grid">
        <section className="panel" aria-labelledby="workflow-run-title">
          <div className="panel-header"><h2 id="workflow-run-title">{props.view.id}</h2><span className="status-badge status-badge--warning">{props.view.status}</span></div>
          <dl className="fact-grid">
            <div><dt>Source</dt><dd className="mono">{props.view.sourceFile}</dd></div>
            <div><dt>Judge</dt><dd>{props.view.judge}</dd></div>
            <div><dt>Boundary</dt><dd>{props.view.publishBoundary}</dd></div>
            <div><dt>Handoff</dt><dd>{props.view.handoffExpiry}</dd></div>
          </dl>
        </section>
        <section className="panel" aria-labelledby="workflow-review-title">
          <div className="panel-header"><h2 id="workflow-review-title">Human review</h2><span className="status-badge status-badge--warning">{props.view.reviewState}</span></div>
          <div className="workflow-review-body">
            <p>Review pending until a reviewer approves the exact draft payload hash.</p>
            <a className="primary-action" href={props.view.reviewHref}>Open Review</a>
          </div>
        </section>
      </section>
    </div>
  );
}

function ListPanel(props: { readonly title: string; readonly titleId: string; readonly items: readonly string[] }): JSX.Element {
  return (
    <section className="panel" aria-labelledby={props.titleId}>
      <div className="panel-header"><h2 id={props.titleId}>{props.title}</h2><span className="mono meta">{props.items.length}</span></div>
      <div className="row-list">
        {props.items.map((item) => <div className="work-row" key={item}>{item}</div>)}
      </div>
    </section>
  );
}
