import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ArtifactStore } from "../../packages/artifacts/src/index.js";
import type { ReviewDecision } from "../../packages/contracts/src/index.js";
import { ArtifactRepository, IdempotencyRepository, ReceiptRepository, ReviewRepository, RunRepository, migrate, openDatabase, type IdempotencyRecord, type IdempotencyReservation } from "../../packages/persistence/src/index.js";
import { SeoDraftWorkflowEngine, WORKFLOW_RESOURCE_TYPE, WorkflowExecutionError, type SeoDraftWorkflowInput } from "../../packages/workflows/src/index.js";

const TIME = "2026-08-28T04:00:00.000Z";
const EXPIRY = "2026-08-29T04:00:00.000Z";
const ID = {
  agent: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  artifact: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  attempt: "01MRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  receipt: "01JRZ3NDEKTSV4RRFFQ69G5FAV",
  review: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  reviewer: "01HRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
} as const;

describe("C12 SEO draft workflow integration", () => {
  it("Given source GSC fixture data When the workflow runs Then it writes draft artifact receipt judge result and pending review without publishing", () => {
    const context = createContext();
    seedGraph(context.database);
    const engine = context.engine;

    const result = engine.run(seoInput({ idempotency_key: "workflow:seo:demo:v1" }));

    expect(result.kind).toBe("created");
    if (result.kind !== "created") throw new Error("Expected created SEO workflow result");
    expect(result.status).toBe("waiting_review");
    expect(result.publish_disabled).toBe(true);
    expect(result.side_effects).toEqual([{ kind: "artifact_write", reference: result.artifact.content_ref }]);
    expect(result.source_receipt.source_file).toBe("fixtures/gsc/acme-2026-08-28.json");
    expect(result.judge.status).toBe("pass");
    expect(result.review.human_decision).toBe("pending");
    expect(result.review.approved_payload_hash).toBeNull();
    expect(new ReceiptRepository(context.database).get(ID.workspace, ID.receipt)?.validation_results).toContainEqual({ gate: "no_invented_metrics", passed: true });
    expect(new ReviewRepository(context.database).get(ID.workspace, ID.review, 1)?.human_decision).toBe("pending");
    expect(context.artifactStore.read({ workspace_id: ID.workspace, artifact_id: ID.artifact, version: 1 }).content).toContain("## Source receipt");
    expect(new RunRepository(context.database).get(ID.workspace, ID.run)?.status).toBe("waiting_review");

    context.cleanup();
  });

  it("Given an initial invented metric When retry is allowed Then the judge failure is repaired before review", () => {
    const context = createContext();
    seedGraph(context.database);

    const result = context.engine.run(seoInput({ draft_mode: "invent_metric_once", idempotency_key: "workflow:seo:demo:repair" }));

    expect(result.kind).toBe("created");
    if (result.kind !== "created") throw new Error("Expected repaired SEO workflow result");
    expect(result.status).toBe("waiting_review");
    expect(result.judge_history.map((judge) => judge.status)).toEqual(["fail", "pass"]);
    expect(result.revision_count).toBe(1);

    context.cleanup();
  });

  it("Given missing source data When the workflow runs Then it blocks without creating a draft artifact", () => {
    const context = createContext();
    seedGraph(context.database);

    const result = context.engine.run(seoInput({ gsc_rows: [], idempotency_key: "workflow:seo:demo:missing" }));

    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") throw new Error("Expected blocked SEO workflow result");
    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("GSC source fixture returned no rows");
    expect(new ReviewRepository(context.database).get(ID.workspace, ID.review, 1)).toBeUndefined();

    context.cleanup();
  });

  it("Given an expired review handoff When the workflow runs Then it blocks before writing durable facts", () => {
    const context = createContext();
    seedGraph(context.database);

    const result = context.engine.run(seoInput({ expiry_at: TIME, idempotency_key: "workflow:seo:demo:expired" }));

    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") throw new Error("Expected expired SEO workflow result to block");
    expect(result.reason).toBe("SEO review handoff has expired");
    expect(new IdempotencyRepository(context.database).get(ID.workspace, "workflow:seo:demo:expired")).toBeUndefined();
    expect(new ArtifactRepository(context.database).get(ID.workspace, ID.artifact, 1)).toBeUndefined();
    expect(new ReviewRepository(context.database).get(ID.workspace, ID.review, 1)).toBeUndefined();

    context.cleanup();
  });

  it("Given a non-site requested scope When the workflow runs Then it blocks before artifact or review writes", () => {
    const context = createContext();
    seedGraph(context.database);

    const result = context.engine.run(seoInput({ idempotency_key: "workflow:seo:demo:workspace-scope", requested_scope: { kind: "workspace", id: ID.workspace } }));

    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") throw new Error("Expected workspace-scoped SEO workflow result to block");
    expect(result.reason).toBe("SEO draft workflow requires site scope");
    expect(new ReviewRepository(context.database).get(ID.workspace, ID.review, 1)).toBeUndefined();

    context.cleanup();
  });

  it("Given three failed judge attempts When no source-backed draft can be produced Then the run fails and stops retrying", () => {
    const context = createContext();
    seedGraph(context.database);

    const result = context.engine.run(seoInput({ draft_mode: "always_invent_metric", idempotency_key: "workflow:seo:demo:fail" }));

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") throw new Error("Expected failed SEO workflow result");
    expect(result.status).toBe("failed");
    expect(result.attempts).toBe(3);
    expect(result.judge_history.every((judge) => judge.status === "fail")).toBe(true);
    expect(new RunRepository(context.database).get(ID.workspace, ID.run)?.status).toBe("failed");

    context.cleanup();
  });

  it("Given the same workflow command repeats When the idempotency key and request hash match Then no duplicate artifact version is written", () => {
    const context = createContext();
    seedGraph(context.database);
    const input = seoInput({ idempotency_key: "workflow:seo:demo:repeat" });

    const first = context.engine.run(input);
    const second = context.engine.run(input);

    expect(first.kind).toBe("created");
    expect(second.kind).toBe("reused");
    if (first.kind !== "created") throw new Error("Expected first SEO workflow result to create an artifact");
    if (second.kind !== "reused") throw new Error("Expected second SEO workflow result to reuse the artifact");
    expect(second.artifact_ref).toBe(first.artifact.content_ref);
    expect(new IdempotencyRepository(context.database).get(ID.workspace, "workflow:seo:demo:repeat")?.resource_type).toBe(WORKFLOW_RESOURCE_TYPE);

    context.cleanup();
  });

  it("Given another worker already reserved the workflow key When execution retries Then no duplicate durable facts are written", () => {
    const context = createContext({ idempotencyRepository: (database) => new ExistingUnknownIdempotencyRepository(database) });
    seedGraph(context.database);

    expect(() => context.engine.run(seoInput({ idempotency_key: "workflow:seo:demo:in-progress" }))).toThrowError(WorkflowExecutionError);
    expect(new ArtifactRepository(context.database).get(ID.workspace, ID.artifact, 1)).toBeUndefined();
    expect(new ReviewRepository(context.database).get(ID.workspace, ID.review, 1)).toBeUndefined();

    context.cleanup();
  });

  it("Given a durable write fails after reservation When the workflow aborts Then idempotency remains frozen for reconcile", () => {
    const context = createContext({ reviewRepository: (database) => new ThrowingReviewRepository(database) });
    seedGraph(context.database);

    expect(() => context.engine.run(seoInput({ idempotency_key: "workflow:seo:demo:partial-failure" }))).toThrowError("Review write failed");

    expect(new IdempotencyRepository(context.database).get(ID.workspace, "workflow:seo:demo:partial-failure")?.resource_type).toBe("workflow_side_effect_unknown");
    expect(new ArtifactRepository(context.database).get(ID.workspace, ID.artifact, 1)).toBeUndefined();
    expect(new ReceiptRepository(context.database).get(ID.workspace, ID.receipt)).toBeUndefined();
    expect(new ReviewRepository(context.database).get(ID.workspace, ID.review, 1)).toBeUndefined();

    context.cleanup();
  });
});

