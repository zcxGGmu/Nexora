import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactStore, ArtifactStoreError } from "@nexora/artifacts";
import { ReviewDecisionSchema, type PolicyScope } from "@nexora/contracts";
import { ArtifactRepository, IdempotencyRepository, migrate, openDatabase, ReviewRepository } from "@nexora/persistence";
import type { PolicyActor } from "@nexora/policy";
import { ConnectorExecutionError } from "./errors.js";
import { ConnectorIdempotencyGate } from "./idempotency.js";
import { MockDraftConnector, type MockDraftInput } from "./mock-draft-connector.js";
import type { ConnectorAuthorization } from "./connector.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const GOAL_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const TICKET_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const AGENT_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const REVIEW_ID = "01GRZ3NDEKTSV4RRFFQ69G5FAV";
const REVIEWER_ID = "01HRZ3NDEKTSV4RRFFQ69G5FAV";
const RECEIPT_ID = "01JRZ3NDEKTSV4RRFFQ69G5FAV";
const OTHER_ID = "01KRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-27T04:00:00.000Z";
const EXPIRY = "2026-08-27T04:01:00.000Z";
const scope: PolicyScope = { kind: "workspace", id: WORKSPACE_ID };
const actor: PolicyActor = { id: AGENT_ID, role: "Agent", workspace_id: WORKSPACE_ID, allowed_scopes: [scope] };
const policyDecision = { allowed: true, code: null, event_type: null, reason: "Allowed", required_action: "none", redactions: [] } as const;

function seedGraph(database: ReturnType<typeof openDatabase>): void {
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Demo", TIME, TIME);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(AGENT_ID, WORKSPACE_ID, "{}", TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(GOAL_ID, WORKSPACE_ID, "Goal", "Objective", "[]", "{}", TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(TICKET_ID, WORKSPACE_ID, GOAL_ID, "ready", "ticket:c08", "{}", TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(RUN_ID, WORKSPACE_ID, TICKET_ID, "queued", "{}", TIME, TIME);
}

function seedReviewArtifact(database: ReturnType<typeof openDatabase>): void {
  new ArtifactRepository(database).create({ id: ARTIFACT_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, type: "draft", status: "verified", source_ticket: TICKET_ID, source_run: RUN_ID, version: 1, visibility: "workspace", content_ref: "artifact://pending", evidence_refs: [] });
}

function input(content: string): MockDraftInput {
  return {
    workspace_id: WORKSPACE_ID,
    run_id: RUN_ID,
    requested_scope: scope,
    artifact_id: ARTIFACT_ID,
    artifact_version: 1,
    source_ticket: TICKET_ID,
    source_run: RUN_ID,
    source_agent: AGENT_ID,
    model: "deterministic-fixture",
    title: "SEO draft",
    content,
    target_ref: "internal://drafts/acme-growth/seo",
    risk_level: "R3",
    idempotency_key: "connector:mock-draft:seo:v1",
    review_id: REVIEW_ID,
    review_version: 1,
  };
}

function requireAuthorization(authorization: ReturnType<MockDraftConnector["authorize"]>): ConnectorAuthorization {
  if (authorization.kind !== "authorized") throw new Error("Expected connector authorization");
  return authorization;
}

