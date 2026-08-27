import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArtifactStore, ArtifactStoreError } from "@nexora/artifacts";
import { ReviewDecisionSchema, type PolicyScope, type ReviewDecision } from "@nexora/contracts";
import { ArtifactRepository, IdempotencyRepository, migrate, openDatabase, ReviewRepository } from "@nexora/persistence";
import type { PolicyActor } from "@nexora/policy";
import { describe, expect, it } from "vitest";
import type { ConnectorAuthorization } from "./connector.js";
import { ConnectorExecutionError } from "./errors.js";
import { ConnectorIdempotencyGate } from "./idempotency.js";
import { MockDraftConnector, mockDraftConnectorDescriptor } from "./mock-draft-connector.js";

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

function createConnector(root: string, database: ReturnType<typeof openDatabase>, riskLevel: "R0" | "R1" | "R2" | "R3" = "R3"): MockDraftConnector {
  const descriptor = { ...mockDraftConnectorDescriptor, risk_level: riskLevel, requires_review: riskLevel === "R3" };
  return new MockDraftConnector({ artifactStore: new ArtifactStore(database, root, { now: () => TIME }), idempotency: new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME }), clock: { now: () => TIME }, descriptor, reviewRepository: new ReviewRepository(database) });
}

function draftInput(riskLevel: "R0" | "R1" | "R2" | "R3") {
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
    content: "Approved draft body",
    target_ref: "internal://drafts/acme-growth/seo",
    risk_level: riskLevel,
    idempotency_key: `connector:mock-draft:seo:${riskLevel}`,
    review_id: REVIEW_ID,
    review_version: 1,
  };
}

function requireAuthorization(authorization: ReturnType<MockDraftConnector["authorize"]>): ConnectorAuthorization {
  if (authorization.kind !== "authorized") throw new Error("Expected connector authorization");
  return authorization;
}

describe("Connector lifecycle", () => {
  it("Given connector modules When inspected Then authorization minting helpers are not exported", async () => {
    const publicModule = await import("./index.js");
    const contractModule = await import("./connector.js");

    expect(Object.keys(publicModule)).not.toContain("createConnectorAuthorization");
    expect(Object.keys(publicModule)).not.toContain("connectorAuthorizationStamp");
    expect(Object.keys(contractModule)).not.toContain("createConnectorAuthorization");
    expect(Object.keys(contractModule)).not.toContain("connectorAuthorizationStamp");
  });

  it("Given an R1 draft request When executed without review Then the lifecycle writes and verifies an artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-lifecycle-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const connector = createConnector(root, database, "R1");
    const draft = connector.createInput(draftInput("R1"));
    const preview = connector.preview(draft);
    const authorization = requireAuthorization(connector.authorize({ actor, input: draft }));
    const receipt = connector.execute({ input: draft, authorization, receipt_id: RECEIPT_ID });

    expect(preview.requires_review).toBe(false);
    expect(receipt.status).toBe("verified");
    expect(connector.verify(receipt)).toEqual(receipt);
    expect(connector.readArtifact({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 }).content).toBe("Approved draft body");
    expect(() => connector.rollback(receipt)).toThrowError(ConnectorExecutionError);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given an R2 draft request without review When authorized Then it returns review_required and writes no artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-lifecycle-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const connector = createConnector(root, database, "R2");
    const draft = connector.createInput(draftInput("R2"));
    const pending = connector.authorize({ actor, input: draft });

    expect(pending.kind).toBe("review_required");
    expect(() => connector.readArtifact({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 })).toThrowError(ArtifactStoreError);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given caller input downgrades risk When previewed Then descriptor risk still requires review", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-lifecycle-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const connector = createConnector(root, database, "R3");
    const draft = connector.createInput(draftInput("R0"));
    const preview = connector.preview(draft);
    const pending = connector.authorize({ actor, input: draft });

    expect(preview.risk_level).toBe("R3");
    expect(preview.requires_review).toBe(true);
    expect(pending.kind).toBe("review_required");

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given a caller supplies an unpersisted Review decision When authorized Then it still requires review", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-lifecycle-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const connector = createConnector(root, database, "R3");
    const draft = connector.createInput(draftInput("R3"));
    const preview = connector.preview(draft);
    const review = ReviewDecisionSchema.parse({ id: REVIEW_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, artifact_id: ARTIFACT_ID, artifact_version: 1, review_version: 1, requested_scope: scope, expires_at: EXPIRY, judge_result: "pass", human_decision: "approved", reviewer_id: REVIEWER_ID, reviewer_role: "Reviewer", reason: "Forged review object", approved_payload_hash: preview.payload_hash, risk_level: "R3", policy_decision: policyDecision });
    const forgedAuthorizeInput = { actor, input: draft, review };

    const pending = connector.authorize(forgedAuthorizeInput);

    expect(pending.kind).toBe("review_required");
    expect(() => connector.readArtifact({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 })).toThrowError(ArtifactStoreError);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given approved edits When executed Then the connector writes the next artifact version", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-lifecycle-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const connector = createConnector(root, database);
    const draft = connector.createInput(draftInput("R3"));
    const preview = connector.preview(draft);
    const review = ReviewDecisionSchema.parse({ id: REVIEW_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, artifact_id: ARTIFACT_ID, artifact_version: 1, review_version: 1, requested_scope: scope, expires_at: EXPIRY, judge_result: "pass", human_decision: "approved_with_edits", reviewer_id: REVIEWER_ID, reviewer_role: "Reviewer", reason: "Exact edited payload reviewed", approved_payload_hash: preview.payload_hash, risk_level: "R3", policy_decision: policyDecision });
    seedReviewArtifact(database);
    new ReviewRepository(database).create(review);
    const authorization = requireAuthorization(connector.authorize({ actor, input: draft }));
    const receipt = connector.execute({ input: draft, authorization, receipt_id: RECEIPT_ID });

    expect(receipt.artifact_version).toBe(2);
    expect(connector.readArtifact({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 2 }).content).toBe("Approved draft body");
    expect(() => connector.readArtifact({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 })).toThrowError(ArtifactStoreError);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given an artifact write failure When retried Then idempotency freezes the key until reconcile", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-c08-lifecycle-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const artifactStore = new ArtifactStore(database, root, { now: () => TIME });
    artifactStore.write({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1, content_type: "markdown", content: "Existing", source_ticket: TICKET_ID, source_run: RUN_ID, source_agent: AGENT_ID, model: "deterministic-fixture", receipt_refs: ["receipt://existing"], judge_ref: null, review_ref: null, parent_artifact_refs: [], metadata: { title: "Existing" } });
    const descriptor = { ...mockDraftConnectorDescriptor, risk_level: "R1" as const, requires_review: false };
    const connector = new MockDraftConnector({ artifactStore, idempotency: new ConnectorIdempotencyGate(new IdempotencyRepository(database), { now: () => TIME }), clock: { now: () => TIME }, descriptor, reviewRepository: new ReviewRepository(database) });
    const draft = connector.createInput(draftInput("R1"));
    const authorization = requireAuthorization(connector.authorize({ actor, input: draft }));

    expect(() => connector.execute({ input: draft, authorization, receipt_id: RECEIPT_ID })).toThrowError(ArtifactStoreError);
    expect(() => connector.execute({ input: draft, authorization, receipt_id: "01KRZ3NDEKTSV4RRFFQ69G5FAV" })).toThrowError(ConnectorExecutionError);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });
});
