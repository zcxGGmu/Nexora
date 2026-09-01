import { describe, expect, it } from "vitest";
import { GoalLoopDescriptorSchema } from "@nexora/contracts";
import { createGoalModeSubgoal, fetchGoalModeProjection, resolveGoalModeWorkspace, sendGoalModeControl, shouldUseGoalModePlanningFallback, type GoalModeCommandWriter, type GoalModePostOptions } from "./goal-mode-api.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  session: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  loop: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
};

const TIME = "2026-09-01T04:00:00.000Z";

describe("Mission Control Goal Mode API", () => {
  it("fetches live goal loop descriptors from the control API instead of static fixtures", async () => {
    const loop = GoalLoopDescriptorSchema.parse(goalLoop());
    const calls: string[] = [];

    const projection = await fetchGoalModeProjection(IDS.workspace, (path, workspace) => {
      calls.push(`${path}?workspace_id=${workspace}`);
      if (path === `/v1/goal-loops/${IDS.loop}`) return Promise.resolve({ schema_version: 1, goal_loop: loop, version: 2, continuations: [], commands: [] });
      return Promise.resolve({ schema_version: 1, goal_loops: [loop] });
    });

    expect(calls).toEqual([`/v1/goal-loops?workspace_id=${IDS.workspace}`, `/v1/goal-loops/${IDS.loop}?workspace_id=${IDS.workspace}`]);
    expect(projection.goal_loops).toEqual([loop]);
    expect(projection.details).toEqual([{ schema_version: 1, goal_loop: loop, version: 2, continuations: [], commands: [] }]);
  });

  it("resolves canonical workspace ids and local aliases without accepting arbitrary scopes", () => {
    expect(resolveGoalModeWorkspace("ws-demo")).toEqual({ kind: "resolved", workspace_id: IDS.workspace });
    expect(resolveGoalModeWorkspace(IDS.workspace)).toEqual({ kind: "resolved", workspace_id: IDS.workspace });
    expect(resolveGoalModeWorkspace("ws-unknown")).toEqual({ kind: "invalid", input: "ws-unknown" });
  });

  it("posts pause resume steer and judge commands with If-Match and Idempotency-Key headers", async () => {
    const calls: PostCall[] = [];
    const writer = createWriter(calls);

    await sendGoalModeControl({ workspace_id: IDS.workspace, goal_loop_id: IDS.loop, action: "pause", expected_revision: 2 }, "goal:pause", writer);
    await sendGoalModeControl({ workspace_id: IDS.workspace, goal_loop_id: IDS.loop, action: "resume", expected_revision: 3, cursor: "turn-2" }, "goal:resume", writer);
    await sendGoalModeControl({ workspace_id: IDS.workspace, goal_loop_id: IDS.loop, action: "steer", expected_revision: 4, instruction: "Stay inside local verification." }, "goal:steer", writer);
    await sendGoalModeControl({ workspace_id: IDS.workspace, goal_loop_id: IDS.loop, action: "judge", expected_revision: 5, judge: { done: false, reason: "Verifier failed." } }, "goal:judge", writer);

    expect(calls.map((call) => call.path)).toEqual([
      `/v1/goal-loops/${IDS.loop}/pause`,
      `/v1/goal-loops/${IDS.loop}/resume`,
      `/v1/goal-loops/${IDS.loop}/steer`,
      `/v1/goal-loops/${IDS.loop}/judge`,
    ]);
    expect(calls.map((call) => call.headers["If-Match"])).toEqual(["2", "3", "4", "5"]);
    expect(calls[3]?.json).toEqual({ schema_version: 1, workspace_id: IDS.workspace, done: false, reason: "Verifier failed." });
  });

  it("posts subgoal creation as a descriptor-only control request", async () => {
    const calls: PostCall[] = [];
    const writer = createWriter(calls);

    await createGoalModeSubgoal({ workspace_id: IDS.workspace, parent_loop_id: IDS.loop, objective: "Investigate verifier failure", max_turns: 2, deadline_at: "2026-09-01T05:00:00.000Z", budget: { max_tokens: 12_000, max_cost_usd: 1.5 }, expected_revision: 6 }, "goal:subgoal", writer);

    expect(calls).toEqual([{ path: `/v1/goal-loops/${IDS.loop}/subgoals`, headers: { "Idempotency-Key": "goal:subgoal", "If-Match": "6" }, json: { schema_version: 1, workspace_id: IDS.workspace, objective: "Investigate verifier failure", max_turns: 2, deadline_at: "2026-09-01T05:00:00.000Z", budget: { max_tokens: 12_000, max_cost_usd: 1.5 } } }]);
  });

  it("does not use the local planning fixture for authorization or scope errors", () => {
    expect(shouldUseGoalModePlanningFallback({ response: { status: 401 } })).toBe(false);
    expect(shouldUseGoalModePlanningFallback({ response: { status: 403 } })).toBe(false);
    expect(shouldUseGoalModePlanningFallback({ response: { status: 404 } })).toBe(false);
    expect(shouldUseGoalModePlanningFallback({ response: { status: 409 } })).toBe(false);
    expect(shouldUseGoalModePlanningFallback({ response: { status: 503 } })).toBe(true);
    expect(shouldUseGoalModePlanningFallback(new TypeError("Failed to fetch"))).toBe(true);
  });
});

type PostCall = {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
};

function createWriter(calls: PostCall[]): GoalModeCommandWriter {
  return {
    post: (path: string, options: GoalModePostOptions): Promise<unknown> => {
      calls.push({ path, headers: options.headers, json: options.json });
      return Promise.resolve({ ok: true });
    },
  };
}

function goalLoop(): object {
  return { id: IDS.loop, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, run_id: IDS.run, session_id: IDS.session, parent_loop_id: null, root_loop_id: IDS.loop, status: "running", objective: "Continue until done.", definition_of_done: ["done"], max_turns: 5, turn_count: 2, budget: { max_tokens: 10_000, max_cost_usd: 1 }, deadline_at: "2026-09-01T05:00:00.000Z", continuation_cursor: "turn-2", judge: { done: false, reason: "Continue." }, descriptor_only: true };
}
