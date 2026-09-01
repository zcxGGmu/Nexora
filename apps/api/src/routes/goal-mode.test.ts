import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GoalLoopCommandSchema, GoalLoopDescriptorSchema } from "@nexora/contracts";
import { createLocalBearerToken } from "../plugins/auth.js";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, seedAttemptStepAndJob, seedRun, TIME, TOKEN_SECRET } from "./test-fixtures.js";
import { GoalLoopRepository } from "@nexora/persistence";
import type { SqliteDatabase } from "@nexora/persistence";

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
const GoalLoopDetailResponseSchema = z.object({ schema_version: z.literal(1), commands: z.array(GoalLoopCommandSchema) }).passthrough();

describe("C20 Goal Mode API", () => {
  it("Given a run and session When a goal loop is created Then the API accepts a descriptor-only loop with idempotent replay", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const payload = {
        schema_version: 1,
        workspace_id: IDS.workspace,
        goal_id: IDS.goal,
        run_id: IDS.run,
        session_id: IDS.attempt,
        objective: "Continue this goal until the judge reports done.",
        definition_of_done: ["Judge JSON has done true."],
        max_turns: 4,
        budget: { max_tokens: 20_000, max_cost_usd: 2 },
        deadline_at: "2026-09-01T05:00:00.000Z",
      };
      const first = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:c20", traceparent: IDS.owner }, payload });
      const replay = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:c20", traceparent: IDS.owner }, payload });

      expect(first.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      const accepted = AcceptedCommandSchema.parse(first.json());
      expect(AcceptedCommandSchema.parse(replay.json())).toEqual(accepted);
      expect(accepted).toMatchObject({ object_type: "goal_loop", status_url: `/v1/goal-loops/${accepted.object_id}?workspace_id=${IDS.workspace}`, events_url: null });

      const detail = await fixture.api.inject({ method: "GET", url: accepted.status_url, headers: { authorization: ownerHeader() } });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ goal_loop: { descriptor_only: true, run_id: IDS.run, session_id: IDS.attempt, status: "running", max_turns: 4 } });
      expect(JSON.stringify(detail.json())).not.toContain("secret://");
      expect(JSON.stringify(detail.json())).not.toContain("provider_token");
      expect(JSON.stringify(detail.json())).not.toContain("Bearer ");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a lost create response When the same idempotency key is replayed after session closes Then the original acceptance is returned", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const payload = createGoalLoopPayload();
      const first = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:lost-response", traceparent: IDS.owner }, payload });
      fixture.database.prepare("UPDATE sessions SET status = 'closed' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.attempt);
      const replay = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:lost-response", traceparent: IDS.owner }, payload });

      expect(first.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(replay.json())).toEqual(AcceptedCommandSchema.parse(first.json()));
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given unknown fields When creating a goal loop Then the API rejects the request before persistence", async () => {
    const fixture = createControlFixture();
    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: "/v1/goal-loops",
        headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:unknown", traceparent: IDS.owner },
        payload: { schema_version: 1, workspace_id: IDS.workspace, goal_id: IDS.goal, run_id: IDS.run, session_id: IDS.attempt, objective: "Do work", definition_of_done: ["done"], max_turns: 2, budget: { max_tokens: 1_000, max_cost_usd: 1 }, deadline_at: "2026-09-01T05:00:00.000Z", provider_token: "secret://provider/live" },
      });

      expect(response.statusCode).toBe(400);
      expect(ErrorSchema.parse(response.json())).toMatchObject({ code: "SCHEMA_INVALID", required_action: "correct_request" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given secret-shaped goal mode text When submitted Then the API rejects it without echoing the secret", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const createSecret = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:secret-text", traceparent: IDS.owner }, payload: { ...createGoalLoopPayload(), objective: "Continue with Bearer live-token-123" } });
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:secret-boundary", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      markLoopWaitingJudge(fixture.database, loopId);
      const judgeSecret = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/judge`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:judge:secret-text", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, done: false, reason: "secret://providers/live-token" } });
      const steerSecret = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/steer`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:steer:secret-text", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, instruction: "Use Bearer live-token-123" } });

      expect(createSecret.statusCode).toBe(400);
      expect(judgeSecret.statusCode).toBe(400);
      expect(steerSecret.statusCode).toBe(400);
      expect(JSON.stringify([createSecret.json(), judgeSecret.json(), steerSecret.json()])).not.toContain("live-token-123");
      expect(JSON.stringify([createSecret.json(), judgeSecret.json(), steerSecret.json()])).not.toContain("secret://");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given broader secret-shaped goal mode text When submitted Then the API rejects it before detail exposure", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const payload = {
        ...createGoalLoopPayload(),
        objective: "Continue with token=abcd1234",
        definition_of_done: ["Do not leak xoxb-123-456-secret"],
      };
      const response = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:broad-secret-text", traceparent: IDS.owner }, payload });
      const responseText = JSON.stringify(response.json());

      expect(response.statusCode).toBe(400);
      expect(ErrorSchema.parse(response.json())).toMatchObject({ code: "SCHEMA_INVALID", required_action: "correct_request" });
      expect(responseText).not.toContain("abcd1234");
      expect(responseText).not.toContain("xoxb-123-456-secret");
      expect(new GoalLoopRepository(fixture.database).list(IDS.workspace)).toEqual([]);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given invalid run or session state When creating a goal loop Then the API rejects live loop registration", async () => {
    const failedRun = createControlFixture();
    seedRun(failedRun.database, "failed");
    seedAttemptStepAndJob(failedRun.database, "failed");
    seedSession(failedRun.database);
    try {
      const response = await failedRun.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:failed-run", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      expect(response.statusCode).toBe(409);
      expect(ErrorSchema.parse(response.json())).toMatchObject({ code: "INVALID_STATE_TRANSITION", required_action: "select_active_run_session" });
    } finally {
      await closeControlFixture(failedRun);
    }

    const closedSession = createControlFixture();
    seedRun(closedSession.database, "running");
    seedAttemptStepAndJob(closedSession.database);
    seedSession(closedSession.database, "closed");
    try {
      const response = await closedSession.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:closed-session", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      expect(response.statusCode).toBe(409);
      expect(ErrorSchema.parse(response.json())).toMatchObject({ code: "INVALID_STATE_TRANSITION", required_action: "select_active_run_session" });
    } finally {
      await closeControlFixture(closedSession);
    }
  });

  it("Given exhausted budget or expired deadline When creating or resuming a goal loop Then the API rejects forward progress", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const exhausted = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:exhausted", traceparent: IDS.owner }, payload: { ...createGoalLoopPayload(), budget: { max_tokens: 0, max_cost_usd: 0 } } });
      const expired = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:expired", traceparent: IDS.owner }, payload: { ...createGoalLoopPayload(), deadline_at: "2026-08-26T05:00:00.000Z" } });
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:resume-limit", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      forcePausedExhaustedLoop(fixture.database, loopId);
      const resume = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/resume`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:resume:exhausted", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, cursor: "turn-4" } });

      expect(exhausted.statusCode).toBe(409);
      expect(expired.statusCode).toBe(409);
      expect(resume.statusCode).toBe(409);
      expect(ErrorSchema.parse(resume.json())).toMatchObject({ code: "GOAL_LOOP_LIMIT_EXCEEDED", required_action: "refresh_state" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a loop in another workspace When an owner resumes it Then existing and missing IDs are denied the same way", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:scope", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      const existing = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/resume`, headers: { authorization: ownerHeader(IDS.otherWorkspace), "idempotency-key": "goal:resume:foreign-existing", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, cursor: "turn-1" } });
      const missing = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${IDS.otherStep}/resume`, headers: { authorization: ownerHeader(IDS.otherWorkspace), "idempotency-key": "goal:resume:foreign-missing", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, cursor: "turn-1" } });

      expect(existing.statusCode).toBe(403);
      expect(missing.statusCode).toBe(403);
      expect(ErrorSchema.parse(existing.json())).toMatchObject(ErrorSchema.parse(missing.json()));
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given pause resume subgoal and judge commands When accepted Then If-Match and idempotency preserve descriptor-only semantics", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1, IDS.event2, IDS.otherStep, IDS.lease, "01SRZ3NDEKTSV4RRFFQ69S5FAV", "01TRZ3NDEKTSV4RRFFQ69T5FAV"]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:commands", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      const pause = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/pause`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:pause:c20", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace } });
      const resume = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/resume`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:resume:c20", "if-match": "2", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace } });
      const subgoal = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/subgoals`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:subgoal:c20", "if-match": "3", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, objective: "Investigate verifier failure", max_turns: 2, deadline_at: "2026-09-01T04:30:00.000Z" } });
      markLoopWaitingJudge(fixture.database, loopId);
      const judgeNeedsAnotherTurn = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/judge`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:judge:continue", "if-match": "4", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, done: false, reason: "Need another verified loop turn." } });

      expect(pause.statusCode).toBe(202);
      expect(resume.statusCode).toBe(202);
      expect(subgoal.statusCode).toBe(202);
      expect(judgeNeedsAnotherTurn.statusCode).toBe(202);
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/goal-loops/${loopId}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(detail.json()).toMatchObject({ goal_loop: { status: "running", turn_count: 1, continuation_cursor: "turn-1", judge: { done: false, reason: "Need another verified loop turn." } } });
      expect(detail.json()).toMatchObject({ continuations: [expect.objectContaining({ turn: 1, previous_cursor: null, cursor: "turn-1", descriptor_only: true })] });
      expect(GoalLoopDetailResponseSchema.parse(detail.json()).commands.map((record) => record.kind)).toEqual(["pause", "resume", "subgoal", "judge"]);
      expect(JSON.stringify(detail.json())).not.toContain("external_message_sent");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given terminal judge authority When actors submit decisions Then Reviewer decides and Operator is denied", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:judge-rbac", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      markLoopWaitingJudge(fixture.database, loopId);
      const operator = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/judge`, headers: { authorization: roleHeader("Operator"), "idempotency-key": "goal:judge:operator", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, done: true, reason: "All acceptance checks passed." } });
      const reviewer = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/judge`, headers: { authorization: roleHeader("Reviewer"), "idempotency-key": "goal:judge:reviewer", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, done: true, reason: "All acceptance checks passed." } });

      expect(operator.statusCode).toBe(403);
      expect(ErrorSchema.parse(operator.json())).toMatchObject({ code: "SCOPE_DENIED" });
      expect(reviewer.statusCode).toBe(202);
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/goal-loops/${loopId}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(detail.json()).toMatchObject({ goal_loop: { status: "succeeded", judge: { done: true } } });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a steer command When accepted Then the API exposes the instruction as an append-only command fact", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:steer-audit", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      const steer = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/steer`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:steer:audit", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, instruction: "Continue from the last verified checkpoint." } });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/goal-loops/${loopId}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(steer.statusCode).toBe(202);
      expect(GoalLoopDetailResponseSchema.parse(detail.json()).commands).toEqual([expect.objectContaining({ kind: "steer", instruction: "Continue from the last verified checkpoint.", descriptor_only: true })]);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a stale If-Match When a goal loop command is submitted Then the API returns a version conflict without changing state", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:stale", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      const stale = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/pause`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:pause:stale", "if-match": "9", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace } });

      expect(stale.statusCode).toBe(409);
      expect(ErrorSchema.parse(stale.json())).toMatchObject({ code: "VERSION_CONFLICT", retryable: true });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/goal-loops/${loopId}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(detail.json()).toMatchObject({ goal_loop: { status: "running" }, version: 1 });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a running goal loop When judge tries to complete it before the judge gate Then the API rejects the transition", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:judge-pre-gate", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      const judge = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/judge`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:judge:pre-gate", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, done: true, reason: "All acceptance checks passed." } });

      expect(judge.statusCode).toBe(409);
      expect(ErrorSchema.parse(judge.json())).toMatchObject({ code: "INVALID_STATE_TRANSITION", required_action: "refresh_state" });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/goal-loops/${loopId}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(detail.json()).toMatchObject({ goal_loop: { status: "running", judge: null }, version: 1 });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given the auxiliary judge returns done true When recorded Then the API stores literal Judge JSON and completes the loop", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:done", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      markLoopWaitingJudge(fixture.database, loopId);
      const judge = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/judge`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:judge:done", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, done: true, reason: "All acceptance checks passed." } });

      expect(judge.statusCode).toBe(202);
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/goal-loops/${loopId}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(detail.json()).toMatchObject({ goal_loop: { status: "succeeded", judge: { done: true, reason: "All acceptance checks passed." } } });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a completed goal loop When steer is submitted Then the API rejects terminal resurrection", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1, IDS.event2]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:steer-terminal", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      markLoopWaitingJudge(fixture.database, loopId);
      const judge = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/judge`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:judge:steer-terminal", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, done: true, reason: "All acceptance checks passed." } });
      const steer = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/steer`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:steer:terminal", "if-match": "2", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, instruction: "Continue anyway." } });

      expect(judge.statusCode).toBe(202);
      expect(steer.statusCode).toBe(409);
      expect(ErrorSchema.parse(steer.json())).toMatchObject({ code: "INVALID_STATE_TRANSITION", required_action: "refresh_state" });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/goal-loops/${loopId}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(detail.json()).toMatchObject({ goal_loop: { status: "succeeded", judge: { done: true } }, version: 2 });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a completed goal loop When subgoal is submitted Then the API rejects terminal continuation", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1, IDS.event2, "01SRZ3NDEKTSV4RRFFQ69S5FAV"]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:subgoal-terminal", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      markLoopWaitingJudge(fixture.database, loopId);
      const judge = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/judge`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:judge:subgoal-terminal", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, done: true, reason: "All acceptance checks passed." } });
      const subgoal = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/subgoals`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:subgoal:terminal", "if-match": "2", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, objective: "Keep working after completion.", max_turns: 2, deadline_at: "2026-09-01T04:30:00.000Z" } });

      expect(judge.statusCode).toBe(202);
      expect(subgoal.statusCode).toBe(409);
      expect(ErrorSchema.parse(subgoal.json())).toMatchObject({ code: "INVALID_STATE_TRANSITION", required_action: "refresh_state" });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/goal-loops/${loopId}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(detail.json()).toMatchObject({ goal_loop: { status: "succeeded", judge: { done: true } }, version: 2 });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a paused loop with a current checkpoint When resume uses a different cursor Then the API rejects cursor mutation", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:resume-cursor", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      fixture.database.prepare("UPDATE goal_loops SET continuation_cursor = ?, payload_json = json_set(payload_json, '$.continuation_cursor', ?) WHERE workspace_id = ? AND id = ?").run("turn-10", "turn-10", IDS.workspace, loopId);
      const pause = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/pause`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:pause:resume-cursor", "if-match": "1", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace } });
      const rewound = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/resume`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:resume:rewind-cursor", "if-match": "2", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, cursor: "turn-1" } });

      expect(pause.statusCode).toBe(202);
      expect(rewound.statusCode).toBe(409);
      expect(ErrorSchema.parse(rewound.json())).toMatchObject({ code: "VERSION_CONFLICT", required_action: "refresh_state" });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/goal-loops/${loopId}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(detail.json()).toMatchObject({ goal_loop: { status: "paused", continuation_cursor: "turn-10" }, version: 2 });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a subgoal command was accepted before parent completion When replayed after terminal parent Then idempotency returns the original acceptance", async () => {
    const fixture = createControlFixture([IDS.event0, IDS.event1, IDS.event2, "01SRZ3NDEKTSV4RRFFQ69S5FAV"]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);

    try {
      const payload = { schema_version: 1, workspace_id: IDS.workspace, objective: "Investigate verifier failure", max_turns: 2, deadline_at: "2026-09-01T04:30:00.000Z" };
      const create = await fixture.api.inject({ method: "POST", url: "/v1/goal-loops", headers: { authorization: ownerHeader(), "idempotency-key": "goal:create:subgoal-replay", traceparent: IDS.owner }, payload: createGoalLoopPayload() });
      const loopId = AcceptedCommandSchema.parse(create.json()).object_id;
      const first = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/subgoals`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:subgoal:replay-after-terminal", "if-match": "1", traceparent: IDS.owner }, payload });
      markLoopWaitingJudge(fixture.database, loopId);
      const judge = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/judge`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:judge:subgoal-replay-parent", "if-match": "2", traceparent: IDS.owner }, payload: { schema_version: 1, workspace_id: IDS.workspace, done: true, reason: "Parent loop done." } });
      const replay = await fixture.api.inject({ method: "POST", url: `/v1/goal-loops/${loopId}/subgoals`, headers: { authorization: ownerHeader(), "idempotency-key": "goal:subgoal:replay-after-terminal", "if-match": "1", traceparent: IDS.owner }, payload });

      expect(first.statusCode).toBe(202);
      expect(judge.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(replay.json())).toEqual(AcceptedCommandSchema.parse(first.json()));
    } finally {
      await closeControlFixture(fixture);
    }
  });
});

function seedSession(database: SqliteDatabase, status: "active" | "paused" | "closed" | "error" = "active"): void {
  database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES ('gateway-c20', ?, 'Gateway C20', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME, TIME);
  database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES ('channel-c20', ?, 'gateway-c20', 'Channel C20', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'gateway-c20', 'channel-c20', ?, ?, NULL, 'background', ?, 'turn-1', NULL, ?, '{}', 1, ?, ?)").run(IDS.attempt, IDS.workspace, IDS.agent, IDS.run, status, TIME, TIME, TIME);
}

function createGoalLoopPayload(): object {
  return { schema_version: 1, workspace_id: IDS.workspace, goal_id: IDS.goal, run_id: IDS.run, session_id: IDS.attempt, objective: "Continue this goal until the judge reports done.", definition_of_done: ["Judge JSON has done true."], max_turns: 4, budget: { max_tokens: 20_000, max_cost_usd: 2 }, deadline_at: "2026-09-01T05:00:00.000Z" };
}

function markLoopWaitingJudge(database: SqliteDatabase, loopId: string): void {
  database.prepare("UPDATE goal_loops SET status = 'waiting_judge', updated_at = ?, payload_json = json_set(payload_json, '$.status', 'waiting_judge', '$.updated_at', ?) WHERE workspace_id = ? AND id = ?").run(TIME, TIME, IDS.workspace, loopId);
}

function forcePausedExhaustedLoop(database: SqliteDatabase, loopId: string): void {
  const existing = new GoalLoopRepository(database).get(IDS.workspace, loopId);
  if (existing === undefined) throw new Error("expected persisted goal loop");
  const exhausted = GoalLoopDescriptorSchema.parse({ ...existing, status: "paused", max_turns: 4, turn_count: 4, budget: { max_tokens: 0, max_cost_usd: 0 }, deadline_at: "2026-08-31T05:00:00.000Z", continuation_cursor: "turn-4", updated_at: TIME });
  database.prepare("UPDATE goal_loops SET status = ?, max_turns = ?, turn_count = ?, budget_json = ?, deadline_at = ?, continuation_cursor = ?, payload_json = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(exhausted.status, exhausted.max_turns, exhausted.turn_count, JSON.stringify(exhausted.budget), exhausted.deadline_at, exhausted.continuation_cursor, JSON.stringify(exhausted), exhausted.updated_at, IDS.workspace, loopId);
}

function roleHeader(role: "Owner" | "Operator" | "Reviewer" | "Viewer"): string {
  return createLocalBearerToken({ workspace_id: IDS.workspace, actor_id: IDS.owner, role, tokenSecret: TOKEN_SECRET });
}
