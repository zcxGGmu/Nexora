import { useEffect, useState } from "react";
import type { KeyboardEvent, JSX } from "react";

import { EmptyState } from "../components/states/EmptyState.js";
import { PermissionDeniedState } from "../components/states/PermissionDeniedState.js";
import { statusClassForTone, type StatusTone } from "../design/status.js";

type InboxMode = "ready" | "permission-filtered";

export type InboxTab = (typeof tabs)[number];

export type InboxItem = {
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

export function inboxItemsForTab(items: readonly InboxItem[], tab: InboxTab): readonly InboxItem[] {
  if (tab === "Attention") return items;
  const itemType = tab === "Approvals" ? "Approval" : tab === "Failures" ? "Failure" : tab.slice(0, -1) as InboxItem["type"];
  return items.filter((item) => item.type === itemType);
}

export function InboxPage(props: { readonly view: InboxView; readonly selectedTab?: string | null | undefined }): JSX.Element {
  if (props.view.mode === "permission-filtered") {
    return (
      <PermissionDeniedState
        title="Inbox hidden by policy"
        impact="This role can only read filtered projections for the active scope. No private item names are disclosed."
        nextAction="Request an Owner to grant access."
      />
    );
  }

  return <ReadyInboxPage selectedTab={props.selectedTab} view={props.view} />;
}

function ReadyInboxPage(props: { readonly view: InboxView; readonly selectedTab?: string | null | undefined }): JSX.Element {
  const [selectedTab, setSelectedTab] = useState<InboxTab>(() => tabFromValue(props.selectedTab));
  useEffect(() => {
    setSelectedTab(tabFromValue(props.selectedTab));
  }, [props.selectedTab]);

  const filteredItems = inboxItemsForTab(props.view.items, selectedTab);
  const selected = filteredItems.find((item) => item.id === props.view.selectedId) ?? filteredItems[0] ?? null;
  const selectTab = (tab: InboxTab): void => {
    setSelectedTab(tab);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab.toLowerCase());
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: InboxTab): void => {
    const currentIndex = tabs.indexOf(tab);
    const nextIndex = event.key === "ArrowRight" ? (currentIndex + 1) % tabs.length : event.key === "ArrowLeft" ? (currentIndex - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab === undefined) return;
    selectTab(nextTab);
    document.getElementById(`inbox-tab-${nextTab.toLowerCase()}`)?.focus();
  };
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Inbox</p>
        <h1 id="route-title">Human attention queue</h1>
        <p>Attention, approvals, failures, and handoffs stay separate from the durable Review queue.</p>
      </header>
      <div className="tabs" role="tablist" aria-label="Inbox filters">
        {tabs.map((tab) => <button className="tab" id={`inbox-tab-${tab.toLowerCase()}`} type="button" role="tab" aria-selected={tab === selectedTab} aria-controls="inbox-items-panel" tabIndex={tab === selectedTab ? 0 : -1} onClick={() => selectTab(tab)} onKeyDown={(event) => onTabKeyDown(event, tab)} key={tab}>{tab}</button>)}
      </div>
      {filteredItems.length === 0 ? (
        <div id="inbox-items-panel" role="tabpanel" aria-labelledby={`inbox-tab-${selectedTab.toLowerCase()}`}>
          <EmptyState title={selectedTab === "Attention" ? "Inbox is clear" : `No ${selectedTab.toLowerCase()} in this scope`} impact={`No ${selectedTab.toLowerCase()} items match this scope and filter.`} nextAction="Create a ticket or clear the filter." />
        </div>
      ) : (
        <section className="list-detail" id="inbox-items-panel" role="tabpanel" aria-labelledby={`inbox-tab-${selectedTab.toLowerCase()}`}>
          <div className="panel row-list" aria-label="Inbox items">
            {filteredItems.map((item) => <InboxRow item={item} key={item.id} />)}
          </div>
          <EvidenceDetail item={selected} />
        </section>
      )}
    </div>
  );
}

function tabFromValue(value: string | null | undefined): InboxTab {
  switch (value?.toLowerCase()) {
    case "mentions":
      return "Mentions";
    case "approvals":
      return "Approvals";
    case "failures":
      return "Failures";
    case "handoffs":
      return "Handoffs";
    case "attention":
    default:
      return "Attention";
  }
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
