import { describe, expect, it } from "vitest";
import { ScheduleFiredEventSchema, ScheduleOccurrenceSchema, ScheduleSchema } from "./index.js";

const TIME = "2026-08-29T04:00:00.000Z";
const ID = {
  agent: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  event: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  occurrence: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
  schedule: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  trace: "01KRZ3NDEKTSV4RRFFQ69K5FAV",
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
} as const;

const schedule = {
  id: ID.schedule,
  workspace_id: ID.workspace,
  schema_version: 1,
  created_at: TIME,
  updated_at: TIME,
  workflow_id: "seo_draft_v1",
  enabled: true,
  trigger: { kind: "cron", expression: "0 8 * * 1-5" },
  timezone: "Asia/Shanghai",
  start_at: TIME,
  end_at: null,
  misfire_policy: "run_once_after_recovery",
  max_catch_up: 1,
  overlap_policy: "skip_if_active",
  next_fire_at: "2026-08-31T00:00:00.000Z",
  last_fire_at: null,
  revision: 1,
  run_template: { ticket_id: ID.ticket, agent_id: ID.agent, execution_location: "local" },
} as const;

const occurrence = {
  id: ID.occurrence,
  workspace_id: ID.workspace,
  schema_version: 1,
  created_at: TIME,
  updated_at: TIME,
  schedule_id: ID.schedule,
  workflow_id: "seo_draft_v1",
  scheduled_for: "2026-08-31T00:00:00.000Z",
  fired_at: "2026-08-31T00:00:01.000Z",
  run_id: ID.run,
  status: "enqueued",
  dedupe_key: `${ID.schedule}:2026-08-31T00:00:00.000Z:r1`,
  schedule_revision: 1,
  misfire_policy: "run_once_after_recovery",
  overlap_policy: "skip_if_active",
  timezone: "Asia/Shanghai",
  time_resolution: "exact",
  fired_event_id: ID.event,
  reason: "scheduled run enqueued",
} as const;

describe("schedule contracts", () => {
  it("Given a durable cron schedule When parsed Then UTC fire fields timezone revision and policies are retained", () => {
    expect(ScheduleSchema.parse(schedule)).toEqual(schedule);
  });

  it("Given invalid schedule metadata When parsed Then unsafe timing states are rejected", () => {
    expect(ScheduleSchema.safeParse({ ...schedule, timezone: "Mars/Base" }).success).toBe(false);
    expect(ScheduleSchema.safeParse({ ...schedule, max_catch_up: 0 }).success).toBe(false);
    expect(ScheduleSchema.safeParse({ ...schedule, next_fire_at: "2026-08-31T08:00:00+08:00" }).success).toBe(false);
    expect(ScheduleSchema.safeParse({ ...schedule, overlap_policy: "parallel" }).success).toBe(false);
    expect(ScheduleSchema.safeParse({ ...schedule, trigger: { kind: "cron", expression: "not a cron expression" } }).success).toBe(false);
  });

  it("Given a fired occurrence When parsed Then dedupe status and DST resolution are explicit", () => {
    expect(ScheduleOccurrenceSchema.parse(occurrence)).toEqual(occurrence);
    expect(ScheduleOccurrenceSchema.parse({ ...occurrence, id: ID.trace, status: "skipped_overlap", run_id: null, time_resolution: "ambiguous_time" })).toMatchObject({ status: "skipped_overlap", time_resolution: "ambiguous_time" });
    expect(ScheduleOccurrenceSchema.parse({ ...occurrence, id: ID.trace, status: "blocked_policy", run_id: null, time_resolution: "skipped_time" })).toMatchObject({ status: "blocked_policy", time_resolution: "skipped_time" });
  });

  it("Given occurrence status and Run binding When parsed Then impossible persisted states are rejected", () => {
    expect(ScheduleOccurrenceSchema.safeParse({ ...occurrence, run_id: null }).success).toBe(false);
    expect(ScheduleOccurrenceSchema.safeParse({ ...occurrence, status: "skipped_overlap" }).success).toBe(false);
    expect(ScheduleOccurrenceSchema.safeParse({ ...occurrence, status: "blocked_policy" }).success).toBe(false);
    expect(ScheduleOccurrenceSchema.safeParse({ ...occurrence, status: "failed_enqueue" }).success).toBe(false);
    expect(ScheduleOccurrenceSchema.safeParse({ ...occurrence, status: "failed_enqueue", run_id: null }).success).toBe(true);
    expect(ScheduleOccurrenceSchema.safeParse({ ...occurrence, status: "deduplicated", run_id: null }).success).toBe(false);
  });

  it("Given a schedule trigger without a Run When event parsed Then schedule.fired remains a valid audit event", () => {
    const event = {
      event_id: ID.event,
      event_type: "schedule.fired",
      schema_version: 1,
      occurred_at: occurrence.fired_at,
      workspace_id: ID.workspace,
      scope: { kind: "schedule", id: ID.schedule },
      trace_id: ID.trace,
      run_id: null,
      attempt_id: null,
      step_id: null,
      actor: { type: "system", id: null },
      payload: { ...occurrence, run_id: null, status: "skipped_overlap" },
      redactions: [],
      sequence: 0,
    } as const;

    expect(ScheduleFiredEventSchema.parse(event)).toMatchObject({ event_type: "schedule.fired", run_id: null, scope: { kind: "schedule", id: ID.schedule } });
  });
});
