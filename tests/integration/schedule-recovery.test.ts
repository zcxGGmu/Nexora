import { describe, expect, it } from "vitest";
import { AttemptManager, DurableQueue, LeaseManager } from "../../packages/orchestration/src/index.js";
import { SchedulerLoop } from "../../apps/worker/src/scheduler-loop.js";
import { WorkerLoop, type RetryAttemptFactory } from "../../apps/worker/src/worker-loop.js";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, TIME } from "../../apps/api/src/routes/test-fixtures.js";

const NEW = {
  schedule: "01SRZ3NDEKTSV4RRFFQ69S5FAV",
  occurrence: "01TRZ3NDEKTSV4RRFFQ69T5FAV",
  event: "01VRZ3NDEKTSV4RRFFQ69V5FAV",
  run: "01WRZ3NDEKTSV4RRFFQ69W5FAV",
  attempt: "01XRZ3NDEKTSV4RRFFQ69X5FAV",
  step: "01YRZ3NDEKTSV4RRFFQ69Y5FAV",
  job: "01ZRZ3NDEKTSV4RRFFQ69Z5FAV",
} as const;
const FOLLOW_UP = {
  occurrence: "020RZ3NDEKTSV4RRFFQ69A5FAV",
  event: "021RZ3NDEKTSV4RRFFQ69B5FAV",
  run: "022RZ3NDEKTSV4RRFFQ69C5FAV",
  attempt: "023RZ3NDEKTSV4RRFFQ69D5FAV",
  step: "024RZ3NDEKTSV4RRFFQ69E5FAV",
  job: "025RZ3NDEKTSV4RRFFQ69F5FAV",
  lease: "026RZ3NDEKTSV4RRFFQ69G5FAV",
  retryAttempt: "027RZ3NDEKTSV4RRFFQ69H5FAV",
  retryStep: "028RZ3NDEKTSV4RRFFQ69J5FAV",
} as const;
const NEXT_FIRE = "2026-08-27T04:01:00.000Z";

