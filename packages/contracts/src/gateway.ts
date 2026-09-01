import { z } from "zod";
import { NonNegativeInt, TimestampSchema } from "./common.js";
import { DataClassificationSchema, ExecutionLocationSchema } from "./policy.js";
import { MessageIdSchema, RunIdSchema, TraceIdSchema, UlidSchema, WorkspaceIdSchema } from "./ids.js";
import { DescriptorIdSchema } from "./registry.js";

const DescriptorNameSchema = z.string().min(1).max(160);
const DescriptorVersionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
const CursorSchema = z.string().min(1).max(512).regex(/^\S+$/);
const IdempotencyKeySchema = z.string().min(1).max(128);
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)]));

export const GatewayKindSchema = z.enum(["hermes", "openclaw", "custom"]);
export const GatewayHealthSchema = z.enum(["unknown", "healthy", "degraded", "offline"]);
export const GatewayStatusSchema = z.enum(["registered", "connecting", "connected", "paused", "offline"]);
export const ChannelKindSchema = z.enum(["telegram", "discord", "slack", "whatsapp", "signal", "web", "api", "custom"]);
export const ChannelStatusSchema = z.enum(["connected", "degraded", "offline", "disabled"]);
export const SessionModeSchema = z.enum(["foreground", "background"]);
export const SessionStatusSchema = z.enum(["active", "paused", "closed", "error"]);
export const SessionCommandKindSchema = z.enum(["pause", "steer", "resume"]);
export const MessageDirectionSchema = z.enum(["inbound", "outbound"]);
export const MessageStatusSchema = z.enum(["queued", "accepted", "delivered", "failed", "replayed"]);
export const DeliveryStatusSchema = z.enum(["queued", "sent", "delivered", "failed", "unknown", "replayed"]);
export const AllowlistSubjectSchema = z.enum(["user", "channel", "thread"]);
export const AllowlistDecisionSchema = z.enum(["allow", "deny"]);

const DescriptorMetadataSchema = z.object({
  id: DescriptorIdSchema,
  workspace_id: WorkspaceIdSchema,
  schema_version: z.literal(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
}).strict();

export const GatewayDescriptorSchema = DescriptorMetadataSchema.extend({
  name: DescriptorNameSchema,
  kind: GatewayKindSchema,
  version: DescriptorVersionSchema,
  requested_version: DescriptorVersionSchema.nullable().default(null),
  actual_version: DescriptorVersionSchema.nullable().default(null),
  protocol_version: z.literal(1),
  capabilities: z.array(z.string().min(1).max(96)).min(1).max(128),
  health: GatewayHealthSchema,
  status: GatewayStatusSchema,
  enabled: z.boolean(),
  execution_location: ExecutionLocationSchema,
  endpoint_ref: z.string().regex(/^secret:\/\/[^\s]+$/).max(512).nullable(),
  data_classification: DataClassificationSchema,
  last_heartbeat_at: TimestampSchema.nullable(),
  revision: z.number().int().positive().default(1),
}).strict();

export const ChannelDescriptorSchema = DescriptorMetadataSchema.extend({
  gateway_id: DescriptorIdSchema,
  name: DescriptorNameSchema,
  kind: ChannelKindSchema,
  version: DescriptorVersionSchema,
  status: ChannelStatusSchema,
  enabled: z.boolean(),
  capabilities: z.array(z.string().min(1).max(96)).min(1).max(128),
  credential_ref: z.string().regex(/^secret:\/\/[^\s]+$/).nullable(),
  endpoint_ref: z.string().regex(/^secret:\/\/[^\s]+$/).max(512).nullable(),
  allowlist_mode: z.enum(["deny_by_default", "allowlist_only"]),
  data_classification: DataClassificationSchema,
  revision: z.number().int().positive().default(1),
}).strict();

export const SessionSchema = z.object({
  id: UlidSchema,
  workspace_id: WorkspaceIdSchema,
  schema_version: z.literal(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  gateway_id: DescriptorIdSchema,
  channel_id: DescriptorIdSchema,
  agent_id: UlidSchema.nullable(),
  run_id: RunIdSchema.nullable(),
  external_session_ref: z.string().min(1).max(256).nullable(),
  mode: SessionModeSchema,
  status: SessionStatusSchema,
  cursor: CursorSchema.nullable(),
  last_message_id: MessageIdSchema.nullable(),
  last_event_at: TimestampSchema.nullable(),
  revision: z.number().int().positive().default(1),
}).strict();

export const MessageEnvelopeSchema = z.object({
  schema_version: z.literal(1),
  message_id: MessageIdSchema,
  workspace_id: WorkspaceIdSchema,
  session_id: UlidSchema,
  channel_id: DescriptorIdSchema,
  direction: MessageDirectionSchema,
  status: MessageStatusSchema,
  idempotency_key: IdempotencyKeySchema,
  sequence: NonNegativeInt,
  cursor: CursorSchema.nullable(),
  occurred_at: TimestampSchema,
  trace_id: TraceIdSchema,
  sender_ref: z.string().min(1).max(256).nullable(),
  recipient_ref: z.string().min(1).max(256).nullable(),
  content: JsonValueSchema,
  content_type: z.enum(["text", "json", "binary_ref"]),
  content_hash: z.string().min(1).max(256),
}).strict();

export const DeliveryReceiptSchema = z.object({
  schema_version: z.literal(1),
  receipt_id: UlidSchema,
  workspace_id: WorkspaceIdSchema,
  session_id: UlidSchema,
  message_id: MessageIdSchema,
  idempotency_key: IdempotencyKeySchema,
  status: DeliveryStatusSchema,
  provider_receipt_ref: z.string().min(1).max(256).nullable(),
  delivered_at: TimestampSchema.nullable(),
  error_code: z.string().min(1).max(96).nullable(),
  error_message: z.string().min(1).max(512).nullable(),
  created_at: TimestampSchema,
  trace_id: TraceIdSchema,
}).strict().superRefine((receipt, context) => {
  if (receipt.status === "delivered" && receipt.delivered_at === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["delivered_at"], message: "delivered receipts require delivered_at" });
  if (receipt.status === "failed" && receipt.error_code === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["error_code"], message: "failed receipts require error_code" });
});

