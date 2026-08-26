import { describe, expect, it } from "vitest";

import { canIssueHumanDecision, canRolePerform, requiresReviewForRisk } from "./index.js";

describe("policy rbac", () => {
  it("Given role permissions When actions are evaluated Then least privilege is enforced", () => {
    // Given / When / Then
    expect(canRolePerform({ role: "Owner", action: "workspace:admin" })).toBe(true);
    expect(canRolePerform({ role: "Operator", action: "run:write" })).toBe(true);
    expect(canRolePerform({ role: "Reviewer", action: "review:decide" })).toBe(true);
    expect(canRolePerform({ role: "Viewer", action: "run:read" })).toBe(true);
    expect(canRolePerform({ role: "Viewer", action: "run:write" })).toBe(false);
    expect(canRolePerform({ role: "Agent", action: "review:decide" })).toBe(false);
  });

  it("Given risk levels When review is checked Then R3 always requires human review", () => {
    // Given / When / Then
    expect(requiresReviewForRisk("R0")).toBe(false);
    expect(requiresReviewForRisk("R1")).toBe(false);
    expect(requiresReviewForRisk("R2")).toBe(false);
    expect(requiresReviewForRisk("R3")).toBe(true);
  });

  it("Given an Agent role When a human decision is requested Then it is denied", () => {
    // Given / When / Then
    expect(canIssueHumanDecision("Reviewer")).toBe(true);
    expect(canIssueHumanDecision("Owner")).toBe(true);
    expect(canIssueHumanDecision("Operator")).toBe(false);
    expect(canIssueHumanDecision("Agent")).toBe(false);
  });
});
