import { ReviewDecisionSchema, type ConnectorPreview, type ReviewDecision, type RiskLevel } from "@nexora/contracts";
import { ConnectorExecutionError } from "./errors.js";

export type ReviewApproval = {
  readonly human_decision: "approved" | "approved_with_edits";
  readonly reviewer_role: ReviewDecision["reviewer_role"];
  readonly reviewer_id: ReviewDecision["reviewer_id"];
  readonly approved_payload_hash: string;
};

export type ReviewGateResult =
  | { readonly kind: "not_required" }
  | { readonly kind: "pending" }
  | { readonly kind: "approved"; readonly review: ReviewDecision; readonly approval: ReviewApproval; readonly review_ref: string; readonly artifact_version: number };

export function requiresReview(riskLevel: RiskLevel): boolean {
  return riskLevel === "R2" || riskLevel === "R3";
}

export function evaluateReviewGate(input: { readonly preview: ConnectorPreview; readonly review: ReviewDecision | null; readonly now: string; readonly review_id: string; readonly review_version: number }): ReviewGateResult {
  if (!input.preview.requires_review && !requiresReview(input.preview.risk_level)) return { kind: "not_required" };
  if (input.review === null) return { kind: "pending" };
  const review = ReviewDecisionSchema.parse(input.review);
  assertFreshBinding(review, input.preview, input.now, input.review_id, input.review_version);
  const approval = toApproval(review);
  if (approval === null) return { kind: "pending" };
  return { kind: "approved", review, approval, review_ref: reviewRef(review), artifact_version: artifactVersionForDecision(input.preview, review) };
}

export function reviewRef(review: ReviewDecision): string {
  return `review://${review.id}/v${review.review_version}`;
}

function toApproval(review: ReviewDecision): ReviewApproval | null {
  if (review.human_decision !== "approved" && review.human_decision !== "approved_with_edits") return null;
  const approvedPayloadHash = review.approved_payload_hash;
  if (approvedPayloadHash === null) return null;
  return { human_decision: review.human_decision, reviewer_role: review.reviewer_role, reviewer_id: review.reviewer_id, approved_payload_hash: approvedPayloadHash };
}

function assertFreshBinding(review: ReviewDecision, preview: ConnectorPreview, now: string, reviewId: string, reviewVersion: number): void {
  if (review.id !== reviewId) throwStale("Review id does not match connector request");
  if (review.workspace_id !== preview.workspace_id) throwStale("Review workspace does not match connector request");
  if (review.artifact_id !== preview.artifact_id) throwStale("Review artifact does not match connector request");
  if (review.artifact_version !== preview.artifact_version) throwStale("Review artifact version does not match connector request");
  if (review.review_version !== reviewVersion) throwStale("Review version does not match connector request");
  if (review.risk_level !== preview.risk_level) throwStale("Review risk level does not match connector request");
  if (!scopesEqual(review.requested_scope, preview.requested_scope)) throwStale("Review scope does not match connector request");
  if (Date.parse(review.expires_at) <= Date.parse(now)) throwStale("Review decision is expired");
  if ((review.human_decision === "approved" || review.human_decision === "approved_with_edits") && review.approved_payload_hash !== preview.payload_hash) throwStale("Review payload hash does not match connector request");
}

function artifactVersionForDecision(preview: ConnectorPreview, review: ReviewDecision): number {
  if (review.human_decision === "approved_with_edits") return preview.artifact_version + 1;
  return preview.artifact_version;
}

function scopesEqual(left: ReviewDecision["requested_scope"], right: ConnectorPreview["requested_scope"]): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function throwStale(message: string): never {
  throw new ConnectorExecutionError("REVIEW_STALE", message);
}
