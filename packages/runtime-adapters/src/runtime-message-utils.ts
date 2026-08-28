import { RuntimeAdapterError } from "./errors.js";
import { MessageIdSchema, RuntimePayloadSchema, type MessageId } from "@nexora/contracts";
import { createHash } from "node:crypto";
import { StartInputSchema, type StartInput } from "./runtime-adapter.js";
import { RUNTIME_EVENT_TYPES, type RuntimeEventType, type RuntimePayload } from "./runtime-adapter.js";

export function readBoolean(payload: RuntimePayload, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === "boolean" ? value : undefined;
}

export function readString(payload: RuntimePayload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

export function readPayload(payload: RuntimePayload, key: string): RuntimePayload {
  const value = payload[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new RuntimeAdapterError("SCHEMA_INVALID", `Runtime event ${key} must be an object`);
  return RuntimePayloadSchema.parse(value);
}

export function readEventType(payload: RuntimePayload): RuntimeEventType {
  const value = payload["event_type"];
  if (typeof value !== "string" || value.length === 0) throw new RuntimeAdapterError("SCHEMA_INVALID", "Runtime event_type is invalid");
  return isRuntimeEventType(value) ? value : "unmapped_event";
}

export function messageIdFor(seed: string, sequence: number): MessageId {
  const digest = createHash("sha256").update(`${seed}:${String(sequence)}`).digest("hex").toUpperCase();
  return MessageIdSchema.parse(`0${digest.slice(0, 25)}`);
}

export function parseStartInput(input: unknown): StartInput {
  const result = StartInputSchema.safeParse(input);
  if (!result.success) {
    const path = result.error.issues[0]?.path.join(".") ?? "input";
    throw new RuntimeAdapterError("SCHEMA_INVALID", `Runtime start input is invalid at ${path}`);
  }
  return result.data;
}

function isRuntimeEventType(value: string): value is RuntimeEventType {
  return RUNTIME_EVENT_TYPES.some((eventType) => eventType === value);
}

export function assertNeverCommand(command: never): never {
  throw new RuntimeAdapterError("SCHEMA_INVALID", `Unsupported runtime command ${String(command)}`);
}

export function assertNeverMessage(messageType: never): never {
  throw new RuntimeAdapterError("SCHEMA_INVALID", `Unsupported runtime message ${String(messageType)}`);
}
