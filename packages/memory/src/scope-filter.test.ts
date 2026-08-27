import { describe, expect, it } from "vitest";
import type { PolicyScope } from "@nexora/contracts";
import type { PolicyActor } from "@nexora/policy";
import { assertMemoryAccess } from "./scope-filter.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const OTHER_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const scope: PolicyScope = { kind: "workspace", id: WORKSPACE_ID };

describe("memory scope filter", () => {
  it("Given read and write memory actions When roles differ Then Viewer remains read-only and Agent writes only inside scope", () => {
    const viewer: PolicyActor = { id: OTHER_ID, role: "Viewer", workspace_id: WORKSPACE_ID, allowed_scopes: [scope] };
    const agent: PolicyActor = { id: OTHER_ID, role: "Agent", workspace_id: WORKSPACE_ID, allowed_scopes: [scope] };

    expect(assertMemoryAccess({ actor: viewer, operation: "read", requested_scope: scope, enforcement_point: "api" }).allowed).toBe(true);
    expect(assertMemoryAccess({ actor: viewer, operation: "write", requested_scope: scope, enforcement_point: "api" }).allowed).toBe(false);
    expect(assertMemoryAccess({ actor: agent, operation: "write", requested_scope: { kind: "workspace", id: OTHER_ID }, enforcement_point: "worker" }).allowed).toBe(false);
  });
});
