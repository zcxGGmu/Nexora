export const RETRYABLE_ERROR_CODES = ["CONNECTOR_TIMEOUT", "CONNECTOR_UNAVAILABLE", "RATE_LIMITED", "RUNTIME_CRASHED"] as const;
export type RetryableErrorCode = (typeof RETRYABLE_ERROR_CODES)[number];

export type RetryDecision =
  | { readonly kind: "retry"; readonly next_attempt: number; readonly delay_ms: number; readonly error_code: RetryableErrorCode }
  | { readonly kind: "stop"; readonly reason: "non_retryable" | "attempts_exhausted"; readonly error_code: string };

export type RetryInput = {
  readonly attempt: number;
  readonly max_attempts: number;
  readonly error_code: string;
  readonly base_delay_ms: number;
};

export function decideRetry(input: RetryInput): RetryDecision {
  if (!Number.isInteger(input.attempt) || !Number.isInteger(input.max_attempts) || !Number.isFinite(input.base_delay_ms) || input.attempt < 1 || input.max_attempts < 1 || input.max_attempts > 3 || input.base_delay_ms < 0) return { kind: "stop", reason: "non_retryable", error_code: input.error_code };
  if (!isRetryableError(input.error_code)) return { kind: "stop", reason: "non_retryable", error_code: input.error_code };
  if (input.attempt >= input.max_attempts) return { kind: "stop", reason: "attempts_exhausted", error_code: input.error_code };
  const delay = Math.min(input.base_delay_ms * 2 ** (input.attempt - 1), 60_000);
  return { kind: "retry", next_attempt: input.attempt + 1, delay_ms: delay, error_code: input.error_code };
}

function isRetryableError(value: string): value is RetryableErrorCode {
  return RETRYABLE_ERROR_CODES.some((code) => code === value);
}
