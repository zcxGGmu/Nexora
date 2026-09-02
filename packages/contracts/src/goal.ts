import { z } from "zod";
import { MetadataSchema, NonNegativeInt, TimestampSchema } from "./common.js";
import { CursorSchema, IdempotencyKeySchema } from "./gateway.js";
import { GoalIdSchema, RunIdSchema, UlidSchema, WorkspaceIdSchema } from "./ids.js";
import { BudgetSchema } from "./run.js";
export const GoalSchema = MetadataSchema.extend({ title: z.string().min(1), objective: z.string().min(1), definition_of_done: z.array(z.string().min(1)) }).strict();

export const GoalLoopStatusSchema = z.enum(["running", "paused", "waiting_judge", "succeeded", "failed", "cancelled"]);
export const GoalLoopCommandKindSchema = z.enum(["pause", "resume", "steer", "subgoal", "judge"]);
export const GoalContinuationRecoveryKindSchema = z.enum(["normal", "orphan_recovery"]);
const SecretSafeTextSchema = (maximumLength: number) => z.string().min(1).max(maximumLength).refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed");

export const JudgeDecisionSchema = z.object({ done: z.boolean(), reason: SecretSafeTextSchema(2000) }).strict();

const SubgoalRequestSchema = z.object({
  objective: SecretSafeTextSchema(4000),
  max_turns: z.number().int().positive().max(1000),
  deadline_at: TimestampSchema,
}).strict();

export const GoalLoopDescriptorSchema = MetadataSchema.extend({
  goal_id: GoalIdSchema,
  run_id: RunIdSchema,
  session_id: UlidSchema,
  parent_loop_id: UlidSchema.nullable(),
  root_loop_id: UlidSchema,
  status: GoalLoopStatusSchema,
  objective: SecretSafeTextSchema(4000),
  definition_of_done: z.array(SecretSafeTextSchema(1000)).min(1).max(50),
  max_turns: z.number().int().positive().max(1000),
  turn_count: NonNegativeInt.max(1000),
  budget: BudgetSchema,
  deadline_at: TimestampSchema,
  continuation_cursor: CursorSchema.nullable(),
  judge: JudgeDecisionSchema.nullable(),
  descriptor_only: z.literal(true),
}).strict().superRefine((loop, context) => {
  if (loop.turn_count > loop.max_turns) context.addIssue({ code: z.ZodIssueCode.custom, path: ["turn_count"], message: "turn_count cannot exceed max_turns" });
  if (loop.parent_loop_id === null && loop.root_loop_id !== loop.id) context.addIssue({ code: z.ZodIssueCode.custom, path: ["root_loop_id"], message: "root loop must reference itself" });
  if (loop.parent_loop_id !== null && loop.root_loop_id === loop.id) context.addIssue({ code: z.ZodIssueCode.custom, path: ["root_loop_id"], message: "subgoal loop must reference the inherited root loop" });
  if (loop.status === "succeeded" && loop.judge?.done !== true) context.addIssue({ code: z.ZodIssueCode.custom, path: ["judge"], message: "succeeded goal loops require judge.done true" });
  if (loop.status === "failed" && loop.judge?.done !== false) context.addIssue({ code: z.ZodIssueCode.custom, path: ["judge"], message: "failed goal loops require judge.done false" });
  if (loop.status !== "succeeded" && loop.judge?.done === true) context.addIssue({ code: z.ZodIssueCode.custom, path: ["judge"], message: "only succeeded goal loops may carry judge.done true" });
});

export const GoalContinuationSchema = MetadataSchema.extend({
  goal_loop_id: UlidSchema,
  run_id: RunIdSchema,
  session_id: UlidSchema,
  turn: z.number().int().positive().max(1000),
  previous_cursor: CursorSchema.nullable(),
  cursor: CursorSchema,
  judge: JudgeDecisionSchema,
  idempotency_key: IdempotencyKeySchema,
  recovery_kind: GoalContinuationRecoveryKindSchema,
  descriptor_only: z.literal(true),
}).strict().superRefine((continuation, context) => {
  if (isBackwardsCursor(continuation.previous_cursor, continuation.cursor)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["cursor"], message: "continuation cursor cannot move backwards" });
});

export const GoalLoopCommandSchema = z.object({
  schema_version: z.literal(1),
  command_id: UlidSchema,
  workspace_id: WorkspaceIdSchema,
  goal_loop_id: UlidSchema,
  run_id: RunIdSchema,
  session_id: UlidSchema,
  kind: GoalLoopCommandKindSchema,
  idempotency_key: IdempotencyKeySchema,
  expected_revision: z.number().int().positive().nullable(),
  cursor: CursorSchema.nullable().default(null),
  instruction: SecretSafeTextSchema(4000).nullable().default(null),
  subgoal: SubgoalRequestSchema.nullable().default(null),
  judge: JudgeDecisionSchema.nullable().default(null),
  descriptor_only: z.literal(true).default(true),
  created_at: TimestampSchema,
}).strict().superRefine((command, context) => {
  if (command.kind === "steer" && command.instruction === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["instruction"], message: "steer commands require instruction" });
  if (command.kind === "subgoal" && (command.instruction === null || command.subgoal === null)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["subgoal"], message: "subgoal commands require instruction and subgoal descriptor" });
  if (command.kind === "judge" && command.judge === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["judge"], message: "judge commands require a judge decision" });
  if ((command.kind === "pause" || command.kind === "resume") && command.instruction !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["instruction"], message: "pause and resume commands do not accept instruction" });
  if (command.kind !== "subgoal" && command.subgoal !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["subgoal"], message: "only subgoal commands accept subgoal descriptors" });
  if (command.kind !== "judge" && command.judge !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["judge"], message: "only judge commands accept judge decisions" });
  if (command.kind === "judge" && command.instruction !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["instruction"], message: "judge commands do not accept instruction" });
});

