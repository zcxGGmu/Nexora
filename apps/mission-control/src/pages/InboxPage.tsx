import type { JSX } from "react";

import { EmptyState } from "../components/states/EmptyState.js";
import { PermissionDeniedState } from "../components/states/PermissionDeniedState.js";
import { statusClassForTone, type StatusTone } from "../design/status.js";

type InboxMode = "ready" | "permission-filtered";

type InboxItem = {
  readonly id: string;
  readonly title: string;
  readonly type: "Attention" | "Mention" | "Approval" | "Failure" | "Handoff";
  readonly scope: string;
  readonly status: string;
  readonly tone: StatusTone;
  readonly href: string;
};

export type InboxView = {
  readonly mode: InboxMode;
  readonly selectedId: string | null;
  readonly items: readonly InboxItem[];
};

export const inboxFixture: InboxView = {
  items: [
    {
      href: "/review/rev-r3?workspace=ws-demo&tab=evidence",
      id: "rev-r3",
      scope: "Workspace / SEO launch",
      status: "Payload hash current",
      title: "R3 publish review",
      tone: "danger",
      type: "Approval",
    },
    {
      href: "/runs/run-blocked?workspace=ws-demo&tab=events",
      id: "run-blocked",
      scope: "Project / Content refresh",
      status: "Connector authentication expired",
      title: "Run needs operator attention",
      tone: "warning",
      type: "Failure",
    },
  ],
  mode: "ready",
  selectedId: "rev-r3",
};

const tabs = ["Attention", "Mentions", "Approvals", "Failures", "Handoffs"] as const;

export function InboxPage(props: { readonly view: InboxView }): JSX.Element {
  if (props.view.mode === "permission-filtered") {
    return (
      <PermissionDeniedState
        title="Inbox hidden by policy"
        impact="This role can only read filtered projections for the active scope. No private item names are disclosed."
        nextAction="Request an Owner to grant access."
      />
    );
  }

  const selected = props.view.items.find((item) => item.id === props.view.selectedId) ?? props.view.items[0] ?? null;
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Inbox</p>
        <h1 id="route-title">Human attention queue</h1>
        <p>Attention, approvals, failures, and handoffs stay separate from the durable Review queue.</p>
      </header>
      <div className="tabs" role="tablist" aria-label="Inbox filters">
        {tabs.map((tab) => <button className="tab" type="button" role="tab" aria-selected={tab === "Attention"} key={tab}>{tab}</button>)}
      </div>
      {props.view.items.length === 0 ? (
        <EmptyState title="Inbox is clear" impact="No attention items match this scope and filter." nextAction="Create a ticket or clear the filter." />
      ) : (
        <section className="list-detail">
          <div className="panel row-list" aria-label="Inbox items">
            {props.view.items.map((item) => <InboxRow item={item} key={item.id} />)}
          </div>
          <EvidenceDetail item={selected} />
        </section>
      )}
    </div>
  );
}

function InboxRow(props: { readonly item: InboxItem }): JSX.Element {
  return (
    <article className="work-row">
      <div>
        <h3>{props.item.title}</h3>
        <div className="row-meta">{props.item.type} | {props.item.scope}</div>
        <span className={statusClassForTone(props.item.tone)}>{props.item.status}</span>
      </div>
      <a className="row-action" href={props.item.href}>Open Run</a>
    </article>
  );
}

function EvidenceDetail(props: { readonly item: InboxItem | null }): JSX.Element {
  if (props.item === null) {
    return <EmptyState title="No item selected" impact="Select an inbox item to inspect its evidence." nextAction="Open an attention item." />;
  }
  return (
    <aside className="panel" aria-label="Evidence detail">
      <div className="panel-header">
        <h2>Evidence detail</h2>
        <span className={statusClassForTone(props.item.tone)}>{props.item.type}</span>
      </div>
      <article className="work-row">
        <div>
          <h3>{props.item.title}</h3>
          <p className="row-meta">{props.item.scope}</p>
          <p>{props.item.status}</p>
        </div>
        <a className="row-action" href={props.item.href}>Open evidence</a>
      </article>
    </aside>
  );
}
