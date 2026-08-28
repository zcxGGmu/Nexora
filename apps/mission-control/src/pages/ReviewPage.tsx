import type { JSX } from "react";

import { DecisionSheet, type ReviewDecisionRecord } from "../components/review/DecisionSheet.js";
import { EvidencePanel, type ReviewEvidence } from "../components/review/EvidencePanel.js";
import { PayloadDiff, type DiffLine } from "../components/review/PayloadDiff.js";

export type ReviewWorkspaceView = {
  readonly review: ReviewDecisionRecord;
  readonly diff: readonly DiffLine[];
  readonly evidence: readonly ReviewEvidence[];
  readonly judge: string;
  readonly cost: string;
};

const reviewEvidence: readonly ReviewEvidence[] = [
  { href: "/artifacts/artifact-summary?tab=receipt", id: "rcp-artifact-v1", label: "Receipt rcp-artifact-v1", state: "Artifact v1 hash matches review payload" },
  { href: "/runs/run-active?tab=receipt", id: "rcp-run-active-02", label: "Receipt rcp-run-active-02", state: "Run cursor evt-2 produced this artifact" },
];

const reviewDiff: readonly DiffLine[] = [
  { marker: " ", text: "title: Source-backed update summary" },
  { marker: "+", text: "canonical_url: https://example.test/agent-os" },
  { marker: "-", text: "claims_without_receipts: 1" },
];

export const reviewFixture: ReviewWorkspaceView = {
  cost: "$0.38",
  diff: reviewDiff,
  evidence: reviewEvidence,
  judge: "independent-source-check",
  review: {
    canApprove: true,
    expiresAt: "2026-08-28 10:30 UTC",
    id: "rev-r2",
    payloadHash: "sha256:7f4a6d15c0e2",
    reversibility: "Reversible by creating artifact v2",
    risk: "R2",
    scope: "Workspace / SEO launch",
    staleReason: null,
  },
};

export const staleReviewFixture: ReviewWorkspaceView = {
  ...reviewFixture,
  review: {
    ...reviewFixture.review,
    canApprove: false,
    id: "rev-stale",
    staleReason: "Refresh evidence before approval",
  },
};

export function ReviewPage(props: { readonly view: ReviewWorkspaceView }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Review Center</p>
        <h1 id="route-title">Review Center</h1>
        <p>Diff, evidence, judge, cost, risk, scope, reversibility, hash, and exact decision controls stay on one screen.</p>
      </header>
      <section className="workspace-grid workspace-grid--wide">
        <PayloadDiff lines={props.view.diff} />
        <EvidencePanel cost={props.view.cost} evidence={props.view.evidence} judge={props.view.judge} />
      </section>
      <DecisionSheet review={props.view.review} />
    </div>
  );
}