export type Goal = z.infer<typeof GoalSchema>;
export type GoalLoopStatus = z.infer<typeof GoalLoopStatusSchema>;
export type GoalLoopCommandKind = z.infer<typeof GoalLoopCommandKindSchema>;
export type GoalContinuationRecoveryKind = z.infer<typeof GoalContinuationRecoveryKindSchema>;
export type JudgeDecision = z.infer<typeof JudgeDecisionSchema>;
export type GoalLoopDescriptor = z.infer<typeof GoalLoopDescriptorSchema>;
export type GoalContinuation = z.infer<typeof GoalContinuationSchema>;
export type GoalLoopCommand = z.infer<typeof GoalLoopCommandSchema>;

const GOAL_LOOP_STATUS_TRANSITIONS: Readonly<Record<GoalLoopStatus, readonly GoalLoopStatus[]>> = {
  running: ["paused", "waiting_judge", "cancelled"],
  paused: ["running", "cancelled"],
  waiting_judge: ["running", "succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransitionGoalLoop(from: GoalLoopStatus, to: GoalLoopStatus, judge: JudgeDecision | null): boolean {
  GoalLoopStatusSchema.parse(from);
  GoalLoopStatusSchema.parse(to);
  if (!GOAL_LOOP_STATUS_TRANSITIONS[from].includes(to)) return false;
  const parsedJudge = judge === null ? null : JudgeDecisionSchema.parse(judge);
  if (to === "succeeded") return parsedJudge?.done === true;
  if (to === "failed") return parsedJudge?.done === false;
  return true;
}

export function goalLoopTransitions(): Readonly<Record<GoalLoopStatus, readonly GoalLoopStatus[]>> {
  return GOAL_LOOP_STATUS_TRANSITIONS;
}

function isBackwardsCursor(previous: string | null, next: string): boolean {
  if (previous === null || previous === next) return false;
  const previousNumber = trailingNumber(previous);
  const nextNumber = trailingNumber(next);
  return previousNumber !== undefined && nextNumber !== undefined && nextNumber < previousNumber;
}

function trailingNumber(value: string): number | undefined {
  const match = /(?:^|[-:])(\d+)$/.exec(value);
  if (match === null) return undefined;
  const numberText = match[1];
  if (numberText === undefined) return undefined;
  const parsed = Number(numberText);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

const SECRET_LIKE_PATTERNS: readonly RegExp[] = [
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/i,
  /secret:\/\/[^\s]+/i,
  /\b(?:secret|vault|credential):(?:\/\/)?[^\s"']+/i,
  /\b(?:api[_-]?key|access[_-]?token|authorization|private[_-]?key|client[_-]?secret|refresh[_-]?token|session[_-]?token|token|password|passwd|pwd|secret)\s*[:=]\s*["']?[^\s"']{4,}/i,
  /\bxox[abprs]-[A-Za-z0-9-]{8,}\b/i,
  /\bgh[pousr]_[A-Za-z0-9_]{8,}\b/,
  /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bsk-(?:live|proj|test|ant)-[A-Za-z0-9_-]{8,}\b/i,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
];

const DEFAULT_IGNORABLE_CODE_POINT_PATTERN = /\p{Default_Ignorable_Code_Point}/gu;

export function containsSecretLikeText(value: string): boolean {
  return secretDetectionCandidates(value).some((candidate) => SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(candidate)));
}

function secretDetectionCandidates(value: string): readonly string[] {
  const candidates: string[] = [value];
  const pending: string[] = [value];
  for (let pass = 0; pending.length > 0 && pass < 16; pass += 1) {
    const current = pending.shift();
    if (current === undefined) break;
    appendTransformedCandidate(candidates, pending, stripDefaultIgnorableCodePoints(current));
    appendTransformedCandidate(candidates, pending, decodePercentTriplets(current));
  }
  return candidates;
}

function appendTransformedCandidate(candidates: string[], pending: string[], value: string): void {
  if (candidates.includes(value)) return;
  candidates.push(value);
  pending.push(value);
}

function stripDefaultIgnorableCodePoints(value: string): string {
  return value.replace(DEFAULT_IGNORABLE_CODE_POINT_PATTERN, "");
}

function decodePercentTriplets(value: string): string {
  return value.replace(/%([0-9a-fA-F]{2})/g, (_match: string, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}
