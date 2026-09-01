import { GoalContinuationSchema, GoalLoopCommandSchema, GoalLoopDescriptorSchema, JudgeDecisionSchema, WorkspaceIdSchema, z, type GoalContinuation, type GoalLoopCommand, type GoalLoopDescriptor, type JudgeDecision } from "@nexora/contracts";
import { controlApi, readControlProjection } from "./query-client.js";

export type GoalModeProjection = {
  readonly goal_loops: readonly GoalLoopDescriptor[];
  readonly details: readonly GoalModeLoopDetail[];
};

export type GoalModeLoopDetail = {
  readonly schema_version: 1;
  readonly goal_loop: GoalLoopDescriptor;
  readonly version: number;
  readonly continuations: readonly GoalContinuation[];
  readonly commands: readonly GoalLoopCommand[];
};

export type GoalModePostOptions = {
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
};

export type GoalModeCommandWriter = {
  readonly post: (path: string, options: GoalModePostOptions) => Promise<unknown>;
};

export type GoalModeProjectionReader = (path: string, workspace: string) => Promise<unknown>;

export type GoalModeControlAction = "pause" | "resume" | "steer" | "judge";

export type GoalModeWorkspaceResolution =
  | { readonly kind: "resolved"; readonly workspace_id: string }
  | { readonly kind: "invalid"; readonly input: string };

const GoalLoopListResponseSchema = z.object({ schema_version: z.literal(1), goal_loops: z.array(GoalLoopDescriptorSchema) }).strict();
const GoalLoopDetailResponseSchema = z.object({ schema_version: z.literal(1), goal_loop: GoalLoopDescriptorSchema, version: z.number().int().positive(), continuations: z.array(GoalContinuationSchema), commands: z.array(GoalLoopCommandSchema) }).strict();
const HttpStatusErrorSchema = z.object({ response: z.object({ status: z.number().int() }).passthrough() }).passthrough();

export async function fetchGoalModeProjection(workspaceId: string, read: GoalModeProjectionReader = readControlProjection): Promise<GoalModeProjection> {
  const response = GoalLoopListResponseSchema.parse(await read("/v1/goal-loops", workspaceId));
  const details = await Promise.all(response.goal_loops.map((loop) => readGoalLoopDetail(loop.id, workspaceId, read)));
  return { goal_loops: response.goal_loops, details };
}

export async function sendGoalModeControl(input: { readonly workspace_id: string; readonly goal_loop_id: string; readonly action: GoalModeControlAction; readonly expected_revision: number; readonly cursor?: string; readonly instruction?: string; readonly judge?: JudgeDecision }, idempotencyKey: string, writer: GoalModeCommandWriter = controlApi): Promise<void> {
  await writer.post(`/v1/goal-loops/${encodeURIComponent(input.goal_loop_id)}/${input.action}`, {
    headers: { "Idempotency-Key": idempotencyKey, "If-Match": String(input.expected_revision) },
    json: controlBody(input),
  });
}

export async function createGoalModeSubgoal(input: { readonly workspace_id: string; readonly parent_loop_id: string; readonly objective: string; readonly max_turns: number; readonly deadline_at: string; readonly budget: { readonly max_tokens: number; readonly max_cost_usd: number }; readonly expected_revision: number }, idempotencyKey: string, writer: GoalModeCommandWriter = controlApi): Promise<void> {
  await writer.post(`/v1/goal-loops/${encodeURIComponent(input.parent_loop_id)}/subgoals`, {
    headers: { "Idempotency-Key": idempotencyKey, "If-Match": String(input.expected_revision) },
    json: { schema_version: 1, workspace_id: input.workspace_id, objective: input.objective, max_turns: input.max_turns, deadline_at: input.deadline_at, budget: input.budget },
  });
}

export function resolveGoalModeWorkspace(workspaceId: string): GoalModeWorkspaceResolution {
  const alias = localWorkspaceAlias(workspaceId);
  const parsed = WorkspaceIdSchema.safeParse(alias ?? workspaceId);
  if (!parsed.success) return { kind: "invalid", input: workspaceId };
  return { kind: "resolved", workspace_id: parsed.data };
}

export function shouldUseGoalModePlanningFallback(error: unknown): boolean {
  const parsed = HttpStatusErrorSchema.safeParse(error);
  if (!parsed.success) return true;
  return parsed.data.response.status >= 500;
}

async function readGoalLoopDetail(goalLoopId: string, workspaceId: string, read: GoalModeProjectionReader): Promise<GoalModeLoopDetail> {
  return GoalLoopDetailResponseSchema.parse(await read(`/v1/goal-loops/${encodeURIComponent(goalLoopId)}`, workspaceId));
}

function controlBody(input: { readonly workspace_id: string; readonly action: GoalModeControlAction; readonly cursor?: string; readonly instruction?: string; readonly judge?: JudgeDecision }): unknown {
  switch (input.action) {
    case "pause":
      return { schema_version: 1, workspace_id: input.workspace_id };
    case "resume":
      return { schema_version: 1, workspace_id: input.workspace_id, cursor: input.cursor };
    case "steer":
      return { schema_version: 1, workspace_id: input.workspace_id, instruction: input.instruction };
    case "judge": {
      const judge = JudgeDecisionSchema.parse(input.judge);
      return { schema_version: 1, workspace_id: input.workspace_id, done: judge.done, reason: judge.reason };
    }
    default:
      return assertNever(input.action);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Goal Mode action ${String(value)}`);
}

function localWorkspaceAlias(workspaceId: string): string | undefined {
  switch (workspaceId) {
    case "ws-demo":
    case "ws-a":
      return "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    case "ws-b":
      return "01BRZ3NDEKTSV4RRFFQ69G5FAV";
    default:
      return undefined;
  }
}
