import { AlertTriangle, Archive, Play, Target } from "lucide-react";
import type { JSX } from "react";

import { statusClassForTone, type StatusTone } from "../design/status.js";
import { EmptyState } from "../components/states/EmptyState.js";
import { OfflineState } from "../components/states/OfflineState.js";

type WorkItem = {
  readonly id: string;
  readonly title: string;
  readonly scope: string;
  readonly status: string;
  readonly tone: StatusTone;
  readonly timestamp: string;
  readonly action: string;
  readonly href: string;
};

export type MissionControlView = {
  readonly attention: readonly WorkItem[];
  readonly activeRuns: readonly WorkItem[];
  readonly goals: readonly WorkItem[];
  readonly recentArtifacts: readonly WorkItem[];
  readonly health: {
    readonly eventStore: string;
    readonly modelRoute: string;
    readonly approvalQueue: string;
    readonly lastCursor: string;
  };
};

export const missionControlFixture: MissionControlView = {
  attention: [
    {
      action: "Open Review",
      href: "/review/rev-r3?workspace=ws-demo&filter=pending",
      id: "rev-r3",
      scope: "Workspace / SEO launch",
      status: "R3 review expires in 18 minutes",
      timestamp: "2026-08-27 10:18 UTC",
      title: "R3 publish review needs exact payload approval",
      tone: "danger",
    },
    {
      action: "Open Run",
      href: "/runs/run-blocked?workspace=ws-demo&tab=events",
      id: "run-blocked",
      scope: "Project / Content refresh",
      status: "Blocked by connector authentication",
      timestamp: "2026-08-27 10:11 UTC",
      title: "Draft writer cannot verify receipt",
      tone: "warning",
    },
  ],
  activeRuns: [
    {
      action: "Pause allowed run",
      href: "/runs/run-active?workspace=ws-demo&tab=events",
      id: "run-active",
      scope: "Site / Docs",
      status: "Running step 2 of 4",
      timestamp: "8m elapsed",
      title: "Generate source-backed update summary",
      tone: "info",
    },
  ],
  goals: [
    {
      action: "Open Goal",
      href: "/goals?workspace=ws-demo&filter=blocked",
      id: "goal-q3",
      scope: "Workspace / Growth",
      status: "2 tickets blocked",
      timestamp: "updated 12m ago",
      title: "Ship verified SEO workflow",
      tone: "warning",
    },
  ],
  health: {
    approvalQueue: "3 pending, 1 R3",
    eventStore: "Projection lag 0 events",
    lastCursor: "evt-2026-08-27-18",
    modelRoute: "deterministic local policy",
  },
  recentArtifacts: [
    {
      action: "Open Artifact",
      href: "/artifacts/artifact-summary?workspace=ws-demo&tab=receipt",
      id: "artifact-summary",
      scope: "Run / run-active",
      status: "Verified draft v1",
      timestamp: "created 5m ago",
      title: "Evidence summary markdown",
      tone: "success",
    },
  ],
};

export function MissionControlPage(props: { readonly view: MissionControlView }): JSX.Element {
  const view = props.view;
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Mission Control</p>
        <h1 id="route-title">Attention, active work, and next safe actions</h1>
        <p>Every count resolves to a Goal, Ticket, Run, Review, Artifact, or receipt-backed evidence link.</p>
      </header>
      <WorkPanel emptyTitle="No attention items in this scope" icon="attention" items={view.attention} nextAction="Create a Goal or clear the filter" title="Needs Attention" />
      <WorkPanel emptyTitle="No active runs in this scope" icon="runs" items={view.activeRuns} nextAction="Start a scoped Ticket from Create" title="Active Runs" />
      <section className="dashboard-grid" aria-label="Goals and artifacts">
        <WorkPanel emptyTitle="No goals match this filter" icon="goals" items={view.goals} nextAction="Create a Goal or clear the filter" title="Goals" />
        <WorkPanel emptyTitle="No recent artifacts" icon="artifacts" items={view.recentArtifacts} nextAction="Open a Run to inspect output" title="Recent Artifacts" />
      </section>
      <OfflineState title="Offline mode has a read-only fallback" impact="Cached projections keep their last cursor and disable approvals until the stream reconnects." nextAction="Reconnect before approving risk." />
    </div>
  );
}

export function MissionControlRail(props: { readonly health: MissionControlView["health"] }): JSX.Element {
  return (
    <div className="page-stack">
      <h2>Run Health</h2>
      <RailFact label="Event store" value={props.health.eventStore} />
      <RailFact label="Model route" value={props.health.modelRoute} />
      <RailFact label="Approval Queue" value={props.health.approvalQueue} />
      <RailFact label="Last cursor" value={props.health.lastCursor} />
      <a className="row-action" href="/review?workspace=ws-demo&filter=pending">Open Review</a>
    </div>
  );
}

function WorkPanel(props: { readonly title: string; readonly icon: "attention" | "runs" | "goals" | "artifacts"; readonly items: readonly WorkItem[]; readonly emptyTitle: string; readonly nextAction: string }): JSX.Element {
  const Icon = iconForPanel(props.icon);
  return (
    <section className="panel" aria-labelledby={`${props.icon}-panel`}>
      <div className="panel-header">
        <h2 id={`${props.icon}-panel`}><Icon aria-hidden="true" size={18} /> {props.title}</h2>
        <span className="mono meta">{props.items.length}</span>
      </div>
      {props.items.length === 0 ? (
        <EmptyState title={props.emptyTitle} impact="This view is filtered by the active scope and current URL state." nextAction={props.nextAction} />
      ) : (
        <div className="row-list">
          {props.items.map((item) => <WorkRow item={item} key={item.id} />)}
        </div>
      )}
    </section>
  );
}

function WorkRow(props: { readonly item: WorkItem }): JSX.Element {
  return (
    <article className="work-row">
      <div>
        <h3>{props.item.title}</h3>
        <div className="row-meta">{props.item.scope} | <span className="mono">{props.item.timestamp}</span></div>
        <span className={statusClassForTone(props.item.tone)}>{props.item.status}</span>
      </div>
      <a className="row-action" href={props.item.href}>{props.item.action}</a>
    </article>
  );
}

function RailFact(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{props.label}</h2>
      </div>
      <p className="mono" style={{ paddingInline: "var(--space-4)" }}>{props.value}</p>
    </section>
  );
}

function iconForPanel(icon: "attention" | "runs" | "goals" | "artifacts"): typeof AlertTriangle {
  switch (icon) {
    case "artifacts":
      return Archive;
    case "attention":
      return AlertTriangle;
    case "goals":
      return Target;
    case "runs":
      return Play;
    default:
      return assertNever(icon);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Mission Control icon ${String(value)}`);
}
