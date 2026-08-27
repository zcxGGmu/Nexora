import type { FastifyRequest } from "fastify";
import { TraceIdSchema } from "@nexora/contracts";
import type { PolicyActor } from "@nexora/policy";
import { requireActor, type LocalAuthOptions } from "./auth.js";
import { ApiHttpError } from "../services/errors.js";

const FALLBACK_TRACE_ID = "00000000000000000000000000";

export type RequestContext = {
  readonly actor: PolicyActor;
  readonly trace_id: string;
  readonly idempotency_key: string | null;
  readonly expected_version: number | null;
};

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export function requestContext(request: FastifyRequest, auth: LocalAuthOptions): RequestContext {
  return {
    actor: requireActor(request.headers.authorization, auth),
    trace_id: requiredTraceId(request.headers["traceparent"]),
    idempotency_key: firstHeader(request.headers["idempotency-key"]) ?? null,
    expected_version: ifMatchVersion(request.headers["if-match"]),
  };
}

export function requiredIdempotencyKey(context: RequestContext): string {
  const key = context.idempotency_key?.trim();
  if (key === undefined || key === "") {
    throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Idempotency-Key header is required", retryable: false, required_action: "send_idempotency_key" });
  }
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Idempotency-Key header must be 128 characters or fewer", retryable: false, required_action: "correct_idempotency_key" });
  }
  return key;
}

export function requiredExpectedVersion(context: RequestContext): number {
  if (context.expected_version === null) {
    throw new ApiHttpError({ status_code: 428, code: "VERSION_CONFLICT", message: "If-Match header is required", retryable: true, required_action: "send_current_version" });
  }
  return context.expected_version;
}

export function traceId(value: string | string[] | undefined): string {
  const header = firstHeader(value);
  const parsed = TraceIdSchema.safeParse(header);
  return parsed.success ? parsed.data : FALLBACK_TRACE_ID;
}

function requiredTraceId(value: string | string[] | undefined): string {
  const header = firstHeader(value);
  if (header === undefined) return FALLBACK_TRACE_ID;
  const parsed = TraceIdSchema.safeParse(header);
  if (!parsed.success) throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "traceparent must be a Nexora trace id", retryable: false, required_action: "correct_traceparent" });
  return parsed.data;
}

function ifMatchVersion(value: string | string[] | undefined): number | null {
  const header = firstHeader(value);
  if (header === undefined) return null;
  const unquoted = header.startsWith('"') && header.endsWith('"') ? header.slice(1, -1) : header;
  if (!/^\d+$/.test(unquoted)) throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "If-Match must be a positive integer version", retryable: false, required_action: "correct_if_match" });
  const version = Number(unquoted);
  if (!Number.isSafeInteger(version) || version < 1) throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "If-Match must be a positive integer version", retryable: false, required_action: "correct_if_match" });
  return version;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
