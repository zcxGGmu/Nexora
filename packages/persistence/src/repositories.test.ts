import { describe, expect, it } from "vitest";
import {
  AgentProfileSchema, ArtifactSchema, GoalSchema, ReviewDecisionSchema, RunSchema, StepSchema, TicketSchema,
  type AgentProfile, type Artifact, type Goal, type ReviewDecision, type Run, type Step, type Ticket, type Attempt, type Receipt,
} from "@nexora/contracts";
import { openDatabase, migrate } from "./index.js";
import { AgentRepository, ArtifactRepository, AttemptRepository, GoalRepository, IdempotencyRepository, ReviewRepository, RunRepository, StepRepository, TicketRepository, WorkspaceRepository, PersistenceError, ReceiptRepository } from "./repositories/index.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-26T04:00:00.000Z";
const meta = { id: ID, workspace_id: ID, schema_version: 1 as const, created_at: TIME, updated_at: TIME };
const policyDecision = { allowed: true, code: null, event_type: null, reason: "Allowed", required_action: "none", redactions: [] };
const PAYLOAD_HASH = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const agent: AgentProfile = { ...meta, purpose: "Coordinate", role: "Agent", allowed_scopes: [{ kind: "workspace", id: ID }], runtime: { kind: "local", adapter: "test" }, model_policy: { allowed_models: ["test"], default_model: "test" }, memory_reads: [{ scope: "workspace" }], tools: { allow: ["memory:read"], deny: [] }, handoff_outputs: ["report"], requires_review: false, quality_gates: ["tests"] };
const goal: Goal = { ...meta, title: "Goal", objective: "Objective", definition_of_done: ["done"] };
const ticket: Ticket = { ...meta, goal_id: ID, status: "ready", definition_of_done: ["done"], assigned_agents: [ID], approval_policy: { mode: "required" }, idempotency_key: "ticket-1" };
const run: Run = { ...meta, ticket_id: ID, execution_location: "local", status: "queued", budget: { max_tokens: 10, max_cost_usd: 1 }, memory_snapshot: { snapshot_id: ID, version: 1 }, connector_versions: { test: "1.0.0" } };
const attempt: Attempt = { ...meta, run_id: ID, status: "queued" };
const step: Step = { ...meta, run_id: ID, attempt_id: ID, agent_id: ID, status: "pending", inputs: ["input://request"], outputs: ["output://result"], retry_policy: { max_attempts: 1, backoff_ms: 0 }, requires_review: false };
const artifact: Artifact = { ...meta, type: "report", status: "verified", source_ticket: ID, source_run: ID, version: 1, visibility: "workspace", content_ref: "artifact://report", evidence_refs: ["evidence://tests"] };
const receipt: Receipt = { ...meta, run_id: ID, inputs: ["input://request"], tool_calls: [{ tool: "test", status: "succeeded" }], validation_results: [{ gate: "tests", passed: true }], unverified_items: [], side_effects: [] };
const review: ReviewDecision = { ...meta, artifact_id: ID, artifact_version: 1, review_version: 1, requested_scope: { kind: "workspace", id: ID }, expires_at: TIME, judge_result: "pass", human_decision: "approved", reviewer_id: ID, reviewer_role: "Reviewer", reason: "Approved", approved_payload_hash: PAYLOAD_HASH, risk_level: "R3", policy_decision: policyDecision };

describe("contract repositories", () => {
  it("persists and reads a complete scoped graph while preserving immutable attempts and receipts", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    expect(new WorkspaceRepository(database).create({ ...meta, name: "Demo" })).toEqual({ ...meta, name: "Demo" });
    expect(new AgentRepository(database).create(agent)).toEqual(AgentProfileSchema.parse(agent));
    expect(new GoalRepository(database).create(goal)).toEqual(GoalSchema.parse(goal));
    expect(new TicketRepository(database).create(ticket)).toEqual(TicketSchema.parse(ticket));
    expect(new RunRepository(database).create(run)).toEqual(RunSchema.parse(run));
    expect(new AttemptRepository(database).create(attempt)).toEqual(attempt);
    expect(new StepRepository(database).create(step)).toEqual(StepSchema.parse(step));
    expect(new ArtifactRepository(database).create(artifact)).toEqual(ArtifactSchema.parse(artifact));
    expect(new ReceiptRepository(database).create(receipt)).toEqual(receipt);
    expect(new ReviewRepository(database).create(review)).toEqual(ReviewDecisionSchema.parse(review));
    expect(new GoalRepository(database).get(ID, ID)).toEqual(goal);
    expect(new TicketRepository(database).get(ID, ID)).toEqual(ticket);
    expect(new RunRepository(database).get(ID, ID)).toEqual(run);
    expect(new StepRepository(database).get(ID, ID)).toEqual(step);
    expect(new ArtifactRepository(database).get(ID, ID, 1)).toEqual(artifact);
    expect(new ReviewRepository(database).get(ID, ID, 1)).toEqual(review);
    expect(new ReviewRepository(database).latestForArtifactVersion(ID, ID, 1)).toEqual(review);
    expect(new AttemptRepository(database).get(ID, ID)).toEqual(attempt);
    expect(new ReceiptRepository(database).get(ID, ID)).toEqual(receipt);
    database.close();
  });

  it("enforces optimistic versions, workspace scope, and idempotency reuse", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    new WorkspaceRepository(database).create({ ...meta, name: "Demo" });
    new GoalRepository(database).create(goal);
    const repository = new GoalRepository(database);
    expect(repository.get("01BRZ3NDEKTSV4RRFFQ69G5FAV", ID)).toBeUndefined();
    expect(() => repository.update({ ...goal, title: "Changed" }, 2)).toThrowError(PersistenceError);
    expect(repository.update({ ...goal, title: "Changed" }, 1).title).toBe("Changed");
    const idempotency = new IdempotencyRepository(database);
    const record = { workspace_id: ID, idempotency_key: "request-1", request_hash: "hash-1", resource_type: "ticket", resource_id: ID, created_at: TIME };
    expect(idempotency.reserve(record)).toEqual(record);
    expect(idempotency.reserve(record)).toEqual(record);
    expect(() => idempotency.reserve({ ...record, request_hash: "hash-2" })).toThrowError(PersistenceError);
    database.close();
  });

  it("revalidates runtime DTOs before writing", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    const repository = new GoalRepository(database);
    expect(() => repository.create({ ...goal, title: "" })).toThrow();
    database.close();
  });
});
