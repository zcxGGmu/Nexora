import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GoalContinuationRepository, GoalLoopRepository, migrate, openDatabase } from "../../packages/persistence/src/index.js";
import type { SqliteDatabase } from "../../packages/persistence/src/index.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  agent: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  gateway: "gateway-c20-recovery",
  channel: "channel-c20-recovery",
  session: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  loop: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  recoveryContinuation: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
};

const START = "2026-09-01T04:00:00.000Z";
const RECOVERY = "2026-09-01T04:10:00.000Z";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir !== undefined) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("C20 goal loop restart recovery", () => {
  it("Given a persisted running loop When the process restarts Then orphan recovery preserves scope and checkpoint facts", () => {
    tempDir = mkdtempSync(join(tmpdir(), "nexora-c20-"));
    const databasePath = join(tempDir, "nexora.sqlite");
    const first = openDatabase(databasePath);
    migrate(first, { now: () => START });
    seedWorkspaceGraph(first);
    new GoalLoopRepository(first).create(goalLoop());
    first.close();

    const restarted = openDatabase(databasePath);
    try {
      migrate(restarted, { now: () => RECOVERY });
      const loops = new GoalLoopRepository(restarted);
      const recovered = loops.recoverOrphans({ workspace_id: IDS.workspace, stale_before: RECOVERY, now: RECOVERY, idempotency_key_prefix: "goal:restart", continuation_id_factory: () => IDS.recoveryContinuation });
      const continuations = new GoalContinuationRepository(restarted).list(IDS.workspace, IDS.loop);

      expect(recovered).toHaveLength(1);
      expect(loops.get(IDS.workspace, IDS.loop)).toMatchObject({ status: "paused", run_id: IDS.run, session_id: IDS.session, continuation_cursor: "turn-2" });
      expect(continuations).toEqual([expect.objectContaining({ id: IDS.recoveryContinuation, workspace_id: IDS.workspace, goal_loop_id: IDS.loop, run_id: IDS.run, session_id: IDS.session, recovery_kind: "orphan_recovery", cursor: "turn-2", descriptor_only: true })]);
    } finally {
      restarted.close();
    }
  });
});

function seedWorkspaceGraph(database: SqliteDatabase): void {
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'Demo', 1, ?, ?)").run(IDS.workspace, START, START);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, '{}', 1, ?, ?)").run(IDS.agent, IDS.workspace, START, START);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'Goal', 'Objective', '[\"done\"]', '{}', 1, ?, ?)").run(IDS.goal, IDS.workspace, START, START);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'ready', 'ticket:c20-recovery', '{}', 1, ?, ?)").run(IDS.ticket, IDS.workspace, IDS.goal, START, START);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.ticket, JSON.stringify(runPayload()), START, START);
  database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'Gateway C20', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(IDS.gateway, IDS.workspace, START, START, START);
  database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'Channel C20', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(IDS.channel, IDS.workspace, IDS.gateway, START, START);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'background', 'active', 'turn-2', NULL, ?, '{}', 1, ?, ?)").run(IDS.session, IDS.workspace, IDS.gateway, IDS.channel, IDS.agent, IDS.run, START, START, START);
}

function runPayload(): object {
  return { id: IDS.run, workspace_id: IDS.workspace, schema_version: 1, created_at: START, updated_at: START, ticket_id: IDS.ticket, execution_location: "local", status: "running", budget: { max_tokens: 10_000, max_cost_usd: 1 }, memory_snapshot: { snapshot_id: IDS.workspace, version: 1 }, connector_versions: { deterministic: "1.0.0" } };
}

function goalLoop(): object {
  return { id: IDS.loop, workspace_id: IDS.workspace, schema_version: 1, created_at: START, updated_at: START, goal_id: IDS.goal, run_id: IDS.run, session_id: IDS.session, parent_loop_id: null, root_loop_id: IDS.loop, status: "running", objective: "Continue across process restarts.", definition_of_done: ["done"], max_turns: 5, turn_count: 2, budget: { max_tokens: 10_000, max_cost_usd: 1 }, deadline_at: "2026-09-01T05:00:00.000Z", continuation_cursor: "turn-2", judge: { done: false, reason: "Continue." }, descriptor_only: true };
}
