import type { ErrorCode } from "@nexora/contracts";

export type DomainErrorCode = Extract<ErrorCode, "INVALID_STATE_TRANSITION" | "VERSION_CONFLICT">;

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
