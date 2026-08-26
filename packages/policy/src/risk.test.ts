import { describe, expect, it } from "vitest";

import { evaluateRiskPolicy } from "./index.js";

const connector = { id: "github.publish", risk_level: "R3", data_classification: "confidential", requires_review: true, allowed_scopes: [{ kind: "workspace", id: "01BRZ3NDEKTSV4RRFFQ69G5FAV" }] } as const;

describe("policy risk", () => {
  it("Given R3 connector without approval When risk is evaluated Then human review is required", () => {
    expect(evaluateRiskPolicy({ connector, approval: null, payload_hash: "sha256:new" })).toMatchObject({ allowed: false, code: "POLICY_REVIEW_REQUIRED" });
  });

  it("Given stale approval When payload hash changes Then execution is denied", () => {
    expect(evaluateRiskPolicy({ connector, approval: { human_decision: "approved", reviewer_role: "Reviewer", reviewer_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", approved_payload_hash: "sha256:old" }, payload_hash: "sha256:new" })).toMatchObject({ allowed: false, code: "POLICY_REVIEW_REQUIRED" });
  });

  it("Given forged Agent approval When R3 risk is evaluated Then execution is denied", () => {
    expect(evaluateRiskPolicy({ connector, approval: { human_decision: "approved", reviewer_role: "Agent", reviewer_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", approved_payload_hash: "sha256:new" }, payload_hash: "sha256:new" })).toMatchObject({ allowed: false, code: "POLICY_REVIEW_REQUIRED" });
  });

  it("Given rejected approval-shaped input When R3 risk is evaluated Then execution is denied", () => {
    expect(evaluateRiskPolicy({ connector, approval: { human_decision: "rejected", reviewer_role: "Reviewer", reviewer_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", approved_payload_hash: "sha256:new" }, payload_hash: "sha256:new" })).toMatchObject({ allowed: false, code: "POLICY_REVIEW_REQUIRED" });
  });

  it("Given approval with malformed reviewer id When R3 risk is evaluated Then execution is denied", () => {
    expect(evaluateRiskPolicy({ connector, approval: { human_decision: "approved", reviewer_role: "Reviewer", reviewer_id: "not-a-ulid", approved_payload_hash: "sha256:new" }, payload_hash: "sha256:new" })).toMatchObject({ allowed: false, code: "POLICY_REVIEW_REQUIRED" });
  });

  it("Given R3 approval without payload hash When risk is evaluated Then execution is denied", () => {
    expect(evaluateRiskPolicy({ connector, approval: { human_decision: "approved", reviewer_role: "Reviewer", reviewer_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", approved_payload_hash: null } })).toMatchObject({ allowed: false, code: "POLICY_REVIEW_REQUIRED" });
  });

  it("Given empty payload hashes When R3 risk is evaluated Then execution is denied", () => {
    expect(evaluateRiskPolicy({ connector, approval: { human_decision: "approved", reviewer_role: "Reviewer", reviewer_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", approved_payload_hash: "" }, payload_hash: "" })).toMatchObject({ allowed: false, code: "POLICY_REVIEW_REQUIRED" });
  });

  it("Given non-canonical payload hashes When R3 risk is evaluated Then execution is denied", () => {
    expect(evaluateRiskPolicy({ connector, approval: { human_decision: "approved", reviewer_role: "Reviewer", reviewer_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", approved_payload_hash: "sha256:new" }, payload_hash: "sha256:new" })).toMatchObject({ allowed: false, code: "POLICY_REVIEW_REQUIRED" });
  });

  it("Given matching approval When R3 risk is evaluated Then execution can continue", () => {
    const hash = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    expect(evaluateRiskPolicy({ connector, approval: { human_decision: "approved", reviewer_role: "Reviewer", reviewer_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", approved_payload_hash: hash }, payload_hash: hash })).toMatchObject({ allowed: true });
  });
});
