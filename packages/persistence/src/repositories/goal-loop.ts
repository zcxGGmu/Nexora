import {
  GoalContinuationSchema,
  GoalLoopDescriptorSchema,
  GoalLoopCommandSchema,
  canTransitionGoalLoop,
  type GoalContinuation,
  type GoalLoopDescriptor,
  type GoalLoopCommand,
} from "@nexora/contracts";
import { withTransaction, type SqliteDatabase } from "../db.js";
import { PersistenceError, json, readJson, sqliteError, updateChanged } from "./utils.js";

export type OrphanRecoveryInput = {
  readonly workspace_id: string;
  readonly stale_before: string;
  readonly now: string;
  readonly idempotency_key_prefix: string;
  readonly continuation_id_factory: () => string;
};

export class GoalLoopRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): GoalLoopDescriptor {
    const parsed = GoalLoopDescriptorSchema.parse(record);
    this.requireSessionRunTopology(parsed.workspace_id, parsed.run_id, parsed.session_id);
    try {
      this.database.prepare("INSERT INTO goal_loops(id, workspace_id, goal_id, run_id, session_id, parent_loop_id, root_loop_id, status, objective, definition_of_done_json, max_turns, turn_count, budget_json, deadline_at, continuation_cursor, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.goal_id, parsed.run_id, parsed.session_id, parsed.parent_loop_id, parsed.root_loop_id, parsed.status, parsed.objective, json(parsed.definition_of_done), parsed.max_turns, parsed.turn_count, json(parsed.budget), parsed.deadline_at, parsed.continuation_cursor, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): GoalLoopDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json FROM goal_loops WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], GoalLoopDescriptorSchema);
  }

  getWithVersion(workspaceId: string, id: string): { readonly loop: GoalLoopDescriptor; readonly version: number } | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM goal_loops WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    if (row === undefined) return undefined;
    return { loop: readJson(row["payload_json"], GoalLoopDescriptorSchema), version: readVersion(row["version"]) };
  }

  list(workspaceId: string): readonly GoalLoopDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json FROM goal_loops WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId);
    return rows.map((row) => readJson(row["payload_json"], GoalLoopDescriptorSchema));
  }

  update(record: unknown, expectedVersion: number): GoalLoopDescriptor {
    const parsed = GoalLoopDescriptorSchema.parse(record);
    this.requireSessionRunTopology(parsed.workspace_id, parsed.run_id, parsed.session_id);
    this.requireAllowedUpdate(parsed);
    const result = this.database.prepare("UPDATE goal_loops SET goal_id = ?, run_id = ?, session_id = ?, parent_loop_id = ?, root_loop_id = ?, status = ?, objective = ?, definition_of_done_json = ?, max_turns = ?, turn_count = ?, budget_json = ?, deadline_at = ?, continuation_cursor = ?, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?").run(parsed.goal_id, parsed.run_id, parsed.session_id, parsed.parent_loop_id, parsed.root_loop_id, parsed.status, parsed.objective, json(parsed.definition_of_done), parsed.max_turns, parsed.turn_count, json(parsed.budget), parsed.deadline_at, parsed.continuation_cursor, json(parsed), parsed.schema_version, parsed.updated_at, parsed.workspace_id, parsed.id, expectedVersion);
    updateChanged(result, "GoalLoop");
    return parsed;
  }

  recoverOrphans(input: OrphanRecoveryInput): readonly GoalLoopDescriptor[] {
    return withTransaction(this.database, () => {
      const rows = this.database.prepare("SELECT payload_json, version FROM goal_loops WHERE workspace_id = ? AND status = 'running' AND updated_at < ? ORDER BY updated_at ASC, id ASC").all(input.workspace_id, input.stale_before);
      const recovered: GoalLoopDescriptor[] = [];
      const continuations = new GoalContinuationRepository(this.database);
      for (const row of rows) {
        const loop = readJson(row["payload_json"], GoalLoopDescriptorSchema);
        const version = readVersion(row["version"]);
        const updated = GoalLoopDescriptorSchema.parse({ ...loop, status: "paused", updated_at: input.now });
        this.update(updated, version);
        continuations.record({
          id: input.continuation_id_factory(),
          workspace_id: loop.workspace_id,
          schema_version: 1,
          created_at: input.now,
          updated_at: input.now,
          goal_loop_id: loop.id,
          run_id: loop.run_id,
          session_id: loop.session_id,
          turn: Math.max(1, loop.turn_count),
          previous_cursor: null,
          cursor: loop.continuation_cursor ?? `turn-${String(loop.turn_count)}`,
          judge: loop.judge ?? { done: false, reason: "Recovered orphaned goal loop." },
          idempotency_key: `${input.idempotency_key_prefix}:${loop.id}`,
          recovery_kind: "orphan_recovery",
          descriptor_only: true,
        });
        recovered.push(updated);
      }
      return recovered;
    });
  }

  private requireSessionRunTopology(workspaceId: string, runId: string, sessionId: string): void {
    const row = this.database.prepare("SELECT 1 AS present FROM sessions WHERE workspace_id = ? AND id = ? AND run_id = ?").get(workspaceId, sessionId, runId);
    if (row === undefined) throw new PersistenceError("NOT_FOUND", "Goal loop run/session topology mismatch");
  }

  private requireAllowedUpdate(parsed: GoalLoopDescriptor): void {
    const current = this.get(parsed.workspace_id, parsed.id);
    if (current === undefined) return;
    if (isTerminalGoalLoopStatus(current.status)) throw new PersistenceError("VERSION_CONFLICT", "Goal loop terminal descriptor is immutable");
    if (current.goal_id !== parsed.goal_id || current.run_id !== parsed.run_id || current.session_id !== parsed.session_id || current.parent_loop_id !== parsed.parent_loop_id || current.root_loop_id !== parsed.root_loop_id) throw new PersistenceError("VERSION_CONFLICT", "Goal loop scope is immutable");
    if (current.status !== parsed.status && !canTransitionGoalLoop(current.status, parsed.status, parsed.judge)) throw new PersistenceError("VERSION_CONFLICT", "Goal loop status transition is invalid");
  }
}

