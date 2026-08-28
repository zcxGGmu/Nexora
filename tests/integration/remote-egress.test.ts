import { describe, expect, it } from "vitest";
import { DataClassificationSchema, EgressReceiptSchema, RunIdSchema, AttemptIdSchema, StepIdSchema, TraceIdSchema } from "../../packages/contracts/src/index.js";
import { createEgressReceipt } from "../../packages/policy/src/index.js";
import { buildRemoteSnapshot, scanSnapshotForSecrets } from "../../apps/remote-worker/src/snapshot.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  attempt: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
  step: "01KRZ3NDEKTSV4RRFFQ69K5FAV",
  trace: "01VRZ3NDEKTSV4RRFFQ69V5FAV",
  lease: "01MRZ3NDEKTSV4RRFFQ69M5FAV",
};
const NOW = "2026-08-28T14:00:00.000Z";

describe("remote minimal snapshot and egress receipt", () => {
  it("Given scoped refs and a secret When a remote snapshot is built Then only bounded redacted content and refs cross the boundary", () => {
    const snapshot = buildRemoteSnapshot({
      workspace_id: IDS.workspace,
      run_id: IDS.run,
      attempt_id: IDS.attempt,
      step_id: IDS.step,
      trace_id: IDS.trace,
      lease_id: IDS.lease,
      fencing_token: 4,
      deadline_at: "2026-08-28T14:05:00.000Z",
      budget: { max_tokens: 1000, max_cost_usd: 2 },
      artifact_refs: [{ artifact_id: "01NRZ3NDEKTSV4RRFFQ69N5FAV", artifact_version: 2, content_hash: "sha256:" + "a".repeat(64) }],
      memory_refs: [{ note_id: "01PRZ3NDEKTSV4RRFFQ69P5FAV", note_version: 3, content_hash: "sha256:" + "b".repeat(64), content: "Token=super-secret; keep this note." }],
      policy_snapshot: { scope: { kind: "workspace", id: IDS.workspace }, data_classification: "internal", provider: "fixture-provider", region: "us-test-1", decision: { allowed: true, code: null, event_type: null, reason: "approved", required_action: "none", redactions: [] } },
      secret_refs: ["super-secret"],
      now: NOW,
    });

    expect(snapshot.memory_refs[0]?.content).toContain("[REDACTED]");
    expect(snapshot).not.toHaveProperty("vault");
    expect(snapshot).not.toHaveProperty("chat_history");
    expect(snapshot).not.toHaveProperty("secret_refs");
    expect(snapshot.redaction_count).toBe(1);
    expect(snapshot.snapshot_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(scanSnapshotForSecrets(snapshot, ["super-secret"])).toEqual([]);
  });

  it("Given a snapshot When an unknown secret field is supplied Then strict parsing rejects it", () => {
    expect(() => buildRemoteSnapshot({
      workspace_id: IDS.workspace,
      run_id: IDS.run,
      attempt_id: IDS.attempt,
      step_id: IDS.step,
      trace_id: IDS.trace,
      lease_id: IDS.lease,
      fencing_token: 1,
      deadline_at: "2026-08-28T14:05:00.000Z",
      budget: { max_tokens: 1, max_cost_usd: 1 },
      artifact_refs: [],
      memory_refs: [],
      policy_snapshot: { scope: { kind: "workspace", id: IDS.workspace }, data_classification: "restricted", provider: "fixture-provider", region: "us-test-1", decision: { allowed: true, code: null, event_type: null, reason: "approved", required_action: "none", redactions: [] } },
      secret_refs: [],
      chat_history: "must never cross boundary",
      now: NOW,
    })).toThrow();
  });

  it("Given an allowed remote decision When an egress receipt is created Then location provider region classification redactions and snapshot hash are durable", () => {
    const receipt = createEgressReceipt({
      receipt_id: "01QRZ3NDEKTSV4RRFFQ69Q5FAV",
      workspace_id: IDS.workspace,
      run_id: RunIdSchema.parse(IDS.run),
      attempt_id: AttemptIdSchema.parse(IDS.attempt),
      step_id: StepIdSchema.parse(IDS.step),
      trace_id: TraceIdSchema.parse(IDS.trace),
      execution_location: "remote",
      provider: "fixture-provider",
      region: "us-test-1",
      data_classification: DataClassificationSchema.parse("internal"),
      redaction_count: 1,
      policy_decision: { allowed: true, code: null, event_type: null, reason: "approved", required_action: "none", redactions: [] },
      snapshot_hash: "sha256:" + "c".repeat(64),
      created_at: NOW,
    });

    expect(EgressReceiptSchema.parse(receipt)).toMatchObject({ execution_location: "remote", provider: "fixture-provider", region: "us-test-1", data_classification: "internal", redaction_count: 1 });
    expect(receipt.policy_decision.allowed).toBe(true);
  });
});
