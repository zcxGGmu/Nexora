import type { JSX } from "react";

import { ConflictResolver, type MemoryConflict } from "../components/memory/ConflictResolver.js";
import { MemoryTree, type MemoryNode } from "../components/memory/MemoryTree.js";
import { ProvenancePanel, type MemoryProvenance } from "../components/memory/ProvenancePanel.js";

export type MemoryWorkspaceView = {
  readonly nodes: readonly MemoryNode[];
  readonly provenance: MemoryProvenance;
  readonly versionDiff: readonly string[];
  readonly conflict: MemoryConflict;
};

export const memoryFixture: MemoryWorkspaceView = {
  conflict: {
    candidateVersion: "candidate v4",
    currentVersion: "current v3",
    noteId: "memory-sop-seo",
    rollbackTarget: "v2",
    summary: "Concurrent SOP edit requires reviewer choice before memory mutation.",
  },
  nodes: [
    { children: [{ children: [], id: "memory-sop-seo", label: "SEO source checklist", type: "SOP" }], id: "project-content-refresh", label: "Project / Content refresh", type: "Project" },
  ],
  provenance: {
    consumers: ["draft-writer", "reviewer-checklist"],
    receiptHref: "/artifacts/artifact-summary?tab=receipt",
    scope: "Project / Content refresh",
    sourceRun: "run-active",
    trust: "verified with receipt",
    type: "SOP",
  },
  versionDiff: ["Version Diff", "+ require source receipt before publishing", "- remove unsupported traffic estimate"],
};

export function MemoryPage(props: { readonly view: MemoryWorkspaceView }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Memory Explorer</p>
        <h1 id="route-title">Memory Explorer</h1>
        <p>Memory changes stay scoped, sourced, trusted, versioned, and recoverable.</p>
      </header>
      <section className="workspace-grid">
        <MemoryTree nodes={props.view.nodes} />
        <ProvenancePanel provenance={props.view.provenance} />
      </section>
      <section className="panel" aria-labelledby="memory-diff-title">
        <div className="panel-header"><h2 id="memory-diff-title">Version Diff</h2></div>
        <pre className="code-block">{props.view.versionDiff.join("\n")}</pre>
      </section>
      <ConflictResolver conflict={props.view.conflict} />
    </div>
  );
}
