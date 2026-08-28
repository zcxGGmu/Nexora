import { z } from "zod";
import { EgressReceiptSchema } from "./artifact.js";
import type { EgressReceipt } from "./artifact.js";
import { NonNegativeInt, TimestampSchema } from "./common.js";
import { ArtifactIdSchema, AttemptIdSchema, LeaseIdSchema, RunIdSchema, StepIdSchema, TraceIdSchema, UlidSchema, WorkspaceIdSchema } from "./ids.js";
import { DataClassificationSchema, PayloadHashSchema, PolicyDecisionSchema, PolicyScopeSchema } from "./policy.js";
import { BudgetSchema } from "./run.js";

export { RuntimeEnvelopeSchema, RUNTIME_MESSAGE_TYPES, createRuntimeEnvelopeSchema } from "./envelope.js";

export type RuntimeScalar = string | number | boolean | null;
export type RuntimeValue = RuntimeScalar | readonly RuntimeValue[] | { readonly [key: string]: RuntimeValue } | EgressReceipt | RemoteExecutionSnapshot;

const RuntimeValueSchema: z.ZodType<RuntimeValue> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(RuntimeValueSchema), z.record(RuntimeValueSchema),
]));
export const RuntimePayloadSchema = z.record(RuntimeValueSchema);
export const RemoteArtifactRefSchema = z.object({ artifact_id: ArtifactIdSchema, artifact_version: z.number().int().positive().max(1000000000), content_hash: PayloadHashSchema }).strict();
export const RemoteMemoryRefSchema = z.object({ note_id: UlidSchema, note_version: z.number().int().positive().max(1000000000), content_hash: PayloadHashSchema, transmitted_hash: PayloadHashSchema.optional(), content: z.string().max(65536) }).strict();
export const RemotePolicySnapshotSchema = z.object({
  scope: PolicyScopeSchema,
  data_classification: DataClassificationSchema,
  provider: z.string().min(1).max(128),
  region: z.string().min(1).max(128),
  decision: PolicyDecisionSchema,
}).strict();
export const RemoteExecutionSnapshotSchema = z.object({
  schema_version: z.literal(1),
  workspace_id: WorkspaceIdSchema,
  run_id: RunIdSchema,
  attempt_id: AttemptIdSchema,
  step_id: StepIdSchema,
  trace_id: TraceIdSchema,
  lease_id: LeaseIdSchema,
  fencing_token: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  deadline_at: TimestampSchema,
  budget: BudgetSchema,
  artifact_refs: z.array(RemoteArtifactRefSchema).max(128),
  memory_refs: z.array(RemoteMemoryRefSchema).max(128),
  policy_snapshot: RemotePolicySnapshotSchema,
  redaction_count: NonNegativeInt.max(10000),
  snapshot_hash: PayloadHashSchema,
}).strict();
export const RemoteStartInputSchema = z.object({
  snapshot: RemoteExecutionSnapshotSchema.optional(),
  egress_receipt: EgressReceiptSchema.optional(),
}).catchall(RuntimeValueSchema).superRefine((input, context) => {
  if (input.egress_receipt !== undefined && input.snapshot === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["egress_receipt"], message: "egress receipt requires a remote snapshot" });
  }
  if (input.egress_receipt !== undefined && input.snapshot !== undefined && input.egress_receipt.snapshot_hash !== input.snapshot.snapshot_hash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["egress_receipt", "snapshot_hash"], message: "egress receipt must reference the remote snapshot" });
  }
});
export const RuntimeHelloPayloadSchema = z.object({ adapter_id: z.string().min(1), protocol_version: z.literal(1), capabilities: z.record(z.boolean()) }).strict();
export const RuntimeHelloAckPayloadSchema = z.object({ accepted: z.boolean(), adapter_id: z.string().min(1), protocol_version: z.literal(1), reason: z.string().min(1).nullable() }).strict();
export const RuntimeStartPayloadSchema = z
  .object({ input: RuntimePayloadSchema })
  .strict()
  .superRefine((payload, context) => {
    const remoteInput = RemoteStartInputSchema.safeParse(payload.input);
    if (remoteInput.success) return;
    for (const issue of remoteInput.error.issues) context.addIssue({ ...issue, path: ["input", ...issue.path] });
  });
export const RuntimeEventPayloadSchema = z.object({ event_type: z.string().min(1), data: RuntimePayloadSchema }).strict();
export const RuntimeHeartbeatPayloadSchema = z.object({ status: z.enum(["running", "idle", "stopping"]), cursor: z.string().nullable() }).strict();
export const RuntimeResumePayloadSchema = z.object({ cursor: z.string().nullable() }).strict();
export const RuntimeCancelPayloadSchema = z.object({ reason: z.string().min(1) }).strict();
export const RuntimeCancelAckPayloadSchema = z.object({ acknowledged: z.boolean(), unknown: z.boolean(), reason: z.string().min(1).nullable() }).strict();
export const RuntimeClosePayloadSchema = z.object({ reason: z.string().min(1).nullable() }).strict();

export type RuntimeHelloPayload = z.infer<typeof RuntimeHelloPayloadSchema>;
export type RuntimeHelloAckPayload = z.infer<typeof RuntimeHelloAckPayloadSchema>;
export type RemoteArtifactRef = z.infer<typeof RemoteArtifactRefSchema>;
export type RemoteMemoryRef = z.infer<typeof RemoteMemoryRefSchema>;
export type RemotePolicySnapshot = z.infer<typeof RemotePolicySnapshotSchema>;
export type RemoteExecutionSnapshot = z.infer<typeof RemoteExecutionSnapshotSchema>;
export type RemoteStartInput = z.infer<typeof RemoteStartInputSchema>;
export type RuntimeStartPayload = z.infer<typeof RuntimeStartPayloadSchema>;
export type RuntimeEventPayload = z.infer<typeof RuntimeEventPayloadSchema>;
export type RuntimeHeartbeatPayload = z.infer<typeof RuntimeHeartbeatPayloadSchema>;
export type RuntimeResumePayload = z.infer<typeof RuntimeResumePayloadSchema>;
export type RuntimeCancelPayload = z.infer<typeof RuntimeCancelPayloadSchema>;
export type RuntimeCancelAckPayload = z.infer<typeof RuntimeCancelAckPayloadSchema>;
export type RuntimeClosePayload = z.infer<typeof RuntimeClosePayloadSchema>;
