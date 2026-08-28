import { describe, expect, it } from "vitest";
import { ConnectorExecutionReceiptSchema, ConnectorPreviewSchema, ConnectorRequestSchema, ConnectorReviewRequiredSchema } from "./connectors.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const STEP_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const PAYLOAD_HASH = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const REQUEST_HASH = "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const TIME = "2026-08-27T04:00:00.000Z";
const scope = { kind: "workspace", id: ID } as const;

describe("C08 connector lifecycle contracts", () => {
  it("Given a connector request When parsed Then it binds descriptor version, scope, hashes, and idempotency key", () => {
    const request = ConnectorRequestSchema.parse({
      schema_version: 1,
      connector_id: "mock-draft",
      connector_version: "1.0.0",
      workspace_id: ID,
      run_id: RUN_ID,
      step_id: STEP_ID,
      requested_scope: scope,
      idempotency_key: "connector:mock-draft:ticket-1:v1",
      request_hash: REQUEST_HASH,
      payload_hash: PAYLOAD_HASH,
      dry_run: false,
      input: { title: "Draft", target_ref: "internal://drafts/seo" },
    });

    expect(request.request_hash).toBe(REQUEST_HASH);
    expect(request.requested_scope).toEqual(scope);
  });

  it("Given a site workflow request When parsed Then site scope can bind non-ULID site identifiers", () => {
    const request = ConnectorRequestSchema.parse({
      schema_version: 1,
      connector_id: "gsc.fixture",
      connector_version: "1.0.0",
      workspace_id: ID,
      run_id: RUN_ID,
      step_id: STEP_ID,
      requested_scope: { kind: "site", id: "site-acme" },
      idempotency_key: "connector:gsc:site-acme:v1",
      request_hash: REQUEST_HASH,
      payload_hash: PAYLOAD_HASH,
      dry_run: true,
      input: { source_file: "fixtures/gsc/acme.json" },
    });

    expect(request.requested_scope).toEqual({ kind: "site", id: "site-acme" });
  });

  it("Given a connector preview When review is required Then the pending payload carries the exact artifact and payload hash", () => {
    const preview = ConnectorPreviewSchema.parse({
      schema_version: 1,
      connector_id: "mock-draft",
      connector_version: "1.0.0",
      workspace_id: ID,
      run_id: RUN_ID,
      requested_scope: scope,
      artifact_id: ARTIFACT_ID,
      artifact_version: 1,
      payload_hash: PAYLOAD_HASH,
      request_hash: REQUEST_HASH,
      risk_level: "R3",
      requires_review: true,
      target_ref: "internal://drafts/seo",
      summary: "Create internal SEO draft artifact",
      expires_at: TIME,
      redactions: [],
    });

    expect(ConnectorReviewRequiredSchema.parse({ kind: "review_required", preview, review_id: ID, review_version: 1 }).preview.payload_hash).toBe(PAYLOAD_HASH);
  });

  it("Given an execution receipt When parsed Then it records verification and side-effect uncertainty explicitly", () => {
    const receipt = ConnectorExecutionReceiptSchema.parse({
      schema_version: 1,
      connector_id: "mock-draft",
      connector_version: "1.0.0",
      workspace_id: ID,
      run_id: RUN_ID,
      receipt_id: ID,
      idempotency_key: "connector:mock-draft:ticket-1:v1",
      request_hash: REQUEST_HASH,
      payload_hash: PAYLOAD_HASH,
      artifact_id: ARTIFACT_ID,
      artifact_version: 1,
      status: "side_effect_unknown",
      external_receipt_ref: null,
      side_effects: [{ kind: "artifact_write", reference: "artifact://Artifacts/draft" }],
      verification: { status: "unknown", checked_at: TIME, reason: "verify timed out" },
    });

    expect(receipt.status).toBe("side_effect_unknown");
    expect(ConnectorExecutionReceiptSchema.safeParse({ ...receipt, status: "sent" }).success).toBe(false);
  });
});