function createContext(overrides: { readonly idempotencyRepository?: (database: ReturnType<typeof openDatabase>) => IdempotencyRepository; readonly reviewRepository?: (database: ReturnType<typeof openDatabase>) => ReviewRepository } = {}): { readonly artifactStore: ArtifactStore; readonly cleanup: () => void; readonly database: ReturnType<typeof openDatabase>; readonly engine: SeoDraftWorkflowEngine } {
  const root = mkdtempSync(join(tmpdir(), "nexora-c12-seo-"));
  const database = openDatabase(":memory:");
  migrate(database, { now: () => TIME });
  const artifactStore = new ArtifactStore(database, root, { now: () => TIME });
  const engine = new SeoDraftWorkflowEngine({ artifactRepository: new ArtifactRepository(database), artifactStore, clock: { now: () => TIME }, database, idempotencyRepository: overrides.idempotencyRepository?.(database) ?? new IdempotencyRepository(database), receiptRepository: new ReceiptRepository(database), reviewRepository: overrides.reviewRepository?.(database) ?? new ReviewRepository(database), runRepository: new RunRepository(database) });
  return { artifactStore, database, engine, cleanup: () => { database.close(); rmSync(root, { recursive: true, force: true }); } };
}

class ExistingUnknownIdempotencyRepository extends IdempotencyRepository {
  override reserveOrGet(record: IdempotencyRecord): IdempotencyReservation {
    return { kind: "existing", record: { ...record, resource_type: "workflow_side_effect_unknown" } };
  }
}

