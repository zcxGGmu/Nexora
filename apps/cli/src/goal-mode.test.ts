import { describe, expect, it } from "vitest";
import { parseGoalModeCommand } from "./goal-mode.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  loop: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
};

describe("C20 Goal Mode CLI control semantics", () => {
  it("Given /goal resume When parsed Then it produces a descriptor-only API request without network side effects", () => {
    const parsed = parseGoalModeCommand(`/goal resume ${IDS.loop} --workspace ${IDS.workspace} --cursor turn-2 --if-match 3 --idempotency-key goal:resume:c20`);

    expect(parsed).toEqual({
      method: "POST",
      path: `/v1/goal-loops/${IDS.loop}/resume`,
      headers: { "idempotency-key": "goal:resume:c20", "if-match": "3" },
      body: { schema_version: 1, workspace_id: IDS.workspace, cursor: "turn-2" },
      descriptor_only: true,
    });
  });

  it("Given /subgoal When parsed Then it preserves parent loop scope budget deadline and turn limit", () => {
    const parsed = parseGoalModeCommand(`/subgoal ${IDS.loop} --workspace ${IDS.workspace} --objective "Investigate verifier failure" --max-turns 2 --deadline 2026-09-01T05:00:00.000Z --budget-tokens 12000 --budget-usd 1.5 --if-match 4 --idempotency-key goal:subgoal:c20`);

    expect(parsed).toEqual({
      method: "POST",
      path: `/v1/goal-loops/${IDS.loop}/subgoals`,
      headers: { "idempotency-key": "goal:subgoal:c20", "if-match": "4" },
      body: { schema_version: 1, workspace_id: IDS.workspace, objective: "Investigate verifier failure", max_turns: 2, deadline_at: "2026-09-01T05:00:00.000Z", budget: { max_tokens: 12_000, max_cost_usd: 1.5 } },
      descriptor_only: true,
    });
  });

  it("Given unsupported outbound flags When parsed Then the CLI rejects them before command construction", () => {
    expect(() => parseGoalModeCommand(`/goal resume ${IDS.loop} --workspace ${IDS.workspace} --send slack`)).toThrow(/external/i);
    expect(() => parseGoalModeCommand(`/subgoal ${IDS.loop} --workspace ${IDS.workspace} --provider telegram --objective "Ping"`)).toThrow(/external/i);
  });
});
