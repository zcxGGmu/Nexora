import { describe, expect, it } from "vitest";
import { systemClock, type Clock } from "@nexora/contracts";
import { DomainError, canTransitionRun, transitionRun, applyRunStatus, createRunAggregate } from "./index.js";

describe("run state machine", () => {
  it.each([
    ["queued", "running"], ["running", "paused"], ["paused", "running"],
    ["running", "waiting_review"], ["waiting_review", "succeeded"],
    ["running", "partial"], ["partial", "succeeded"], ["running", "failed"],
    ["failed", "running"], ["queued", "cancelled"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(canTransitionRun(from, to)).toBe(true);
    expect(transitionRun(from, to)).toBe(to);
  });

  it.each([["succeeded", "running"], ["cancelled", "running"], ["queued", "succeeded"], ["running", "queued"]] as const)("rejects %s -> %s", (from, to) => {
    expect(canTransitionRun(from, to)).toBe(false);
    expect(() => transitionRun(from, to)).toThrowError(DomainError);
    try { transitionRun(from, to); } catch (error) { expect(error).toMatchObject({ code: "INVALID_STATE_TRANSITION" }); }
  });

  it("uses an injected clock when applying a transition", () => {
    const run = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", schema_version: 1 as const, created_at: "2026-08-26T04:00:00.000Z", updated_at: "2026-08-26T04:00:00.000Z", ticket_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", execution_location: "local" as const, status: "queued" as const, budget: { max_tokens: 1, max_cost_usd: 0 }, memory_snapshot: { snapshot_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", version: 1 }, connector_versions: {} };
    const fixedClock: Clock = { now: () => "2026-08-26T05:00:00.000Z" };
    expect(applyRunStatus(createRunAggregate(run), "running", fixedClock).run.updated_at).toBe("2026-08-26T05:00:00.000Z");
    expect(systemClock.now()).toMatch(/Z$/);
  });
});
