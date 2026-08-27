import type { ErrorCode } from "@nexora/contracts";

export type ConnectorExecutionErrorCode = Extract<ErrorCode, "CONNECTOR_UNAVAILABLE" | "DUPLICATE_SIDE_EFFECT" | "IDEMPOTENCY_KEY_REUSED" | "POLICY_DENIED" | "POLICY_REVIEW_REQUIRED" | "REVIEW_STALE" | "SCHEMA_INVALID" | "SCOPE_DENIED">;

export class ConnectorExecutionError extends Error {
  readonly name = "ConnectorExecutionError";
  readonly code: ConnectorExecutionErrorCode;

  constructor(code: ConnectorExecutionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
