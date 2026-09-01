import { describe, expect, it } from "vitest";
import { GoalContinuationSchema, GoalLoopCommandSchema } from "@nexora/contracts";
import { migrate, openDatabase } from "./index.js";
import { GoalContinuationRepository, GoalLoopCommandRepository, GoalLoopRepository } from "./repositories/index.js";
import type { SqliteDatabase } from "./index.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  otherWorkspace: "01BRZ3NDEKTSV4RRFFQ69H5FAV",
  agent: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  otherRun: "01QRZ3NDEKTSV4RRFFQ69Q5FAV",
  otherSession: "01RRZ3NDEKTSV4RRFFQ69R5FAV",
  gateway: "gateway-c20",
  channel: "channel-c20",
  session: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  loop: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  continuationA: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  continuationB: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
  continuationC: "01MRZ3NDEKTSV4RRFFQ69M5FAV",
  continuationRecovery: "01KRZ3NDEKTSV4RRFFQ69K5FAV",
  commandA: "01VRZ3NDEKTSV4RRFFQ69V5FAV",
  commandB: "01WRZ3NDEKTSV4RRFFQ69W5FAV",
};

const TIME = "2026-09-01T04:00:00.000Z";
const LATER = "2026-09-01T04:05:00.000Z";
const EVEN_LATER = "2026-09-01T04:06:00.000Z";
const DEADLINE = "2026-09-01T05:00:00.000Z";

