import { describe, expect, it } from "vitest";
import { EventEnvelopeSchema, type EventEnvelope } from "@nexora/contracts";
import { migrate, openDatabase } from "@nexora/persistence";
import { EventStore } from "./event-store.js";
import { PROJECTION_NAMES, ProjectionStore } from "./projections.js";

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

function runEvent(sequence: number, eventId: string, eventType: EventEnvelope["event_type"]): EventEnvelope {
  return EventEnvelopeSchema.parse({
    event_id: eventId,
    event_type: eventType,
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

describe("ProjectionStore", () => {
  it("Given raw events When rebuilding Then all projection checkpoints reach the last event", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    seedRun(database);
    const store = new EventStore(database);
    store.append(runEvent(0, "01GRZ3NDEKTSV4RRFFQ69G5FAV", "run.created"), -1);
    store.append(runEvent(1, "01HRZ3NDEKTSV4RRFFQ69G5FAV", "artifact.created"), 0);

    const projections = new ProjectionStore(database);
    const checkpoints = projections.rebuildProjection({ workspaceId: WORKSPACE_ID, runId: RUN_ID });

    expect(checkpoints.map((checkpoint) => checkpoint.projection_name)).toEqual(PROJECTION_NAMES);
    expect(checkpoints.every((checkpoint) => checkpoint.last_sequence === 1 && checkpoint.status === "ready")).toBe(true);
    expect(projections.getHealth({ workspaceId: WORKSPACE_ID, runId: RUN_ID })).toEqual({ status: "ok", projection_lag: 0 });

    const rebuiltAgain = projections.rebuildProjection({ workspaceId: WORKSPACE_ID, runId: RUN_ID });
    expect(rebuiltAgain).toEqual(checkpoints);
    expect(database.prepare("SELECT COUNT(*) AS count FROM projection_checkpoints WHERE workspace_id = ? AND run_id = ?").get(WORKSPACE_ID, RUN_ID)?.["count"]).toBe(PROJECTION_NAMES.length);
    database.close();
  });

  it("Given a degraded reducer When rebuilding Then events remain and projection health reports lag", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    seedRun(database);
    const store = new EventStore(database);
    const first = runEvent(0, "01GRZ3NDEKTSV4RRFFQ69G5FAV", "run.created");
    const second = runEvent(1, "01HRZ3NDEKTSV4RRFFQ69G5FAV", "review.requested");
    store.append(first, -1);
    store.append(second, 0);

    const degraded = new ProjectionStore(database, {
      reviews: () => {
        throw new Error("projection failed");
      },
    });
    degraded.rebuildProjection({ workspaceId: WORKSPACE_ID, runId: RUN_ID });

    expect(degraded.getHealth({ workspaceId: WORKSPACE_ID, runId: RUN_ID })).toEqual({ status: "degraded", projection_lag: 2 });
    expect(store.listEvents({ workspaceId: WORKSPACE_ID, runId: RUN_ID, after: null, limit: 10 }).events).toEqual([first, second]);

    const recovered = new ProjectionStore(database);
    recovered.rebuildProjection({ workspaceId: WORKSPACE_ID, runId: RUN_ID });
    expect(recovered.getHealth({ workspaceId: WORKSPACE_ID, runId: RUN_ID })).toEqual({ status: "ok", projection_lag: 0 });
    database.close();
  });
});
