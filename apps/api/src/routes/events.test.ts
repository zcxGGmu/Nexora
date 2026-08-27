import { describe, expect, it } from "vitest";
import { EventEnvelopeSchema, ReviewRequestedEventSchema, type EventEnvelope } from "@nexora/contracts";
import { encodeEventCursor, EventStore } from "@nexora/event-store";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, seedAttemptStepAndJob, seedRun, TIME } from "./test-fixtures.js";

describe("Control API run events", () => {
  it("Given historical events When the client reconnects after a cursor Then SSE returns only matching step events", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    const store = new EventStore(fixture.database, { now: () => TIME });
    store.append(event(0, IDS.event0, "run.created", null), -1);
    store.append(event(1, IDS.event1, "step.started", IDS.step), 0);
    store.append(event(2, IDS.event2, "step.completed", IDS.otherStep), 1);

    try {
      const response = await fixture.api.inject({
        method: "GET",
        url: `/v1/runs/${IDS.run}/events?workspace_id=${IDS.workspace}&after=${encodeEventCursor(IDS.run, 0)}&limit=10&step_id=${IDS.step}`,
        headers: { authorization: ownerHeader(), accept: "text/event-stream" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/event-stream");
      expect(response.body).toContain(`id: ${IDS.event1}`);
      expect(response.body).toContain("event: step.started");
      expect(response.body).not.toContain(IDS.event0);
      expect(response.body).not.toContain(IDS.event2);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given Last-Event-ID When the stream reconnects Then catch-up starts after that event id", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    const store = new EventStore(fixture.database, { now: () => TIME });
    store.append(event(0, IDS.event0, "run.created", null), -1);
    store.append(event(1, IDS.event1, "step.started", IDS.step), 0);

    try {
      const response = await fixture.api.inject({ method: "GET", url: `/v1/runs/${IDS.run}/events?workspace_id=${IDS.workspace}&limit=10`, headers: { authorization: ownerHeader(), accept: "text/event-stream", "last-event-id": IDS.event0 } });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(`id: ${IDS.event1}`);
      expect(response.body).not.toContain(`id: ${IDS.event0}`);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a missing run When the client opens an event stream Then the API returns a scoped 404", async () => {
    const fixture = createControlFixture();

    try {
      const response = await fixture.api.inject({
        method: "GET",
        url: `/v1/runs/${IDS.run}/events?workspace_id=${IDS.workspace}&limit=10`,
        headers: { authorization: ownerHeader(), accept: "text/event-stream" },
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.stringify(response.json())).not.toContain(IDS.run);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given the first page contains another step When step events are filtered Then pagination returns the matching later event", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    const store = new EventStore(fixture.database, { now: () => TIME });
    store.append(event(0, IDS.event0, "step.started", IDS.otherStep), -1);
    store.append(event(1, IDS.event1, "step.completed", IDS.step), 0);

    try {
      const response = await fixture.api.inject({
        method: "GET",
        url: `/v1/runs/${IDS.run}/events?workspace_id=${IDS.workspace}&limit=1&step_id=${IDS.step}`,
        headers: { authorization: ownerHeader(), accept: "text/event-stream" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(`id: ${IDS.event1}`);
      expect(response.body).not.toContain(`id: ${IDS.event0}`);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a review request event When streamed Then SSE returns a sanitized event payload", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database, "running");
    const reviewEvent = ReviewRequestedEventSchema.parse({
      event_id: IDS.event0,
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
      payload: { review_id: IDS.event1, artifact_id: IDS.event2, artifact_version: 1, review_version: 1, payload_hash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", risk_level: "R3", requested_scope: { kind: "workspace", id: IDS.workspace } },
      redactions: [],
      sequence: 0,
    });
    fixture.database.prepare("INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, 0, 'review.requested', ?, ?, ?, ?, ?, ?, ?)").run(reviewEvent.event_id, reviewEvent.workspace_id, reviewEvent.run_id, reviewEvent.occurred_at, TIME, reviewEvent.trace_id, reviewEvent.attempt_id, reviewEvent.step_id, JSON.stringify(reviewEvent), reviewEvent.schema_version);

    try {
      const response = await fixture.api.inject({ method: "GET", url: `/v1/runs/${IDS.run}/events?workspace_id=${IDS.workspace}&limit=10`, headers: { authorization: ownerHeader(), accept: "text/event-stream" } });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("event: review.requested");
      expect(response.body).not.toContain("payload_hash");
      expect(response.body).not.toContain('"actor"');
    } finally {
      await closeControlFixture(fixture);
    }
  });
});

function event(sequence: number, eventId: string, eventType: "run.created" | "step.started" | "step.completed", stepId: string | null): EventEnvelope {
  return EventEnvelopeSchema.parse({
    event_id: eventId,
    event_type: eventType,
    schema_version: 1,
    occurred_at: TIME,
    workspace_id: IDS.workspace,
    scope: { kind: "run", id: IDS.run },
    trace_id: IDS.owner,
    run_id: IDS.run,
    attempt_id: stepId === null ? null : IDS.attempt,
    step_id: stepId,
    actor: { type: "system", id: IDS.owner },
    payload: {},
    redactions: [],
    sequence,
  });
}
