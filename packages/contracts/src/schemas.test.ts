import { describe, expect, it } from "vitest";
import {
  AgentProfileSchema, ArtifactSchema, AttemptSchema, ConnectorDescriptorSchema,
  GoalSchema, ReceiptSchema, ReviewDecisionSchema, RunSchema, StepSchema, TicketSchema,
  systemClock, type Clock,
} from "./index.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-26T04:00:00.000Z";
const meta = { id: ID, workspace_id: ID, schema_version: 1, created_at: TIME, updated_at: TIME };
const policyDecision = { allowed: true, code: null, event_type: null, reason: "Allowed", required_action: "none", redactions: [] };
const PAYLOAD_HASH = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const fixtures = {
  agent: { ...meta, purpose: "Coordinate work", role: "Agent", allowed_scopes: [{ kind: "workspace", id: ID }], runtime: { kind: "local", adapter: "codex" }, model_policy: { allowed_models: ["gpt-5"], default_model: "gpt-5" }, memory_reads: [{ scope: "workspace" }], tools: { allow: ["memory:read", "connector:execute"], deny: ["workspace:admin"] }, handoff_outputs: ["artifact"], requires_review: true, quality_gates: ["tests"] },
  goal: { ...meta, title: "Ship C01", objective: "Define contracts", definition_of_done: ["tests pass"] },
  ticket: { ...meta, goal_id: ID, status: "ready", definition_of_done: ["schema published"], assigned_agents: [ID], approval_policy: { mode: "required" }, idempotency_key: "ticket-c01" },
  run: { ...meta, ticket_id: ID, execution_location: "local", status: "queued", budget: { max_tokens: 1000, max_cost_usd: 1 }, memory_snapshot: { snapshot_id: ID, version: 1 }, connector_versions: { github: "1.0.0" } },
  attempt: { ...meta, run_id: ID, status: "queued" },
  step: { ...meta, run_id: ID, attempt_id: ID, agent_id: ID, status: "pending", inputs: ["input://request"], outputs: ["output://result"], retry_policy: { max_attempts: 1, backoff_ms: 0 }, requires_review: false },
  artifact: { ...meta, type: "report", status: "verified", source_ticket: ID, source_run: ID, version: 1, visibility: "workspace", content_ref: "artifact://c01", evidence_refs: ["evidence://tests"] },
  receipt: { ...meta, run_id: ID, inputs: ["input://request"], tool_calls: [{ tool: "pnpm", status: "succeeded" }], validation_results: [{ gate: "tests", passed: true }], unverified_items: [], side_effects: [{ kind: "file_write", reference: "packages/contracts" }] },
  review: { ...meta, artifact_id: ID, artifact_version: 1, review_version: 1, requested_scope: { kind: "workspace", id: ID }, expires_at: TIME, judge_result: "pass", human_decision: "approved_with_edits", reviewer_id: ID, reviewer_role: "Reviewer", reason: "Meets gates", approved_payload_hash: PAYLOAD_HASH, risk_level: "R3", policy_decision: policyDecision },
  connector: { id: "github", version: "1.0.0", risk_level: "R1", data_classification: "internal", allowed_scopes: [{ kind: "workspace", id: ID }], egress: { execution_location: "remote", provider: "github", region: "us", allowed_providers: ["github"], allowed_regions: ["us"], minimal_snapshot_required: true }, input_schema: { schema_version: 1, name: "github.input" }, output_schema: { schema_version: 1, name: "github.output" }, supports_idempotency: true, supports_dry_run: true, timeout_seconds: 30, retry: { max_attempts: 3, backoff_ms: 100 }, rollback: "supported", requires_review: false },
} as const;

