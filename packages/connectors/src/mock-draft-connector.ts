import { ArtifactStore, type ArtifactWithContent } from "@nexora/artifacts";
import {
  ConnectorDescriptorSchema,
  ConnectorExecutionReceiptSchema,
  ConnectorPreviewSchema,
  ConnectorRequestSchema,
  PolicyScopeSchema,
  RiskLevelSchema,
  UlidSchema,
  systemClock,
  z,
  type Clock,
  type ConnectorDescriptor,
  type ConnectorExecutionReceipt,
  type ConnectorPreview,
  type ConnectorReviewRequired,
} from "@nexora/contracts";
import { ReviewRepository } from "@nexora/persistence";
import { evaluateConnectorPolicy } from "@nexora/policy";
import { ConnectorExecutionError } from "./errors.js";
import { connectorHash } from "./hashes.js";
import { ConnectorIdempotencyGate } from "./idempotency.js";
import { draftPayload, requestPayload } from "./mock-draft-payload.js";
import type { ConnectorAuthorization, ConnectorAuthorizationStamp, ConnectorAuthorizeInput, ConnectorExecuteInput, ConnectorLifecycle, CreateConnectorAuthorizationInput } from "./connector.js";
import { evaluateReviewGate, requiresReview } from "./review-gate.js";

const CONNECTOR_ID = "mock-draft";
const CONNECTOR_VERSION = "1.0.0";
const INTERNAL_TARGET_URL = "http://127.0.0.1/mock-draft";
const DESCRIPTOR_WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const issuedAuthorizations = new WeakMap<object, ConnectorAuthorizationStamp>();

const MockDraftInputSchema = z
  .object({
    workspace_id: UlidSchema,
    run_id: UlidSchema,
    requested_scope: PolicyScopeSchema,
    artifact_id: UlidSchema,
    artifact_version: z.number().int().positive(),
    source_ticket: UlidSchema,
    source_run: UlidSchema,
    source_agent: UlidSchema,
    model: z.string().min(1),
    title: z.string().min(1),
    content: z.string().min(1),
    target_ref: z.string().min(1),
    risk_level: RiskLevelSchema,
    idempotency_key: z.string().min(1).max(128),
    review_id: UlidSchema,
    review_version: z.number().int().positive(),
  })
  .strict();

export type MockDraftInput = z.infer<typeof MockDraftInputSchema>;
export type MockDraftAuthorization = ConnectorAuthorization;

export const mockDraftConnectorDescriptor: ConnectorDescriptor = ConnectorDescriptorSchema.parse({
  id: CONNECTOR_ID,
  version: CONNECTOR_VERSION,
  risk_level: "R3",
  data_classification: "internal",
  allowed_scopes: [{ kind: "workspace", id: DESCRIPTOR_WORKSPACE_ID }],
  egress: { execution_location: "local", provider: "internal", region: "local", allowed_providers: ["internal"], allowed_regions: ["local"], minimal_snapshot_required: false },
  input_schema: { schema_version: 1, name: "mock-draft.input" },
  output_schema: { schema_version: 1, name: "mock-draft.output" },
  supports_idempotency: true,
  supports_dry_run: true,
  timeout_seconds: 30,
  retry: { max_attempts: 1, backoff_ms: 0 },
  rollback: "unsupported",
  requires_review: true,
});

export class MockDraftConnector implements ConnectorLifecycle<MockDraftInput, MockDraftAuthorization> {
  readonly descriptor: ConnectorDescriptor;
  private readonly dependencies: { readonly artifactStore: ArtifactStore; readonly idempotency: ConnectorIdempotencyGate; readonly clock?: Clock; readonly reviewRepository?: ReviewRepository };

  constructor(dependencies: { readonly artifactStore: ArtifactStore; readonly idempotency: ConnectorIdempotencyGate; readonly clock?: Clock; readonly descriptor?: ConnectorDescriptor; readonly reviewRepository?: ReviewRepository }) {
    this.dependencies = dependencies;
    this.descriptor = ConnectorDescriptorSchema.parse(dependencies.descriptor ?? mockDraftConnectorDescriptor);
  }

  createInput(input: unknown): MockDraftInput {
    return this.validate(input);
  }

  validate(input: unknown): MockDraftInput {
    return MockDraftInputSchema.parse(input);
  }

