import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DurableQueue, LeaseManager } from "@nexora/orchestration";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, seedAttemptStepAndJob, seedRun, TIME } from "./test-fixtures.js";

const AcceptedCommandSchema = z.object({
  schema_version: z.literal(1),
  command_id: z.string().min(1),
  status: z.literal("accepted"),
  object_type: z.string().min(1),
  object_id: z.string().min(1),
  status_url: z.string().min(1),
  events_url: z.string().nullable(),
  run_id: z.string().optional(),
}).strict();

const ErrorSchema = z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), required_action: z.string() }).passthrough();

describe("Control API run commands", () => {
  it("Given a ticket When a run is created twice with the same idempotency key Then the API returns one accepted command", async () => {
    const fixture = createControlFixture([IDS.run, IDS.attempt, IDS.step, IDS.job, IDS.event0]);

    try {
      const first = await fixture.api.inject({
        method: "POST",
        url: "/v1/runs",
        headers: { authorization: ownerHeader(), "idempotency-key": "run:create:c09", traceparent: IDS.owner },
        payload: { schema_version: 1, workspace_id: IDS.workspace, ticket_id: IDS.ticket, agent_id: IDS.agent },
      });
      const second = await fixture.api.inject({
        method: "POST",
        url: "/v1/runs",
        headers: { authorization: ownerHeader(), "idempotency-key": "run:create:c09", traceparent: IDS.owner },
        payload: { schema_version: 1, workspace_id: IDS.workspace, ticket_id: IDS.ticket, agent_id: IDS.agent },
      });

      expect(first.statusCode).toBe(202);
      expect(second.statusCode).toBe(202);
      const body = AcceptedCommandSchema.parse(first.json());
      expect(AcceptedCommandSchema.parse(second.json())).toEqual(body);
      expect(body).toMatchObject({ object_type: "run", object_id: IDS.run, run_id: IDS.run });
      expect(body.status_url).toBe(`/v1/runs/${IDS.run}?workspace_id=${IDS.workspace}`);
      expect(body.events_url).toBe(`/v1/runs/${IDS.run}/events?workspace_id=${IDS.workspace}`);

      const detail = await fixture.api.inject({ method: "GET", url: body.status_url, headers: { authorization: ownerHeader() } });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ run: { id: IDS.run, status: "queued" }, attempts: [{ id: IDS.attempt }], steps: [{ id: IDS.step }], queue_jobs: [{ id: IDS.job, status: "queued" }] });
      expect(JSON.stringify(detail.json())).not.toContain("idempotency_key");
      expect(JSON.stringify(detail.json())).not.toContain("request_hash");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a reused idempotency key When the request body changes Then the API returns a recoverable conflict", async () => {
    const fixture = createControlFixture([IDS.run, IDS.attempt, IDS.step, IDS.job, IDS.event0]);

    try {
      await fixture.api.inject({ method: "POST", url: "/v1/runs", headers: { authorization: ownerHeader(), "idempotency-key": "run:create:conflict", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, ticket_id: IDS.ticket, agent_id: IDS.agent } });
      const conflict = await fixture.api.inject({ method: "POST", url: "/v1/runs", headers: { authorization: ownerHeader(), "idempotency-key": "run:create:conflict", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, ticket_id: IDS.ticket, agent_id: IDS.agent, execution_location: "remote" } });

      expect(conflict.statusCode).toBe(409);
      expect(ErrorSchema.parse(conflict.json())).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", retryable: false, required_action: "use_new_idempotency_key" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a stale run transition When retried with the same idempotency key Then the failure is not replayed as accepted", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);

    try {
      const headers = { authorization: ownerHeader(), "idempotency-key": "run:pause:stale", "if-match": "9", traceparent: IDS.owner };
      const first = await fixture.api.inject({ method: "POST", url: `/v1/runs/${IDS.run}/pause`, headers, payload: { schema_version: 1, workspace_id: IDS.workspace } });
      const second = await fixture.api.inject({ method: "POST", url: `/v1/runs/${IDS.run}/pause`, headers, payload: { schema_version: 1, workspace_id: IDS.workspace } });

      expect(first.statusCode).toBe(409);
      expect(second.statusCode).toBe(409);
      expect(ErrorSchema.parse(second.json())).toMatchObject({ code: "VERSION_CONFLICT", retryable: true });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a run without failed steps When retry is requested twice Then idempotency does not mask the invalid state", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database, "pending");

    try {
      const headers = { authorization: ownerHeader(), "idempotency-key": "run:retry:no-failed-step", "if-match": "1", traceparent: IDS.owner };
      const first = await fixture.api.inject({ method: "POST", url: `/v1/runs/${IDS.run}/retry`, headers, payload: { schema_version: 1, workspace_id: IDS.workspace } });
      const second = await fixture.api.inject({ method: "POST", url: `/v1/runs/${IDS.run}/retry`, headers, payload: { schema_version: 1, workspace_id: IDS.workspace } });

      expect(first.statusCode).toBe(409);
      expect(second.statusCode).toBe(409);
      expect(ErrorSchema.parse(second.json())).toMatchObject({ code: "INVALID_STATE_TRANSITION", required_action: "select_failed_run" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a forged unsigned bearer token When a command is sent Then the API rejects it", async () => {
    const fixture = createControlFixture([IDS.run, IDS.attempt, IDS.step, IDS.job, IDS.event0]);

    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: "/v1/runs",
        headers: { authorization: `Bearer workspace=${IDS.workspace};actor=${IDS.owner};role=Owner`, "idempotency-key": "run:create:forged", traceparent: IDS.owner },
        payload: { schema_version: 1, workspace_id: IDS.workspace, ticket_id: IDS.ticket, agent_id: IDS.agent },
      });

      expect(response.statusCode).toBe(401);
      expect(ErrorSchema.parse(response.json())).toMatchObject({ code: "AUTH_EXPIRED", required_action: "authenticate" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an oversized idempotency key When a command is sent Then the API rejects it before accepting the command", async () => {
    const fixture = createControlFixture([IDS.run, IDS.attempt, IDS.step, IDS.job, IDS.event0]);

    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: "/v1/runs",
        headers: { authorization: ownerHeader(), "idempotency-key": "x".repeat(129), traceparent: IDS.owner },
        payload: { schema_version: 1, workspace_id: IDS.workspace, ticket_id: IDS.ticket, agent_id: IDS.agent },
      });

      expect(response.statusCode).toBe(400);
      expect(ErrorSchema.parse(response.json())).toMatchObject({ code: "SCHEMA_INVALID", required_action: "correct_idempotency_key" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an invalid run id When querying a run Then the API rejects the path before scoped lookup", async () => {
    const fixture = createControlFixture();

    try {
      const response = await fixture.api.inject({ method: "GET", url: `/v1/runs/not-a-ulid?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(response.statusCode).toBe(400);
      expect(ErrorSchema.parse(response.json())).toMatchObject({ code: "SCHEMA_INVALID", required_action: "correct_request" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given scoped runs When another workspace asks for a run Then the API returns 404 without leaking the owner workspace", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database);

    try {
      const response = await fixture.api.inject({ method: "GET", url: `/v1/runs/${IDS.run}?workspace_id=${IDS.otherWorkspace}`, headers: { authorization: ownerHeader(IDS.otherWorkspace) } });

      expect(response.statusCode).toBe(404);
      expect(JSON.stringify(response.json())).not.toContain(IDS.workspace);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a running run When pause resume and cancel commands are accepted Then state and queue visibility follow the lifecycle", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1, IDS.event2]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);

    try {
      const paused = await fixture.api.inject({ method: "POST", url: `/v1/runs/${IDS.run}/pause`, headers: { authorization: ownerHeader(), "idempotency-key": "run:pause:c09", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace } });
      const claimWhilePaused = new LeaseManager(fixture.database, { now: () => TIME }).claimNext({ workspace_id: IDS.workspace, worker_id: "worker-a", lease_id: IDS.lease, now: TIME });
      const resumed = await fixture.api.inject({ method: "POST", url: `/v1/runs/${IDS.run}/resume`, headers: { authorization: ownerHeader(), "idempotency-key": "run:resume:c09", "if-match": "2", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace } });
      const cancelled = await fixture.api.inject({ method: "POST", url: `/v1/runs/${IDS.run}/cancel`, headers: { authorization: ownerHeader(), "idempotency-key": "run:cancel:c09", "if-match": "3", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace } });

      expect(paused.statusCode).toBe(202);
      expect(claimWhilePaused).toBeUndefined();
      expect(resumed.statusCode).toBe(202);
      expect(cancelled.statusCode).toBe(202);
      expect(new DurableQueue(fixture.database).get(IDS.workspace, IDS.job)?.status).toBe("cancelled");

      const detail = await fixture.api.inject({ method: "GET", url: `/v1/runs/${IDS.run}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(detail.json()["run"]).toMatchObject({ id: IDS.run, status: "cancelled" });
    } finally {
      await closeControlFixture(fixture);
    }
  });
});
