export const RUNTIME_ADAPTER_ERROR_CODES = [
  "SCHEMA_INVALID",
  "PROTOCOL_MISMATCH",
  "RUNTIME_CRASHED",
  "STALE_LEASE",
  "CANCEL_UNKNOWN",
  "CONNECTOR_TIMEOUT",
] as const;
export type RuntimeAdapterErrorCode = (typeof RUNTIME_ADAPTER_ERROR_CODES)[number];

export class RuntimeAdapterError extends Error {
  readonly name = "RuntimeAdapterError";

  constructor(readonly code: RuntimeAdapterErrorCode, message: string) {
    super(message);
  }
}