export const AllowlistEntrySchema = z.object({
  id: UlidSchema,
  workspace_id: WorkspaceIdSchema,
  schema_version: z.literal(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  channel_id: DescriptorIdSchema,
  subject_type: AllowlistSubjectSchema,
  subject_ref: z.string().min(1).max(256),
  decision: AllowlistDecisionSchema,
  reason: z.string().min(1).max(512),
  expires_at: TimestampSchema.nullable(),
  created_by: UlidSchema.nullable(),
  revision: z.number().int().positive().default(1),
}).strict();

export const SessionCommandSchema = z.object({
  schema_version: z.literal(1),
  command_id: UlidSchema,
  workspace_id: WorkspaceIdSchema,
  session_id: UlidSchema,
  kind: SessionCommandKindSchema,
  idempotency_key: IdempotencyKeySchema,
  expected_revision: z.number().int().positive().nullable(),
  cursor: CursorSchema.nullable().default(null),
  instruction: z.string().min(1).max(4000).nullable().default(null),
  created_at: TimestampSchema,
}).strict().superRefine((command, context) => {
  if (command.kind === "steer" && command.instruction === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["instruction"], message: "steer commands require instruction" });
  if (command.kind !== "steer" && command.instruction !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["instruction"], message: "only steer commands accept instruction" });
});

export type GatewayDescriptor = z.infer<typeof GatewayDescriptorSchema>;
export type ChannelDescriptor = z.infer<typeof ChannelDescriptorSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;
export type DeliveryReceipt = z.infer<typeof DeliveryReceiptSchema>;
export type AllowlistEntry = z.infer<typeof AllowlistEntrySchema>;
export type SessionCommand = z.infer<typeof SessionCommandSchema>;
export type GatewayKind = z.infer<typeof GatewayKindSchema>;
export type GatewayHealth = z.infer<typeof GatewayHealthSchema>;
export type GatewayStatus = z.infer<typeof GatewayStatusSchema>;
export type ChannelKind = z.infer<typeof ChannelKindSchema>;
export type ChannelStatus = z.infer<typeof ChannelStatusSchema>;
export type SessionMode = z.infer<typeof SessionModeSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type SessionCommandKind = z.infer<typeof SessionCommandKindSchema>;
export type MessageDirection = z.infer<typeof MessageDirectionSchema>;
export type MessageStatus = z.infer<typeof MessageStatusSchema>;
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;
export type AllowlistSubject = z.infer<typeof AllowlistSubjectSchema>;
export type AllowlistDecision = z.infer<typeof AllowlistDecisionSchema>;
export { CursorSchema, IdempotencyKeySchema };

const SESSION_STATUS_TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  active: ["paused", "closed", "error"],
  paused: ["active", "closed", "error"],
  closed: [],
  error: ["closed"],
};

export function canTransitionSession(from: SessionStatus, to: SessionStatus): boolean {
  SessionStatusSchema.parse(from);
  SessionStatusSchema.parse(to);
  return SESSION_STATUS_TRANSITIONS[from].includes(to);
}

export function sessionTransitions(): Readonly<Record<SessionStatus, readonly SessionStatus[]>> {
  return SESSION_STATUS_TRANSITIONS;
}
