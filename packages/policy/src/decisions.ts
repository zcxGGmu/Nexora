import { EventEnvelopeSchema, type EventEnvelope, type PolicyDenialCode, type PolicyEventType, type PolicyScope, type PolicyDecisionRecord } from "@nexora/contracts";

export type PolicyDecision =
  | { readonly allowed: true; readonly reason: string; readonly required_action: "none" }
  | { readonly allowed: false; readonly code: PolicyDenialCode; readonly event_type: PolicyEventType; readonly reason: string; readonly required_action: string; readonly redactions: readonly string[] };

export type PolicyActor = {
  readonly id: string;
  readonly role: "Owner" | "Operator" | "Reviewer" | "Viewer" | "Agent";
  readonly workspace_id: string;
  readonly allowed_scopes: readonly PolicyScope[];
};

export type CreatePolicyEventInput = {
  readonly decision: PolicyDecision;
  readonly event_id: string;
  readonly workspace_id: string;
  readonly run_id: string;
  readonly trace_id: string;
  readonly occurred_at: string;
  readonly actor: { readonly type: "system" | "agent" | "human" | "connector"; readonly id: string | null };
  readonly sequence: number;
};

export function allow(reason = "Policy allowed"): PolicyDecision {
  return { allowed: true, reason, required_action: "none" };
}

export function deny(input: { readonly code: PolicyDenialCode; readonly event_type: PolicyEventType; readonly reason: string; readonly required_action: string; readonly redactions?: readonly string[] }): PolicyDecision {
  return { allowed: false, code: input.code, event_type: input.event_type, reason: input.reason, required_action: input.required_action, redactions: input.redactions ?? [] };
}

export function toDecisionRecord(decision: PolicyDecision): PolicyDecisionRecord {
  if (decision.allowed) return { allowed: true, code: null, event_type: null, reason: decision.reason, required_action: decision.required_action, redactions: [] };
  return { allowed: false, code: decision.code, event_type: decision.event_type, reason: decision.reason, required_action: decision.required_action, redactions: [...decision.redactions] };
}

export function createPolicyEvent(input: CreatePolicyEventInput): EventEnvelope {
  if (input.decision.allowed) {
    throw new PolicyEventError("Allowed decisions do not produce audit denial events");
  }

  return EventEnvelopeSchema.parse({
    event_id: input.event_id,
    event_type: input.decision.event_type,
    schema_version: 1,
    occurred_at: input.occurred_at,
    workspace_id: input.workspace_id,
    scope: { kind: "run", id: input.run_id },
    trace_id: input.trace_id,
    run_id: input.run_id,
    attempt_id: null,
    step_id: null,
    actor: input.actor,
    payload: {},
    redactions: [...input.decision.redactions],
    sequence: input.sequence,
  });
}

export class PolicyEventError extends Error {
  readonly name = "PolicyEventError";
}
