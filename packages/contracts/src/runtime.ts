import { z } from "zod";

export { RuntimeEnvelopeSchema, RUNTIME_MESSAGE_TYPES, createRuntimeEnvelopeSchema } from "./envelope.js";

export type RuntimeScalar = string | number | boolean | null;
export type RuntimeValue = RuntimeScalar | readonly RuntimeValue[] | { readonly [key: string]: RuntimeValue };

const RuntimeValueSchema: z.ZodType<RuntimeValue> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(RuntimeValueSchema), z.record(RuntimeValueSchema),
]));
export const RuntimePayloadSchema = z.record(RuntimeValueSchema);
export const RuntimeHelloPayloadSchema = z.object({ adapter_id: z.string().min(1), protocol_version: z.literal(1), capabilities: z.record(z.boolean()) }).strict();
export const RuntimeHelloAckPayloadSchema = z.object({ accepted: z.boolean(), adapter_id: z.string().min(1), protocol_version: z.literal(1), reason: z.string().min(1).nullable() }).strict();
export const RuntimeStartPayloadSchema = z.object({ input: RuntimePayloadSchema }).strict();
export const RuntimeEventPayloadSchema = z.object({ event_type: z.string().min(1), data: RuntimePayloadSchema }).strict();
export const RuntimeHeartbeatPayloadSchema = z.object({ status: z.enum(["running", "idle", "stopping"]), cursor: z.string().nullable() }).strict();
export const RuntimeResumePayloadSchema = z.object({ cursor: z.string().nullable() }).strict();
export const RuntimeCancelPayloadSchema = z.object({ reason: z.string().min(1) }).strict();
export const RuntimeCancelAckPayloadSchema = z.object({ acknowledged: z.boolean(), unknown: z.boolean(), reason: z.string().min(1).nullable() }).strict();
export const RuntimeClosePayloadSchema = z.object({ reason: z.string().min(1).nullable() }).strict();

export type RuntimeHelloPayload = z.infer<typeof RuntimeHelloPayloadSchema>;
export type RuntimeHelloAckPayload = z.infer<typeof RuntimeHelloAckPayloadSchema>;
export type RuntimeStartPayload = z.infer<typeof RuntimeStartPayloadSchema>;
export type RuntimeEventPayload = z.infer<typeof RuntimeEventPayloadSchema>;
export type RuntimeHeartbeatPayload = z.infer<typeof RuntimeHeartbeatPayloadSchema>;
export type RuntimeResumePayload = z.infer<typeof RuntimeResumePayloadSchema>;
export type RuntimeCancelPayload = z.infer<typeof RuntimeCancelPayloadSchema>;
export type RuntimeCancelAckPayload = z.infer<typeof RuntimeCancelAckPayloadSchema>;
export type RuntimeClosePayload = z.infer<typeof RuntimeClosePayloadSchema>;
