import type { PolicyAction, PolicyRole, RiskLevel } from "@nexora/contracts";

const ROLE_ACTIONS = {
  Owner: ["workspace:admin", "run:read", "run:write", "memory:read", "connector:execute", "review:decide"],
  Operator: ["run:read", "run:write", "memory:read", "connector:execute"],
  Reviewer: ["run:read", "memory:read", "review:decide"],
  Viewer: ["run:read", "memory:read"],
  Agent: ["run:read", "memory:read", "connector:execute"],
} as const satisfies Record<PolicyRole, readonly PolicyAction[]>;

export function canRolePerform(input: { readonly role: PolicyRole; readonly action: PolicyAction }): boolean {
  const actions: readonly PolicyAction[] = ROLE_ACTIONS[input.role];
  return actions.includes(input.action);
}

export function canIssueHumanDecision(role: PolicyRole): boolean {
  return role === "Owner" || role === "Reviewer";
}

export function requiresReviewForRisk(riskLevel: RiskLevel): boolean {
  return riskLevel === "R3";
}
