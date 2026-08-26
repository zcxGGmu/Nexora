import { describe, expect, it } from "vitest";
import { MessageIdSchema, RunIdSchema, AttemptIdSchema, StepIdSchema, TraceIdSchema, LeaseIdSchema } from "@nexora/contracts";
import { RuntimeAdapterError, decodeRuntimeEnvelope, encodeRuntimeEnvelope } from "./index.js";
import type { RuntimeMessage } from "./index.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-26T04:00:00.000Z";
const validMessage: RuntimeMessage = {
  schema_version: 1,
  protocol_version: 1,
  message_id: MessageIdSchema.parse(ID),
  message_type: "event",
  run_id: RunIdSchema.parse(ID),
  attempt_id: AttemptIdSchema.parse(ID),
  step_id: StepIdSchema.parse(ID),
  trace_id: TraceIdSchema.parse(ID),
  sequence: 2,
  cursor: "cursor-1",
  deadline_at: TIME,
  lease_id: LeaseIdSchema.parse(ID),
  fencing_token: 4,
  payload: { event_type: "started", data: { phase: "run" } },
};

describe("runtime envelope codec", () => {
  it("round-trips a strict event envelope as one JSON line", () => {
    const encoded = encodeRuntimeEnvelope(validMessage);

    expect(encoded.endsWith("\n")).toBe(true);
    expect(decodeRuntimeEnvelope(encoded)).toEqual(validMessage);
  });

  it("rejects unknown payload fields instead of silently stripping them", () => {
    const encoded = JSON.stringify({ ...validMessage, payload: { event_type: "started", data: {}, extra: true } });

    expect(() => decodeRuntimeEnvelope(encoded)).toThrowError(RuntimeAdapterError);
    expect(() => decodeRuntimeEnvelope(encoded)).toThrowError(/payload/i);
  });

  it("reports an incompatible protocol version distinctly from malformed schema", () => {
    const encoded = JSON.stringify({ ...validMessage, protocol_version: 2 });

    expect(() => decodeRuntimeEnvelope(encoded)).toThrowError(
      expect.objectContaining({ code: "PROTOCOL_MISMATCH" }),
    );
  });

  it("preserves unknown event names for the adapter unmapped-event lane", () => {
    const encoded = JSON.stringify({ ...validMessage, payload: { event_type: "vendor.progress", data: { raw: "value" } } });

    expect(decodeRuntimeEnvelope(encoded).payload).toEqual({ event_type: "vendor.progress", data: { raw: "value" } });
  });
});
