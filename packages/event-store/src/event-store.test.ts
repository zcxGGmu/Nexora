import { describe, expect, it } from "vitest";
import { EventEnvelopeSchema, type EventEnvelope } from "@nexora/contracts";
import { migrate, openDatabase } from "@nexora/persistence";
import { EventStore, EventStoreError } from "./event-store.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const ATTEMPT_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const STEP_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const TRACE_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const SYSTEM_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-26T04:00:00.000Z";

function seedRun(database: ReturnType<typeof openDatabase>): void {
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Demo", TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(SYSTEM_ID, WORKSPACE_ID, "Goal", "Objective", "[]", "{}", TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(TRACE_ID, WORKSPACE_ID, SYSTEM_ID, "ready", "ticket-c03", "{}", TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(RUN_ID, WORKSPACE_ID, TRACE_ID, "queued", "{}", TIME, TIME);
}

function event(sequence: number, eventId: string): EventEnvelope {
  return EventEnvelopeSchema.parse({
    event_id: eventId,
    event_type: sequence === 0 ? "run.created" : "step.started",
    schema_version: 1,
    occurred_at: TIME,
    workspace_id: WORKSPACE_ID,
    scope: { kind: "run", id: RUN_ID },
    trace_id: TRACE_ID,
    run_id: RUN_ID,
    attempt_id: sequence === 0 ? null : ATTEMPT_ID,
    step_id: sequence === 0 ? null : STEP_ID,
    actor: { type: "system", id: SYSTEM_ID },
    payload: {},
    redactions: [],
    sequence,
  });
}

describe("EventStore append", () => {
  it("Given ordered events When appending Then it stores immutable events and advances sequence", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    seedRun(database);
    const store = new EventStore(database);

    const first = event(0, "01GRZ3NDEKTSV4RRFFQ69G5FAV");
    const second = event(1, "01HRZ3NDEKTSV4RRFFQ69G5FAV");

    expect(store.append(first, -1)).toEqual(first);
    expect(store.append(second, 0)).toEqual(second);
    expect(store.listEvents({ workspaceId: WORKSPACE_ID, runId: RUN_ID, after: null, limit: 10 })).toMatchObject({
      events: [first, second],
      last_event_id: second.event_id,
    });
    expect(() => database.prepare("UPDATE events SET sequence = 9 WHERE workspace_id = ? AND event_id = ?").run(WORKSPACE_ID, first.event_id)).toThrow();
    expect(() => database.prepare("DELETE FROM events WHERE workspace_id = ? AND event_id = ?").run(WORKSPACE_ID, first.event_id)).toThrow();
    expect(() => database.prepare("INSERT OR REPLACE INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(first.event_id, first.workspace_id, first.run_id, first.sequence, "run.failed", first.occurred_at, first.occurred_at, first.trace_id, first.attempt_id, first.step_id, JSON.stringify({ ...first, event_type: "run.failed" }), first.schema_version)).toThrow();
    database.close();
  });

  it("Given duplicate or out-of-order events When appending Then it rejects without changing facts", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    seedRun(database);
    const store = new EventStore(database);
    const first = event(0, "01GRZ3NDEKTSV4RRFFQ69G5FAV");
    const duplicateId = event(1, first.event_id);
    const outOfOrder = event(2, "01HRZ3NDEKTSV4RRFFQ69G5FAV");

    store.append(first, -1);

    expect(() => store.append(duplicateId, 0)).toThrowError(EventStoreError);
    expect(() => store.append(outOfOrder, 0)).toThrowError(EventStoreError);
    expect(store.listEvents({ workspaceId: WORKSPACE_ID, runId: RUN_ID, after: null, limit: 10 }).events).toEqual([first]);
    database.close();
  });
});