describe("C20 goal loop persistence", () => {
  it("Given a scoped run and session When a goal loop is created Then it stores only descriptor facts for the same workspace", () => {
    const database = createDatabase();
    try {
      const created = new GoalLoopRepository(database).create(goalLoop());

      expect(created).toMatchObject({ workspace_id: IDS.workspace, run_id: IDS.run, session_id: IDS.session, descriptor_only: true });
      expect(new GoalLoopRepository(database).get(IDS.otherWorkspace, IDS.loop)).toBeUndefined();
      expect(() => new GoalLoopRepository(database).create({ ...goalLoop(), workspace_id: IDS.otherWorkspace })).toThrow();
    } finally {
      database.close();
    }
  });

  it("Given continuation checkpoints When the same idempotency key is replayed Then exact replay is idempotent and conflicting cursors are rejected", () => {
    const database = createDatabase();
    try {
      const loops = new GoalLoopRepository(database);
      const continuations = new GoalContinuationRepository(database);
      loops.create(goalLoop());

      const first = continuations.record(checkpoint(IDS.continuationA, "goal:turn:3", "turn-2", "turn-3", 3));
      const replay = continuations.record({ ...checkpoint(IDS.continuationB, "goal:turn:3", "turn-2", "turn-3", 3), created_at: EVEN_LATER, updated_at: EVEN_LATER });
      const second = continuations.record(checkpoint(IDS.continuationC, "goal:turn:4", "turn-3", "turn-4", 4));

      expect(replay).toEqual(first);
      expect(second).toMatchObject({ id: IDS.continuationC, turn: 4, previous_cursor: "turn-3", cursor: "turn-4" });
      expect(() => continuations.record(checkpoint(IDS.continuationA, "goal:turn:3", "turn-2", "turn-4", 3))).toThrow(/idempotency/i);
      expect(() => continuations.record(checkpoint(IDS.continuationB, "goal:turn:5", "turn-4", "turn-2", 5))).toThrow(/cursor/i);
      expect(() => continuations.record(checkpoint(IDS.continuationRecovery, "goal:turn:older", null, "turn-1", 5))).toThrow(/cursor/i);
    } finally {
      database.close();
    }
  });

  it("Given a session from a different run When a loop is persisted Then the repository rejects the topology", () => {
    const database = createDatabase();
    try {
      database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.otherRun, IDS.workspace, IDS.ticket, JSON.stringify({ ...runPayload(), id: IDS.otherRun }), TIME, TIME);

      expect(() => new GoalLoopRepository(database).create({ ...goalLoop(), run_id: IDS.otherRun })).toThrow(/scope|topology|not found/i);
    } finally {
      database.close();
    }
  });

  it("Given a terminal loop When a stale writer tries to demote it Then repository and database boundaries reject the status change", () => {
    const database = createDatabase();
    try {
      const loops = new GoalLoopRepository(database);
      const succeeded = loops.create({ ...goalLoop(), status: "succeeded", judge: { done: true, reason: "Already done." } });

      expect(() => loops.update({ ...succeeded, status: "failed", judge: { done: false, reason: "Late judge failure." }, updated_at: LATER }, 1)).toThrow(/terminal|immutable|version/i);
      expect(() => database.prepare("UPDATE goal_loops SET status = 'failed' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.loop)).toThrow(/terminal|immutable|abort/i);
      expect(loops.get(IDS.workspace, IDS.loop)).toMatchObject({ status: "succeeded", judge: { done: true } });
    } finally {
      database.close();
    }
  });

  it("Given a running loop When a writer skips the judge gate Then repository and database boundaries reject terminal status", () => {
    const database = createDatabase();
    try {
      const loops = new GoalLoopRepository(database);
      const running = loops.create(goalLoop());

      expect(() => loops.update({ ...running, status: "succeeded", judge: { done: true, reason: "Done without gate." }, updated_at: LATER }, 1)).toThrow(/transition|gate|version/i);
      expect(() => database.prepare("UPDATE goal_loops SET status = 'succeeded' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.loop)).toThrow(/terminal|gate|abort/i);
      expect(loops.get(IDS.workspace, IDS.loop)).toMatchObject({ status: "running", judge: { done: false } });
    } finally {
      database.close();
    }
  });

  it("Given a terminal loop is created When judge status is contradictory Then schema and database insert boundaries reject it", () => {
    const database = createDatabase();
    try {
      const invalidFailed = { ...goalLoop(), status: "failed", judge: { done: true, reason: "Contradictory failure." } };
      const invalidSucceeded = { ...goalLoop(), status: "succeeded", judge: null };

      expect(() => new GoalLoopRepository(database).create(invalidFailed)).toThrow(/judge|validation|contract/i);
      expect(() => new GoalLoopRepository(database).create(invalidSucceeded)).toThrow(/judge|validation|contract/i);
      expect(() => insertRawGoalLoop(database, "failed", invalidFailed)).toThrow(/judge|terminal|abort/i);
      expect(() => insertRawGoalLoop(database, "succeeded", invalidSucceeded)).toThrow(/judge|terminal|abort/i);
    } finally {
      database.close();
    }
  });

  it("Given a loop at the judge gate When a failed terminal update claims judge done Then repository and database boundaries reject it", () => {
    const database = createDatabase();
    try {
      const loops = new GoalLoopRepository(database);
      const running = loops.create(goalLoop());
      const waiting = loops.update({ ...running, status: "waiting_judge", updated_at: LATER }, 1);
      const current = loops.getWithVersion(IDS.workspace, IDS.loop);
      if (current === undefined) throw new Error("expected persisted loop version");

      expect(() => loops.update({ ...waiting, status: "failed", judge: { done: true, reason: "Contradictory failure." }, updated_at: EVEN_LATER }, current.version)).toThrow(/judge|transition|version/i);
      expect(() => database.prepare("UPDATE goal_loops SET status = 'failed', payload_json = ? WHERE workspace_id = ? AND id = ?").run(JSON.stringify({ ...waiting, status: "failed", judge: { done: true, reason: "Contradictory failure." }, updated_at: EVEN_LATER }), IDS.workspace, IDS.loop)).toThrow(/judge|terminal|abort/i);
      expect(loops.get(IDS.workspace, IDS.loop)).toMatchObject({ status: "waiting_judge", judge: { done: false } });
    } finally {
      database.close();
    }
  });

  it("Given raw SQL mutates only payload status When read through repository Then column and payload divergence is rejected", () => {
    const database = createDatabase();
    try {
      const loops = new GoalLoopRepository(database);
      loops.create(goalLoop());
      const divergentPayload = { ...goalLoop(), status: "failed", judge: { done: false, reason: "Payload diverged." }, updated_at: LATER };

      expect(() => database.prepare("UPDATE goal_loops SET payload_json = ? WHERE workspace_id = ? AND id = ?").run(JSON.stringify(divergentPayload), IDS.workspace, IDS.loop)).toThrow(/payload|status|columns|abort/i);
      expect(loops.get(IDS.workspace, IDS.loop)).toMatchObject({ status: "running", judge: { done: false } });
    } finally {
      database.close();
    }
  });

  it("Given raw SQL inserts a continuation with divergent payload facts Then the database rejects it before reads can trust payload_json", () => {
    const database = createDatabase();
    try {
      new GoalLoopRepository(database).create(goalLoop());
      const columns = GoalContinuationSchema.parse(checkpoint(IDS.continuationA, "goal:turn:payload-divergence", "turn-2", "turn-3", 3));
      const payload = { ...columns, cursor: "turn-999" };

      expect(() => insertRawContinuation(database, columns, payload)).toThrow(/payload|columns|abort/i);
      expect(new GoalContinuationRepository(database).list(IDS.workspace, IDS.loop)).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("Given raw SQL inserts a command with divergent payload facts Then the database rejects it before reads can trust payload_json", () => {
    const database = createDatabase();
    try {
      new GoalLoopRepository(database).create(goalLoop());
      const columns = GoalLoopCommandSchema.parse({ schema_version: 1, command_id: IDS.commandA, workspace_id: IDS.workspace, goal_loop_id: IDS.loop, run_id: IDS.run, session_id: IDS.session, kind: "judge", idempotency_key: "goal:command:payload-divergence", expected_revision: 1, cursor: "turn-2", instruction: null, subgoal: null, judge: { done: false, reason: "Needs another turn." }, created_at: LATER });
      const payload = { ...columns, kind: "pause", cursor: null, judge: null };

      expect(() => insertRawCommand(database, columns, payload)).toThrow(/payload|columns|abort/i);
      expect(new GoalLoopCommandRepository(database).list(IDS.workspace, IDS.loop)).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("Given a terminal loop When a continuation is recorded Then repository and database boundaries reject fact corruption", () => {
    const database = createDatabase();
    try {
      const loops = new GoalLoopRepository(database);
      const continuations = new GoalContinuationRepository(database);
      loops.create({ ...goalLoop(), status: "succeeded", judge: { done: true, reason: "Already done." } });
      const staleContinuation = checkpoint(IDS.continuationA, "goal:turn:terminal", "turn-2", "turn-3", 3);

      expect(() => continuations.record(staleContinuation)).toThrow(/terminal|transition|version/i);
      expect(() => insertRawContinuation(database, staleContinuation)).toThrow(/terminal|immutable|abort/i);
      expect(loops.get(IDS.workspace, IDS.loop)).toMatchObject({ status: "succeeded", continuation_cursor: "turn-2", turn_count: 2, judge: { done: true } });
    } finally {
      database.close();
    }
  });

  it("Given the next continuation cursor already matches the loop When a new checkpoint is recorded Then it cannot spend another turn", () => {
    const database = createDatabase();
    try {
      const loops = new GoalLoopRepository(database);
      const continuations = new GoalContinuationRepository(database);
      loops.create(goalLoop());
      const duplicateCursor = checkpoint(IDS.continuationA, "goal:turn:same-cursor", "turn-2", "turn-2", 3);

      expect(() => continuations.record(duplicateCursor)).toThrow(/cursor|progress|version/i);
      expect(() => insertRawContinuation(database, duplicateCursor)).toThrow(/cursor|progress|abort/i);
      expect(loops.get(IDS.workspace, IDS.loop)).toMatchObject({ continuation_cursor: "turn-2", turn_count: 2 });
    } finally {
      database.close();
    }
  });

  it("Given a steer command is accepted When stored Then the instruction remains an append-only descriptor fact", () => {
    const database = createDatabase();
    try {
      new GoalLoopRepository(database).create(goalLoop());
      const commands = new GoalLoopCommandRepository(database);
      const command = GoalLoopCommandSchema.parse({ schema_version: 1, command_id: IDS.commandA, workspace_id: IDS.workspace, goal_loop_id: IDS.loop, run_id: IDS.run, session_id: IDS.session, kind: "steer", idempotency_key: "goal:steer:audit", expected_revision: 1, cursor: null, instruction: "Continue from the last verified checkpoint.", subgoal: null, created_at: LATER });

      expect(commands.record(command)).toMatchObject({ command_id: IDS.commandA, kind: "steer", instruction: "Continue from the last verified checkpoint.", descriptor_only: true });
      expect(commands.list(IDS.workspace, IDS.loop)).toEqual([expect.objectContaining({ command_id: IDS.commandA, kind: "steer", instruction: "Continue from the last verified checkpoint." })]);
      expect(() => commands.record({ ...command, command_id: IDS.commandB, instruction: "Different steering." })).toThrow(/idempotency|unique|constraint/i);
      expect(() => database.prepare("UPDATE goal_loop_commands SET instruction = 'mutated' WHERE workspace_id = ? AND command_id = ?").run(IDS.workspace, IDS.commandA)).toThrow(/append-only|abort/i);
      expect(() => database.prepare("DELETE FROM goal_loop_commands WHERE workspace_id = ? AND command_id = ?").run(IDS.workspace, IDS.commandA)).toThrow(/append-only|abort/i);
    } finally {
      database.close();
    }
  });

  it("Given a judge command is accepted When stored Then the decision remains an append-only descriptor fact", () => {
    const database = createDatabase();
    try {
      new GoalLoopRepository(database).create(goalLoop());
      const commands = new GoalLoopCommandRepository(database);
      const command = GoalLoopCommandSchema.parse({ schema_version: 1, command_id: IDS.commandA, workspace_id: IDS.workspace, goal_loop_id: IDS.loop, run_id: IDS.run, session_id: IDS.session, kind: "judge", idempotency_key: "goal:judge:audit", expected_revision: 1, cursor: null, instruction: null, subgoal: null, judge: { done: false, reason: "Verifier failed." }, created_at: LATER });

      expect(commands.record(command)).toMatchObject({ command_id: IDS.commandA, kind: "judge", judge: { done: false, reason: "Verifier failed." }, descriptor_only: true });
      expect(commands.list(IDS.workspace, IDS.loop)).toEqual([expect.objectContaining({ command_id: IDS.commandA, kind: "judge", judge: { done: false, reason: "Verifier failed." } })]);
      expect(() => commands.record({ ...command, command_id: IDS.commandB, judge: { done: true, reason: "Different judge." } })).toThrow(/idempotency|unique|constraint/i);
    } finally {
      database.close();
    }
  });

  it("Given another valid run and session When a loop update tries to rebind scope Then repository and database boundaries reject it", () => {
    const database = createDatabase();
    try {
      seedOtherRunAndSession(database);
      const loops = new GoalLoopRepository(database);
      const current = loops.create(goalLoop());

      expect(() => loops.update({ ...current, run_id: IDS.otherRun, session_id: IDS.otherSession, updated_at: LATER }, 1)).toThrow(/scope|immutable|version/i);
      expect(() => database.prepare("UPDATE goal_loops SET run_id = ?, session_id = ? WHERE workspace_id = ? AND id = ?").run(IDS.otherRun, IDS.otherSession, IDS.workspace, IDS.loop)).toThrow(/scope|immutable|abort/i);
      expect(loops.get(IDS.workspace, IDS.loop)).toMatchObject({ run_id: IDS.run, session_id: IDS.session });
    } finally {
      database.close();
    }
  });

  it("Given an active loop after restart When orphans are recovered Then only stale same-workspace loops become recovery continuations", () => {
    const database = createDatabase();
    try {
      const loops = new GoalLoopRepository(database);
      const continuations = new GoalContinuationRepository(database);
      loops.create({ ...goalLoop(), status: "running", updated_at: TIME });

      const recovered = loops.recoverOrphans({ workspace_id: IDS.workspace, stale_before: LATER, now: LATER, idempotency_key_prefix: "goal:recover", continuation_id_factory: () => IDS.continuationRecovery });

      expect(recovered).toHaveLength(1);
      expect(recovered[0]).toMatchObject({ workspace_id: IDS.workspace, id: IDS.loop, status: "paused", continuation_cursor: "turn-2" });
      expect(continuations.list(IDS.workspace, IDS.loop)).toEqual(expect.arrayContaining([expect.objectContaining({ id: IDS.continuationRecovery, recovery_kind: "orphan_recovery", cursor: "turn-2" })]));
      expect(loops.recoverOrphans({ workspace_id: IDS.otherWorkspace, stale_before: LATER, now: LATER, idempotency_key_prefix: "goal:recover", continuation_id_factory: () => IDS.continuationRecovery })).toHaveLength(0);
    } finally {
      database.close();
    }
  });
});

function createDatabase(): SqliteDatabase {
  const database = openDatabase(":memory:");
  migrate(database, { now: () => TIME });
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'Demo', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'Other', 1, ?, ?)").run(IDS.otherWorkspace, TIME, TIME);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, '{}', 1, ?, ?)").run(IDS.agent, IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'Goal', 'Objective', '[\"done\"]', '{}', 1, ?, ?)").run(IDS.goal, IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'ready', 'ticket:c20', '{}', 1, ?, ?)").run(IDS.ticket, IDS.workspace, IDS.goal, TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.ticket, JSON.stringify(runPayload()), TIME, TIME);
  database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'Gateway C20', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(IDS.gateway, IDS.workspace, TIME, TIME, TIME);
  database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'Channel C20', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(IDS.channel, IDS.workspace, IDS.gateway, TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'background', 'active', 'turn-2', NULL, ?, '{}', 1, ?, ?)").run(IDS.session, IDS.workspace, IDS.gateway, IDS.channel, IDS.agent, IDS.run, TIME, TIME, TIME);
  return database;
}

function runPayload(): object {
  return { id: IDS.run, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, ticket_id: IDS.ticket, execution_location: "local", status: "running", budget: { max_tokens: 10_000, max_cost_usd: 1 }, memory_snapshot: { snapshot_id: IDS.workspace, version: 1 }, connector_versions: { deterministic: "1.0.0" } };
}

function goalLoop(): object {
  return { id: IDS.loop, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, run_id: IDS.run, session_id: IDS.session, parent_loop_id: null, root_loop_id: IDS.loop, status: "running", objective: "Keep working across turns.", definition_of_done: ["Judge returns done true."], max_turns: 5, turn_count: 2, budget: { max_tokens: 10_000, max_cost_usd: 1 }, deadline_at: DEADLINE, continuation_cursor: "turn-2", judge: { done: false, reason: "Continue." }, descriptor_only: true };
}

function checkpoint(id: string, idempotencyKey: string, previousCursor: string | null, cursor: string, turn: number): object {
  return { id, workspace_id: IDS.workspace, schema_version: 1, created_at: LATER, updated_at: LATER, goal_loop_id: IDS.loop, run_id: IDS.run, session_id: IDS.session, turn, previous_cursor: previousCursor, cursor, judge: { done: false, reason: "Continue." }, idempotency_key: idempotencyKey, recovery_kind: "normal", descriptor_only: true };
}

function insertRawContinuation(database: SqliteDatabase, record: object, payload: object = record): void {
  const parsed = GoalContinuationSchema.parse(record);
  database.prepare("INSERT INTO goal_continuations(id, workspace_id, goal_loop_id, run_id, session_id, turn, previous_cursor, cursor, idempotency_key, recovery_kind, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.goal_loop_id, parsed.run_id, parsed.session_id, parsed.turn, parsed.previous_cursor, parsed.cursor, parsed.idempotency_key, parsed.recovery_kind, JSON.stringify(payload), parsed.schema_version, parsed.created_at, parsed.updated_at);
}

function insertRawCommand(database: SqliteDatabase, record: object, payload: object = record): void {
  const parsed = GoalLoopCommandSchema.parse(record);
  database.prepare("INSERT INTO goal_loop_commands(command_id, workspace_id, goal_loop_id, run_id, session_id, kind, idempotency_key, expected_revision, cursor, instruction, subgoal_json, judge_json, descriptor_only, payload_json, schema_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)").run(parsed.command_id, parsed.workspace_id, parsed.goal_loop_id, parsed.run_id, parsed.session_id, parsed.kind, parsed.idempotency_key, parsed.expected_revision, parsed.cursor, parsed.instruction, parsed.subgoal === null ? null : JSON.stringify(parsed.subgoal), parsed.judge === null ? null : JSON.stringify(parsed.judge), JSON.stringify(payload), parsed.schema_version, parsed.created_at);
}

function insertRawGoalLoop(database: SqliteDatabase, status: "succeeded" | "failed", payload: object): void {
  database.prepare("INSERT INTO goal_loops(id, workspace_id, goal_id, run_id, session_id, parent_loop_id, root_loop_id, status, objective, definition_of_done_json, max_turns, turn_count, budget_json, deadline_at, continuation_cursor, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)").run(IDS.loop, IDS.workspace, IDS.goal, IDS.run, IDS.session, IDS.loop, status, "Keep working across turns.", JSON.stringify(["Judge returns done true."]), 5, 2, JSON.stringify({ max_tokens: 10_000, max_cost_usd: 1 }), DEADLINE, "turn-2", JSON.stringify(payload), TIME, TIME);
}

function seedOtherRunAndSession(database: SqliteDatabase): void {
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.otherRun, IDS.workspace, IDS.ticket, JSON.stringify({ ...runPayload(), id: IDS.otherRun }), TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'background', 'active', 'turn-2', NULL, ?, '{}', 1, ?, ?)").run(IDS.otherSession, IDS.workspace, IDS.gateway, IDS.channel, IDS.agent, IDS.otherRun, TIME, TIME, TIME);
}
