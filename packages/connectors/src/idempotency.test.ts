import { describe, expect, it } from "vitest";
import { migrate, openDatabase } from "@nexora/persistence";
import { IdempotencyRepository } from "@nexora/persistence";
import { ConnectorExecutionError } from "./errors.js";
import { ConnectorIdempotencyGate } from "./idempotency.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-27T04:00:00.000Z";
const REQUEST_HASH = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_HASH = "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

describe("ConnectorIdempotencyGate", () => {
  it("Given the same idempotency key and request hash When claimed twice Then it reuses the first receipt", () => {
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Demo", TIME, TIME);
    const gate = new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME });

    expect(gate.claim({ workspace_id: WORKSPACE_ID, idempotency_key: "connector:key", request_hash: REQUEST_HASH, receipt_ref: "receipt://first" })).toEqual({ kind: "reserved", receipt_ref: "receipt://first" });
    expect(gate.claim({ workspace_id: WORKSPACE_ID, idempotency_key: "connector:key", request_hash: REQUEST_HASH, receipt_ref: "receipt://second" })).toEqual({ kind: "reused", receipt_ref: "receipt://first" });
    expect(() => gate.claim({ workspace_id: WORKSPACE_ID, idempotency_key: "connector:key", request_hash: OTHER_HASH, receipt_ref: "receipt://third" })).toThrowError(ConnectorExecutionError);

    database.close();
  });

  it("Given a side effect reservation When confirmed Then later claims reuse the confirmed receipt", () => {
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Demo", TIME, TIME);
    const gate = new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME });

    expect(gate.begin({ workspace_id: WORKSPACE_ID, idempotency_key: "connector:begin", request_hash: REQUEST_HASH, receipt_ref: "receipt://first" })).toEqual({ kind: "reserved", receipt_ref: "receipt://first" });
    expect(gate.claim({ workspace_id: WORKSPACE_ID, idempotency_key: "connector:begin", request_hash: REQUEST_HASH, receipt_ref: "receipt://first" })).toEqual({ kind: "reserved", receipt_ref: "receipt://first" });
    expect(gate.claim({ workspace_id: WORKSPACE_ID, idempotency_key: "connector:begin", request_hash: REQUEST_HASH, receipt_ref: "receipt://second" })).toEqual({ kind: "reused", receipt_ref: "receipt://first" });

    database.close();
  });

  it("Given an unknown side effect When the same key is claimed Then execution is frozen until reconcile", () => {
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Demo", TIME, TIME);
    const gate = new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME });

    expect(gate.freezeUnknown({ workspace_id: WORKSPACE_ID, idempotency_key: "connector:unknown", request_hash: REQUEST_HASH, receipt_ref: "external://op-1" })).toEqual({ kind: "frozen", receipt_ref: "external://op-1" });
    expect(() => gate.claim({ workspace_id: WORKSPACE_ID, idempotency_key: "connector:unknown", request_hash: REQUEST_HASH, receipt_ref: "receipt://retry" })).toThrowError(ConnectorExecutionError);

    database.close();
  });
});
