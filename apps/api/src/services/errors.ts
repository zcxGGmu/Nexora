import { z } from "zod";
import { DomainError } from "@nexora/domain";
import { EventStoreError } from "@nexora/event-store";
import { OrchestrationError } from "@nexora/orchestration";
import { PersistenceError } from "@nexora/persistence";
import { ErrorResponseSchema, TraceIdSchema, type ErrorCode, type ErrorResponse } from "@nexora/contracts";

const FALLBACK_TRACE_ID = "00000000000000000000000000";

export type ApiHttpErrorInput = {
  readonly status_code: number;
  readonly code: ErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly required_action: string;
};

export class ApiHttpError extends Error {
  readonly name = "ApiHttpError";
  readonly status_code: number;
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly required_action: string;

  constructor(input: ApiHttpErrorInput) {
    super(input.message);
    this.status_code = input.status_code;
    this.code = input.code;
    this.retryable = input.retryable;
    this.required_action = input.required_action;
  }
}

export function toApiHttpError(error: unknown): ApiHttpError {
  if (error instanceof ApiHttpError) return error;
  if (error instanceof z.ZodError) return new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Contract validation failed", retryable: false, required_action: "correct_request" });
  if (error instanceof DomainError) return domainError(error);
  if (error instanceof PersistenceError) return persistenceError(error);
  if (error instanceof EventStoreError) return eventStoreError(error);
  if (error instanceof OrchestrationError) return orchestrationError(error);
  throw error;
}

export function errorResponse(error: ApiHttpError, traceId: string): ErrorResponse {
  const safeTrace = TraceIdSchema.safeParse(traceId);
  return ErrorResponseSchema.parse({
    schema_version: 1,
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    required_action: error.required_action,
    trace_id: safeTrace.success ? safeTrace.data : TraceIdSchema.parse(FALLBACK_TRACE_ID),
    details: [],
  });
}

function domainError(error: DomainError): ApiHttpError {
  return new ApiHttpError({ status_code: 409, code: error.code, message: error.message, retryable: false, required_action: "refresh_state" });
}

function persistenceError(error: PersistenceError): ApiHttpError {
  if (error.code === "IDEMPOTENCY_KEY_REUSED") return new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: error.message, retryable: false, required_action: "use_new_idempotency_key" });
  if (error.code === "VERSION_CONFLICT") return new ApiHttpError({ status_code: 409, code: "VERSION_CONFLICT", message: error.message, retryable: true, required_action: "refresh_state" });
  if (error.code === "NOT_FOUND") return new ApiHttpError({ status_code: 404, code: "SCOPE_DENIED", message: "Resource not found", retryable: false, required_action: "check_scope" });
  return new ApiHttpError({ status_code: 409, code: "VERSION_CONFLICT", message: error.message, retryable: false, required_action: "inspect_constraint" });
}

function eventStoreError(error: EventStoreError): ApiHttpError {
  if (error.code === "EVENT_CURSOR_EXPIRED") return new ApiHttpError({ status_code: 410, code: "EVENT_CURSOR_EXPIRED", message: error.message, retryable: false, required_action: "restart_event_stream" });
  return new ApiHttpError({ status_code: 409, code: "VERSION_CONFLICT", message: error.message, retryable: true, required_action: "refresh_state" });
}

function orchestrationError(error: OrchestrationError): ApiHttpError {
  if (error.code === "IDEMPOTENCY_KEY_REUSED") return new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: error.message, retryable: false, required_action: "use_new_idempotency_key" });
  if (error.code === "NOT_FOUND") return new ApiHttpError({ status_code: 404, code: "SCOPE_DENIED", message: "Resource not found", retryable: false, required_action: "check_scope" });
  return new ApiHttpError({ status_code: 409, code: error.code === "STALE_LEASE" ? "STALE_LEASE" : "VERSION_CONFLICT", message: error.message, retryable: true, required_action: "refresh_state" });
}
