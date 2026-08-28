import type { JSX } from "react";

export type TicketDetailView = {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly runId: string;
  readonly reviewState: string;
  readonly evidenceHref: string;
};

export const ticketFixture: TicketDetailView = {
  evidenceHref: "/runs/run-active?workspace=ws-demo&tab=events",
  goal: "Ship verified SEO workflow",
  id: "SEO-147",
  reviewState: "Pending R2 review",
  runId: "run-active",
  title: "Publish source-backed update summary",
};

export function TicketPage(props: { readonly view: TicketDetailView }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Ticket Detail</p>
        <h1 id="route-title">Ticket Detail</h1>
        <p>Tickets bind Goal intent to a Run and Review handoff without auto-starting an Agent.</p>
      </header>
      <section className="panel">
        <div className="panel-header"><h2>{props.view.id}</h2><span className="status-badge status-badge--warning">{props.view.reviewState}</span></div>
        <dl className="fact-grid">
          <div><dt>Title</dt><dd>{props.view.title}</dd></div>
          <div><dt>Goal</dt><dd>{props.view.goal}</dd></div>
          <div><dt>Run</dt><dd>Linked Run {props.view.runId}</dd></div>
          <div><dt>Review</dt><dd>{props.view.reviewState}</dd></div>
        </dl>
        <div className="button-row padded-row">
          <a className="row-action" href={props.view.evidenceHref}>Open Run evidence</a>
          <button className="primary-action" type="button">Start Agent requires explicit command</button>
        </div>
      </section>
    </div>
  );
}
