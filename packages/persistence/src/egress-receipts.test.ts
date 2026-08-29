import { describe, expect, it } from "vitest";
import { EgressReceiptSchema } from "@nexora/contracts";
import { EgressReceiptRepository, migrate, openDatabase, WorkspaceRepository, AgentRepository, GoalRepository, TicketRepository, RunRepository, AttemptRepository, StepRepository } from "./index.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const AGENT_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-29T02:00:00.000Z";
const HASH = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("egress receipt repository", () => {
  it("Given a remote egress receipt When persisted Then it is queryable by id and run without losing policy metadata", () => {
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const repository = new EgressReceiptRepository(database);

    expect(repository.create(receipt)).toEqual(receipt);
    expect(repository.get(ID, ID)).toEqual(receipt);
    expect(repository.listByRun(ID, ID)).toEqual([receipt]);
    expect(() => repository.create(receipt)).toThrow();
    database.close();
  });
});

const receipt = EgressReceiptSchema.parse({
  schema_version: 1,
  receipt_id: ID,
  workspace_id: ID,
  run_id: ID,
  attempt_id: ID,
  step_id: ID,
  trace_id: ID,
  execution_location: "remote",
  provider: "fixture-provider",
  region: "us-test-1",
  data_classification: "internal",
  redaction_count: 1,
  policy_decision: { allowed: true, code: null, event_type: null, reason: "Allowed", required_action: "none", redactions: [] },
  snapshot_hash: HASH,
  created_at: TIME,
});

function seedGraph(database: ReturnType<typeof openDatabase>): void {
  const meta = { id: ID, workspace_id: ID, schema_version: 1 as const, created_at: TIME, updated_at: TIME };
  new WorkspaceRepository(database).create({ ...meta, name: "Demo" });
  new AgentRepository(database).create({ ...meta, id: AGENT_ID, purpose: "Coordinate", role: "Agent", allowed_scopes: [{ kind: "workspace", id: ID }], runtime: { kind: "local", adapter: "deterministic" }, model_policy: { allowed_models: ["deterministic"], default_model: "deterministic" }, memory_reads: [{ scope: "workspace" }], tools: { allow: ["memory:read"], deny: [] }, handoff_outputs: ["report"], requires_review: false, quality_gates: ["tests"] });
  new GoalRepository(database).create({ ...meta, title: "Goal", objective: "Objective", definition_of_done: ["done"] });
  new TicketRepository(database).create({ ...meta, goal_id: ID, status: "ready", definition_of_done: ["done"], assigned_agents: [AGENT_ID], approval_policy: { mode: "required" }, idempotency_key: "ticket-egress" });
  new RunRepository(database).create({ ...meta, ticket_id: ID, execution_location: "remote", status: "queued", budget: { max_tokens: 10, max_cost_usd: 1 }, memory_snapshot: { snapshot_id: ID, version: 1 }, connector_versions: { remote: "1.0.0" } });
  new AttemptRepository(database).create({ ...meta, run_id: ID, status: "queued", execution_location: "remote" });
  new StepRepository(database).create({ ...meta, run_id: ID, attempt_id: ID, agent_id: AGENT_ID, status: "pending", inputs: ["input://request"], outputs: ["output://result"], retry_policy: { max_attempts: 1, backoff_ms: 0 }, requires_review: false });
}
