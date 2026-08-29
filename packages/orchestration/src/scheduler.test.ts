import { describe, expect, it } from "vitest";
import { EventEnvelopeSchema, ScheduleOccurrenceSchema, ScheduleSchema } from "@nexora/contracts";
import { migrate, openDatabase, ScheduleOccurrenceRepository, ScheduleRepository } from "@nexora/persistence";
import { DurableQueue } from "./queue.js";
import { DurableScheduler } from "./scheduler.js";

const TIME = "2026-08-29T04:00:00.000Z";
const NEXT = "2026-08-29T04:01:00.000Z";
const ID = {
  agent: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  schedule: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
} as const;

describe("DurableScheduler", () => {
  it("Given a due interval schedule When two scheduler instances fire Then one occurrence and one queued Run are created", () => {
    const state = createSchedulerState(["01GRZ3NDEKTSV4RRFFQ69G5FAV", "01HRZ3NDEKTSV4RRFFQ69H5FAV", "01JRZ3NDEKTSV4RRFFQ69J5FAV", "01KRZ3NDEKTSV4RRFFQ69K5FAV", "01VRZ3NDEKTSV4RRFFQ69V5FAV", "01MRZ3NDEKTSV4RRFFQ69M5FAV"]);
    state.schedules.create(scheduleRecord({ next_fire_at: TIME }));
    const schedulerA = state.scheduler;
    const schedulerB = new DurableScheduler({ database: state.database, clock: { now: () => TIME }, idFactory: state.nextId });

    const first = schedulerA.fireDue({ workspace_id: ID.workspace, now: TIME });
    const second = schedulerB.fireDue({ workspace_id: ID.workspace, now: TIME });

    expect(first).toHaveLength(1);
    expect(first[0]?.kind).toBe("enqueued");
    expect(second).toEqual([]);
    expect(new ScheduleOccurrenceRepository(state.database).listBySchedule(ID.workspace, ID.schedule)).toHaveLength(1);
    expect(state.database.prepare("SELECT COUNT(*) AS count FROM runs WHERE workspace_id = ?").get(ID.workspace)?.["count"]).toBe(1);
    expect(new DurableQueue(state.database, { now: () => TIME }).get(ID.workspace, "01MRZ3NDEKTSV4RRFFQ69M5FAV")?.payload).toMatchObject({ kind: "deterministic", schedule_id: ID.schedule });
    expect(state.schedules.get(ID.workspace, ID.schedule)?.last_fire_at).toBe(TIME);
    expect(state.schedules.get(ID.workspace, ID.schedule)?.next_fire_at).toBe(NEXT);
    expect(scheduleEvents(state.database).map((event) => event.event_type)).toEqual(["schedule.fired"]);
    state.database.close();
  });

  it("Given occurrence creation loses a dedupe race When the scheduler fires Then duplicate handling leaves no Run graph side effects", () => {
    const state = createSchedulerState(["01GRZ3NDEKTSV4RRFFQ69G5FAV", "01HRZ3NDEKTSV4RRFFQ69H5FAV", "01JRZ3NDEKTSV4RRFFQ69J5FAV", "01KRZ3NDEKTSV4RRFFQ69K5FAV", "01VRZ3NDEKTSV4RRFFQ69V5FAV", "01MRZ3NDEKTSV4RRFFQ69M5FAV"]);
    const schedule = scheduleRecord({ next_fire_at: TIME });
    const duplicate = ScheduleOccurrenceSchema.parse({ id: "01NRZ3NDEKTSV4RRFFQ69N5FAV", workspace_id: ID.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, schedule_id: ID.schedule, workflow_id: schedule.workflow_id, scheduled_for: TIME, fired_at: TIME, run_id: null, status: "blocked_policy", dedupe_key: `${ID.schedule}:${TIME}:r${schedule.revision}`, schedule_revision: schedule.revision, misfire_policy: schedule.misfire_policy, overlap_policy: schedule.overlap_policy, timezone: schedule.timezone, time_resolution: "exact", fired_event_id: "01PRZ3NDEKTSV4RRFFQ69P5FAV", reason: "concurrent scheduler won occurrence insert" });
    state.schedules.create(schedule);
    new ScheduleOccurrenceRepository(state.database).create(duplicate);
    Object.defineProperty(state.scheduler, "occurrences", { value: { getByDedupeKey: () => undefined, create: () => ({ kind: "duplicate", occurrence: duplicate }) } satisfies Pick<ScheduleOccurrenceRepository, "getByDedupeKey" | "create"> });

    const fired = state.scheduler.fireDue({ workspace_id: ID.workspace, now: TIME });

    expect(fired).toEqual([]);
    expect(new ScheduleOccurrenceRepository(state.database).listBySchedule(ID.workspace, ID.schedule)).toEqual([duplicate]);
    expect(state.database.prepare("SELECT COUNT(*) AS count FROM runs WHERE workspace_id = ?").get(ID.workspace)?.["count"]).toBe(0);
    expect(state.database.prepare("SELECT COUNT(*) AS count FROM attempts WHERE workspace_id = ?").get(ID.workspace)?.["count"]).toBe(0);
    expect(state.database.prepare("SELECT COUNT(*) AS count FROM steps WHERE workspace_id = ?").get(ID.workspace)?.["count"]).toBe(0);
    expect(state.database.prepare("SELECT COUNT(*) AS count FROM queue_jobs WHERE workspace_id = ?").get(ID.workspace)?.["count"]).toBe(0);
    expect(scheduleEvents(state.database)).toEqual([]);
    expect(state.schedules.get(ID.workspace, ID.schedule)?.next_fire_at).toBe(TIME);
    state.database.close();
  });

  it("Given skip_if_active overlap When a prior occurrence Run is active Then the new trigger records schedule.fired without a Run", () => {
    const state = createSchedulerState([
      "01GRZ3NDEKTSV4RRFFQ69G5FAV", "01HRZ3NDEKTSV4RRFFQ69H5FAV", "01JRZ3NDEKTSV4RRFFQ69J5FAV", "01KRZ3NDEKTSV4RRFFQ69K5FAV", "01VRZ3NDEKTSV4RRFFQ69V5FAV", "01MRZ3NDEKTSV4RRFFQ69M5FAV",
      "01NRZ3NDEKTSV4RRFFQ69N5FAV", "01PRZ3NDEKTSV4RRFFQ69P5FAV",
    ]);
    state.schedules.create(scheduleRecord({ next_fire_at: TIME, overlap_policy: "skip_if_active" }));
    state.scheduler.fireDue({ workspace_id: ID.workspace, now: TIME });

    const skipped = state.scheduler.fireDue({ workspace_id: ID.workspace, now: NEXT });

    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ kind: "skipped_overlap", run_id: null });
    expect(new ScheduleOccurrenceRepository(state.database).listBySchedule(ID.workspace, ID.schedule).map((occurrence) => occurrence.status)).toEqual(["enqueued", "skipped_overlap"]);
    expect(scheduleEvents(state.database).map((event) => ({ run_id: event.run_id, status: event.payload["status"] }))).toEqual([{ run_id: "01JRZ3NDEKTSV4RRFFQ69J5FAV", status: "enqueued" }, { run_id: null, status: "skipped_overlap" }]);
    state.database.close();
  });

  it("Given queue_after_active overlap When a prior occurrence Run is active Then a second Run remains queued", () => {
    const state = createSchedulerState([
      "01GRZ3NDEKTSV4RRFFQ69G5FAV", "01HRZ3NDEKTSV4RRFFQ69H5FAV", "01JRZ3NDEKTSV4RRFFQ69J5FAV", "01KRZ3NDEKTSV4RRFFQ69K5FAV", "01VRZ3NDEKTSV4RRFFQ69V5FAV", "01MRZ3NDEKTSV4RRFFQ69M5FAV",
      "01NRZ3NDEKTSV4RRFFQ69N5FAV", "01PRZ3NDEKTSV4RRFFQ69P5FAV", "01QRZ3NDEKTSV4RRFFQ69Q5FAV", "01RRZ3NDEKTSV4RRFFQ69R5FAV", "01SRZ3NDEKTSV4RRFFQ69S5FAV", "01TRZ3NDEKTSV4RRFFQ69T5FAV",
    ]);
    state.schedules.create(scheduleRecord({ next_fire_at: TIME, overlap_policy: "queue_after_active" }));
    state.scheduler.fireDue({ workspace_id: ID.workspace, now: TIME });

    const second = state.scheduler.fireDue({ workspace_id: ID.workspace, now: NEXT });

    expect(second[0]).toMatchObject({ kind: "enqueued", run_id: "01QRZ3NDEKTSV4RRFFQ69Q5FAV" });
    expect(new ScheduleOccurrenceRepository(state.database).listBySchedule(ID.workspace, ID.schedule).map((occurrence) => occurrence.status)).toEqual(["enqueued", "enqueued"]);
    expect(state.database.prepare("SELECT status FROM runs WHERE workspace_id = ? AND id = ?").get(ID.workspace, "01JRZ3NDEKTSV4RRFFQ69J5FAV")?.["status"]).toBe("queued");
    expect(state.database.prepare("SELECT COUNT(*) AS count FROM queue_jobs WHERE workspace_id = ?").get(ID.workspace)?.["count"]).toBe(2);
    state.database.close();
  });

  it("Given skip_missed misfire policy When a persisted fire time is stale Then a blocked occurrence advances the schedule", () => {
    const missedFire = "2026-08-29T03:58:00.000Z";
    const state = createSchedulerState(["01GRZ3NDEKTSV4RRFFQ69G5FAV", "01HRZ3NDEKTSV4RRFFQ69H5FAV"]);
    state.schedules.create(scheduleRecord({ next_fire_at: missedFire, misfire_policy: "skip_missed" }));

    const skipped = state.scheduler.fireDue({ workspace_id: ID.workspace, now: TIME });

    expect(skipped[0]).toMatchObject({ kind: "blocked_policy", run_id: null });
    expect(new ScheduleOccurrenceRepository(state.database).listBySchedule(ID.workspace, ID.schedule)).toMatchObject([{ scheduled_for: missedFire, status: "blocked_policy", run_id: null }]);
    expect(state.schedules.get(ID.workspace, ID.schedule)).toMatchObject({ last_fire_at: missedFire, next_fire_at: NEXT });
    expect(scheduleEvents(state.database)).toHaveLength(1);
    expect(state.database.prepare("SELECT COUNT(*) AS count FROM runs WHERE workspace_id = ?").get(ID.workspace)?.["count"]).toBe(0);
    state.database.close();
  });

  it("Given max catch-up above one When restart finds multiple missed fires Then only the capped occurrences are enqueued", () => {
    const firstMissed = "2026-08-29T03:58:00.000Z";
    const secondMissed = "2026-08-29T03:59:00.000Z";
    const state = createSchedulerState([
      "01GRZ3NDEKTSV4RRFFQ69G5FAV", "01HRZ3NDEKTSV4RRFFQ69H5FAV", "01JRZ3NDEKTSV4RRFFQ69J5FAV", "01KRZ3NDEKTSV4RRFFQ69K5FAV", "01VRZ3NDEKTSV4RRFFQ69V5FAV", "01MRZ3NDEKTSV4RRFFQ69M5FAV",
      "01NRZ3NDEKTSV4RRFFQ69N5FAV", "01PRZ3NDEKTSV4RRFFQ69P5FAV", "01QRZ3NDEKTSV4RRFFQ69Q5FAV", "01RRZ3NDEKTSV4RRFFQ69R5FAV", "01SRZ3NDEKTSV4RRFFQ69S5FAV", "01TRZ3NDEKTSV4RRFFQ69T5FAV",
    ]);
    state.schedules.create(scheduleRecord({ next_fire_at: firstMissed, max_catch_up: 2, overlap_policy: "queue_after_active" }));

    const fired = state.scheduler.fireDue({ workspace_id: ID.workspace, now: TIME });

    expect(fired.map((result) => result.kind)).toEqual(["enqueued", "enqueued"]);
    expect(new ScheduleOccurrenceRepository(state.database).listBySchedule(ID.workspace, ID.schedule).map((occurrence) => occurrence.scheduled_for)).toEqual([firstMissed, secondMissed]);
    expect(state.schedules.get(ID.workspace, ID.schedule)).toMatchObject({ last_fire_at: secondMissed, next_fire_at: NEXT });
    expect(state.database.prepare("SELECT COUNT(*) AS count FROM runs WHERE workspace_id = ?").get(ID.workspace)?.["count"]).toBe(2);
    state.database.close();
  });

  it("Given cancel_previous overlap When a prior occurrence Run is active Then the old Run is cancelled and a new occurrence is enqueued", () => {
    const state = createSchedulerState([
      "01GRZ3NDEKTSV4RRFFQ69G5FAV", "01HRZ3NDEKTSV4RRFFQ69H5FAV", "01JRZ3NDEKTSV4RRFFQ69J5FAV", "01KRZ3NDEKTSV4RRFFQ69K5FAV", "01VRZ3NDEKTSV4RRFFQ69V5FAV", "01MRZ3NDEKTSV4RRFFQ69M5FAV",
      "01NRZ3NDEKTSV4RRFFQ69N5FAV", "01PRZ3NDEKTSV4RRFFQ69P5FAV", "01QRZ3NDEKTSV4RRFFQ69Q5FAV", "01RRZ3NDEKTSV4RRFFQ69R5FAV", "01SRZ3NDEKTSV4RRFFQ69S5FAV", "01TRZ3NDEKTSV4RRFFQ69T5FAV",
    ]);
    state.schedules.create(scheduleRecord({ next_fire_at: TIME, overlap_policy: "cancel_previous" }));
    state.scheduler.fireDue({ workspace_id: ID.workspace, now: TIME });

    const second = state.scheduler.fireDue({ workspace_id: ID.workspace, now: NEXT });

    expect(second[0]).toMatchObject({ kind: "enqueued", run_id: "01QRZ3NDEKTSV4RRFFQ69Q5FAV" });
    expect(state.database.prepare("SELECT status FROM runs WHERE workspace_id = ? AND id = ?").get(ID.workspace, "01JRZ3NDEKTSV4RRFFQ69J5FAV")?.["status"]).toBe("cancelled");
    expect(state.database.prepare("SELECT status FROM queue_jobs WHERE workspace_id = ? AND run_id = ?").get(ID.workspace, "01JRZ3NDEKTSV4RRFFQ69J5FAV")?.["status"]).toBe("cancelled");
    expect(new ScheduleOccurrenceRepository(state.database).listBySchedule(ID.workspace, ID.schedule).map((occurrence) => occurrence.status)).toEqual(["enqueued", "enqueued"]);
    state.database.close();
  });

  it("Given an end_at boundary When missed fires include the boundary Then before and at end are fired and next fire is cleared", () => {
    const state = createSchedulerState([
      "01GRZ3NDEKTSV4RRFFQ69G5FAV", "01HRZ3NDEKTSV4RRFFQ69H5FAV", "01JRZ3NDEKTSV4RRFFQ69J5FAV", "01KRZ3NDEKTSV4RRFFQ69K5FAV", "01VRZ3NDEKTSV4RRFFQ69V5FAV", "01MRZ3NDEKTSV4RRFFQ69M5FAV",
      "01NRZ3NDEKTSV4RRFFQ69N5FAV", "01PRZ3NDEKTSV4RRFFQ69P5FAV", "01QRZ3NDEKTSV4RRFFQ69Q5FAV", "01RRZ3NDEKTSV4RRFFQ69R5FAV", "01SRZ3NDEKTSV4RRFFQ69S5FAV", "01TRZ3NDEKTSV4RRFFQ69T5FAV",
    ]);
    state.schedules.create(scheduleRecord({ next_fire_at: TIME, end_at: NEXT, max_catch_up: 2, overlap_policy: "queue_after_active" }));

    const fired = state.scheduler.fireDue({ workspace_id: ID.workspace, now: NEXT });

    expect(fired.map((result) => result.kind)).toEqual(["enqueued", "enqueued"]);
    expect(new ScheduleOccurrenceRepository(state.database).listBySchedule(ID.workspace, ID.schedule).map((occurrence) => occurrence.scheduled_for)).toEqual([TIME, NEXT]);
    expect(state.schedules.get(ID.workspace, ID.schedule)).toMatchObject({ last_fire_at: NEXT, next_fire_at: null });
    state.database.close();
  });

  it("Given next_fire_at is after end_at When the scheduler recovers Then no occurrence or Run is created", () => {
    const state = createSchedulerState(["01GRZ3NDEKTSV4RRFFQ69G5FAV", "01HRZ3NDEKTSV4RRFFQ69H5FAV", "01JRZ3NDEKTSV4RRFFQ69J5FAV", "01KRZ3NDEKTSV4RRFFQ69K5FAV", "01VRZ3NDEKTSV4RRFFQ69V5FAV", "01MRZ3NDEKTSV4RRFFQ69M5FAV"]);
    state.schedules.create(scheduleRecord({ next_fire_at: NEXT, end_at: TIME }));

    const fired = state.scheduler.fireDue({ workspace_id: ID.workspace, now: NEXT });

    expect(fired).toEqual([]);
    expect(new ScheduleOccurrenceRepository(state.database).listBySchedule(ID.workspace, ID.schedule)).toEqual([]);
    expect(state.database.prepare("SELECT COUNT(*) AS count FROM runs WHERE workspace_id = ?").get(ID.workspace)?.["count"]).toBe(0);
    expect(state.schedules.get(ID.workspace, ID.schedule)).toMatchObject({ last_fire_at: null, next_fire_at: null });
    state.database.close();
  });

  it("Given cron fires across DST boundaries When occurrences are recorded Then skipped and ambiguous local times are visible", () => {
    const spring = createSchedulerState(["01GRZ3NDEKTSV4RRFFQ69G5FAV", "01HRZ3NDEKTSV4RRFFQ69H5FAV", "01JRZ3NDEKTSV4RRFFQ69J5FAV", "01KRZ3NDEKTSV4RRFFQ69K5FAV", "01VRZ3NDEKTSV4RRFFQ69V5FAV", "01MRZ3NDEKTSV4RRFFQ69M5FAV"], "2026-03-08T07:30:00.000Z");
    spring.schedules.create(scheduleRecord({ next_fire_at: "2026-03-08T07:30:00.000Z", start_at: "2026-03-07T07:30:00.000Z", trigger: { kind: "cron", expression: "30 2 * * *" }, timezone: "America/New_York" }));

    const fall = createSchedulerState(["01GRZ3NDEKTSV4RRFFQ69G5FAV", "01HRZ3NDEKTSV4RRFFQ69H5FAV", "01JRZ3NDEKTSV4RRFFQ69J5FAV", "01KRZ3NDEKTSV4RRFFQ69K5FAV", "01VRZ3NDEKTSV4RRFFQ69V5FAV", "01MRZ3NDEKTSV4RRFFQ69M5FAV"], "2026-11-01T05:30:00.000Z");
    fall.schedules.create(scheduleRecord({ next_fire_at: "2026-11-01T05:30:00.000Z", start_at: "2026-10-31T05:30:00.000Z", trigger: { kind: "cron", expression: "30 1 * * *" }, timezone: "America/New_York" }));

    expect(spring.scheduler.fireDue({ workspace_id: ID.workspace, now: "2026-03-08T07:30:00.000Z" })[0]?.occurrence.time_resolution).toBe("skipped_time");
    expect(fall.scheduler.fireDue({ workspace_id: ID.workspace, now: "2026-11-01T05:30:00.000Z" })[0]?.occurrence.time_resolution).toBe("ambiguous_time");
    spring.database.close();
    fall.database.close();
  });
});