describe("C14 schedule recovery integration", () => {
  it("Given a due schedule from the API When scheduler restarts Then exactly one occurrence Run and queue job are created", async () => {
    const fixture = createControlFixture([NEW.schedule]);
    const nextId = idFactory([NEW.occurrence, NEW.event, NEW.run, NEW.attempt, NEW.step, NEW.job]);
    const headers = { authorization: ownerHeader(), "idempotency-key": "schedule:create", traceparent: IDS.owner };

    try {
      const created = await fixture.api.inject({ method: "POST", url: "/v1/schedules", headers, payload: scheduleBody() });
      const firstLoop = new SchedulerLoop({ database: fixture.database, workspace_id: IDS.workspace, clock: { now: () => TIME }, idFactory: nextId });
      const secondLoop = new SchedulerLoop({ database: fixture.database, workspace_id: IDS.workspace, clock: { now: () => TIME }, idFactory: nextId });

      const first = firstLoop.runOnce(TIME);
      const second = secondLoop.runOnce(TIME);
      const schedules = await fixture.api.inject({ method: "GET", url: `/v1/schedules?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      const occurrences = await fixture.api.inject({ method: "GET", url: `/v1/schedules/${NEW.schedule}/occurrences?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(created.statusCode).toBe(202);
      expect(first).toMatchObject({ kind: "fired", fired: 1 });
      expect(second).toEqual({ kind: "idle" });
      expect(schedules.json()).toMatchObject({ schedules: [{ id: NEW.schedule, next_fire_at: NEXT_FIRE, last_fire_at: TIME }] });
      expect(occurrences.json()).toMatchObject({ occurrences: [{ id: NEW.occurrence, schedule_id: NEW.schedule, run_id: NEW.run, status: "enqueued", dedupe_key: `${NEW.schedule}:${TIME}:r1` }] });
      expect(new DurableQueue(fixture.database, { now: () => TIME }).get(IDS.workspace, NEW.job)?.payload).toMatchObject({ kind: "deterministic", schedule_id: NEW.schedule, occurrence_id: NEW.occurrence });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM events WHERE workspace_id = ? AND event_type = 'schedule.fired'").get(IDS.workspace)?.["count"]).toBe(1);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an invalid cron expression When creating a schedule Then the API rejects it before persistence", async () => {
    const fixture = createControlFixture([NEW.schedule]);
    const headers = { authorization: ownerHeader(), "idempotency-key": "schedule:invalid-cron", traceparent: IDS.owner };

    try {
      const response = await fixture.api.inject({ method: "POST", url: "/v1/schedules", headers, payload: { ...scheduleBody(), trigger: { kind: "cron", expression: "not a cron expression" } } });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "SCHEMA_INVALID", required_action: "correct_request" });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM schedules WHERE workspace_id = ?").get(IDS.workspace)?.["count"]).toBe(0);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a scheduled Run completes through the worker When the next skip_if_active fire is due Then it enqueues a new Run", async () => {
    const fixture = createControlFixture([NEW.schedule]);
    const nextId = idFactory([NEW.occurrence, NEW.event, NEW.run, NEW.attempt, NEW.step, NEW.job, FOLLOW_UP.occurrence, FOLLOW_UP.event, FOLLOW_UP.run, FOLLOW_UP.attempt, FOLLOW_UP.step, FOLLOW_UP.job]);
    const headers = { authorization: ownerHeader(), "idempotency-key": "schedule:worker-completion", traceparent: IDS.owner };

    try {
      await fixture.api.inject({ method: "POST", url: "/v1/schedules", headers, payload: scheduleBody() });
      const scheduler = new SchedulerLoop({ database: fixture.database, workspace_id: IDS.workspace, clock: { now: () => TIME }, idFactory: nextId });
      expect(scheduler.runOnce(TIME)).toMatchObject({ kind: "fired", fired: 1 });

      const queue = new DurableQueue(fixture.database, { now: () => TIME });
      const worker = new WorkerLoop({ queue, leases: new LeaseManager(fixture.database, { now: () => TIME }), workspace_id: IDS.workspace, worker_id: "worker-c14", lease_id_factory: () => FOLLOW_UP.lease, handler: async () => ({ kind: "succeeded" }), clock: { now: () => TIME }, heartbeat_ms: 100, attempt_manager: new AttemptManager(fixture.database), retry_attempt_factory: retryAttemptFactory() });
      await expect(worker.runOnce(TIME)).resolves.toMatchObject({ kind: "succeeded", job_id: NEW.job });

      const followUp = scheduler.runOnce(NEXT_FIRE);
      const occurrences = await fixture.api.inject({ method: "GET", url: `/v1/schedules/${NEW.schedule}/occurrences?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(followUp).toMatchObject({ kind: "fired", fired: 1 });
      if (followUp.kind !== "fired") throw new Error("Expected follow-up scheduler fire");
      expect(followUp.results[0]).toMatchObject({ kind: "enqueued", run_id: FOLLOW_UP.run });
      expect(occurrences.json()).toMatchObject({ occurrences: [{ id: NEW.occurrence, run_id: NEW.run, status: "enqueued" }, { id: FOLLOW_UP.occurrence, run_id: FOLLOW_UP.run, status: "enqueued" }] });
      expect(fixture.database.prepare("SELECT status FROM runs WHERE workspace_id = ? AND id = ?").get(IDS.workspace, NEW.run)?.["status"]).toBe("succeeded");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a missing schedule When listing occurrences Then the API returns the same not found response as schedule detail", async () => {
    const fixture = createControlFixture();

    try {
      const response = await fixture.api.inject({ method: "GET", url: `/v1/schedules/${NEW.schedule}/occurrences?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "SCOPE_DENIED", required_action: "check_scope" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an unauthorized workspace token When creating a schedule Then scope policy rejects the command", async () => {
    const fixture = createControlFixture([NEW.schedule]);
    const headers = { authorization: ownerHeader(IDS.otherWorkspace), "idempotency-key": "schedule:scope-denied", traceparent: IDS.owner };

    try {
      const response = await fixture.api.inject({ method: "POST", url: "/v1/schedules", headers, payload: scheduleBody() });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "SCOPE_DENIED", required_action: "request_authorized_scope" });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM schedules WHERE workspace_id = ?").get(IDS.workspace)?.["count"]).toBe(0);
    } finally {
      await closeControlFixture(fixture);
    }
  });
});

function scheduleBody() {
  return {
    schema_version: 1,
    workspace_id: IDS.workspace,
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
    run_template: { ticket_id: IDS.ticket, agent_id: IDS.agent, execution_location: "local" },
  };
}

function retryAttemptFactory(): RetryAttemptFactory {
  return () => ({
    attempt: { id: FOLLOW_UP.retryAttempt, workspace_id: IDS.workspace, schema_version: 1 as const, created_at: TIME, updated_at: TIME, run_id: NEW.run, status: "queued" as const, execution_location: "local" as const },
    step: { id: FOLLOW_UP.retryStep, workspace_id: IDS.workspace, schema_version: 1 as const, created_at: TIME, updated_at: TIME, run_id: NEW.run, attempt_id: FOLLOW_UP.retryAttempt, agent_id: IDS.agent, status: "pending" as const, inputs: ["input://schedule"], outputs: ["output://schedule"], retry_policy: { max_attempts: 3, backoff_ms: 100 }, requires_review: false },
  });
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
