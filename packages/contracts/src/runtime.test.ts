import { describe, expect, it } from "vitest";
import {
  EgressReceiptSchema,
  RemoteExecutionSnapshotSchema,
  RuntimeCancelAckPayloadSchema,
  RuntimeEventPayloadSchema,
  RuntimeHelloPayloadSchema,
  RuntimeStartPayloadSchema,
} from "./index.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const HASH = "sha256:" + "a".repeat(64);
const TIME = "2026-08-28T14:00:00.000Z";

const snapshot = {
  schema_version: 1,
  workspace_id: ID,
  run_id: ID,
  attempt_id: ID,
  step_id: ID,
  trace_id: ID,
  lease_id: ID,
  fencing_token: 4,
  deadline_at: TIME,
  budget: { max_tokens: 1000, max_cost_usd: 2 },
  artifact_refs: [{ artifact_id: ID, artifact_version: 1, content_hash: HASH }],
  memory_refs: [{ note_id: ID, note_version: 1, content_hash: HASH, content: "redacted" }],
  policy_snapshot: { scope: { kind: "workspace", id: ID }, data_classification: "internal", provider: "fixture", region: "test", decision: { allowed: true, code: null, event_type: null, reason: "approved", required_action: "none", redactions: [] } },
  redaction_count: 1,
  snapshot_hash: HASH,
} as const;

describe("runtime payload contracts", () => {
  it("accepts the typed handshake and start payloads", () => {
    expect(RuntimeHelloPayloadSchema.parse({ adapter_id: "fixture", protocol_version: 1, capabilities: { resume: true, cancel: true } })).toEqual({ adapter_id: "fixture", protocol_version: 1, capabilities: { resume: true, cancel: true } });
    expect(RuntimeStartPayloadSchema.parse({ input: { prompt: "hello", retries: 1 } })).toEqual({ input: { prompt: "hello", retries: 1 } });
  });

  it("keeps unknown runtime event names parseable for unmapped-event handling", () => {
    expect(RuntimeEventPayloadSchema.parse({ event_type: "vendor.progress", data: { chunk: "1" } })).toEqual({ event_type: "vendor.progress", data: { chunk: "1" } });
  });

  it("rejects extra fields in cancellation acknowledgements", () => {
    expect(RuntimeCancelAckPayloadSchema.safeParse({ acknowledged: true, unknown: false, reason: null, secret: "nope" }).success).toBe(false);
  });

  it("accepts a bounded remote snapshot and validates optional remote start metadata", () => {
    expect(RemoteExecutionSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(RuntimeStartPayloadSchema.parse({ input: { prompt: "remote", snapshot, egress_receipt: { schema_version: 1, receipt_id: ID, workspace_id: ID, run_id: ID, attempt_id: ID, step_id: ID, trace_id: ID, execution_location: "remote", provider: "fixture", region: "test", data_classification: "internal", redaction_count: 1, policy_decision: snapshot.policy_snapshot.decision, snapshot_hash: HASH, created_at: TIME } } })).toHaveProperty("input.snapshot");
  });

  it("rejects unbounded or unknown remote snapshot fields", () => {
    expect(RemoteExecutionSnapshotSchema.safeParse({ ...snapshot, unknown: true }).success).toBe(false);
    expect(RemoteExecutionSnapshotSchema.safeParse({ ...snapshot, memory_refs: Array.from({ length: 129 }, () => snapshot.memory_refs[0]) }).success).toBe(false);
    expect(RemoteExecutionSnapshotSchema.safeParse({ ...snapshot, memory_refs: [{ ...snapshot.memory_refs[0], content: "x".repeat(65537) }] }).success).toBe(false);
  });

  it("keeps egress receipts strict and linked to the snapshot hash", () => {
    const receipt = { schema_version: 1, receipt_id: ID, workspace_id: ID, run_id: ID, attempt_id: ID, step_id: ID, trace_id: ID, execution_location: "remote", provider: "fixture", region: "test", data_classification: "internal", redaction_count: 1, policy_decision: snapshot.policy_snapshot.decision, snapshot_hash: HASH, created_at: TIME } as const;
    expect(EgressReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(EgressReceiptSchema.safeParse({ ...receipt, extra: true }).success).toBe(false);
  });
});
