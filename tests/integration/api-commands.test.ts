import { describe, expect, it } from "vitest";
import type { SqliteDatabase } from "../../packages/persistence/src/index.js";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, TIME } from "../../apps/api/src/routes/test-fixtures.js";

const NEW = {
  goal: "01SRZ3NDEKTSV4RRFFQ69S5FAV",
  ticket: "01TRZ3NDEKTSV4RRFFQ69T5FAV",
  run: "01VRZ3NDEKTSV4RRFFQ69V5FAV",
  attempt: "01WRZ3NDEKTSV4RRFFQ69W5FAV",
  step: "01XRZ3NDEKTSV4RRFFQ69X5FAV",
  job: "01YRZ3NDEKTSV4RRFFQ69Y5FAV",
  createdEvent: "01ZRZ3NDEKTSV4RRFFQ69Z5FAV",
  pausedEvent: "020RZ3NDEKTSV4RRFFQ69Z5FAV",
  resumedEvent: "021RZ3NDEKTSV4RRFFQ69Z5FAV",
  cancelledEvent: "022RZ3NDEKTSV4RRFFQ69Z5FAV",
  artifact: "023RZ3NDEKTSV4RRFFQ69Z5FAV",
  review: "024RZ3NDEKTSV4RRFFQ69Z5FAV",
} as const;

describe("C09 API command integration", () => {
  it("creates and controls a deterministic run through the HTTP API surface", async () => {
    const fixture = createControlFixture([NEW.goal, NEW.ticket, NEW.run, NEW.attempt, NEW.step, NEW.job, NEW.createdEvent, NEW.pausedEvent, NEW.resumedEvent, NEW.cancelledEvent]);

    try {
      const goal = await fixture.api.inject({ method: "POST", url: "/v1/goals", headers: commandHeaders("goal:create"), payload: { schema_version: 1, workspace_id: IDS.workspace, title: "API goal", objective: "Drive C09", definition_of_done: ["run observed"] } });
      const ticket = await fixture.api.inject({ method: "POST", url: "/v1/tickets", headers: commandHeaders("ticket:create"), payload: { schema_version: 1, workspace_id: IDS.workspace, goal_id: NEW.goal, status: "ready", definition_of_done: ["run observed"], assigned_agents: [IDS.agent], approval_policy: { mode: "required" } } });
      const runResponse = await fixture.api.inject({ method: "POST", url: "/v1/runs", headers: commandHeaders("run:create"), payload: { schema_version: 1, workspace_id: IDS.workspace, ticket_id: NEW.ticket, agent_id: IDS.agent } });
      const eventsUrl = `/v1/runs/${NEW.run}/events?workspace_id=${IDS.workspace}`;

      expect(goal.statusCode).toBe(202);
      expect(ticket.statusCode).toBe(202);
      expect(runResponse.statusCode).toBe(202);
      expect(runResponse.json()).toMatchObject({ object_type: "run", object_id: NEW.run, events_url: eventsUrl });
      expect((await fixture.api.inject({ method: "GET", url: eventsUrl, headers: { authorization: ownerHeader(), accept: "text/event-stream" } })).body).toContain("event: run.created");
      expect((await fixture.api.inject({ method: "POST", url: `/v1/runs/${NEW.run}/pause`, headers: commandHeaders("run:pause", "1"), payload: { schema_version: 1, workspace_id: IDS.workspace } })).statusCode).toBe(202);
      expect((await fixture.api.inject({ method: "POST", url: `/v1/runs/${NEW.run}/resume`, headers: commandHeaders("run:resume", "2"), payload: { schema_version: 1, workspace_id: IDS.workspace } })).statusCode).toBe(202);
      expect((await fixture.api.inject({ method: "POST", url: `/v1/runs/${NEW.run}/cancel`, headers: commandHeaders("run:cancel", "3"), payload: { schema_version: 1, workspace_id: IDS.workspace } })).statusCode).toBe(202);
      expect((await fixture.api.inject({ method: "GET", url: `/v1/runs/${NEW.run}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } })).json()).toMatchObject({ run: { id: NEW.run, status: "cancelled" } });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("rejects stale review decisions through the API boundary", async () => {
    const fixture = createControlFixture([NEW.run, NEW.attempt, NEW.step, NEW.job, NEW.createdEvent]);

    try {
      await fixture.api.inject({ method: "POST", url: "/v1/runs", headers: commandHeaders("review-run:create"), payload: { schema_version: 1, workspace_id: IDS.workspace, ticket_id: IDS.ticket, agent_id: IDS.agent } });
      seedArtifactAndReview(fixture.database);
      const response = await fixture.api.inject({ method: "POST", url: `/v1/reviews/${NEW.review}/decision`, headers: commandHeaders("review:stale"), payload: reviewBody(1) });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "REVIEW_STALE", required_action: "reload_review" });
    } finally {
      await closeControlFixture(fixture);
    }
  });
});

function commandHeaders(key: string, version?: string): Record<string, string> {
  return version === undefined
    ? { authorization: ownerHeader(), "idempotency-key": key, traceparent: IDS.owner }
    : { authorization: ownerHeader(), "idempotency-key": key, traceparent: IDS.owner, "if-match": version };
}

function seedArtifactAndReview(database: SqliteDatabase): void {
  const artifact = { id: NEW.artifact, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, type: "draft", status: "verified", source_ticket: IDS.ticket, source_run: NEW.run, version: 1, visibility: "workspace", content_ref: "artifact://c09", evidence_refs: [] };
  database.prepare("INSERT INTO artifacts(id, workspace_id, artifact_version, source_ticket, source_run, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?, 1, ?, ?)").run(NEW.artifact, IDS.workspace, IDS.ticket, NEW.run, artifact.status, JSON.stringify(artifact), TIME, TIME);
  database.prepare("INSERT INTO review_decisions(id, workspace_id, artifact_id, artifact_version, review_version, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, 2, ?, 1, ?, ?)").run(NEW.review, IDS.workspace, NEW.artifact, JSON.stringify(reviewRecord(2)), TIME, TIME);
}

function reviewBody(reviewVersion: number) {
  return { schema_version: 1, workspace_id: IDS.workspace, artifact_id: NEW.artifact, artifact_version: 1, review_version: reviewVersion, requested_scope: { kind: "workspace", id: IDS.workspace }, expires_at: "2026-08-27T04:10:00.000Z", judge_result: "pass", human_decision: "approved", reason: "Reviewed", approved_payload_hash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", risk_level: "R3", policy_decision: { allowed: true, code: null, event_type: null, reason: "Allowed", required_action: "none", redactions: [] } };
}

function reviewRecord(reviewVersion: number) {
  return { id: NEW.review, created_at: TIME, updated_at: TIME, ...reviewBody(reviewVersion), reviewer_id: IDS.owner, reviewer_role: "Reviewer" };
}