  preview(input: MockDraftInput): ConnectorPreview {
    const payloadHash = connectorHash(draftPayload(input));
    const requestHash = connectorHash(requestPayload(input, payloadHash, this.descriptor));
    ConnectorRequestSchema.parse({
      schema_version: 1,
      connector_id: this.descriptor.id,
      connector_version: this.descriptor.version,
      workspace_id: input.workspace_id,
      run_id: input.run_id,
      step_id: null,
      requested_scope: input.requested_scope,
      idempotency_key: input.idempotency_key,
      request_hash: requestHash,
      payload_hash: payloadHash,
      dry_run: false,
      input: { title: input.title, content: input.content, target_ref: input.target_ref },
    });
    return ConnectorPreviewSchema.parse({
      schema_version: 1,
      connector_id: this.descriptor.id,
      connector_version: this.descriptor.version,
      workspace_id: input.workspace_id,
      run_id: input.run_id,
      requested_scope: input.requested_scope,
      artifact_id: input.artifact_id,
      artifact_version: input.artifact_version,
      payload_hash: payloadHash,
      request_hash: requestHash,
      risk_level: this.descriptor.risk_level,
      requires_review: this.descriptor.requires_review || requiresReview(this.descriptor.risk_level),
      target_ref: input.target_ref,
      summary: `Create internal draft artifact: ${input.title}`,
      expires_at: this.clock.now(),
      redactions: [],
    });
  }

  authorize(input: ConnectorAuthorizeInput<MockDraftInput>): MockDraftAuthorization | ConnectorReviewRequired {
    const preview = this.preview(input.input);
    const review = this.dependencies.reviewRepository?.get(input.input.workspace_id, input.input.review_id, input.input.review_version) ?? null;
    const reviewGate = evaluateReviewGate({ preview, review, now: this.clock.now(), review_id: input.input.review_id, review_version: input.input.review_version });
    const decision = evaluateConnectorPolicy({
      actor: input.actor,
      connector: { id: this.descriptor.id, risk_level: preview.risk_level, data_classification: this.descriptor.data_classification, requires_review: preview.requires_review, allowed_scopes: this.descriptor.allowed_scopes },
      requested_scope: preview.requested_scope,
      approval: reviewGate.kind === "approved" ? reviewGate.approval : null,
      egress: { execution_location: this.descriptor.egress.execution_location, provider: this.descriptor.egress.provider, region: this.descriptor.egress.region, data_classification: this.descriptor.data_classification, allowed_providers: this.descriptor.egress.allowed_providers, allowed_regions: this.descriptor.egress.allowed_regions, minimal_snapshot: this.descriptor.egress.minimal_snapshot_required, target_url: INTERNAL_TARGET_URL },
      payload_hash: preview.payload_hash,
    });

    if (!decision.allowed) {
      if (decision.code === "POLICY_REVIEW_REQUIRED") return { kind: "review_required", preview, review_id: input.input.review_id, review_version: input.input.review_version };
      throw new ConnectorExecutionError(decision.code, decision.reason);
    }

    return createConnectorAuthorization({ preview, review: reviewGate.kind === "approved" ? reviewGate.review : null, review_ref: reviewGate.kind === "approved" ? reviewGate.review_ref : null, artifact_version: reviewGate.kind === "approved" ? reviewGate.artifact_version : preview.artifact_version });
  }

  execute(input: ConnectorExecuteInput<MockDraftInput, MockDraftAuthorization>): ConnectorExecutionReceipt {
    const authorizationStamp = connectorAuthorizationStamp(input.authorization);
    if (authorizationStamp === null) throw new ConnectorExecutionError("POLICY_REVIEW_REQUIRED", "Connector authorization was not issued by authorize");
    if (authorizationStamp.requires_review && authorizationStamp.review_ref === null) throw new ConnectorExecutionError("POLICY_REVIEW_REQUIRED", "Reviewed connector execution requires a bound review decision");
    const preview = this.preview(input.input);
    if (preview.request_hash !== authorizationStamp.request_hash || preview.payload_hash !== authorizationStamp.payload_hash) throw new ConnectorExecutionError("REVIEW_STALE", "Connector authorization does not match execution input");
    const receiptRef = `receipt://${input.receipt_id}`;
    const idempotencyInput = { workspace_id: input.input.workspace_id, idempotency_key: input.input.idempotency_key, request_hash: authorizationStamp.request_hash, receipt_ref: receiptRef };
    const reservation = this.dependencies.idempotency.begin(idempotencyInput);
    if (reservation.kind === "reused") return this.reusedReceipt({ input, original_receipt_ref: reservation.receipt_ref, authorization_stamp: authorizationStamp });
    const artifact = this.writeArtifact({ input, receipt_ref: receiptRef, idempotency_input: idempotencyInput, authorization_stamp: authorizationStamp });
    const claim = this.dependencies.idempotency.claim(idempotencyInput);
    if (claim.kind === "reused") throw new ConnectorExecutionError("DUPLICATE_SIDE_EFFECT", "Connector artifact write could not be reconciled with idempotency receipt");

    return ConnectorExecutionReceiptSchema.parse({
      schema_version: 1,
      connector_id: this.descriptor.id,
      connector_version: this.descriptor.version,
      workspace_id: input.input.workspace_id,
      run_id: input.input.run_id,
      receipt_id: input.receipt_id,
      idempotency_key: input.input.idempotency_key,
      request_hash: authorizationStamp.request_hash,
      payload_hash: authorizationStamp.payload_hash,
      artifact_id: input.input.artifact_id,
      artifact_version: artifact.artifact_version,
      status: "verified",
      external_receipt_ref: null,
      side_effects: [{ kind: "artifact_write", reference: artifact.content_ref }],
      verification: { status: "verified", checked_at: this.clock.now(), reason: "Artifact version written and readable" },
    });
  }

