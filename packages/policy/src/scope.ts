import type { EnforcementPoint, PolicyAction, PolicyScope } from "@nexora/contracts";
import { canRolePerform } from "./rbac.js";
import { allow, deny, type PolicyActor, type PolicyDecision } from "./decisions.js";

export type AssertScopeInput = {
  readonly actor: PolicyActor;
  readonly action: PolicyAction;
  readonly enforcement_point: EnforcementPoint;
  readonly requested_scope: PolicyScope;
  readonly untrusted_content?: string;
};

export function assertScope(input: AssertScopeInput): PolicyDecision {
  if (!canRolePerform({ role: input.actor.role, action: input.action })) {
    return deny({ code: "SCOPE_DENIED", event_type: "scope.denied", reason: `${input.enforcement_point} denied action for role`, required_action: "use_authorized_role" });
  }
  if (!input.actor.allowed_scopes.some((scope) => scopeMatches(scope, input.requested_scope))) {
    return deny({ code: "SCOPE_DENIED", event_type: "scope.denied", reason: `${input.enforcement_point} denied requested scope`, required_action: "request_authorized_scope" });
  }
  return allow("Scope allowed");
}

function scopeMatches(allowedScope: PolicyScope, requestedScope: PolicyScope): boolean {
  return allowedScope.kind === requestedScope.kind && allowedScope.id === requestedScope.id;
}
