import { describe, expect, it } from "vitest";
import {
  EVENT_TYPES,
  EventEnvelopeSchema,
  RUNTIME_MESSAGE_TYPES,
  RuntimeEnvelopeSchema,
  createEventEnvelopeSchema,
  createRuntimeEnvelopeSchema,
  z,
} from "./index.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-26T04:00:00.000Z";
const event = {
  event_id: ID, event_type: "run.queued", schema_version: 1, occurred_at: TIME,
  workspace_id: ID, scope: { kind: "workspace", id: ID }, trace_id: ID,
  run_id: ID, attempt_id: null, step_id: null,
  actor: { type: "system", id: null }, payload: {}, redactions: [], sequence: 0,
};
const runtime = {
  schema_version: 1, protocol_version: 1, message_id: ID, message_type: "hello",
  run_id: ID, attempt_id: null, step_id: null, trace_id: ID, sequence: 0, cursor: null,
  deadline_at: TIME, lease_id: ID, fencing_token: 0, payload: {},
};

describe("event envelope", () => {
  it("accepts a valid strict event envelope", () => {
    // Given / When / Then
    expect(EventEnvelopeSchema.parse(event)).toEqual(event);
    expect(EVENT_TYPES).toEqual(expect.arrayContaining([
      "run.created", "step.started", "tool.called", "artifact.created",
      "judge.completed", "review.decided", "run.paused", "run.resumed",
      "run.failed", "run.completed", "scope.denied", "policy.denied", "secret.redacted",
    ]));
  });

  it.each([
    { ...event, sequence: -1 },
    { ...event, event_id: "event_123" },
    { ...event, actor: { type: "system", id: null, secret: true } },
    { ...event, payload: { unknown: { nested: undefined } } },
    { ...event, extra: true },
  ])("rejects invalid envelope structure %#", (candidate) => {
    // Given / When / Then
    expect(EventEnvelopeSchema.safeParse(candidate).success).toBe(false);
  });

  it("enforces a strict typed event payload", () => {
    // Given
    const schema = createEventEnvelopeSchema(z.object({ reason: z.string() }).strict());

    // When / Then
    expect(schema.safeParse({ ...event, payload: { reason: "queued", extra: true } }).success).toBe(false);
  });

  it("does not strip unknown fields from a non-strict payload factory input", () => {
    const schema = createEventEnvelopeSchema(z.object({ reason: z.string() }));
    expect(schema.safeParse({ ...event, payload: { reason: "queued", secret: "value" } }).success).toBe(false);
  });
});

describe("runtime envelope", () => {
  it.each(RUNTIME_MESSAGE_TYPES)("accepts runtime discriminator %s", (messageType) => {
    // Given / When
    const parsed = RuntimeEnvelopeSchema.safeParse({ ...runtime, message_type: messageType });

    // Then
    expect(parsed.success).toBe(true);
  });

  it.each([0, 2])("rejects schema version %s independently", (schemaVersion) => {
    // Given / When / Then
    expect(RuntimeEnvelopeSchema.safeParse({ ...runtime, schema_version: schemaVersion }).success).toBe(false);
  });

  it.each([0, 2])("rejects protocol version %s independently", (protocolVersion) => {
    // Given / When / Then
    expect(RuntimeEnvelopeSchema.safeParse({ ...runtime, protocol_version: protocolVersion }).success).toBe(false);
  });

  it("rejects invalid runtime fields and strict typed payloads", () => {
    // Given
    const schema = createRuntimeEnvelopeSchema(z.object({ runtime: z.string() }).strict());

    // When / Then
    expect(schema.safeParse({ ...runtime, fencing_token: -1 }).success).toBe(false);
    expect(schema.safeParse({ ...runtime, payload: { runtime: "local", extra: true } }).success).toBe(false);
    expect(schema.safeParse({ ...runtime, extra: true }).success).toBe(false);
  });
});
