import { describe, expect, it } from "vitest";
import { ReviewDecidedEventSchema, ReviewDecisionSchema, ReviewRequestSchema, ReviewRequestedEventSchema } from "./review.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const EVENT_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const REVIEWER_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const PAYLOAD_HASH = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TIME = "2026-08-27T04:00:00.000Z";
const scope = { kind: "workspace", id: ID } as const;
const policyDecision = { allowed: true, code: null, event_type: null, reason: "Allowed", required_action: "none", redactions: [] } as const;

describe("C08 review gate contracts", () => {
  it("Given a review request When parsed Then it binds scope, artifact version, review version, and payload hash", () => {
    const request = ReviewRequestSchema.parse({
      id: ID,
      workspace_id: ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      artifact_id: ARTIFACT_ID,
      artifact_version: 3,
      review_version: 2,
      requested_scope: scope,
      payload_hash: PAYLOAD_HASH,
      risk_level: "R3",
      target_ref: "cms://production/site/post",
      reason: "Public publish requires review",
      expires_at: TIME,
      requested_by: { type: "agent", id: REVIEWER_ID },
      policy_decision: policyDecision,
    });

    expect(request.requested_scope).toEqual(scope);
    expect(request.payload_hash).toBe(PAYLOAD_HASH);
  });

  it("Given an R3 approval When scope is missing Then the decision is invalid", () => {
    const decision = {
      id: ID,
      workspace_id: ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      artifact_id: ARTIFACT_ID,
      artifact_version: 3,
      review_version: 2,
      judge_result: "pass",
      human_decision: "approved",
      reviewer_id: REVIEWER_ID,
      reviewer_role: "Reviewer",
      reason: "Exact payload reviewed",
      approved_payload_hash: PAYLOAD_HASH,
      risk_level: "R3",
      policy_decision: policyDecision,
      expires_at: TIME,
    };

    expect(ReviewDecisionSchema.safeParse(decision).success).toBe(false);
    expect(ReviewDecisionSchema.parse({ ...decision, requested_scope: scope }).approved_payload_hash).toBe(PAYLOAD_HASH);
  });

  it("Given review audit events When parsed Then event type and payload shape must match", () => {
    const base = {
      event_id: EVENT_ID,
      schema_version: 1,
      occurred_at: TIME,
      workspace_id: ID,
      scope: { kind: "run", id: RUN_ID },
      trace_id: ID,
      run_id: RUN_ID,
      attempt_id: null,
      step_id: null,
      actor: { type: "human", id: REVIEWER_ID },
      redactions: [],
      sequence: 1,
    } as const;
    const payload = { review_id: ID, artifact_id: ARTIFACT_ID, artifact_version: 3, review_version: 2, payload_hash: PAYLOAD_HASH, risk_level: "R3", requested_scope: scope };

    expect(ReviewRequestedEventSchema.parse({ ...base, event_type: "review.requested", payload })).toMatchObject({ event_type: "review.requested" });
    expect(ReviewDecidedEventSchema.parse({ ...base, event_type: "review.decided", payload: { ...payload, human_decision: "approved", reviewer_id: REVIEWER_ID } })).toMatchObject({ event_type: "review.decided" });
    expect(ReviewRequestedEventSchema.safeParse({ ...base, event_type: "review.decided", payload }).success).toBe(false);
  });
});