function createSchedulerState(ids: readonly string[], now = TIME) {
  const database = openDatabase(":memory:");
  migrate(database, { now: () => now });
  seedWorkspaceGraph(database, now);
  const schedules = new ScheduleRepository(database);
  const nextId = idFactory(ids);
  return { database, schedules, nextId, scheduler: new DurableScheduler({ database, clock: { now: () => now }, idFactory: nextId }) };
}

function scheduleEvents(database: ReturnType<typeof openDatabase>) {
  return database.prepare("SELECT payload_json FROM events WHERE workspace_id = ? AND event_type = 'schedule.fired' ORDER BY sequence ASC").all(ID.workspace).map((row) => EventEnvelopeSchema.parse(JSON.parse(readText(row["payload_json"]))));
}

function scheduleRecord(overrides: Partial<Record<string, unknown>>) {
  return ScheduleSchema.parse({
    id: ID.schedule,
    workspace_id: ID.workspace,
    schema_version: 1,
    created_at: TIME,
    updated_at: TIME,
    workflow_id: "seo_draft_v1",
    enabled: true,
    trigger: { kind: "interval", every_seconds: 60 },
    timezone: "UTC",
    start_at: TIME,
    end_at: null,
    misfire_policy: "run_once_after_recovery",
    max_catch_up: 1,
    overlap_policy: "skip_if_active",
    next_fire_at: TIME,
    last_fire_at: null,
    revision: 1,
    run_template: { ticket_id: ID.ticket, agent_id: ID.agent, execution_location: "local" },
    ...overrides,
  });
}

function seedWorkspaceGraph(database: ReturnType<typeof openDatabase>, now: string): void {
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(ID.workspace, "Demo", now, now);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(ID.agent, ID.workspace, "{}", now, now);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ID.goal, ID.workspace, "Goal", "Objective", "[]", "{}", now, now);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ID.ticket, ID.workspace, ID.goal, "ready", "ticket:c14", "{}", now, now);
}

function idFactory(ids: readonly string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    if (id === undefined) throw new Error("ID factory exhausted");
    index += 1;
    return id;
  };
}

function readText(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected text");
  return value;
}