export class GoalContinuationRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): GoalContinuation {
    const parsed = GoalContinuationSchema.parse(record);
    return withTransaction(this.database, () => {
      const existing = this.getByIdempotency(parsed.workspace_id, parsed.goal_loop_id, parsed.idempotency_key);
      if (existing !== undefined) {
        if (!sameGoalContinuationRequest(existing, parsed)) throw new PersistenceError("IDEMPOTENCY_KEY_REUSED", "Goal continuation idempotency key conflict");
        return existing;
      }
      const loop = new GoalLoopRepository(this.database).getWithVersion(parsed.workspace_id, parsed.goal_loop_id);
      if (loop === undefined || loop.loop.run_id !== parsed.run_id || loop.loop.session_id !== parsed.session_id) throw new PersistenceError("NOT_FOUND", "Goal continuation scope mismatch");
      if (isTerminalGoalLoopStatus(loop.loop.status)) throw new PersistenceError("VERSION_CONFLICT", "Goal continuation cannot update a terminal loop");
      this.requireCursorMatchesCurrentLoop(loop.loop.continuation_cursor, parsed);
      try {
        this.database.prepare("INSERT INTO goal_continuations(id, workspace_id, goal_loop_id, run_id, session_id, turn, previous_cursor, cursor, idempotency_key, recovery_kind, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.goal_loop_id, parsed.run_id, parsed.session_id, parsed.turn, parsed.previous_cursor, parsed.cursor, parsed.idempotency_key, parsed.recovery_kind, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      } catch (error) {
        throw sqliteError(error);
      }
      const nextStatus = parsed.recovery_kind === "normal" ? "running" : loop.loop.status;
      const updatedLoop = GoalLoopDescriptorSchema.parse({ ...loop.loop, status: nextStatus, turn_count: Math.max(loop.loop.turn_count, parsed.turn), continuation_cursor: parsed.cursor, judge: parsed.judge, updated_at: parsed.updated_at });
      new GoalLoopRepository(this.database).update(updatedLoop, loop.version);
      return parsed;
    });
  }

  list(workspaceId: string, goalLoopId: string): readonly GoalContinuation[] {
    const rows = this.database.prepare("SELECT payload_json FROM goal_continuations WHERE workspace_id = ? AND goal_loop_id = ? ORDER BY turn ASC, created_at ASC, id ASC").all(workspaceId, goalLoopId);
    return rows.map((row) => readJson(row["payload_json"], GoalContinuationSchema));
  }

  private getByIdempotency(workspaceId: string, goalLoopId: string, idempotencyKey: string): GoalContinuation | undefined {
    const row = this.database.prepare("SELECT payload_json FROM goal_continuations WHERE workspace_id = ? AND goal_loop_id = ? AND idempotency_key = ?").get(workspaceId, goalLoopId, idempotencyKey);
    return row === undefined ? undefined : readJson(row["payload_json"], GoalContinuationSchema);
  }

  private requireCursorMatchesCurrentLoop(currentCursor: string | null, continuation: GoalContinuation): void {
    if (continuation.recovery_kind === "orphan_recovery") {
      if (currentCursor !== null && continuation.cursor !== currentCursor) throw new PersistenceError("VERSION_CONFLICT", "Goal recovery continuation cursor must match current cursor");
      return;
    }
    if (continuation.previous_cursor !== currentCursor) throw new PersistenceError("VERSION_CONFLICT", "Goal continuation previous cursor must match current cursor");
    if (continuation.cursor === currentCursor) throw new PersistenceError("VERSION_CONFLICT", "Goal continuation cursor must make forward progress");
  }
}

