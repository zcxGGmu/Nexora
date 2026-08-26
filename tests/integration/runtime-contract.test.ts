import { describe, expect, it } from "vitest";
import { AttemptIdSchema, LeaseIdSchema, RunIdSchema, RuntimeEnvelopeSchema, StepIdSchema, TraceIdSchema } from "../../packages/contracts/src/index.js";
import { DeterministicAdapter } from "../../packages/runtime-adapters/src/index.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const input = {
  run_id: RunIdSchema.parse(ID),
  attempt_id: AttemptIdSchema.parse(ID),
  step_id: StepIdSchema.parse(ID),
  trace_id: TraceIdSchema.parse(ID),
  deadline_at: "2026-08-26T04:01:00.000Z",
  lease_id: LeaseIdSchema.parse(ID),
  fencing_token: 8,
  input: { topic: "Nexora" },
} as const;

describe("runtime adapter integration contract", () => {
  it("maps a deterministic run to ordered runtime envelopes without claiming business success", async () => {
    const adapter = new DeterministicAdapter({ scenario: "success", now: () => "2026-08-26T04:00:00.000Z" });
    const handle = await adapter.start(input);
    const events = [];
    for await (const event of adapter.collect(handle)) events.push(event);

    expect(events.length).toBe(4);
    expect(events.map((event) => event.type)).toEqual(["started", "tool_called", "artifact_created", "completed"]);
    expect(events.map((event) => event.envelope.sequence)).toEqual([1, 2, 3, 4]);
    expect(events.every((event) => RuntimeEnvelopeSchema.safeParse({ ...event.envelope, payload: {} }).success)).toBe(true);
    expect(events.at(-1)?.data).toEqual({ runtime_status: "completed" });
    expect(events.at(-1)?.data).not.toHaveProperty("business_status");
  });
});