class ThrowingReviewRepository extends ReviewRepository {
  override create(record: ReviewDecision): ReviewDecision {
    void record;
    throw new Error("Review write failed");
  }
}

function seedGraph(database: ReturnType<typeof openDatabase>): void {
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(ID.workspace, "Demo", TIME, TIME);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(ID.agent, ID.workspace, "{}", TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ID.goal, ID.workspace, "Goal", "Objective", "[]", "{}", TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ID.ticket, ID.workspace, ID.goal, "ready", "ticket:c12", "{}", TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(ID.run, ID.workspace, ID.ticket, "queued", JSON.stringify(runPayload("queued")), TIME, TIME);
}

function seoInput(overrides: Partial<SeoDraftWorkflowInput>): SeoDraftWorkflowInput {
  return {
    artifact_id: ID.artifact,
    attempt_id: ID.attempt,
    draft_mode: "source_backed",
    expiry_at: EXPIRY,
    gsc_rows: [{ clicks: 82, ctr: 0.073, impressions: 2296, position: 12, query: "agent os setup", url: "https://example.test/agent-os" }],
    idempotency_key: "workflow:seo:demo:v1",
    memory_refs: ["memory://Sites/acme.md"],
    receipt_id: ID.receipt,
    requested_scope: { kind: "site", id: "site-acme" },
    review_id: ID.review,
    reviewer_id: ID.reviewer,
    run_id: ID.run,
    site: { canonical_url: "https://example.test/agent-os", id: "site-acme", voice: "plainspoken operator notes" },
    source_agent: ID.agent,
    source_file: "fixtures/gsc/acme-2026-08-28.json",
    target_keyword: "agent os setup",
    ticket_id: ID.ticket,
    workspace_id: ID.workspace,
    ...overrides,
  };
}

function runPayload(status: "queued" | "waiting_review" | "failed") {
  return { id: ID.run, workspace_id: ID.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, ticket_id: ID.ticket, execution_location: "local", status, budget: { max_tokens: 120000, max_cost_usd: 3 }, memory_snapshot: { snapshot_id: ID.goal, version: 1 }, connector_versions: { "gsc.fixture": "1.0.0" } };
}
