import { ConnectorQuarantineRecordSchema, PayloadHashSchema, RoleSchema, UlidSchema, z, type ConnectorQuarantineRecord, type DataClassification, type PolicyScope, type RiskLevel } from "@nexora/contracts";
import { evaluateEgressPolicy, type EgressPolicyInput } from "./egress.js";
import { canIssueHumanDecision, canRolePerform } from "./rbac.js";
import { allow, deny, type PolicyActor, type PolicyDecision } from "./decisions.js";

const HumanApprovalSchema = z.object({ human_decision: z.enum(["approved", "approved_with_edits"]), reviewer_role: RoleSchema, reviewer_id: UlidSchema, approved_payload_hash: z.string().min(1) }).strict();

export type ConnectorPolicyInput = {
  readonly actor: PolicyActor;
  readonly connector: {
    readonly id: string;
    readonly risk_level: RiskLevel;
    readonly data_classification: DataClassification;
    readonly requires_review: boolean;
    readonly allowed_scopes: readonly PolicyScope[];
  };
  readonly requested_scope: PolicyScope;
  readonly approval: unknown | null;
  readonly egress: EgressPolicyInput;
  readonly payload_hash?: string;
  readonly quarantine?: ConnectorQuarantineRecord;
};

export function evaluateConnectorPolicy(input: ConnectorPolicyInput): PolicyDecision {
  if (input.quarantine !== undefined) {
    const quarantine = ConnectorQuarantineRecordSchema.parse(input.quarantine);
    if (quarantine.status === "active") return deny({ code: "CONNECTOR_UNAVAILABLE", event_type: "policy.denied", reason: "Connector is quarantined", required_action: "release_connector_quarantine" });
  }
  if (!canRolePerform({ role: input.actor.role, action: "connector:execute" })) {
    return deny({ code: "SCOPE_DENIED", event_type: "scope.denied", reason: "Role cannot execute connector", required_action: "use_authorized_role" });
  }
  if (!input.actor.allowed_scopes.some((scope) => scopeMatches(scope, input.requested_scope))) {
    return deny({ code: "SCOPE_DENIED", event_type: "scope.denied", reason: "Actor scope cannot execute connector", required_action: "request_authorized_scope" });
  }
  if (!input.connector.allowed_scopes.some((scope) => scopeMatches(scope, input.requested_scope))) {
    return deny({ code: "SCOPE_DENIED", event_type: "scope.denied", reason: "Connector scope cannot access requested scope", required_action: "choose_authorized_connector" });
  }
  const riskDecision = evaluateRiskPolicy(input);
  if (!riskDecision.allowed) return riskDecision;
  const egressDecision = evaluateEgressPolicy(input.egress);
  if (!egressDecision.allowed) return egressDecision;
  return allow("Connector policy allowed");
}

export function evaluateRiskPolicy(input: Pick<ConnectorPolicyInput, "connector" | "approval" | "payload_hash">): PolicyDecision {
  if (input.connector.risk_level !== "R3" && !input.connector.requires_review) return allow("Risk allowed");
  if (input.approval === null) {
    return deny({ code: "POLICY_REVIEW_REQUIRED", event_type: "policy.denied", reason: "Connector requires human review", required_action: "request_review" });
  }
  const approval = HumanApprovalSchema.safeParse(input.approval);
  if (!approval.success) {
    return deny({ code: "POLICY_REVIEW_REQUIRED", event_type: "policy.denied", reason: "Approval is not a valid approved human decision", required_action: "request_review" });
  }
  if (!canIssueHumanDecision(approval.data.reviewer_role)) {
    return deny({ code: "POLICY_REVIEW_REQUIRED", event_type: "policy.denied", reason: "Reviewer role cannot approve connector risk", required_action: "request_human_reviewer" });
  }
  const payloadHash = PayloadHashSchema.safeParse(input.payload_hash);
  if (!payloadHash.success) {
    return deny({ code: "POLICY_REVIEW_REQUIRED", event_type: "policy.denied", reason: "Approval must bind an exact payload hash", required_action: "refresh_review" });
  }
  if (approval.data.approved_payload_hash !== payloadHash.data) {
    return deny({ code: "POLICY_REVIEW_REQUIRED", event_type: "policy.denied", reason: "Approval payload hash does not match", required_action: "refresh_review" });
  }
  return allow("Risk approved");
}

function scopeMatches(allowedScope: PolicyScope, requestedScope: PolicyScope): boolean {
  return allowedScope.kind === requestedScope.kind && allowedScope.id === requestedScope.id;
}
