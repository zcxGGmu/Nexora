import { describe, expect, it } from "vitest";
import { EventEnvelopeSchema, type EventEnvelope } from "@nexora/contracts";
import { migrate, openDatabase } from "@nexora/persistence";
import { EVENT_CURSOR_EXPIRED, EventStore } from "./event-store.js";
import { dedupeEvents } from "./cursor.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const TRACE_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const SYSTEM_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-26T04:00:00.000Z";

function seedRun(database: ReturnType<typeof openDatabase>): void {
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Demo", TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(SYSTEM_ID, WORKSPACE_ID, "Goal", "Objective", "[]", "{}", TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(TRACE_ID, WORKSPACE_ID, SYSTEM_ID, "ready", "ticket-c03", "{}", TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(RUN_ID, WORKSPACE_ID, TRACE_ID, "queued", "{}", TIME, TIME);
}

function runEvent(sequence: number, eventId: string): EventEnvelope {
  return EventEnvelopeSchema.parse({
    event_id: eventId,
    event_type: sequence === 0 ? "run.created" : "run.started",
    schema_version: 1,
    occurred_at: TIME,
    workspace_id: WORKSPACE_ID,
    scope: { kind: "run", id: RUN_ID },
    trace_id: TRACE_ID,
    run_id: RUN_ID,
    attempt_id: null,
    step_id: null,
    actor: { type: "system", id: SYSTEM_ID },
    payload: {},
    redactions: [],
    sequence,
  });
}

describe("event cursor", () => {
  it("Given a paged read When using next cursor Then it resumes after the previous page", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    seedRun(database);
    const store = new EventStore(database);
    const first = runEvent(0, "01GRZ3NDEKTSV4RRFFQ69G5FAV");
    const second = runEvent(1, "01HRZ3NDEKTSV4RRFFQ69G5FAV");
    const third = runEvent(2, "01JRZ3NDEKTSV4RRFFQ69G5FAV");
    store.append(first, -1);
    store.append(second, 0);
    store.append(third, 1);

    const firstPage = store.listEvents({ workspaceId: WORKSPACE_ID, runId: RUN_ID, after: null, limit: 2 });
    const secondPage = store.listEvents({ workspaceId: WORKSPACE_ID, runId: RUN_ID, after: firstPage.next_cursor, limit: 2 });

    expect(firstPage.events).toEqual([first, second]);
    expect(firstPage.next_cursor).not.toBeNull();
    expect(firstPage.last_event_id).toBe(second.event_id);
    expect(secondPage.events).toEqual([third]);
    expect(secondPage.next_cursor).toBeNull();
    database.close();
  });

  it("Given an expired cursor When listing events Then it returns the cursor error", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    seedRun(database);
    const store = new EventStore(database);

    expect(() => store.listEvents({ workspaceId: WORKSPACE_ID, runId: RUN_ID, after: "run:01ZZZ3NDEKTSV4RRFFQ69G5FAV:99", limit: 10 })).toThrowError(EVENT_CURSOR_EXPIRED);
    database.close();
  });

  it("Given a malformed cursor When listing events Then it is rejected instead of partially parsed", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    seedRun(database);
    const store = new EventStore(database);
    store.append(runEvent(0, "01GRZ3NDEKTSV4RRFFQ69G5FAV"), -1);

    expect(() => store.listEvents({ workspaceId: WORKSPACE_ID, runId: RUN_ID, after: `run:${RUN_ID}:0junk`, limit: 10 })).toThrowError(EVENT_CURSOR_EXPIRED);
    database.close();
  });

  it("Given reconnect events When deduping Then repeated event IDs are ignored", () => {
    const first = runEvent(0, "01GRZ3NDEKTSV4RRFFQ69G5FAV");
    const replay = runEvent(1, "01HRZ3NDEKTSV4RRFFQ69G5FAV");
    const liveDuplicate = runEvent(1, "01HRZ3NDEKTSV4RRFFQ69G5FAV");
    const liveNew = runEvent(2, "01JRZ3NDEKTSV4RRFFQ69G5FAV");

    expect(dedupeEvents([first.event_id], [replay, liveDuplicate, liveNew])).toEqual([replay, liveNew]);
  });
});