  verify(receipt: ConnectorExecutionReceipt): ConnectorExecutionReceipt {
    if (receipt.status === "verified" || receipt.status === "reused") return receipt;
    return ConnectorExecutionReceiptSchema.parse({ ...receipt, status: "verified", verification: { status: "verified", checked_at: this.clock.now(), reason: "Receipt verified" } });
  }

  rollback(_receipt: ConnectorExecutionReceipt): ConnectorExecutionReceipt {
    throw new ConnectorExecutionError("CONNECTOR_UNAVAILABLE", "Mock draft connector rollback is unsupported");
  }

  readArtifact(input: { readonly workspace_id: string; readonly artifact_id: string; readonly version: number }): ArtifactWithContent {
    return this.dependencies.artifactStore.read(input);
  }

  private get clock(): Clock {
    return this.dependencies.clock ?? systemClock;
  }

  private writeArtifact(write: { readonly input: ConnectorExecuteInput<MockDraftInput, MockDraftAuthorization>; readonly receipt_ref: string; readonly idempotency_input: { readonly workspace_id: string; readonly idempotency_key: string; readonly request_hash: string; readonly receipt_ref: string }; readonly authorization_stamp: ConnectorAuthorizationStamp }) {
    try {
      return this.dependencies.artifactStore.write({
        workspace_id: write.input.input.workspace_id,
        artifact_id: write.input.input.artifact_id,
        version: write.authorization_stamp.artifact_version,
        content_type: "markdown",
        content: write.input.input.content,
        source_ticket: write.input.input.source_ticket,
        source_run: write.input.input.source_run,
        source_agent: write.input.input.source_agent,
        model: write.input.input.model,
        receipt_refs: [write.receipt_ref],
        judge_ref: null,
        review_ref: write.authorization_stamp.review_ref,
        parent_artifact_refs: [],
        metadata: { connector_id: this.descriptor.id, connector_version: this.descriptor.version, title: write.input.input.title, target_ref: write.input.input.target_ref, payload_hash: write.authorization_stamp.payload_hash },
      });
    } catch (error) {
      this.dependencies.idempotency.freezeUnknown(write.idempotency_input);
      throw error;
    }
  }

  private reusedReceipt(reuse: { readonly input: ConnectorExecuteInput<MockDraftInput, MockDraftAuthorization>; readonly original_receipt_ref: string; readonly authorization_stamp: ConnectorAuthorizationStamp }): ConnectorExecutionReceipt {
    return ConnectorExecutionReceiptSchema.parse({
      schema_version: 1,
      connector_id: this.descriptor.id,
      connector_version: this.descriptor.version,
      workspace_id: reuse.input.input.workspace_id,
      run_id: reuse.input.input.run_id,
      receipt_id: reuse.input.receipt_id,
      idempotency_key: reuse.input.input.idempotency_key,
      request_hash: reuse.authorization_stamp.request_hash,
      payload_hash: reuse.authorization_stamp.payload_hash,
      artifact_id: reuse.input.input.artifact_id,
      artifact_version: reuse.authorization_stamp.artifact_version,
      status: "reused",
      external_receipt_ref: reuse.original_receipt_ref,
      side_effects: [],
      verification: { status: "verified", checked_at: this.clock.now(), reason: "Idempotent connector receipt reused" },
    });
  }
}

function createConnectorAuthorization(input: CreateConnectorAuthorizationInput): ConnectorAuthorization {
  const authorization = Object.freeze({ kind: "authorized" as const, preview: input.preview, review: input.review, review_ref: input.review_ref, artifact_version: input.artifact_version });
  issuedAuthorizations.set(authorization, { request_hash: input.preview.request_hash, payload_hash: input.preview.payload_hash, requires_review: input.preview.requires_review, review_ref: input.review_ref, artifact_version: input.artifact_version });
  return authorization;
}

function connectorAuthorizationStamp(value: unknown): ConnectorAuthorizationStamp | null {
  if (typeof value !== "object" || value === null) return null;
  return issuedAuthorizations.get(value) ?? null;
}
