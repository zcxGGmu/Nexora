import type { JSX } from "react";

import { ArtifactPreview } from "../components/artifacts/ArtifactPreview.js";
import { ReceiptTabs, type ArtifactVersionView } from "../components/artifacts/ReceiptTabs.js";

export type ArtifactWorkspaceView = {
  readonly artifact: ArtifactVersionView;
  readonly preview: string;
};

export const artifactFixture: ArtifactWorkspaceView = {
  artifact: {
    id: "artifact-summary",
    name: "evidence-summary.md",
    payloadHash: "sha256:7f4a6d15c0e2",
    receiptId: "rcp-artifact-v1",
    sourceRun: "run-active",
    tabs: ["Preview", "Diff", "Source", "Receipt"],
    version: "v1",
  },
  preview: "Source-backed markdown summary with citations, judge result, and reviewer handoff metadata.",
};

export function ArtifactPage(props: { readonly selectedTab?: string | null | undefined; readonly view: ArtifactWorkspaceView }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Artifact Workspace</p>
        <h1 id="route-title">Artifact Workspace</h1>
        <p>Artifact previews are bound to immutable versions; edits create a new version and invalidate stale approvals.</p>
      </header>
      <section className="workspace-grid">
        <ArtifactPreview artifact={props.view.artifact} preview={props.view.preview} />
        <ReceiptTabs artifact={props.view.artifact} selectedTab={props.selectedTab} />
      </section>
    </div>
  );
}
