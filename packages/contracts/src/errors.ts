import { z } from "zod";
import { TraceIdSchema } from "./ids.js";

export const ERROR_CODES = ["AUTH_EXPIRED", "SCOPE_DENIED", "POLICY_DENIED", "POLICY_REVIEW_REQUIRED", "RATE_LIMITED", "CONNECTOR_TIMEOUT", "SCHEMA_INVALID", "PROTOCOL_MISMATCH", "BUDGET_EXCEEDED", "GOAL_LOOP_LIMIT_EXCEEDED", "DUPLICATE_SIDE_EFFECT", "RUNTIME_CRASHED", "STALE_LEASE", "REVIEW_STALE", "MEMORY_CONFLICT", "IDEMPOTENCY_KEY_REUSED", "CONNECTOR_UNAVAILABLE", "PROJECTION_DEGRADED", "EVENT_CURSOR_EXPIRED", "INVALID_STATE_TRANSITION", "VERSION_CONFLICT", "CANCEL_UNKNOWN"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
const SafeTokenSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const SafeMessageSchema = z.string().min(1).max(1000).refine((value) => !/[\u0000-\u001F\u007F]/.test(value), "control characters are not allowed");
const DetailSchema = z.object({ path: z.array(z.union([z.string().max(128), z.number().int().nonnegative()])), code: SafeTokenSchema }).strict();
export const ErrorResponseSchema = z.object({ schema_version: z.literal(1), code: z.enum(ERROR_CODES), message: SafeMessageSchema, retryable: z.boolean(), required_action: SafeTokenSchema, trace_id: TraceIdSchema, details: z.array(DetailSchema).max(100) }).strict();
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ContractResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ErrorResponse };
const FALLBACK_TRACE_ID = "00000000000000000000000000";
export function parseContract<T>(schema: z.ZodType<T>, input: unknown, traceId: string): ContractResult<T> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  const safeTraceId = TraceIdSchema.safeParse(traceId);
  return { ok: false, error: { schema_version: 1, code: "SCHEMA_INVALID", message: "Contract validation failed", retryable: false, required_action: "correct_request", trace_id: safeTraceId.success ? safeTraceId.data : TraceIdSchema.parse(FALLBACK_TRACE_ID), details: result.error.issues.map((issue) => ({ path: issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number"), code: issue.code })) } };
}
