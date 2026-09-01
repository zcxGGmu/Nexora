import { describe, expect, it } from "vitest";
import {
  GoalContinuationSchema,
  GoalLoopCommandSchema,
  GoalLoopDescriptorSchema,
  JudgeDecisionSchema,
  canTransitionGoalLoop,
} from "./goal.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  session: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  loop: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  childLoop: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  continuation: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  command: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
};

const TIME = "2026-09-01T04:00:00.000Z";
const DEADLINE = "2026-09-01T05:00:00.000Z";

const loopDescriptor = {
  id: IDS.loop,
  workspace_id: IDS.workspace,
  schema_version: 1,
  created_at: TIME,
  updated_at: TIME,
  goal_id: IDS.goal,
  run_id: IDS.run,
  session_id: IDS.session,
  parent_loop_id: null,
  root_loop_id: IDS.loop,
  status: "running",
  objective: "Continue until the verifier reports done.",
  definition_of_done: ["Judge returns done true with a reason."],
  max_turns: 5,
  turn_count: 2,
  budget: { max_tokens: 50_000, max_cost_usd: 3 },
  deadline_at: DEADLINE,
  continuation_cursor: "turn-2",
  judge: { done: false, reason: "Need one more verification turn." },
  descriptor_only: true,
};

describe("C20 Goal Mode contracts", () => {
  it("Given a goal loop descriptor When parsed Then continuation judge budget deadline and scope are explicit", () => {
    const parsed = GoalLoopDescriptorSchema.parse(loopDescriptor);

    expect(parsed).toMatchObject({
      workspace_id: IDS.workspace,
      goal_id: IDS.goal,
      run_id: IDS.run,
      session_id: IDS.session,
      status: "running",
      max_turns: 5,
      turn_count: 2,
      continuation_cursor: "turn-2",
      judge: { done: false, reason: "Need one more verification turn." },
      descriptor_only: true,
    });
  });

  it("Given malformed loop and judge payloads When parsed Then unknown fields and invalid turn limits are rejected", () => {
    expect(GoalLoopDescriptorSchema.safeParse({ ...loopDescriptor, provider_token: "secret://provider/live" }).success).toBe(false);
    expect(GoalLoopDescriptorSchema.safeParse({ ...loopDescriptor, turn_count: 6 }).success).toBe(false);
    expect(GoalLoopDescriptorSchema.safeParse({ ...loopDescriptor, descriptor_only: false }).success).toBe(false);
    expect(GoalLoopDescriptorSchema.safeParse({ ...loopDescriptor, status: "succeeded", judge: null }).success).toBe(false);
    expect(GoalLoopDescriptorSchema.safeParse({ ...loopDescriptor, status: "succeeded", judge: { done: false, reason: "Not complete." } }).success).toBe(false);
    expect(GoalLoopDescriptorSchema.safeParse({ ...loopDescriptor, status: "failed", judge: { done: true, reason: "Contradictory failure." } }).success).toBe(false);
    expect(GoalLoopDescriptorSchema.safeParse({ ...loopDescriptor, status: "running", judge: { done: true, reason: "Contradictory running loop." } }).success).toBe(false);
    expect(GoalLoopDescriptorSchema.safeParse({ ...loopDescriptor, objective: "Continue with Bearer live-token-123" }).success).toBe(false);
    expect(GoalLoopDescriptorSchema.safeParse({ ...loopDescriptor, definition_of_done: ["Store secret://providers/live-token"] }).success).toBe(false);
    expect(JudgeDecisionSchema.safeParse({ done: true, reason: "Complete", token: "secret" }).success).toBe(false);
    expect(JudgeDecisionSchema.safeParse({ done: true, reason: "" }).success).toBe(false);
    expect(JudgeDecisionSchema.safeParse({ done: false, reason: "api_key=live-token-123" }).success).toBe(false);
  });

  it.each([
    "token=abcd1234",
    "password=hunter2",
    "xoxb-123-456-secret",
    "ghp_1234567890abcdef",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturepart",
    "AKIAIOSFODNN7EXAMPLE",
  ])("Given secret-shaped text %s When parsed Then goal mode text rejects it", (secretText) => {
    expect(GoalLoopDescriptorSchema.safeParse({ ...loopDescriptor, objective: `Continue with ${secretText}` }).success).toBe(false);
    expect(GoalLoopDescriptorSchema.safeParse({ ...loopDescriptor, definition_of_done: [`Never echo ${secretText}`] }).success).toBe(false);
    expect(JudgeDecisionSchema.safeParse({ done: false, reason: `Blocked by ${secretText}` }).success).toBe(false);
  });

  it("Given a subgoal loop When parsed Then it remains inside the same workspace run and root loop", () => {
    const child = GoalLoopDescriptorSchema.parse({
      ...loopDescriptor,
      id: IDS.childLoop,
      parent_loop_id: IDS.loop,
      root_loop_id: IDS.loop,
      objective: "Resolve the blocker before the parent continues.",
      turn_count: 0,
      continuation_cursor: null,
      judge: null,
    });

    expect(child.parent_loop_id).toBe(IDS.loop);
    expect(child.root_loop_id).toBe(IDS.loop);
    expect(child.workspace_id).toBe(loopDescriptor.workspace_id);
    expect(child.run_id).toBe(loopDescriptor.run_id);
    expect(child.session_id).toBe(loopDescriptor.session_id);
  });

  it("Given goal loop control commands When parsed Then pause resume steer and subgoal are descriptor-only commands", () => {
    const resume = GoalLoopCommandSchema.parse({
      schema_version: 1,
      command_id: IDS.command,
      workspace_id: IDS.workspace,
      goal_loop_id: IDS.loop,
      run_id: IDS.run,
      session_id: IDS.session,
      kind: "resume",
      idempotency_key: "goal:resume:c20",
      expected_revision: 3,
      cursor: "turn-2",
      instruction: null,
      subgoal: null,
      created_at: TIME,
    });

    const subgoal = GoalLoopCommandSchema.parse({ ...resume, kind: "subgoal", instruction: "Investigate the failing verifier.", subgoal: { objective: "Find the verifier failure root cause.", max_turns: 2, deadline_at: DEADLINE } });
    const judge = GoalLoopCommandSchema.parse({ ...resume, kind: "judge", expected_revision: 4, judge: { done: false, reason: "Verifier failed." } });

    expect(resume.kind).toBe("resume");
    expect(resume.descriptor_only).toBe(true);
    expect(subgoal.subgoal).toMatchObject({ objective: "Find the verifier failure root cause.", max_turns: 2 });
    expect(judge.judge).toEqual({ done: false, reason: "Verifier failed." });
    expect(GoalLoopCommandSchema.safeParse({ ...resume, kind: "subgoal", subgoal: null, instruction: null }).success).toBe(false);
    expect(GoalLoopCommandSchema.safeParse({ ...resume, kind: "pause", instruction: "not accepted" }).success).toBe(false);
    expect(GoalLoopCommandSchema.safeParse({ ...resume, kind: "steer", instruction: "Use secret://providers/live-token" }).success).toBe(false);
    expect(GoalLoopCommandSchema.safeParse({ ...resume, kind: "judge", judge: null }).success).toBe(false);
  });

  it("Given continuation checkpoints When parsed Then exact replay is allowed but older cursors are not valid forward progress", () => {
    const checkpoint = GoalContinuationSchema.parse({
      id: IDS.continuation,
      workspace_id: IDS.workspace,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      goal_loop_id: IDS.loop,
      run_id: IDS.run,
      session_id: IDS.session,
      turn: 3,
      previous_cursor: "turn-2",
      cursor: "turn-3",
      judge: { done: false, reason: "Continue." },
      idempotency_key: "goal:continuation:turn-3",
      recovery_kind: "normal",
      descriptor_only: true,
    });

    expect(checkpoint.cursor).toBe("turn-3");
    expect(GoalContinuationSchema.safeParse({ ...checkpoint, cursor: "turn-1" }).success).toBe(false);
  });

  it("Given loop states When transitioning Then terminal judge decisions only follow the judge gate", () => {
    expect(canTransitionGoalLoop("running", "paused", null)).toBe(true);
    expect(canTransitionGoalLoop("running", "waiting_judge", { done: false, reason: "Ready for judge." })).toBe(true);
    expect(canTransitionGoalLoop("paused", "running", null)).toBe(true);
    expect(canTransitionGoalLoop("running", "succeeded", { done: false, reason: "Still failing" })).toBe(false);
    expect(canTransitionGoalLoop("running", "succeeded", { done: true, reason: "Done" })).toBe(false);
    expect(canTransitionGoalLoop("running", "failed", { done: false, reason: "Judge failed" })).toBe(false);
    expect(canTransitionGoalLoop("waiting_judge", "succeeded", { done: false, reason: "Still failing" })).toBe(false);
    expect(canTransitionGoalLoop("waiting_judge", "succeeded", { done: true, reason: "Done" })).toBe(true);
    expect(canTransitionGoalLoop("waiting_judge", "failed", { done: true, reason: "Contradictory failure" })).toBe(false);
    expect(canTransitionGoalLoop("waiting_judge", "failed", { done: false, reason: "Judge failed" })).toBe(true);
    expect(canTransitionGoalLoop("succeeded", "running", { done: true, reason: "Done" })).toBe(false);
  });
});
