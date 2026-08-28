import { useEffect, useState } from "react";
import type { JSX } from "react";

export type ArtifactTab = "Preview" | "Diff" | "Source" | "Receipt";

export type ArtifactVersionView = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly sourceRun: string;
  readonly receiptId: string;
  readonly payloadHash: string;
  readonly tabs: readonly ArtifactTab[];
};

export function ReceiptTabs(props: { readonly artifact: ArtifactVersionView; readonly selectedTab?: string | null | undefined }): JSX.Element {
  const [selectedTab, setSelectedTab] = useState<ArtifactTab>(() => tabFromValue(props.selectedTab, props.artifact.tabs));
  useEffect(() => {
    setSelectedTab(tabFromValue(props.selectedTab, props.artifact.tabs));
  }, [props.selectedTab, props.artifact.tabs]);
  return (
    <section className="panel" aria-labelledby="artifact-tabs-title">
      <div className="panel-header">
        <h2 id="artifact-tabs-title">Artifact Tabs</h2>
        <span className="mono meta">Receipt {props.artifact.receiptId}</span>
      </div>
      <div className="tabs" role="tablist" aria-label="Artifact version tabs">
        {props.artifact.tabs.map((tab) => (
          <button
            aria-controls={tabPanelId(tab)}
            aria-selected={tab === selectedTab}
            className="tab"
            id={tabId(tab)}
            key={tab}
            onClick={() => setSelectedTab(tab)}
            role="tab"
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>
      {props.artifact.tabs.map((tab) => {
        const panel = panelForTab(tab, props.artifact);
        return (
          <article aria-labelledby={tabId(tab)} className="tab-panel preview-body" hidden={tab !== selectedTab} id={tabPanelId(tab)} key={tab} role="tabpanel">
            <h3>{panel.title}</h3>
            <p>{panel.body}</p>
            <p className="state-plane__action">{panel.evidence}</p>
          </article>
        );
      })}
      <dl className="fact-grid">
        <div><dt>Source</dt><dd>Source Run {props.artifact.sourceRun}</dd></div>
        <div><dt>Hash</dt><dd className="mono">{props.artifact.payloadHash}</dd></div>
      </dl>
    </section>
  );
}

type ArtifactTabPanel = {
  readonly title: ArtifactTab;
  readonly body: string;
  readonly evidence: string;
};

function panelForTab(tab: ArtifactTab, artifact: ArtifactVersionView): ArtifactTabPanel {
  switch (tab) {
    case "Preview":
      return { body: `Preview renders fixed artifact ${artifact.version} without mutating the stored payload.`, evidence: `Payload hash ${artifact.payloadHash}`, title: tab };
    case "Diff":
      return { body: `Diff compares ${artifact.version} with the previous version and shows edits as a new artifact version.`, evidence: `Receipt ${artifact.receiptId} remains bound to ${artifact.version}.`, title: tab };
    case "Source":
      return { body: `Source Run ${artifact.sourceRun} created receipt ${artifact.receiptId}.`, evidence: "Open the run receipt before reusing this memory or artifact.", title: tab };
    case "Receipt":
      return { body: `Receipt ${artifact.receiptId} verifies ${artifact.name} ${artifact.version}.`, evidence: `Payload hash ${artifact.payloadHash}`, title: tab };
    default:
      return assertNever(tab);
  }
}

function tabFromValue(value: string | null | undefined, tabs: readonly ArtifactTab[]): ArtifactTab {
  switch (value?.toLowerCase()) {
    case "diff":
      return tabs.includes("Diff") ? "Diff" : firstAvailableTab(tabs);
    case "preview":
      return tabs.includes("Preview") ? "Preview" : firstAvailableTab(tabs);
    case "receipt":
      return tabs.includes("Receipt") ? "Receipt" : firstAvailableTab(tabs);
    case "source":
      return tabs.includes("Source") ? "Source" : firstAvailableTab(tabs);
    default:
      return firstAvailableTab(tabs);
  }
}

function firstAvailableTab(tabs: readonly ArtifactTab[]): ArtifactTab {
  return tabs[0] ?? "Preview";
}

function tabId(tab: ArtifactTab): string {
  return `artifact-tab-${tab.toLowerCase()}`;
}

function tabPanelId(tab: ArtifactTab): string {
  return `artifact-tab-panel-${tab.toLowerCase()}`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled artifact tab ${String(value)}`);
}
