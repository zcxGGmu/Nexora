import { describe, expect, it } from "vitest";
import { ArtifactSchema, ReviewRequestedEventSchema } from "@nexora/contracts";
import type { SqliteDatabase } from "@nexora/persistence";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, seedRun, TIME } from "./test-fixtures.js";

const ARTIFACT_ID = "032RZ3NDEKTSV4RRFFQ69Z5FAV";
const REVIEW_ID = "033RZ3NDEKTSV4RRFFQ69Z5FAV";
const OTHER_REVIEWER_ID = "034RZ3NDEKTSV4RRFFQ69Z5FAV";
const REVIEW_EVENT_ID = "035RZ3NDEKTSV4RRFFQ69Z5FAV";
const DECIDED_EVENT_ID = "036RZ3NDEKTSV4RRFFQ69Z5FAV";
const PAYLOAD_HASH = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("Control API review decisions", () => {
  it("Given an issued review request When the body supplies reviewer fields Then the API rejects caller-owned identity", async () => {
    const fixture = createControlFixture([DECIDED_EVENT_ID]);
    seedRun(fixture.database, "running");
    seedArtifactAndReviewRequest(fixture.database);

    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: `/v1/reviews/${REVIEW_ID}/decision`,
        headers: { authorization: ownerHeader(), "idempotency-key": "review:identity-rejected" },
        payload: reviewBody({ reviewer_id: OTHER_REVIEWER_ID, reviewer_role: "Reviewer" }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "SCHEMA_INVALID", required_action: "correct_request" });
      expect(idempotencyRecord(fixture.database, "review:identity-rejected")).toBeUndefined();
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an issued review request When a decision is accepted Then review queries omit reviewer identity and payload hash", async () => {
    const fixture = createControlFixture([DECIDED_EVENT_ID]);
    seedRun(fixture.database, "running");
    seedArtifactAndReviewRequest(fixture.database);

    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: `/v1/reviews/${REVIEW_ID}/decision`,
        headers: { authorization: ownerHeader(), "idempotency-key": "review:public-query" },
        payload: reviewBody(),
      });
      const stored = await fixture.api.inject({ method: "GET", url: `/v1/reviews/${REVIEW_ID}?workspace_id=${IDS.workspace}&review_version=1`, headers: { authorization: ownerHeader() } });
      const listed = await fixture.api.inject({ method: "GET", url: `/v1/reviews?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(response.statusCode).toBe(202);
      expect(stored.statusCode).toBe(200);
      expect(listed.statusCode).toBe(200);
      expect(stored.json()).toMatchObject({ review: { id: REVIEW_ID, human_decision: "approved" } });
      expect(JSON.stringify(stored.json())).not.toContain("reviewer_id");
      expect(JSON.stringify(stored.json())).not.toContain("reviewer_role");
      expect(JSON.stringify(stored.json())).not.toContain("approved_payload_hash");
      expect(JSON.stringify(listed.json())).not.toContain("reviewer_id");
      expect(JSON.stringify(listed.json())).not.toContain("approved_payload_hash");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an issued review request When a decision is accepted Then the run event stream includes a sanitized review decision", async () => {
    const fixture = createControlFixture([DECIDED_EVENT_ID]);
    seedRun(fixture.database, "running");
    seedArtifactAndReviewRequest(fixture.database);

    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: `/v1/reviews/${REVIEW_ID}/decision`,
        headers: { authorization: ownerHeader(), "idempotency-key": "review:event" },
        payload: reviewBody(),
      });
      const events = await fixture.api.inject({ method: "GET", url: `/v1/runs/${IDS.run}/events?workspace_id=${IDS.workspace}&limit=10`, headers: { authorization: ownerHeader(), accept: "text/event-stream" } });

      expect(response.statusCode).toBe(202);
      expect(events.statusCode).toBe(200);
      expect(events.body).toContain("event: review.decided");
      expect(events.body).toContain(`id: ${DECIDED_EVENT_ID}`);
      expect(events.body).not.toContain("payload_hash");
      expect(events.body).not.toContain('"actor"');
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an expired review decision When submitted Then the API rejects it before reserving idempotency", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database, "running");
    seedArtifactAndReviewRequest(fixture.database);

    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: `/v1/reviews/${REVIEW_ID}/decision`,
        headers: { authorization: ownerHeader(), "idempotency-key": "review:expired" },
        payload: reviewBody({ expires_at: TIME }),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "REVIEW_STALE", required_action: "reload_review" });
      expect(idempotencyRecord(fixture.database, "review:expired")).toBeUndefined();
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an accepted review decision When retried with the same idempotency key Then stale detection does not block replay", async () => {
    const fixture = createControlFixture([DECIDED_EVENT_ID]);
    seedRun(fixture.database, "running");
    seedArtifactAndReviewRequest(fixture.database);
    const payload = reviewBody();
    const headers = { authorization: ownerHeader(), "idempotency-key": "review:replay" };

    try {
      const first = await fixture.api.inject({ method: "POST", url: `/v1/reviews/${REVIEW_ID}/decision`, headers, payload });
      const second = await fixture.api.inject({ method: "POST", url: `/v1/reviews/${REVIEW_ID}/decision`, headers, payload });

      expect(first.statusCode).toBe(202);
      expect(second.statusCode).toBe(202);
      expect(second.json()).toEqual(first.json());
    } finally {
      await closeControlFixture(fixture);
    }
  });
});

function seedArtifactAndReviewRequest(database: SqliteDatabase): void {
  const artifact = ArtifactSchema.parse({ id: ARTIFACT_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, type: "draft", status: "verified", source_ticket: IDS.ticket, source_run: IDS.run, version: 1, visibility: "workspace", content_ref: "artifact://c09-review", evidence_refs: [] });
  database.prepare("INSERT INTO artifacts(id, workspace_id, artifact_version, source_ticket, source_run, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(artifact.id, artifact.workspace_id, artifact.version, artifact.source_ticket, artifact.source_run, artifact.status, JSON.stringify(artifact), artifact.schema_version, artifact.created_at, artifact.updated_at);
  const event = ReviewRequestedEventSchema.parse({
    event_id: REVIEW_EVENT_ID,
    event_type: "review.requested",
    schema_version: 1,
    occurred_at: TIME,
    workspace_id: IDS.workspace,
    scope: { kind: "run", id: IDS.run },
    trace_id: IDS.owner,
    run_id: IDS.run,
    attempt_id: null,
    step_id: null,
    actor: { type: "system", id: IDS.agent },
    payload: { review_id: REVIEW_ID, artifact_id: ARTIFACT_ID, artifact_version: 1, review_version: 1, payload_hash: PAYLOAD_HASH, risk_level: "R3", requested_scope: { kind: "workspace", id: IDS.workspace } },
    redactions: [],
    sequence: 0,
  });
  database.prepare("INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, 0, 'review.requested', ?, ?, ?, ?, ?, ?, ?)").run(event.event_id, event.workspace_id, event.run_id, event.occurred_at, TIME, event.trace_id, event.attempt_id, event.step_id, JSON.stringify(event), event.schema_version);
}

function reviewBody(overrides: { readonly expires_at?: string; readonly reviewer_id?: string; readonly reviewer_role?: "Owner" | "Reviewer" } = {}) {
  return {
    schema_version: 1,
    workspace_id: IDS.workspace,
    artifact_id: ARTIFACT_ID,
    artifact_version: 1,
    review_version: 1,
    requested_scope: { kind: "workspace", id: IDS.workspace },
    expires_at: overrides.expires_at ?? "2026-08-27T04:10:00.000Z",
    judge_result: "pass",
    human_decision: "approved",
    reason: "Reviewed exact preview",
    approved_payload_hash: PAYLOAD_HASH,
    risk_level: "R3",
    policy_decision: { allowed: true, code: null, event_type: null, reason: "Allowed", required_action: "none", redactions: [] },
    ...(overrides.reviewer_id === undefined ? {} : { reviewer_id: overrides.reviewer_id }),
    ...(overrides.reviewer_role === undefined ? {} : { reviewer_role: overrides.reviewer_role }),
  };
}

function idempotencyRecord(database: SqliteDatabase, key: string): unknown {
  return database.prepare("SELECT idempotency_key FROM idempotency_records WHERE workspace_id = ? AND idempotency_key = ?").get(IDS.workspace, key);
}
