export const RUNTIME_ADAPTER_ERROR_CODES = [
  "AUTH_EXPIRED",
  "SCOPE_DENIED",
  "POLICY_DENIED",
  "SCHEMA_INVALID",
  "PROTOCOL_MISMATCH",
  "RUNTIME_CRASHED",
  "STALE_LEASE",
  "CANCEL_UNKNOWN",
  "CONNECTOR_TIMEOUT",
  "CONNECTOR_UNAVAILABLE",
] as const;
export type RuntimeAdapterErrorCode = (typeof RUNTIME_ADAPTER_ERROR_CODES)[number];

export class RuntimeAdapterError extends Error {
  readonly name = "RuntimeAdapterError";

  constructor(readonly code: RuntimeAdapterErrorCode, message: string) {
    super(message);
  }
}
