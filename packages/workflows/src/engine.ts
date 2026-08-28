import { ArtifactStore, sha256Content, type ArtifactWithContent } from "@nexora/artifacts";
import { connectorHash, createSeoDraftMarkdown, judgeSeoDraft, readGscFixture, type SeoJudgeResult, type SeoSourceReceipt } from "@nexora/connectors";
import { PolicyScopeSchema, ReceiptSchema, ReviewDecisionSchema, RunStatusSchema, TimestampSchema, UlidSchema, z, type ArtifactVersion, type Clock, type Receipt, type ReviewDecision } from "@nexora/contracts";
import { withTransaction, type ArtifactRepository, type IdempotencyRepository, type ReceiptRepository, type ReviewRepository, type RunRepository, type SqliteDatabase } from "@nexora/persistence";
import type { ConnectorJson } from "@nexora/connectors";
import { createSeoDraftHandoff, type SeoDraftHandoff } from "./handoff.js";
import { SEO_DRAFT_WORKFLOW } from "./templates/seo-draft-v1.js";

export const WORKFLOW_RESOURCE_TYPE = "workflow_seo_draft_artifact";
const WORKFLOW_UNKNOWN_RESOURCE_TYPE = "workflow_side_effect_unknown";
const ARTIFACT_VERSION = 1;
const REVIEW_VERSION = 1;

const GscRowSchema = z.object({ clicks: z.number().int().nonnegative(), ctr: z.number().finite().nonnegative(), impressions: z.number().int().nonnegative(), position: z.number().finite().positive(), query: z.string().min(1), url: z.string().url() }).strict();

export const SeoDraftWorkflowInputSchema = z
  .object({
    workspace_id: UlidSchema,
    ticket_id: UlidSchema,
    run_id: UlidSchema,
    attempt_id: UlidSchema,
    source_agent: UlidSchema,
    artifact_id: UlidSchema,
    receipt_id: UlidSchema,
    review_id: UlidSchema,
    reviewer_id: UlidSchema,
    requested_scope: PolicyScopeSchema,
    source_file: z.string().min(1),
    target_keyword: z.string().min(1),
    site: z.object({ id: z.string().min(1), canonical_url: z.string().url(), voice: z.string().min(1) }).strict(),
    gsc_rows: z.array(GscRowSchema),
    memory_refs: z.array(z.string().min(1)),
    expiry_at: TimestampSchema,
    idempotency_key: z.string().min(1).max(128),
    draft_mode: z.enum(["source_backed", "invent_metric_once", "always_invent_metric"]).default("source_backed"),
  })
  .strict();

export type SeoDraftWorkflowInput = z.infer<typeof SeoDraftWorkflowInputSchema>;
export type SeoDraftWorkflowResult =
  | { readonly kind: "created"; readonly status: "waiting_review"; readonly publish_disabled: true; readonly side_effects: readonly { readonly kind: "artifact_write"; readonly reference: string }[]; readonly artifact: ArtifactVersion; readonly artifact_content: ArtifactWithContent; readonly source_receipt: SeoSourceReceipt; readonly receipt: Receipt; readonly judge: SeoJudgeResult; readonly judge_history: readonly SeoJudgeResult[]; readonly review: ReviewDecision; readonly handoff: SeoDraftHandoff; readonly revision_count: number }
  | { readonly kind: "blocked"; readonly status: "blocked"; readonly reason: string }
  | { readonly kind: "failed"; readonly status: "failed"; readonly attempts: number; readonly judge_history: readonly SeoJudgeResult[] }
  | { readonly kind: "reused"; readonly status: "waiting_review"; readonly artifact_ref: string };

export class SeoDraftWorkflowEngine {
  private readonly dependencies: { readonly artifactRepository: ArtifactRepository; readonly artifactStore: ArtifactStore; readonly clock: Clock; readonly database: SqliteDatabase; readonly idempotencyRepository: IdempotencyRepository; readonly receiptRepository: ReceiptRepository; readonly reviewRepository: ReviewRepository; readonly runRepository: RunRepository };

