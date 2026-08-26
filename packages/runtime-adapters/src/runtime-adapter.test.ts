import { describe, expect, it } from "vitest";
import { AttemptIdSchema, LeaseIdSchema, RunIdSchema, StepIdSchema, TraceIdSchema } from "@nexora/contracts";
import { DeterministicAdapter } from "./deterministic-adapter.js";
import type { RuntimeAdapter, StartInput } from "./runtime-adapter.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-26T04:00:00.000Z";
const input: StartInput = {
  run_id: RunIdSchema.parse(ID),
  attempt_id: AttemptIdSchema.parse(ID),
  step_id: StepIdSchema.parse(ID),
  trace_id: TraceIdSchema.parse(ID),
  deadline_at: "2026-08-26T04:01:00.000Z",
  lease_id: LeaseIdSchema.parse(ID),
  fencing_token: 1,
  input: { prompt: "hello" },
};

describe("RuntimeAdapter contract", () => {
  it("exposes capabilities and preserves lease/fencing context on start", async () => {
    const adapter: RuntimeAdapter = new DeterministicAdapter({ now: () => TIME });

    await expect(adapter.capabilities()).resolves.toMatchObject({
      adapter_id: "deterministic",
      protocol_version: 1,
      execution_location: "local",
      supports_resume: true,
      supports_cancel: true,
      supports_streaming: true,
    });

    const handle = await adapter.start(input);
    expect(handle).toMatchObject({
      run_id: input.run_id,
      attempt_id: input.attempt_id,
      step_id: input.step_id,
      lease_id: input.lease_id,
      fencing_token: input.fencing_token,
    });
  });

  it("supports heartbeat and resume commands without changing the fencing token", async () => {
    const adapter = new DeterministicAdapter({ now: () => TIME });
    const handle = await adapter.start(input);

    await expect(adapter.send(handle, { type: "heartbeat" })).resolves.toBeUndefined();
    await expect(adapter.send(handle, { type: "resume", cursor: "cursor-1" })).resolves.toBeUndefined();
    expect(handle.fencing_token).toBe(1);
  });
});