describe("MockDraftConnector", () => {
  it("Given an R3 draft request without approval When authorized Then it returns review_required and writes no artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-artifacts-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const connector = new MockDraftConnector({ artifactStore: new ArtifactStore(database, root, { now: () => TIME }), idempotency: new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME }), clock: { now: () => TIME }, reviewRepository: new ReviewRepository(database) });

    const pending = connector.authorize({ actor, input: input("Approved draft body") });

    expect(pending.kind).toBe("review_required");
    expect(() => connector.readArtifact({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 })).toThrowError(ArtifactStoreError);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given an exact Review decision When the draft executes Then it writes one verified artifact and reuses duplicate requests", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-artifacts-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const connector = new MockDraftConnector({ artifactStore: new ArtifactStore(database, root, { now: () => TIME }), idempotency: new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME }), clock: { now: () => TIME }, reviewRepository: new ReviewRepository(database) });
    const draft = input("Approved draft body");
    const preview = connector.preview(draft);
    const review = ReviewDecisionSchema.parse({ id: REVIEW_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, artifact_id: ARTIFACT_ID, artifact_version: 1, review_version: 1, requested_scope: scope, expires_at: EXPIRY, judge_result: "pass", human_decision: "approved", reviewer_id: REVIEWER_ID, reviewer_role: "Reviewer", reason: "Exact payload reviewed", approved_payload_hash: preview.payload_hash, risk_level: "R3", policy_decision: policyDecision });
    seedReviewArtifact(database);
    new ReviewRepository(database).create(review);

    const authorization = requireAuthorization(connector.authorize({ actor, input: draft }));
    expect(() => connector.execute({ input: draft, authorization: structuredClone(authorization), receipt_id: RECEIPT_ID })).toThrowError(ConnectorExecutionError);
    const forgedAuthorization: ConnectorAuthorization = { kind: "authorized", preview, review, review_ref: "review://forged/v1", artifact_version: 1 };
    for (const symbol of Object.getOwnPropertySymbols(authorization)) Object.defineProperty(forgedAuthorization, symbol, { value: true });
    expect(() => connector.execute({ input: draft, authorization: forgedAuthorization, receipt_id: RECEIPT_ID })).toThrowError(ConnectorExecutionError);
    const first = connector.execute({ input: draft, authorization, receipt_id: RECEIPT_ID });
    const duplicate = connector.execute({ input: draft, authorization, receipt_id: OTHER_ID });

    expect(first.status).toBe("verified");
    expect(duplicate.status).toBe("reused");
    expect(connector.readArtifact({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 }).content).toBe("Approved draft body");

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given a Review decision for an old payload When one character changes Then authorization fails stale before execution", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-artifacts-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const connector = new MockDraftConnector({ artifactStore: new ArtifactStore(database, root, { now: () => TIME }), idempotency: new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME }), clock: { now: () => TIME }, reviewRepository: new ReviewRepository(database) });
    const original = input("Approved draft body");
    const changed = input("Approved draft body.");
    const preview = connector.preview(original);
    const review = ReviewDecisionSchema.parse({ id: REVIEW_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, artifact_id: ARTIFACT_ID, artifact_version: 1, review_version: 1, requested_scope: scope, expires_at: EXPIRY, judge_result: "pass", human_decision: "approved", reviewer_id: REVIEWER_ID, reviewer_role: "Reviewer", reason: "Exact payload reviewed", approved_payload_hash: preview.payload_hash, risk_level: "R3", policy_decision: policyDecision });
    seedReviewArtifact(database);
    new ReviewRepository(database).create(review);

    expect(() => connector.authorize({ actor, input: changed })).toThrowError(ConnectorExecutionError);
    expect(() => connector.readArtifact({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 })).toThrowError(ArtifactStoreError);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given a Review decision with another id When authorized Then it fails stale before artifact write", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-artifacts-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const connector = new MockDraftConnector({ artifactStore: new ArtifactStore(database, root, { now: () => TIME }), idempotency: new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME }), clock: { now: () => TIME }, reviewRepository: new ReviewRepository(database) });
    const draft = input("Approved draft body");
    const preview = connector.preview(draft);
    const review = ReviewDecisionSchema.parse({ id: OTHER_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, artifact_id: ARTIFACT_ID, artifact_version: 1, review_version: 1, requested_scope: scope, expires_at: EXPIRY, judge_result: "pass", human_decision: "approved", reviewer_id: REVIEWER_ID, reviewer_role: "Reviewer", reason: "Exact payload reviewed", approved_payload_hash: preview.payload_hash, risk_level: "R3", policy_decision: policyDecision });
    seedReviewArtifact(database);
    new ReviewRepository(database).create(review);

    expect(connector.authorize({ actor, input: draft }).kind).toBe("review_required");
    expect(() => connector.readArtifact({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 })).toThrowError(ArtifactStoreError);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given persisted Review payload has malformed expiry When authorized Then schema validation blocks artifact write", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-artifacts-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const connector = new MockDraftConnector({ artifactStore: new ArtifactStore(database, root, { now: () => TIME }), idempotency: new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME }), clock: { now: () => TIME }, reviewRepository: new ReviewRepository(database) });
    const draft = input("Approved draft body");
    const preview = connector.preview(draft);
    const review = ReviewDecisionSchema.parse({ id: REVIEW_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, artifact_id: ARTIFACT_ID, artifact_version: 1, review_version: 1, requested_scope: scope, expires_at: EXPIRY, judge_result: "pass", human_decision: "approved", reviewer_id: REVIEWER_ID, reviewer_role: "Reviewer", reason: "Exact payload reviewed", approved_payload_hash: preview.payload_hash, risk_level: "R3", policy_decision: policyDecision });
    seedReviewArtifact(database);
    database.prepare("INSERT INTO review_decisions(id, workspace_id, artifact_id, artifact_version, review_version, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(review.id, review.workspace_id, review.artifact_id, review.artifact_version, review.review_version, JSON.stringify({ ...review, expires_at: "not-a-date" }), review.schema_version, review.created_at, review.updated_at);

    expect(() => connector.authorize({ actor, input: draft })).toThrowError();
    expect(() => connector.readArtifact({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 })).toThrowError(ArtifactStoreError);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given a Review decision that expires now When authorized Then execution is blocked stale before artifact write", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-artifacts-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const connector = new MockDraftConnector({ artifactStore: new ArtifactStore(database, root, { now: () => TIME }), idempotency: new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME }), clock: { now: () => TIME }, reviewRepository: new ReviewRepository(database) });
    const draft = input("Approved draft body");
    const preview = connector.preview(draft);
    const review = ReviewDecisionSchema.parse({ id: REVIEW_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, artifact_id: ARTIFACT_ID, artifact_version: 1, review_version: 1, requested_scope: scope, expires_at: TIME, judge_result: "pass", human_decision: "approved", reviewer_id: REVIEWER_ID, reviewer_role: "Reviewer", reason: "Exact payload reviewed", approved_payload_hash: preview.payload_hash, risk_level: "R3", policy_decision: policyDecision });
    seedReviewArtifact(database);
    new ReviewRepository(database).create(review);

    expect(() => connector.authorize({ actor, input: draft })).toThrowError(ConnectorExecutionError);
    expect(() => connector.readArtifact({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 })).toThrowError(ArtifactStoreError);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });
});
