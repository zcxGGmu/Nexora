import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactStore, ArtifactStoreError } from "../../packages/artifacts/src/index.js";
import { ConnectorExecutionError, ConnectorIdempotencyGate, MockDraftConnector } from "../../packages/connectors/src/index.js";
import type { ConnectorAuthorization } from "../../packages/connectors/src/index.js";
import type { PolicyScope, ReviewDecision } from "../../packages/contracts/src/index.js";
import { ArtifactRepository, IdempotencyRepository, ReviewRepository, migrate, openDatabase } from "../../packages/persistence/src/index.js";
import type { PolicyActor } from "../../packages/policy/src/index.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const GOAL_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const TICKET_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const AGENT_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const REVIEW_ID = "01GRZ3NDEKTSV4RRFFQ69G5FAV";
const REVIEWER_ID = "01HRZ3NDEKTSV4RRFFQ69G5FAV";
const RECEIPT_ID = "01JRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-27T04:00:00.000Z";
const EXPIRY = "2026-08-27T04:01:00.000Z";
const scope: PolicyScope = { kind: "workspace", id: WORKSPACE_ID };
const actor: PolicyActor = { id: AGENT_ID, role: "Agent", workspace_id: WORKSPACE_ID, allowed_scopes: [scope] };
const policyDecision: ReviewDecision["policy_decision"] = { allowed: true, code: null, event_type: null, reason: "Allowed", required_action: "none", redactions: [] };

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

function requireAuthorization(authorization: ReturnType<MockDraftConnector["authorize"]>): ConnectorAuthorization {
  if (authorization.kind !== "authorized") throw new Error("Expected connector authorization");
  return authorization;
}

describe("C08 review gate integration", () => {
  it("Given an approved exact payload When one character changes Then execution is blocked as REVIEW_STALE", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-review-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const store = new ArtifactStore(database, root, { now: () => TIME });
    const reviewRepository = new ReviewRepository(database);
    const connector = new MockDraftConnector({ artifactStore: store, idempotency: new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME }), clock: { now: () => TIME }, reviewRepository });
    const original = connector.createInput({ workspace_id: WORKSPACE_ID, run_id: RUN_ID, requested_scope: scope, artifact_id: ARTIFACT_ID, artifact_version: 1, source_ticket: TICKET_ID, source_run: RUN_ID, source_agent: AGENT_ID, model: "deterministic-fixture", title: "SEO draft", content: "Approved body", target_ref: "internal://drafts/seo", risk_level: "R3", idempotency_key: "connector:mock-draft:seo:v1", review_id: REVIEW_ID, review_version: 1 });
    const changed = connector.createInput({ ...original, content: "Approved body." });
    const preview = connector.preview(original);
    seedReviewArtifact(database);
    const review: ReviewDecision = { id: REVIEW_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, artifact_id: ARTIFACT_ID, artifact_version: 1, review_version: 1, requested_scope: scope, expires_at: EXPIRY, judge_result: "pass", human_decision: "approved", reviewer_id: REVIEWER_ID, reviewer_role: "Reviewer", reason: "Exact payload reviewed", approved_payload_hash: preview.payload_hash, risk_level: "R3", policy_decision: policyDecision };
    reviewRepository.create(review);

    expect(reviewRepository.latestForArtifactVersion(WORKSPACE_ID, ARTIFACT_ID, 1)).toEqual(review);
    expect(() => connector.authorize({ actor, input: changed })).toThrowError(ConnectorExecutionError);
    expect(() => store.read({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 })).toThrowError(ArtifactStoreError);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given the exact approved payload When executed twice Then idempotency returns the same receipt reference", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-review-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const reviewRepository = new ReviewRepository(database);
    const connector = new MockDraftConnector({ artifactStore: new ArtifactStore(database, root, { now: () => TIME }), idempotency: new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME }), clock: { now: () => TIME }, reviewRepository });
    const draft = connector.createInput({ workspace_id: WORKSPACE_ID, run_id: RUN_ID, requested_scope: scope, artifact_id: ARTIFACT_ID, artifact_version: 1, source_ticket: TICKET_ID, source_run: RUN_ID, source_agent: AGENT_ID, model: "deterministic-fixture", title: "SEO draft", content: "Approved body", target_ref: "internal://drafts/seo", risk_level: "R3", idempotency_key: "connector:mock-draft:seo:v1", review_id: REVIEW_ID, review_version: 1 });
    const preview = connector.preview(draft);
    const review: ReviewDecision = { id: REVIEW_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, artifact_id: ARTIFACT_ID, artifact_version: 1, review_version: 1, requested_scope: scope, expires_at: EXPIRY, judge_result: "pass", human_decision: "approved", reviewer_id: REVIEWER_ID, reviewer_role: "Reviewer", reason: "Exact payload reviewed", approved_payload_hash: preview.payload_hash, risk_level: "R3", policy_decision: policyDecision };
    seedReviewArtifact(database);
    reviewRepository.create(review);
    const authorization = requireAuthorization(connector.authorize({ actor, input: draft }));

    const first = connector.execute({ input: draft, authorization, receipt_id: RECEIPT_ID });
    const second = connector.execute({ input: draft, authorization, receipt_id: "01KRZ3NDEKTSV4RRFFQ69G5FAV" });

    expect(first.receipt_id).toBe(RECEIPT_ID);
    expect(second.status).toBe("reused");
    expect(second.external_receipt_ref).toBe(`receipt://${RECEIPT_ID}`);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });
});
