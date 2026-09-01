import {
  GoalContinuationSchema,
  GoalLoopDescriptorSchema,
  JudgeDecisionSchema,
  type GoalContinuation,
  type GoalLoopDescriptor,
  type JudgeDecision,
} from "@nexora/contracts";

export type GoalLoopControllerOptions = {
  readonly now: () => string;
  readonly continuationIdFactory: () => string;
};

export type PlanNextTurnInput = {
  readonly workspace_id: string;
  readonly loop: unknown;
  readonly judge: unknown;
  readonly next_cursor: string;
  readonly idempotency_key: string;
};

export type PlanNextTurnResult = {
  readonly loop: GoalLoopDescriptor;
  readonly continuation: GoalContinuation | null;
  readonly reason: string;
};

export class GoalLoopController {
  constructor(private readonly options: GoalLoopControllerOptions) {}

  planNextTurn(input: PlanNextTurnInput): PlanNextTurnResult {
    const loop = this.parseScopedLoop(input.workspace_id, input.loop);
    const judge = JudgeDecisionSchema.parse(input.judge);
    const now = this.options.now();
    if (loop.status !== "waiting_judge") throw new Error(`Goal loop must be waiting_judge before planning continuation; current status is ${loop.status}`);
    if (judge.done) return { loop: GoalLoopDescriptorSchema.parse({ ...loop, status: "succeeded", judge, updated_at: now }), continuation: null, reason: judge.reason };
    if (Date.parse(now) >= Date.parse(loop.deadline_at)) return { loop: this.failed(loop, judge, now), continuation: null, reason: "deadline exceeded" };
    if (loop.turn_count >= loop.max_turns) return { loop: this.failed(loop, judge, now), continuation: null, reason: "max turns exceeded" };
    if (loop.budget.max_tokens === 0 || loop.budget.max_cost_usd === 0) return { loop: this.failed(loop, judge, now), continuation: null, reason: "budget exhausted" };
    if (loop.continuation_cursor === input.next_cursor) return { loop, continuation: null, reason: `checkpoint ${input.next_cursor} already current` };

    const nextTurn = loop.turn_count + 1;
    const updated = GoalLoopDescriptorSchema.parse({ ...loop, status: "running", turn_count: nextTurn, continuation_cursor: input.next_cursor, judge, updated_at: now });
    const continuation = GoalContinuationSchema.parse({
      id: this.options.continuationIdFactory(),
      workspace_id: loop.workspace_id,
      schema_version: 1,
      created_at: now,
      updated_at: now,
      goal_loop_id: loop.id,
      run_id: loop.run_id,
      session_id: loop.session_id,
      turn: nextTurn,
      previous_cursor: loop.continuation_cursor,
      cursor: input.next_cursor,
      judge,
      idempotency_key: input.idempotency_key,
      recovery_kind: "normal",
      descriptor_only: true,
    });
    return { loop: updated, continuation, reason: judge.reason };
  }

  recordJudgeFailure(input: { readonly loop: unknown; readonly reason: string }): GoalLoopDescriptor {
    const loop = GoalLoopDescriptorSchema.parse(input.loop);
    if (isTerminalGoalLoopStatus(loop.status)) throw new Error(`Cannot record judge failure for terminal goal loop ${loop.status}`);
    if (loop.status !== "waiting_judge") throw new Error(`Goal loop must be waiting_judge before recording judge failure; current status is ${loop.status}`);
    return this.failed(loop, { done: false, reason: input.reason }, this.options.now());
  }

  private parseScopedLoop(workspaceId: string, loop: unknown): GoalLoopDescriptor {
    const parsed = GoalLoopDescriptorSchema.parse(loop);
    if (parsed.workspace_id !== workspaceId) throw new Error("Goal loop scope mismatch");
    return parsed;
  }

  private failed(loop: GoalLoopDescriptor, judge: JudgeDecision, updatedAt: string): GoalLoopDescriptor {
    return GoalLoopDescriptorSchema.parse({ ...loop, status: "failed", judge, updated_at: updatedAt });
  }
}

function isTerminalGoalLoopStatus(status: GoalLoopDescriptor["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}
