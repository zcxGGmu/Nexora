import type { EnforcementPoint, PolicyScope } from "@nexora/contracts";
import { assertScope, type PolicyActor, type PolicyDecision } from "@nexora/policy";

export type MemoryOperation = "read" | "write";

export type MemoryAccessInput = {
  readonly actor: PolicyActor;
  readonly operation: MemoryOperation;
  readonly requested_scope: PolicyScope;
  readonly enforcement_point: EnforcementPoint;
};

export function assertMemoryAccess(input: MemoryAccessInput): PolicyDecision {
  return assertScope({
    actor: input.actor,
    action: input.operation === "read" ? "memory:read" : "memory:write",
    enforcement_point: input.enforcement_point,
    requested_scope: input.requested_scope,
  });
}

export function scopesEqual(left: PolicyScope, right: PolicyScope): boolean {
  return left.kind === right.kind && left.id === right.id;
}