export class GoalLoopCommandRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): GoalLoopCommand {
    const parsed = GoalLoopCommandSchema.parse(record);
    return withTransaction(this.database, () => {
      const existing = this.getByIdempotency(parsed.workspace_id, parsed.goal_loop_id, parsed.idempotency_key);
      if (existing !== undefined) {
        if (!sameGoalLoopCommandRequest(existing, parsed)) throw new PersistenceError("IDEMPOTENCY_KEY_REUSED", "Goal loop command idempotency key conflict");
        return existing;
      }
      this.requireLoopRunSessionTopology(parsed.workspace_id, parsed.goal_loop_id, parsed.run_id, parsed.session_id);
      try {
        this.database.prepare("INSERT INTO goal_loop_commands(command_id, workspace_id, goal_loop_id, run_id, session_id, kind, idempotency_key, expected_revision, cursor, instruction, subgoal_json, judge_json, descriptor_only, payload_json, schema_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)").run(parsed.command_id, parsed.workspace_id, parsed.goal_loop_id, parsed.run_id, parsed.session_id, parsed.kind, parsed.idempotency_key, parsed.expected_revision, parsed.cursor, parsed.instruction, parsed.subgoal === null ? null : json(parsed.subgoal), parsed.judge === null ? null : json(parsed.judge), json(parsed), parsed.schema_version, parsed.created_at);
        return parsed;
      } catch (error) {
        throw sqliteError(error);
      }
    });
  }

  list(workspaceId: string, goalLoopId: string): readonly GoalLoopCommand[] {
    const rows = this.database.prepare("SELECT payload_json FROM goal_loop_commands WHERE workspace_id = ? AND goal_loop_id = ? ORDER BY created_at ASC, rowid ASC").all(workspaceId, goalLoopId);
    return rows.map((row) => readJson(row["payload_json"], GoalLoopCommandSchema));
  }

  private getByIdempotency(workspaceId: string, goalLoopId: string, idempotencyKey: string): GoalLoopCommand | undefined {
    const row = this.database.prepare("SELECT payload_json FROM goal_loop_commands WHERE workspace_id = ? AND goal_loop_id = ? AND idempotency_key = ?").get(workspaceId, goalLoopId, idempotencyKey);
    return row === undefined ? undefined : readJson(row["payload_json"], GoalLoopCommandSchema);
  }

  private requireLoopRunSessionTopology(workspaceId: string, goalLoopId: string, runId: string, sessionId: string): void {
    const row = this.database.prepare("SELECT 1 AS present FROM goal_loops WHERE workspace_id = ? AND id = ? AND run_id = ? AND session_id = ?").get(workspaceId, goalLoopId, runId, sessionId);
    if (row === undefined) throw new PersistenceError("NOT_FOUND", "Goal loop command run/session topology mismatch");
  }
}

function readVersion(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "bigint") return Number(value);
  throw new PersistenceError("CONSTRAINT_VIOLATION", "Goal loop version is invalid");
}

function isTerminalGoalLoopStatus(status: GoalLoopDescriptor["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function sameGoalContinuationRequest(left: GoalContinuation, right: GoalContinuation): boolean {
  return left.workspace_id === right.workspace_id
    && left.schema_version === right.schema_version
    && left.goal_loop_id === right.goal_loop_id
    && left.run_id === right.run_id
    && left.session_id === right.session_id
    && left.turn === right.turn
    && left.previous_cursor === right.previous_cursor
    && left.cursor === right.cursor
    && left.idempotency_key === right.idempotency_key
    && left.recovery_kind === right.recovery_kind
    && left.descriptor_only === right.descriptor_only
    && left.judge.done === right.judge.done
    && left.judge.reason === right.judge.reason;
}

function sameGoalLoopCommandRequest(left: GoalLoopCommand, right: GoalLoopCommand): boolean {
  return left.workspace_id === right.workspace_id
    && left.schema_version === right.schema_version
    && left.goal_loop_id === right.goal_loop_id
    && left.run_id === right.run_id
    && left.session_id === right.session_id
    && left.kind === right.kind
    && left.idempotency_key === right.idempotency_key
    && left.expected_revision === right.expected_revision
    && left.cursor === right.cursor
    && left.instruction === right.instruction
    && sameJudgeDecision(left.judge, right.judge)
    && left.descriptor_only === right.descriptor_only
    && sameSubgoalRequest(left.subgoal, right.subgoal);
}

function sameJudgeDecision(left: GoalLoopCommand["judge"], right: GoalLoopCommand["judge"]): boolean {
  if (left === null || right === null) return left === right;
  return left.done === right.done && left.reason === right.reason;
}

function sameSubgoalRequest(left: GoalLoopCommand["subgoal"], right: GoalLoopCommand["subgoal"]): boolean {
  if (left === null || right === null) return left === right;
  return left.objective === right.objective
    && left.max_turns === right.max_turns
    && left.deadline_at === right.deadline_at;
}
