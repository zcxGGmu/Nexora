import { describe, expect, it } from "vitest";
import { ScheduleOccurrenceSchema, ScheduleSchema } from "@nexora/contracts";
import { CORE_MIGRATION_VERSION, CORE_TABLES, migrate, openDatabase, ScheduleOccurrenceRepository, ScheduleRepository } from "./index.js";

const TIME = "2026-08-29T04:00:00.000Z";
const ID = {
  agent: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  event: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  goal: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  occurrence: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
  schedule: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
} as const;

describe("schedule repositories", () => {
  it("Given C14 migration When applied Then schedule tables and dedupe constraints are durable", () => {
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedWorkspaceGraph(database);
    const schedules = new ScheduleRepository(database);
    const occurrences = new ScheduleOccurrenceRepository(database);

    const schedule = schedules.create(scheduleRecord({ next_fire_at: "2026-08-31T00:00:00.000Z" }));
    const first = occurrences.create(occurrenceRecord({ dedupe_key: `${ID.schedule}:2026-08-31T00:00:00.000Z:r1` }));
    const duplicate = occurrences.create(occurrenceRecord({ dedupe_key: first.occurrence.dedupe_key, id: "01KRZ3NDEKTSV4RRFFQ69K5FAV" }));

    expect(CORE_MIGRATION_VERSION).toBe(7);
    expect(CORE_TABLES).toEqual(expect.arrayContaining(["schedules", "schedule_occurrences"]));
    expect(schedule.workflow_id).toBe("seo_draft_v1");
    expect(first.kind).toBe("created");
    expect(duplicate).toEqual({ kind: "duplicate", occurrence: first.occurrence });
    expect(occurrences.listBySchedule(ID.workspace, ID.schedule)).toEqual([first.occurrence]);
    database.close();
  });

  it("Given due schedules When listed Then disabled schedules and future fire times are excluded", () => {
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedWorkspaceGraph(database);
    const schedules = new ScheduleRepository(database);
    schedules.create(scheduleRecord({ id: ID.schedule, enabled: true, next_fire_at: "2026-08-29T03:59:00.000Z" }));
    schedules.create(scheduleRecord({ id: "01VRZ3NDEKTSV4RRFFQ69V5FAV", enabled: false, next_fire_at: "2026-08-29T03:58:00.000Z" }));
    schedules.create(scheduleRecord({ id: "01MRZ3NDEKTSV4RRFFQ69M5FAV", enabled: true, next_fire_at: "2026-08-29T04:01:00.000Z" }));

    expect(schedules.listDue(ID.workspace, TIME).map((schedule) => schedule.id)).toEqual([ID.schedule]);
    database.close();
  });
});

function scheduleRecord(overrides: Partial<Record<string, unknown>>) {
  return ScheduleSchema.parse({ ...scheduleRecordBase(), ...overrides });
}

function scheduleRecordBase() {
  return {
    id: ID.schedule,
    workspace_id: ID.workspace,
    schema_version: 1 as const,
    created_at: TIME,
    updated_at: TIME,
    workflow_id: "seo_draft_v1",
    enabled: true,
    trigger: { kind: "interval" as const, every_seconds: 3600 },
    timezone: "Asia/Shanghai",
    start_at: TIME,
    end_at: null,
    misfire_policy: "run_once_after_recovery" as const,
    max_catch_up: 1,
    overlap_policy: "skip_if_active" as const,
    next_fire_at: "2026-08-31T00:00:00.000Z",
    last_fire_at: null,
    revision: 1,
    run_template: { ticket_id: ID.ticket, agent_id: ID.agent, execution_location: "local" as const },
  };
}

function occurrenceRecord(overrides: Partial<Record<string, unknown>>) {
  return ScheduleOccurrenceSchema.parse({ ...occurrenceRecordBase(), ...overrides });
}

function occurrenceRecordBase() {
  return {
    id: ID.occurrence,
    workspace_id: ID.workspace,
    schema_version: 1 as const,
    created_at: TIME,
    updated_at: TIME,
    schedule_id: ID.schedule,
    workflow_id: "seo_draft_v1",
    scheduled_for: "2026-08-31T00:00:00.000Z",
    fired_at: "2026-08-31T00:00:01.000Z",
    run_id: ID.run,
    status: "enqueued" as const,
    dedupe_key: `${ID.schedule}:2026-08-31T00:00:00.000Z:r1`,
    schedule_revision: 1,
    misfire_policy: "run_once_after_recovery" as const,
    overlap_policy: "skip_if_active" as const,
    timezone: "Asia/Shanghai",
    time_resolution: "exact" as const,
    fired_event_id: ID.event,
    reason: "scheduled run enqueued",
  };
}

function seedWorkspaceGraph(database: ReturnType<typeof openDatabase>): void {
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(ID.workspace, "Demo", TIME, TIME);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(ID.agent, ID.workspace, "{}", TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ID.goal, ID.workspace, "Goal", "Objective", "[]", "{}", TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ID.ticket, ID.workspace, ID.goal, "ready", "ticket:c14", "{}", TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(ID.run, ID.workspace, ID.ticket, "queued", "{}", TIME, TIME);
}
