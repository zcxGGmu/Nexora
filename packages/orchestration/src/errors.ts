export type OrchestrationErrorCode =
  | "BUDGET_EXCEEDED"
  | "CANCEL_UNKNOWN"
  | "IDEMPOTENCY_KEY_REUSED"
  | "LEASE_BUSY"
  | "LEASE_NOT_FOUND"
  | "NOT_FOUND"
  | "RETRY_NOT_ALLOWED"
  | "STALE_LEASE"
  | "INVALID_QUEUE_STATE";

export class OrchestrationError extends Error {
  readonly code: OrchestrationErrorCode;

  constructor(code: OrchestrationErrorCode, message: string) {
    super(message);
    this.name = "OrchestrationError";
    this.code = code;
  }
}
