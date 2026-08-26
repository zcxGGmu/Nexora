import {
  RuntimeCancelAckPayloadSchema,
  RuntimeCancelPayloadSchema,
  RuntimeClosePayloadSchema,
  RuntimeEventPayloadSchema,
  RuntimeHeartbeatPayloadSchema,
  RuntimeHelloAckPayloadSchema,
  RuntimeHelloPayloadSchema,
  RuntimeEnvelopeSchema,
  RuntimeResumePayloadSchema,
  RuntimeStartPayloadSchema,
  z,
  type RuntimeEnvelope,
  type MessageId,
  type RunId,
  type AttemptId,
  type StepId,
  type TraceId,
  type LeaseId,
} from "@nexora/contracts";
import { RuntimeAdapterError } from "./errors.js";
import type { RuntimePayload } from "./runtime-adapter.js";

export type RuntimeMessage = Omit<RuntimeEnvelope, "payload"> & {
  readonly payload: RuntimePayload;
};

export type RuntimeMessageInput = {
  readonly schema_version: 1;
  readonly protocol_version: 1;
  readonly message_id: MessageId;
  readonly message_type: RuntimeMessage["message_type"];
  readonly run_id: RunId;
  readonly attempt_id: AttemptId | null;
  readonly step_id: StepId | null;
  readonly trace_id: TraceId;
  readonly sequence: number;
  readonly cursor: string | null;
  readonly deadline_at: string;
  readonly lease_id: LeaseId;
  readonly fencing_token: number;
  readonly payload: RuntimePayload;
};

export function encodeRuntimeEnvelope(message: RuntimeMessage): string {
  validateEnvelope(message);
  return `${JSON.stringify(message)}\n`;
}

export function decodeRuntimeEnvelope(line: string): RuntimeMessage {
  const parsed = parseJson(line);
  if (hasField(parsed, "protocol_version") && parsed["protocol_version"] !== 1) {
    throw new RuntimeAdapterError("PROTOCOL_MISMATCH", "Runtime protocol version is not supported");
  }
  if (hasField(parsed, "schema_version") && parsed["schema_version"] !== 1) {
    throw new RuntimeAdapterError("SCHEMA_INVALID", "Runtime schema version is not supported");
  }
  const messageType = readMessageType(parsed);
  switch (messageType) {
    case "hello": return parseEnvelope(RuntimeHelloPayloadSchema, parsed);
    case "hello_ack": return parseEnvelope(RuntimeHelloAckPayloadSchema, parsed);
    case "start": return parseEnvelope(RuntimeStartPayloadSchema, parsed);
    case "event": return parseEnvelope(RuntimeEventPayloadSchema, parsed);
    case "heartbeat": return parseEnvelope(RuntimeHeartbeatPayloadSchema, parsed);
    case "resume": return parseEnvelope(RuntimeResumePayloadSchema, parsed);
    case "cancel": return parseEnvelope(RuntimeCancelPayloadSchema, parsed);
    case "cancel_ack": return parseEnvelope(RuntimeCancelAckPayloadSchema, parsed);
    case "close": return parseEnvelope(RuntimeClosePayloadSchema, parsed);
    default: return assertNeverMessageType(messageType);
  }
}

export function createRuntimeMessage(input: RuntimeMessageInput): RuntimeMessage {
  return decodeRuntimeEnvelope(JSON.stringify(input));
}

function validateEnvelope(message: RuntimeMessage): void {
  decodeRuntimeEnvelope(JSON.stringify(message));
}

function parseJson(line: string): unknown {
  try {
    const parsed: unknown = JSON.parse(line);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) throw new RuntimeAdapterError("SCHEMA_INVALID", "Runtime output is not valid JSON");
    throw error;
  }
}

function hasField(value: unknown, key: string): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && key in value;
}

function readMessageType(value: unknown): RuntimeMessage["message_type"] {
  if (!hasField(value, "message_type") || typeof value["message_type"] !== "string") throw new RuntimeAdapterError("SCHEMA_INVALID", "Runtime message_type is missing");
  const messageType = value["message_type"];
  if (messageType !== "hello" && messageType !== "hello_ack" && messageType !== "start" && messageType !== "event" && messageType !== "heartbeat" && messageType !== "resume" && messageType !== "cancel" && messageType !== "cancel_ack" && messageType !== "close") throw new RuntimeAdapterError("SCHEMA_INVALID", "Runtime message_type is unknown");
  return messageType;
}

function parseEnvelope(schema: z.ZodType<RuntimePayload, z.ZodTypeDef, unknown>, value: unknown): RuntimeMessage {
  if (!hasField(value, "payload")) {
    throw new RuntimeAdapterError("SCHEMA_INVALID", "Runtime envelope must be an object with payload");
  }
  const { payload, ...base } = value;
  const baseResult = RuntimeEnvelopeSchema.omit({ payload: true }).safeParse(base);
  if (!baseResult.success) {
    const path = baseResult.error.issues[0]?.path.join(".") ?? "envelope";
    throw new RuntimeAdapterError("SCHEMA_INVALID", `Runtime envelope is invalid at ${path}`);
  }
  const payloadResult = schema.safeParse(payload);
  if (!payloadResult.success) {
    const path = payloadResult.error.issues[0]?.path.join(".") ?? "payload";
    throw new RuntimeAdapterError("SCHEMA_INVALID", `Runtime envelope is invalid at payload.${path}`);
  }
  return { ...baseResult.data, payload: payloadResult.data };
}

function assertNeverMessageType(value: never): never {
  throw new RuntimeAdapterError("SCHEMA_INVALID", `Runtime message_type is invalid: ${String(value)}`);
}