  constructor(dependencies: { readonly artifactRepository: ArtifactRepository; readonly artifactStore: ArtifactStore; readonly clock: Clock; readonly database: SqliteDatabase; readonly idempotencyRepository: IdempotencyRepository; readonly receiptRepository: ReceiptRepository; readonly reviewRepository: ReviewRepository; readonly runRepository: RunRepository }) {
    this.dependencies = dependencies;
  }

  run(rawInput: SeoDraftWorkflowInput): SeoDraftWorkflowResult {
    const input = SeoDraftWorkflowInputSchema.parse(rawInput);
    const boundaryBlock = this.blockedBoundary(input);
    if (boundaryBlock !== null) return boundaryBlock;
    const sourceReceipt = readGscFixture({ rows: input.gsc_rows, source_file: input.source_file, target_keyword: input.target_keyword });
    if (sourceReceipt.rows.length === 0) return { kind: "blocked", status: "blocked", reason: "GSC source fixture returned no rows" };

    const draft = this.createPassingDraft(input, sourceReceipt);
    if (draft.kind === "failed") {
      this.updateRunStatus(input, "failed");
      return { kind: "failed", status: "failed", attempts: draft.judge_history.length, judge_history: draft.judge_history };
    }

    const contentRef = artifactContentRef(input.artifact_id, ARTIFACT_VERSION, draft.content);
    const requestHash = workflowRequestHash(input, contentRef);
    const receiptRef = `receipt://${input.receipt_id}`;
    const reviewRef = `review://${input.review_id}/v${REVIEW_VERSION}`;
    const judgeRef = draft.judge.judge_ref;
    const reservation = this.dependencies.idempotencyRepository.reserveOrGet({ workspace_id: input.workspace_id, idempotency_key: input.idempotency_key, request_hash: requestHash, resource_type: WORKFLOW_UNKNOWN_RESOURCE_TYPE, resource_id: contentRef, created_at: this.now() });
    if (reservation.kind === "existing") return reusedResult(reservation.record.request_hash, requestHash, reservation.record.resource_type, reservation.record.resource_id);

    const written = withTransaction(this.dependencies.database, () => {
      const artifact = this.writeArtifact(input, draft.content, receiptRef, judgeRef, reviewRef);
      const receipt = this.writeReceipt(input, sourceReceipt, draft.judge, artifact.content_ref);
      const review = this.writeReview(input, artifact, draft.judge);
      this.updateRunStatus(input, "waiting_review");
      this.dependencies.idempotencyRepository.replaceResource({ workspace_id: input.workspace_id, idempotency_key: input.idempotency_key, request_hash: requestHash, from_resource_type: WORKFLOW_UNKNOWN_RESOURCE_TYPE, to_resource_type: WORKFLOW_RESOURCE_TYPE, resource_id: contentRef });
      return { artifact, receipt, review };
    });

    return { kind: "created", status: "waiting_review", publish_disabled: true, side_effects: [{ kind: "artifact_write", reference: written.artifact.content_ref }], artifact: written.artifact, artifact_content: this.dependencies.artifactStore.read({ workspace_id: input.workspace_id, artifact_id: input.artifact_id, version: ARTIFACT_VERSION }), source_receipt: sourceReceipt, receipt: written.receipt, judge: draft.judge, judge_history: draft.judge_history, review: written.review, handoff: createSeoDraftHandoff({ run_id: input.run_id, artifact_id: input.artifact_id, artifact_version: ARTIFACT_VERSION, review_id: input.review_id, review_version: REVIEW_VERSION, expires_at: input.expiry_at }), revision_count: draft.revision_count };
  }

  private blockedBoundary(input: SeoDraftWorkflowInput): SeoDraftWorkflowResult | null {
    if (Date.parse(input.expiry_at) <= Date.parse(this.now())) return { kind: "blocked", status: "blocked", reason: "SEO review handoff has expired" };
    if (input.requested_scope.kind !== "site" || input.requested_scope.id !== input.site.id) return { kind: "blocked", status: "blocked", reason: "SEO draft workflow requires site scope" };
    return null;
  }

