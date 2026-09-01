import { describe, expect, it } from "vitest";
import { GoalLoopController } from "./goal-loop.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  otherWorkspace: "01BRZ3NDEKTSV4RRFFQ69H5FAV",
  run: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  session: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  loop: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  continuationA: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  continuationB: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
};

const TIME = "2026-09-01T04:00:00.000Z";
const DEADLINE = "2026-09-01T05:00:00.000Z";
type LoopStatus = "running" | "waiting_judge" | "paused" | "succeeded" | "failed" | "cancelled";

describe("C20 goal loop orchestration", () => {
  it("Given a non-terminal judge decision When planning the next turn Then the loop continues with a descriptor-only checkpoint", () => {
    const controller = new GoalLoopController({ now: () => TIME, continuationIdFactory: () => IDS.continuationA });

    const result = controller.planNextTurn({
      workspace_id: IDS.workspace,
      loop: loop({ turn_count: 2, max_turns: 5, status: "waiting_judge" }),
      judge: { done: false, reason: "Need another pass." },
      next_cursor: "turn-3",
      idempotency_key: "goal:turn:3",
    });

    expect(result.loop).toMatchObject({ status: "running", turn_count: 3, continuation_cursor: "turn-3", descriptor_only: true });
    expect(result.continuation).toMatchObject({ id: IDS.continuationA, turn: 3, cursor: "turn-3", recovery_kind: "normal", descriptor_only: true });
  });

  it("Given multiple continuation turns When planning them Then each checkpoint receives a distinct append-only id", () => {
    const ids = [IDS.continuationA, IDS.continuationB];
    const controller = new GoalLoopController({ now: () => TIME, continuationIdFactory: () => nextId(ids) });

    const first = controller.planNextTurn({
      workspace_id: IDS.workspace,
      loop: loop({ turn_count: 2, max_turns: 5, status: "waiting_judge" }),
      judge: { done: false, reason: "Need turn three." },
      next_cursor: "turn-3",
      idempotency_key: "goal:turn:3",
    });
    const second = controller.planNextTurn({
      workspace_id: IDS.workspace,
      loop: { ...first.loop, status: "waiting_judge" },
      judge: { done: false, reason: "Need turn four." },
      next_cursor: "turn-4",
      idempotency_key: "goal:turn:4",
    });

    const firstContinuation = requiredContinuation(first.continuation);
    const secondContinuation = requiredContinuation(second.continuation);
    expect(firstContinuation.id).toBe(IDS.continuationA);
    expect(secondContinuation.id).toBe(IDS.continuationB);
    expect(secondContinuation.id).not.toBe(firstContinuation.id);
    expect(secondContinuation.previous_cursor).toBe("turn-3");
  });

  it("Given max turns are exhausted When the judge is not done Then the controller fails the loop instead of claiming success", () => {
    const controller = new GoalLoopController({ now: () => TIME, continuationIdFactory: () => IDS.continuationA });

    const result = controller.planNextTurn({
      workspace_id: IDS.workspace,
      loop: loop({ turn_count: 3, max_turns: 3, status: "waiting_judge" }),
      judge: { done: false, reason: "Still not done." },
      next_cursor: "turn-4",
      idempotency_key: "goal:turn:4",
    });

    expect(result.loop).toMatchObject({ status: "failed", turn_count: 3 });
    expect(result.continuation).toBeNull();
    expect(result.reason).toContain("max turns");
  });

  it("Given a judge runtime failure When recorded Then the loop remains failed and cannot emit a done decision", () => {
    const controller = new GoalLoopController({ now: () => TIME, continuationIdFactory: () => IDS.continuationA });

    const result = controller.recordJudgeFailure({ loop: loop({ turn_count: 2, max_turns: 5, status: "waiting_judge" }), reason: "Judge JSON parse failed" });

    expect(result).toMatchObject({ status: "failed", judge: { done: false, reason: "Judge JSON parse failed" } });
  });

  it("Given the deadline has passed When planning continuation Then the loop fails without emitting a new turn", () => {
    const controller = new GoalLoopController({ now: () => "2026-09-01T06:00:00.000Z", continuationIdFactory: () => IDS.continuationA });

    const result = controller.planNextTurn({
      workspace_id: IDS.workspace,
      loop: loop({ turn_count: 1, max_turns: 5, status: "waiting_judge" }),
      judge: { done: false, reason: "Continue." },
      next_cursor: "turn-2",
      idempotency_key: "goal:turn:2",
    });

    expect(result.loop).toMatchObject({ status: "failed", turn_count: 1 });
    expect(result.continuation).toBeNull();
    expect(result.reason).toContain("deadline");
  });

  it("Given the budget is exhausted When planning continuation Then the loop fails without spending another turn", () => {
    const controller = new GoalLoopController({ now: () => TIME, continuationIdFactory: () => IDS.continuationA });

    const result = controller.planNextTurn({
      workspace_id: IDS.workspace,
      loop: { ...loop({ turn_count: 1, max_turns: 5, status: "waiting_judge" }), budget: { max_tokens: 0, max_cost_usd: 1 } },
      judge: { done: false, reason: "Continue." },
      next_cursor: "turn-2",
      idempotency_key: "goal:turn:2",
    });

    expect(result.loop).toMatchObject({ status: "failed", turn_count: 1 });
    expect(result.continuation).toBeNull();
    expect(result.reason).toContain("budget");
  });

  it("Given a paused or terminal loop When planning continuation Then the controller refuses to advance it", () => {
    const controller = new GoalLoopController({ now: () => TIME, continuationIdFactory: () => IDS.continuationA });

    const statuses: readonly LoopStatus[] = ["running", "paused", "succeeded", "failed", "cancelled"];
    for (const status of statuses) {
      expect(() => controller.planNextTurn({
        workspace_id: IDS.workspace,
        loop: loop({ turn_count: 2, max_turns: 5, status }),
        judge: { done: false, reason: "Continue." },
        next_cursor: "turn-3",
        idempotency_key: `goal:turn:${status}`,
      })).toThrow(/waiting_judge/i);
    }
  });

  it("Given the next cursor is already current When planning continuation Then the controller treats it as replay without spending another turn", () => {
    const controller = new GoalLoopController({ now: () => TIME, continuationIdFactory: () => IDS.continuationA });
    const current = loop({ turn_count: 2, max_turns: 5, status: "waiting_judge" });

    const result = controller.planNextTurn({
      workspace_id: IDS.workspace,
      loop: current,
      judge: { done: false, reason: "Retry saw the same checkpoint." },
      next_cursor: "turn-2",
      idempotency_key: "goal:turn:2:replay",
    });

    expect(result.loop).toMatchObject({ status: "waiting_judge", turn_count: 2, continuation_cursor: "turn-2" });
    expect(result.continuation).toBeNull();
    expect(result.reason).toContain("already current");
  });

  it("Given a terminal loop When a late judge failure is recorded Then the controller refuses to demote it", () => {
    const controller = new GoalLoopController({ now: () => TIME, continuationIdFactory: () => IDS.continuationA });

    const terminalStatuses: readonly LoopStatus[] = ["succeeded", "failed", "cancelled"];
    for (const status of terminalStatuses) {
      expect(() => controller.recordJudgeFailure({ loop: loop({ turn_count: 2, max_turns: 5, status }), reason: "Late judge worker failed." })).toThrow(/terminal/i);
    }
  });

  it("Given a loop before the judge gate When judge failure is recorded Then the controller refuses to fail it", () => {
    const controller = new GoalLoopController({ now: () => TIME, continuationIdFactory: () => IDS.continuationA });

    const preJudgeStatuses: readonly LoopStatus[] = ["running", "paused"];
    for (const status of preJudgeStatuses) {
      expect(() => controller.recordJudgeFailure({ loop: loop({ turn_count: 2, max_turns: 5, status }), reason: "Judge worker failed before gate." })).toThrow(/waiting_judge/i);
    }
  });

  it("Given mismatched run or session scope When planning continuation Then the controller rejects the descriptor", () => {
    const controller = new GoalLoopController({ now: () => TIME, continuationIdFactory: () => IDS.continuationA });

    expect(() => controller.planNextTurn({
      workspace_id: IDS.workspace,
      loop: { ...loop({ turn_count: 1, max_turns: 2, status: "waiting_judge" }), workspace_id: IDS.otherWorkspace },
      judge: { done: false, reason: "Continue." },
      next_cursor: "turn-2",
      idempotency_key: "goal:turn:2",
    })).toThrow(/scope/i);
  });
});

function loop(input: { readonly turn_count: number; readonly max_turns: number; readonly status: LoopStatus }): object {
  return { id: IDS.loop, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.loop, run_id: IDS.run, session_id: IDS.session, parent_loop_id: null, root_loop_id: IDS.loop, status: input.status, objective: "Continue until done.", definition_of_done: ["done"], max_turns: input.max_turns, turn_count: input.turn_count, budget: { max_tokens: 10_000, max_cost_usd: 1 }, deadline_at: DEADLINE, continuation_cursor: input.turn_count === 0 ? null : `turn-${String(input.turn_count)}`, judge: judgeForStatus(input.status), descriptor_only: true };
}

function judgeForStatus(status: LoopStatus): { readonly done: boolean; readonly reason: string } | null {
  if (status === "succeeded") return { done: true, reason: "Done." };
  if (status === "failed") return { done: false, reason: "Failed." };
  return null;
}

function requiredContinuation(continuation: ReturnType<GoalLoopController["planNextTurn"]>["continuation"]) {
  if (continuation === null) throw new Error("Expected continuation checkpoint");
  return continuation;
}

function nextId(ids: string[]): string {
  const id = ids.shift();
  if (id === undefined) throw new Error("Missing continuation id");
  return id;
}