describe("persisted domain schemas", () => {
  it.each([
    [AgentProfileSchema, fixtures.agent], [GoalSchema, fixtures.goal], [TicketSchema, fixtures.ticket],
    [RunSchema, fixtures.run], [AttemptSchema, fixtures.attempt], [StepSchema, fixtures.step],
    [ArtifactSchema, fixtures.artifact], [ReceiptSchema, fixtures.receipt], [ReviewDecisionSchema, fixtures.review],
  ])("accepts a valid minimal fixture %#", (schema, fixture) => {
    // Given / When / Then
    expect(schema.parse(fixture)).toEqual(fixture);
  });

  it.each([AgentProfileSchema, GoalSchema, TicketSchema, RunSchema, AttemptSchema, StepSchema, ArtifactSchema, ReceiptSchema, ReviewDecisionSchema])("rejects missing workspace metadata %#", (schema) => {
    // Given
    const { workspace_id: omitted, ...candidate } = fixtures.goal;
    void omitted;

    // When / Then
    expect(schema.safeParse(candidate).success).toBe(false);
  });

  it("rejects illegal entity statuses", () => {
    // Given / When / Then
    expect(TicketSchema.safeParse({ ...fixtures.ticket, status: "waiting_review" }).success).toBe(false);
    expect(RunSchema.safeParse({ ...fixtures.run, status: "done" }).success).toBe(false);
    expect(AttemptSchema.safeParse({ ...fixtures.attempt, status: "succeeded" }).success).toBe(false);
    expect(StepSchema.safeParse({ ...fixtures.step, status: "queued" }).success).toBe(false);
  });

  it("accepts documented artifact and review lifecycle values", () => {
    for (const status of ["draft", "verified", "approved", "published", "superseded", "side_effect_unknown"] as const) {
      expect(ArtifactSchema.safeParse({ ...fixtures.artifact, status }).success).toBe(true);
    }
    expect(ReviewDecisionSchema.safeParse({ ...fixtures.review, human_decision: "approved" }).success).toBe(true);
    expect(ReviewDecisionSchema.safeParse({ ...fixtures.review, human_decision: "approved_with_edits" }).success).toBe(true);
    for (const decision of ["rejected", "changes_requested", "pending"] as const) {
      expect(ReviewDecisionSchema.safeParse({ ...fixtures.review, human_decision: decision, approved_payload_hash: null }).success).toBe(true);
    }
  });

  it("rejects invalid persisted R3 approval states", () => {
    expect(ReviewDecisionSchema.safeParse({ ...fixtures.review, reviewer_role: "Agent" }).success).toBe(false);
    expect(ReviewDecisionSchema.safeParse({ ...fixtures.review, approved_payload_hash: null }).success).toBe(false);
    expect(ReviewDecisionSchema.safeParse({ ...fixtures.review, human_decision: "pending", approved_payload_hash: PAYLOAD_HASH }).success).toBe(false);
    expect(ReviewDecisionSchema.safeParse({ ...fixtures.review, approved_payload_hash: "sha256:new" }).success).toBe(false);
  });

  it("rejects unknown top-level and known nested fields", () => {
    // Given / When / Then
    expect(GoalSchema.safeParse({ ...fixtures.goal, surprise: true }).success).toBe(false);
    expect(AgentProfileSchema.safeParse({ ...fixtures.agent, tools: { ...fixtures.agent.tools, surprise: true } }).success).toBe(false);
  });

  it.each([0, 2])("rejects persisted schema version %s", (schemaVersion) => {
    // Given / When / Then
    expect(GoalSchema.safeParse({ ...fixtures.goal, schema_version: schemaVersion }).success).toBe(false);
  });

  it("rejects invalid UTC timestamps", () => {
    // Given / When / Then
    expect(GoalSchema.safeParse({ ...fixtures.goal, created_at: "2026-08-26 04:00:00" }).success).toBe(false);
    expect(GoalSchema.safeParse({ ...fixtures.goal, created_at: "2026-02-31T04:00:00.000Z" }).success).toBe(false);
    expect(GoalSchema.safeParse({ ...fixtures.goal, created_at: "2026-04-31T04:00:00.000Z" }).success).toBe(false);
    expect(GoalSchema.safeParse({ ...fixtures.goal, updated_at: "2026-08-26T12:00:00+08:00" }).success).toBe(false);
  });
});

describe("clock", () => {
  it("uses an injectable fixed clock and serializes system time as UTC ISO-8601", () => {
    // Given
    const fixedClock: Clock = { now: () => TIME };

    // When / Then
    expect(fixedClock.now()).toBe(TIME);
    expect(systemClock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("connector descriptor", () => {
  it("accepts the strict minimal descriptor", () => {
    // Given / When / Then
    expect(ConnectorDescriptorSchema.parse(fixtures.connector)).toEqual(fixtures.connector);
  });

  it.each([
    { ...fixtures.connector, risk_level: "R4" },
    { ...fixtures.connector, timeout_seconds: 0 },
    { ...fixtures.connector, timeout_seconds: Infinity },
    { ...fixtures.connector, version: "latest" },
    { ...fixtures.connector, input_schema: { schema_version: 2, name: "old" } },
    { ...fixtures.connector, retry: { max_attempts: 1, backoff_ms: 0, jitter: true } },
    { ...fixtures.connector, retry_policy: { max_attempts: 1, backoff_ms: 0 } },
    { ...fixtures.connector, extra: true },
  ])("rejects invalid connector values %#", (candidate) => {
    // Given / When / Then
    expect(ConnectorDescriptorSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects nested secret objects in C01 reference fields", () => {
    expect(StepSchema.safeParse({ ...fixtures.step, inputs: [{ secret: "value" }] }).success).toBe(false);
    expect(ReceiptSchema.safeParse({ ...fixtures.receipt, inputs: [{ secret: "value" }] }).success).toBe(false);
  });

  it("rejects non-finite or excessive budget costs", () => {
    expect(RunSchema.safeParse({ ...fixtures.run, budget: { ...fixtures.run.budget, max_cost_usd: Infinity } }).success).toBe(false);
    expect(RunSchema.safeParse({ ...fixtures.run, budget: { ...fixtures.run.budget, max_cost_usd: 1000000001 } }).success).toBe(false);
  });

  it("rejects unbounded connector version maps", () => {
    expect(RunSchema.safeParse({ ...fixtures.run, connector_versions: { "bad key": "latest" } }).success).toBe(false);
  });
});