  private createPassingDraft(input: SeoDraftWorkflowInput, sourceReceipt: SeoSourceReceipt): { readonly kind: "created"; readonly content: string; readonly judge: SeoJudgeResult; readonly judge_history: readonly SeoJudgeResult[]; readonly revision_count: number } | { readonly kind: "failed"; readonly judge_history: readonly SeoJudgeResult[] } {
    const judgeHistory: SeoJudgeResult[] = [];
    for (let attempt = 1; attempt <= SEO_DRAFT_WORKFLOW.failure_policy.max_attempts; attempt += 1) {
      const content = createSeoDraftMarkdown({ attempt, mode: draftWriterMode(input.draft_mode, attempt), source_receipt: sourceReceipt, site: input.site, target_keyword: input.target_keyword, memory_refs: input.memory_refs });
      const judge = judgeSeoDraft({ attempt, content, canonical_url: input.site.canonical_url, run_id: input.run_id, source_file: input.source_file, source_rows: sourceReceipt.rows });
      judgeHistory.push(judge);
      if (judge.status === "pass") return { kind: "created", content, judge, judge_history: judgeHistory, revision_count: attempt - 1 };
    }
    return { kind: "failed", judge_history: judgeHistory };
  }

  private writeArtifact(input: SeoDraftWorkflowInput, content: string, receiptRef: string, judgeRef: string, reviewRef: string): ArtifactVersion {
    const artifact = this.dependencies.artifactStore.write({ workspace_id: input.workspace_id, artifact_id: input.artifact_id, version: ARTIFACT_VERSION, content_type: "markdown", content, source_ticket: input.ticket_id, source_run: input.run_id, source_agent: input.source_agent, model: "seo_draft_v1/deterministic", receipt_refs: [receiptRef], judge_ref: judgeRef, review_ref: reviewRef, parent_artifact_refs: [], metadata: { workflow_id: SEO_DRAFT_WORKFLOW.id, site_id: input.site.id, target_keyword: input.target_keyword, publish_disabled: true } });
    this.dependencies.artifactRepository.create({ id: input.artifact_id, workspace_id: input.workspace_id, schema_version: 1, created_at: this.now(), updated_at: this.now(), type: "seo_draft", status: "draft", source_ticket: input.ticket_id, source_run: input.run_id, version: ARTIFACT_VERSION, visibility: "workspace", content_ref: artifact.content_ref, evidence_refs: [receiptRef, judgeRef] });
    return artifact;
  }

  private writeReceipt(input: SeoDraftWorkflowInput, sourceReceipt: SeoSourceReceipt, judge: SeoJudgeResult, artifactRef: string): Receipt {
    return this.dependencies.receiptRepository.create(ReceiptSchema.parse({ id: input.receipt_id, workspace_id: input.workspace_id, schema_version: 1, created_at: this.now(), updated_at: this.now(), run_id: input.run_id, inputs: [sourceReceipt.source_file, input.site.canonical_url, ...input.memory_refs], tool_calls: [{ tool: "gsc.fixture", status: "succeeded" }, { tool: "seo.draft_writer", status: "succeeded" }, { tool: "seo.independent_judge", status: judge.status }], validation_results: judge.validation_results, unverified_items: [], side_effects: [{ kind: "artifact_write", reference: artifactRef }] }));
  }

