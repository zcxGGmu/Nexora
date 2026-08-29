import { z } from "zod";
import { MetadataSchema, RetryPolicySchema, TimestampSchema } from "./common.js";
import { ArtifactIdSchema, RunIdSchema, StepIdSchema, UlidSchema, WorkspaceIdSchema } from "./ids.js";
import { DataClassificationSchema, EgressPolicySchema, PayloadHashSchema, PolicyScopeSchema, RiskLevelSchema } from "./policy.js";

const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
const ConnectorInputValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const ConnectorDescriptorSchema = z
  .object({ id: z.string().min(1), version: SemverSchema, risk_level: RiskLevelSchema, data_classification: DataClassificationSchema, allowed_scopes: z.array(PolicyScopeSchema).min(1), egress: EgressPolicySchema, input_schema: z.object({ schema_version: z.literal(1), name: z.string().min(1) }).strict(), output_schema: z.object({ schema_version: z.literal(1), name: z.string().min(1) }).strict(), supports_idempotency: z.boolean(), supports_dry_run: z.boolean(), timeout_seconds: z.number().finite().positive().max(86400), retry: RetryPolicySchema, rollback: z.enum(["supported", "unsupported", "compensating"]), requires_review: z.boolean() })
  .strict();
export const ConnectorRequestSchema = z
  .object({ schema_version: z.literal(1), connector_id: z.string().min(1), connector_version: SemverSchema, workspace_id: WorkspaceIdSchema, run_id: RunIdSchema, step_id: StepIdSchema.nullable(), requested_scope: PolicyScopeSchema, idempotency_key: z.string().min(1).max(128), request_hash: PayloadHashSchema, payload_hash: PayloadHashSchema, dry_run: z.boolean(), input: z.record(ConnectorInputValueSchema) })
  .strict();
export const ConnectorPreviewSchema = z
  .object({ schema_version: z.literal(1), connector_id: z.string().min(1), connector_version: SemverSchema, workspace_id: WorkspaceIdSchema, run_id: RunIdSchema, requested_scope: PolicyScopeSchema, artifact_id: ArtifactIdSchema, artifact_version: z.number().int().positive(), payload_hash: PayloadHashSchema, request_hash: PayloadHashSchema, risk_level: RiskLevelSchema, requires_review: z.boolean(), target_ref: z.string().min(1), summary: z.string().min(1), expires_at: TimestampSchema, redactions: z.array(z.string().min(1)) })
  .strict();
export const ConnectorReviewRequiredSchema = z.object({ kind: z.literal("review_required"), preview: ConnectorPreviewSchema, review_id: UlidSchema, review_version: z.number().int().positive() }).strict();
export const ConnectorExecutionReceiptSchema = z
  .object({ schema_version: z.literal(1), connector_id: z.string().min(1), connector_version: SemverSchema, workspace_id: WorkspaceIdSchema, run_id: RunIdSchema, receipt_id: z.string().min(1), idempotency_key: z.string().min(1).max(128), request_hash: PayloadHashSchema, payload_hash: PayloadHashSchema, artifact_id: ArtifactIdSchema, artifact_version: z.number().int().positive(), status: z.enum(["executed", "verified", "side_effect_unknown", "review_required", "reused"]), external_receipt_ref: z.string().min(1).nullable(), side_effects: z.array(z.object({ kind: z.string().min(1), reference: z.string().min(1) }).strict()), verification: z.object({ status: z.enum(["verified", "failed", "unknown"]), checked_at: TimestampSchema, reason: z.string().min(1) }).strict() })
  .strict();
export const ConnectorQuarantineStatusSchema = z.enum(["active", "released"]);
export const ConnectorQuarantineRecordSchema = MetadataSchema.extend({
  connector_id: z.string().min(1),
  connector_version: SemverSchema,
  status: ConnectorQuarantineStatusSchema,
  reason: z.string().min(1).max(1000),
  quarantined_by: UlidSchema,
  released_by: UlidSchema.nullable(),
  release_reason: z.string().min(1).max(1000).nullable(),
  released_at: TimestampSchema.nullable(),
}).strict().superRefine((record, context) => {
  if (record.status === "active" && (record.released_by !== null || record.release_reason !== null || record.released_at !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Active quarantines cannot include release fields" });
  }
  if (record.status === "released" && (record.released_by === null || record.release_reason === null || record.released_at === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Released quarantines must include release fields" });
  }
});

export type ConnectorDescriptor = z.infer<typeof ConnectorDescriptorSchema>;
export type ConnectorRequest = z.infer<typeof ConnectorRequestSchema>;
export type ConnectorPreview = z.infer<typeof ConnectorPreviewSchema>;
export type ConnectorReviewRequired = z.infer<typeof ConnectorReviewRequiredSchema>;
export type ConnectorExecutionReceipt = z.infer<typeof ConnectorExecutionReceiptSchema>;
export type ConnectorQuarantineStatus = z.infer<typeof ConnectorQuarantineStatusSchema>;
export type ConnectorQuarantineRecord = z.infer<typeof ConnectorQuarantineRecordSchema>;
