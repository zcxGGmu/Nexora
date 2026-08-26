import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  ErrorResponseSchema,
  GoalSchema,
  parseContract,
} from "./index.js";

const ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("error semantics", () => {
  it("publishes the complete stable C01 error code set", () => {
    // Given / When / Then
    expect(ERROR_CODES).toEqual([
      "AUTH_EXPIRED",
      "SCOPE_DENIED",
      "POLICY_DENIED",
      "POLICY_REVIEW_REQUIRED",
      "RATE_LIMITED",
      "CONNECTOR_TIMEOUT",
      "SCHEMA_INVALID",
      "BUDGET_EXCEEDED",
      "DUPLICATE_SIDE_EFFECT",
      "RUNTIME_CRASHED",
      "STALE_LEASE",
      "REVIEW_STALE",
      "MEMORY_CONFLICT",
      "IDEMPOTENCY_KEY_REUSED",
      "CONNECTOR_UNAVAILABLE",
      "PROJECTION_DEGRADED",
      "EVENT_CURSOR_EXPIRED",
      "INVALID_STATE_TRANSITION",
      "VERSION_CONFLICT",
    ]);
  });

  it("accepts a strict versioned error response", () => {
    // Given
    const response = {
      schema_version: 1,
      code: "RATE_LIMITED",
      message: "Try later",
      retryable: true,
      required_action: "retry",
      trace_id: ULID,
      details: [{ path: ["connector"], code: "throttled" }],
    };

    // When / Then
    expect(ErrorResponseSchema.parse(response)).toEqual(response);
  });

  it("returns a redacted SCHEMA_INVALID result at the parse boundary", () => {
    // Given
    const rejected = { title: "secret-token", schema_version: 2 };

    // When
    const result = parseContract(GoalSchema, rejected, ULID);

    // Then
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const json = JSON.stringify(result.error);
      expect(result.error.code).toBe("SCHEMA_INVALID");
      expect(result.error.details.length).toBeGreaterThan(0);
      expect(json).not.toContain("secret-token");
      expect(json).not.toContain("stack");
      expect(json).not.toContain("cause");
    }
  });

  it("rejects unknown error response fields and unsafe detail fields", () => {
    // Given
    const response = {
      schema_version: 1, code: "SCHEMA_INVALID", message: "Invalid",
      retryable: false, required_action: "correct_request", trace_id: ULID,
      details: [{ path: ["title"], code: "invalid_type", value: "secret" }],
    };

    // When / Then
    expect(ErrorResponseSchema.safeParse(response).success).toBe(false);
  });

  it("returns a redacted error with a safe trace fallback for malformed trace input", () => {
    const result = parseContract(GoalSchema, { schema_version: 2 }, "not-a-trace");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.trace_id).toBe("00000000000000000000000000");
  });

  it("rejects unsafe or unbounded error strings", () => {
    const base = { schema_version: 1, code: "SCHEMA_INVALID", message: "Invalid", retryable: false, required_action: "correct_request", trace_id: ULID, details: [{ path: ["title"], code: "invalid_type" }] };
    expect(ErrorResponseSchema.safeParse({ ...base, message: "bad\nmessage" }).success).toBe(false);
    expect(ErrorResponseSchema.safeParse({ ...base, required_action: "retry now" }).success).toBe(false);
    expect(ErrorResponseSchema.safeParse({ ...base, details: [{ path: ["title"], code: "x".repeat(129) }] }).success).toBe(false);
  });
});
