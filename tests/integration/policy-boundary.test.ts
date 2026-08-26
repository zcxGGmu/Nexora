import { describe, expect, it } from "vitest";
import { WorkspaceIdSchema } from "../../packages/contracts/src/index.js";
import { assertScope, evaluateConnectorPolicy } from "../../packages/policy/src/index.js";

const WORKSPACE_A = WorkspaceIdSchema.parse("01ARZ3NDEKTSV4RRFFQ69G5FAV");
const WORKSPACE_B = WorkspaceIdSchema.parse("01BRZ3NDEKTSV4RRFFQ69G5FAV");
const ACTOR_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";

const actor = {
  id: ACTOR_ID,
  role: "Agent",
  workspace_id: WORKSPACE_A,
  allowed_scopes: [{ kind: "workspace", id: WORKSPACE_A }],
} as const;

describe("policy boundary", () => {
  it("Given Site A agent When Site B memory is requested Then API and worker both deny before access", () => {
    for (const enforcementPoint of ["api", "worker"] as const) {
      // Given / When
      const decision = assertScope({ actor, action: "memory:read", enforcement_point: enforcementPoint, requested_scope: { kind: "workspace", id: WORKSPACE_B } });

      // Then
      expect(decision).toMatchObject({ allowed: false, code: "SCOPE_DENIED" });
    }
  });

  it("Given an R3 connector without approval When execution is evaluated Then no external call is made", async () => {
    // Given
    let externalCalls = 0;
    const callExternal = async (): Promise<void> => {
      externalCalls += 1;
    };

    // When
    const decision = evaluateConnectorPolicy({
      actor,
      connector: {
        id: "github.publish",
        risk_level: "R3",
        data_classification: "confidential",
        requires_review: true,
        allowed_scopes: [{ kind: "workspace", id: WORKSPACE_A }],
      },
      requested_scope: { kind: "workspace", id: WORKSPACE_A },
      approval: null,
      egress: {
        execution_location: "remote",
        provider: "github",
        region: "us",
        data_classification: "confidential",
        allowed_providers: ["github"],
        allowed_regions: ["us"],
        minimal_snapshot: true,
        target_url: "https://api.github.com/repos/acme/site/releases",
      },
    });
    if (decision.allowed) await callExternal();

    // Then
    expect(decision).toMatchObject({ allowed: false, code: "POLICY_REVIEW_REQUIRED" });
    expect(externalCalls).toBe(0);
  });

  it("Given connector scope excludes Site B When execution is evaluated Then connector denies before external call", async () => {
    let externalCalls = 0;
    const decision = evaluateConnectorPolicy({
      actor,
      connector: {
        id: "github.read",
        risk_level: "R1",
        data_classification: "internal",
        requires_review: false,
        allowed_scopes: [{ kind: "workspace", id: WORKSPACE_A }],
      },
      requested_scope: { kind: "workspace", id: WORKSPACE_B },
      approval: null,
      egress: {
        execution_location: "remote",
        provider: "github",
        region: "us",
        data_classification: "internal",
        allowed_providers: ["github"],
        allowed_regions: ["us"],
        minimal_snapshot: true,
        target_url: "https://api.github.com/repos/acme/site/contents",
      },
    });
    if (decision.allowed) externalCalls += 1;

    expect(decision).toMatchObject({ allowed: false, code: "SCOPE_DENIED" });
    expect(externalCalls).toBe(0);
  });
});