  private writeReview(input: SeoDraftWorkflowInput, artifact: ArtifactVersion, judge: SeoJudgeResult): ReviewDecision {
    return this.dependencies.reviewRepository.create(ReviewDecisionSchema.parse({ id: input.review_id, workspace_id: input.workspace_id, schema_version: 1, created_at: this.now(), updated_at: this.now(), artifact_id: input.artifact_id, artifact_version: artifact.artifact_version, review_version: REVIEW_VERSION, requested_scope: input.requested_scope, expires_at: input.expiry_at, judge_result: judge.status, human_decision: "pending", reviewer_id: input.reviewer_id, reviewer_role: "Reviewer", reason: "SEO draft requires human review before any publish or indexing action", approved_payload_hash: null, risk_level: "R2", policy_decision: { allowed: false, code: "POLICY_REVIEW_REQUIRED", event_type: "policy.denied", reason: "Publish disabled until human review approves the draft", required_action: "human_review", redactions: [] } }));
  }

  private updateRunStatus(input: SeoDraftWorkflowInput, status: "waiting_review" | "failed"): void {
    const run = this.dependencies.runRepository.get(input.workspace_id, input.run_id);
    if (run === undefined) throw new WorkflowExecutionError("RUN_NOT_FOUND", "Workflow run was not found");
    this.dependencies.runRepository.update({ ...run, status: RunStatusSchema.parse(status), updated_at: this.now() }, 1);
  }

  private now(): string {
    return TimestampSchema.parse(this.dependencies.clock.now());
  }
}

export class WorkflowExecutionError extends Error {
  readonly name = "WorkflowExecutionError";
  readonly code: "IDEMPOTENCY_KEY_REUSED" | "DUPLICATE_SIDE_EFFECT" | "RUN_NOT_FOUND";

  constructor(code: WorkflowExecutionError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

function reusedResult(existingHash: string, requestHash: string, resourceType: string, resourceId: string): SeoDraftWorkflowResult {
  if (existingHash !== requestHash) throw new WorkflowExecutionError("IDEMPOTENCY_KEY_REUSED", "Workflow idempotency key was reused with different input");
  if (resourceType === WORKFLOW_UNKNOWN_RESOURCE_TYPE) throw new WorkflowExecutionError("DUPLICATE_SIDE_EFFECT", "Workflow side effect is in progress or unknown and must be reconciled before retry");
  if (resourceType !== WORKFLOW_RESOURCE_TYPE) throw new WorkflowExecutionError("DUPLICATE_SIDE_EFFECT", "Idempotency key is already reserved by another resource");
  return { kind: "reused", status: "waiting_review", artifact_ref: resourceId };
}

function artifactContentRef(artifactId: string, version: number, content: string): string {
  return `artifact://Artifacts/${artifactId}/v${version}/${sha256Content(content).slice("sha256:".length)}.txt`;
}

function workflowRequestHash(input: SeoDraftWorkflowInput, contentRef: string): string {
  const payload: ConnectorJson = { workflow_id: SEO_DRAFT_WORKFLOW.id, workspace_id: input.workspace_id, run_id: input.run_id, attempt_id: input.attempt_id, artifact_id: input.artifact_id, receipt_id: input.receipt_id, review_id: input.review_id, requested_scope: { kind: input.requested_scope.kind, id: input.requested_scope.id }, source_file: input.source_file, target_keyword: input.target_keyword, site: { id: input.site.id, canonical_url: input.site.canonical_url, voice: input.site.voice }, gsc_rows: input.gsc_rows.map((row) => ({ clicks: row.clicks, ctr: row.ctr, impressions: row.impressions, position: row.position, query: row.query, url: row.url })), memory_refs: input.memory_refs, expiry_at: input.expiry_at, draft_mode: input.draft_mode, content_ref: contentRef };
  return connectorHash(payload);
}

function draftWriterMode(mode: SeoDraftWorkflowInput["draft_mode"], attempt: number): "source_backed" | "invent_metric" {
  switch (mode) {
    case "source_backed":
      return "source_backed";
    case "invent_metric_once":
      return attempt === 1 ? "invent_metric" : "source_backed";
    case "always_invent_metric":
      return "invent_metric";
    default:
      return assertNever(mode);
  }
}

function assertNever(value: never): never {
  throw new WorkflowExecutionError("DUPLICATE_SIDE_EFFECT", `Unhandled workflow value ${String(value)}`);
}
