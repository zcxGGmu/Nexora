import type { JSX } from "react";

import { BudgetPanel, type RunBudget } from "../components/runs/BudgetPanel.js";
import { RunActions, type RunRecoveryAction } from "../components/runs/RunActions.js";
import { RunTimeline, type RunTimelineEvent } from "../components/runs/RunTimeline.js";
import type { EventCursorState } from "../components/runs/EventCursor.js";

type RunArtifactRef = { readonly label: string; readonly href: string; readonly receiptId: string };
type RunReceiptRef = { readonly id: string; readonly label: string; readonly href: string };

export type RunDetailView = {
  readonly run: {
    readonly id: string;
    readonly trigger: string;
    readonly ticket: string;
    readonly agent: string;
    readonly model: string;
    readonly tools: readonly string[];
    readonly location: string;
    readonly attempt: string;
  };
  readonly budget: RunBudget;
  readonly cursor: EventCursorState;
  readonly events: readonly RunTimelineEvent[];
  readonly artifacts: readonly RunArtifactRef[];
  readonly receipts: readonly RunReceiptRef[];
  readonly recoveryActions: readonly RunRecoveryAction[];
};

export const runDetailFixture: RunDetailView = {
  artifacts: [{ href: "/artifacts/artifact-summary?workspace=ws-demo&tab=receipt", label: "Artifact evidence-summary.md v1", receiptId: "rcp-artifact-v1" }],
  budget: { limitLabel: "$3.00", policy: "Stop before new connector side effects", remainingLabel: "$1.58", usedLabel: "$1.42" },
  cursor: { cursor: "evt-2", lastEventId: "evt-run-active-02", status: "live" },
  events: [
    { evidenceHref: "/runs/run-active?tab=receipt&cursor=evt-0", id: "evt-0", impact: "Command accepted without marking output complete.", time: "10:04", title: "Accepted command" },
    { evidenceHref: "/artifacts/artifact-summary?tab=source", id: "evt-1", impact: "Markdown draft stored as immutable artifact v1.", time: "10:07", title: "Draft artifact created" },
    { evidenceHref: "/review/rev-r2?tab=evidence", id: "evt-2", impact: "Reviewer must inspect source receipts before approval.", time: "10:11", title: "Waiting for R2 review" },
  ],
  receipts: [{ href: "/runs/run-active?tab=receipt", id: "rcp-run-active-02", label: "Receipt rcp-run-active-02" }],
  recoveryActions: [
    { enabled: true, impact: "Pause after the current event cursor.", label: "Pause run", sideEffectNote: "Completed side effects remain recorded." },
    { enabled: true, impact: "Stop future steps and keep receipts for audit.", label: "Stop run", sideEffectNote: "Completed side effects remain recorded." },
    { enabled: true, impact: "Retry only the failed step with a new fencing token.", label: "Retry failed step", sideEffectNote: "Retry creates a new attempt." },
  ],
  run: {
    agent: "Agent Writer",
    attempt: "Attempt 2 of 3",
    id: "run-active",
    location: "Location local deterministic runtime",
    model: "Model gpt-5.6-terra",
    ticket: "Ticket SEO-147",
    tools: ["draft-writer", "judge", "memory.read"],
    trigger: "Quick Cowork command",
  },
};

export const blockedRunDetailFixture: RunDetailView = {
  ...runDetailFixture,
  cursor: { cursor: "evt-blocked", lastEventId: "evt-run-blocked-01", status: "paused" },
  events: [
    { evidenceHref: "/runs/run-blocked?tab=receipt&cursor=evt-0", id: "evt-0", impact: "Command accepted and connector authorization was checked before output mutation.", time: "10:08", title: "Accepted command" },
    { evidenceHref: "/review/rev-r3?tab=evidence", id: "evt-blocked", impact: "Run is blocked until connector authentication receipt is refreshed.", time: "10:11", title: "Blocked by connector authentication" },
  ],
  run: {
    ...runDetailFixture.run,
    attempt: "Attempt 1 of 3",
    id: "run-blocked",
    ticket: "Ticket SEO-188",
  },
};

export function RunDetailPage(props: { readonly view: RunDetailView }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Run Detail</p>
        <h1 id="route-title">Run Detail</h1>
        <p>Observe trigger, location, runtime state, budget, artifacts, receipts, and safe recovery actions without hiding prior side effects.</p>
      </header>
      <section className="workspace-grid">
        <section className="panel" aria-labelledby="run-summary-title">
          <div className="panel-header"><h2 id="run-summary-title">Run summary</h2><span className="status-badge status-badge--info">{props.view.run.id}</span></div>
          <dl className="fact-grid">
            <div><dt>Trigger</dt><dd>Trigger {props.view.run.trigger}</dd></div>
            <div><dt>Ticket</dt><dd>{props.view.run.ticket}</dd></div>
            <div><dt>Agent</dt><dd>{props.view.run.agent}</dd></div>
            <div><dt>Model</dt><dd>{props.view.run.model}</dd></div>
            <div><dt>Tools</dt><dd>Tools {props.view.run.tools.join(", ")}</dd></div>
            <div><dt>Location</dt><dd>{props.view.run.location}</dd></div>
            <div><dt>Attempt</dt><dd>{props.view.run.attempt}</dd></div>
          </dl>
        </section>
        <BudgetPanel budget={props.view.budget} />
      </section>
      <RunTimeline cursor={props.view.cursor} events={props.view.events} />
      <section className="workspace-grid">
        <section className="panel" aria-labelledby="run-artifacts-title">
          <div className="panel-header"><h2 id="run-artifacts-title">Artifacts</h2></div>
          {props.view.artifacts.map((artifact) => <a className="work-row" href={artifact.href} key={artifact.label}>{artifact.label} | Receipt {artifact.receiptId}</a>)}
        </section>
        <section className="panel" aria-labelledby="run-receipts-title">
          <div className="panel-header"><h2 id="run-receipts-title">Receipts</h2></div>
          {props.view.receipts.map((receipt) => <a className="work-row" href={receipt.href} key={receipt.id}>{receipt.label}</a>)}
        </section>
      </section>
      <RunActions actions={props.view.recoveryActions} />
    </div>
  );
}
