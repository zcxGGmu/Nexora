import { describe, expect, it } from "vitest";
import { AttemptIdSchema, LeaseIdSchema, RunIdSchema, StepIdSchema, TraceIdSchema } from "@nexora/contracts";
import { DETERMINISTIC_SCENARIOS, DeterministicAdapter, type DeterministicScenario } from "./deterministic-adapter.js";
import type { StartInput } from "./runtime-adapter.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const input: StartInput = {
  run_id: RunIdSchema.parse(ID), attempt_id: AttemptIdSchema.parse(ID), step_id: StepIdSchema.parse(ID), trace_id: TraceIdSchema.parse(ID),
  deadline_at: "2026-08-26T04:01:00.000Z", lease_id: LeaseIdSchema.parse(ID), fencing_token: 2, input: { topic: "Nexora" },
};

async function collectTypes(adapter: DeterministicAdapter, handle: Awaited<ReturnType<DeterministicAdapter["start"]>>): Promise<readonly string[]> {
  const types: string[] = [];
  for await (const event of adapter.collect(handle)) types.push(event.type);
  return types;
}

describe("deterministic adapter", () => {
  it.each(DETERMINISTIC_SCENARIOS)("emits the standard lifecycle for %s", async (scenario: DeterministicScenario) => {
    const adapter = new DeterministicAdapter({ scenario, now: () => "2026-08-26T04:00:00.000Z" });
    const handle = await adapter.start(input);
    const types = await collectTypes(adapter, handle);

    expect(types[0]).toBe("started");
    const terminalType = terminalTypeForScenario(scenario);
    expect(types).toContain(terminalType);
  });

  it("assigns distinct valid message IDs to streamed envelopes", async () => {
    const adapter = new DeterministicAdapter({ now: () => "2026-08-26T04:00:00.000Z" });
    const handle = await adapter.start(input);
    const events = [];
    for await (const event of adapter.collect(handle)) events.push(event);

    expect(new Set(events.map((event) => event.envelope.message_id)).size).toBe(events.length);
  });

  it("returns cancel_unknown when cancellation cannot be acknowledged", async () => {
    const adapter = new DeterministicAdapter({ cancel_mode: "unknown", now: () => "2026-08-26T04:00:00.000Z" });
    const handle = await adapter.start(input);

    await expect(adapter.cancel(handle)).resolves.toEqual({ state: "cancel_unknown", reason: "Runtime did not acknowledge cancellation" });
  });

  it("resumes from the supplied cursor without replaying committed events", async () => {
    const adapter = new DeterministicAdapter({ now: () => "2026-08-26T04:00:00.000Z" });
    const handle = await adapter.start(input);
    await adapter.send(handle, { type: "resume", cursor: "2" });

    const types = await collectTypes(adapter, handle);
    expect(types[0]).not.toBe("started");
    expect(types).toContain("completed");
  });

  it("reuses the same event sequence when a consumer reconnects after a partial read", async () => {
    const adapter = new DeterministicAdapter({ now: () => "2026-08-26T04:00:00.000Z" });
    const handle = await adapter.start(input);
    const iterator = adapter.collect(handle)[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: "started" }, done: false });
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: "tool_called" }, done: false });
    await adapter.send(handle, { type: "resume", cursor: "2" });

    const resumedTypes = await collectTypes(adapter, handle);
    expect(resumedTypes).toEqual(["artifact_created", "completed"]);
  });

  it("rejects stale fencing handles with STALE_LEASE", async () => {
    const adapter = new DeterministicAdapter({ now: () => "2026-08-26T04:00:00.000Z" });
    const handle = await adapter.start(input);
    const staleHandle = { ...handle, fencing_token: 9 };

    await expect(adapter.send(staleHandle, { type: "heartbeat" })).rejects.toMatchObject({ code: "STALE_LEASE" });
  });

  it("rejects malformed resume cursors instead of silently truncating them", async () => {
    const adapter = new DeterministicAdapter({ now: () => "2026-08-26T04:00:00.000Z" });
    const handle = await adapter.start(input);
    await adapter.send(handle, { type: "resume", cursor: "2abc" });

    await expect(async () => {
      for await (const _event of adapter.collect(handle)) continue;
    }).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("returns timeout when the clock passes the runtime deadline", async () => {
    const adapter = new DeterministicAdapter({ now: () => "2026-08-26T04:02:00.000Z" });
    await expect(adapter.start(input)).rejects.toMatchObject({ code: "CONNECTOR_TIMEOUT" });
  });

  it("does not overwrite a terminal completed session with a later cancel", async () => {
    const adapter = new DeterministicAdapter({ now: () => "2026-08-26T04:00:00.000Z" });
    const handle = await adapter.start(input);
    for await (const _event of adapter.collect(handle)) continue;

    await expect(adapter.cancel(handle)).resolves.toMatchObject({ state: "cancel_unknown" });
  });

  it("replays a terminal result after the clock passes its deadline", async () => {
    let now = "2026-08-26T04:00:00.000Z";
    const adapter = new DeterministicAdapter({ now: () => now });
    const handle = await adapter.start(input);
    await expect(collectTypes(adapter, handle)).resolves.toContain("completed");
    now = "2026-08-26T04:02:00.000Z";

    await expect(collectTypes(adapter, handle)).resolves.toContain("completed");
  });
});

function terminalTypeForScenario(scenario: DeterministicScenario): string {
  switch (scenario) {
    case "success":
      return "completed";
    case "judge_fail":
      return "judge_failed";
    case "review_needed":
    case "seo_draft_v1":
      return "review_needed";
    case "partial":
    case "timeout":
      return scenario;
    default:
      return assertNever(scenario);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled deterministic scenario ${String(value)}`);
}
