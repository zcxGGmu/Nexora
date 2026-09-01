import type { FastifyInstance } from "fastify";
import type { SqliteDatabase } from "@nexora/persistence";
import { migrate, openDatabase } from "@nexora/persistence";
import { createLocalBearerToken } from "../plugins/auth.js";
import { createApiServer } from "../server.js";

export const TIME = "2026-08-27T04:00:00.000Z";
export const TOKEN_SECRET = "0123456789abcdef0123456789abcdef";
export const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  otherWorkspace: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  owner: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  agent: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  attempt: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  step: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
  otherStep: "01KRZ3NDEKTSV4RRFFQ69K5FAV",
  job: "01LRZ3NDEKTSV4RRFFQ69L5FAV",
  lease: "01MRZ3NDEKTSV4RRFFQ69M5FAV",
  event0: "01NRZ3NDEKTSV4RRFFQ69N5FAV",
  event1: "01PRZ3NDEKTSV4RRFFQ69P5FAV",
  event2: "01QRZ3NDEKTSV4RRFFQ69Q5FAV",
} as const;

export type ControlFixture = {
  readonly api: FastifyInstance;
  readonly database: SqliteDatabase;
};

export type ControlFixtureOptions = {
  readonly localSessionBootstrap?: boolean;
};

export function createControlFixture(ids: readonly string[] = [], options: ControlFixtureOptions = {}): ControlFixture {
  const database = openDatabase(":memory:");
  migrate(database, { now: () => TIME });
  seedWorkspaceGraph(database);
  const nextId = createIdFactory(ids);
  const api = createApiServer({ version: "0.1.0", database, clock: { now: () => TIME }, idFactory: nextId, auth: { mode: "local", tokenSecret: TOKEN_SECRET }, localSessionBootstrap: { enabled: options.localSessionBootstrap === true } });
  return { api, database };
}

export async function closeControlFixture(fixture: ControlFixture): Promise<void> {
  await fixture.api.close();
  fixture.database.close();
}

export function ownerHeader(workspaceId: string = IDS.workspace): string {
  return createLocalBearerToken({ workspace_id: workspaceId, actor_id: IDS.owner, role: "Owner", tokenSecret: TOKEN_SECRET });
}

export function seedRun(database: SqliteDatabase, status: "queued" | "running" | "failed" = "queued"): void {
  const run = {
    id: IDS.run,
    workspace_id: IDS.workspace,
    schema_version: 1,
    created_at: TIME,
    updated_at: TIME,
    ticket_id: IDS.ticket,
    execution_location: "local",
    status,
    budget: { max_tokens: 10_000, max_cost_usd: 10 },
    memory_snapshot: { snapshot_id: IDS.workspace, version: 1 },
    connector_versions: { deterministic: "1.0.0" },
  };
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.ticket, status, JSON.stringify(run), TIME, TIME);
}

export function seedAttemptStepAndJob(database: SqliteDatabase, stepStatus: "pending" | "failed" = "pending"): void {
  const attempt = { id: IDS.attempt, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, run_id: IDS.run, status: stepStatus === "failed" ? "failed" : "queued" };
  const step = { id: IDS.step, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, run_id: IDS.run, attempt_id: IDS.attempt, agent_id: IDS.agent, status: stepStatus, inputs: ["input://request"], outputs: ["output://result"], retry_policy: { max_attempts: 3, backoff_ms: 100 }, requires_review: false };
  database.prepare("INSERT INTO attempts(id, workspace_id, run_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.attempt, IDS.workspace, IDS.run, attempt.status, JSON.stringify(attempt), TIME, TIME);
  database.prepare("INSERT INTO steps(id, workspace_id, run_id, attempt_id, agent_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.step, IDS.workspace, IDS.run, IDS.attempt, IDS.agent, stepStatus, JSON.stringify(step), TIME, TIME);
  database.prepare("INSERT INTO queue_jobs(id, workspace_id, run_id, step_id, idempotency_key, request_hash, status, available_at, attempts, max_attempts, fencing_token, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, 0, 3, 0, ?, ?, ?)").run(IDS.job, IDS.workspace, IDS.run, IDS.step, "queue:c09", "sha256:queue", TIME, "{}", TIME, TIME);
}

function seedWorkspaceGraph(database: SqliteDatabase): void {
  const agent = { id: IDS.agent, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, purpose: "Coordinate", role: "Agent", allowed_scopes: [{ kind: "workspace", id: IDS.workspace }], runtime: { kind: "local", adapter: "deterministic" }, model_policy: { allowed_models: ["deterministic"], default_model: "deterministic" }, memory_reads: [{ scope: "workspace" }], tools: { allow: ["memory:read"], deny: [] }, handoff_outputs: ["report"], requires_review: false, quality_gates: ["tests"] };
  const goal = { id: IDS.goal, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, title: "Goal", objective: "Objective", definition_of_done: ["done"] };
  const ticket = { id: IDS.ticket, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, status: "ready", definition_of_done: ["done"], assigned_agents: [IDS.agent], approval_policy: { mode: "required" }, idempotency_key: "ticket:c09" };
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(IDS.workspace, "Demo", TIME, TIME);
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(IDS.otherWorkspace, "Other", TIME, TIME);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(IDS.agent, IDS.workspace, JSON.stringify(agent), TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.goal, IDS.workspace, goal.title, goal.objective, JSON.stringify(goal.definition_of_done), JSON.stringify(goal), TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.ticket, IDS.workspace, IDS.goal, ticket.status, ticket.idempotency_key, JSON.stringify(ticket), TIME, TIME);
}

function createIdFactory(ids: readonly string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    if (id === undefined) throw new Error("Test id factory exhausted");
    index += 1;
    return id;
  };
}
