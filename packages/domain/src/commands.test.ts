import { describe, expect, it } from "vitest";
import { CreateRunCommandSchema, TransitionRunCommandSchema } from "./index.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("domain commands", () => {
  it("accepts scoped versioned commands", () => {
    expect(CreateRunCommandSchema.parse({ workspace_id: ID, ticket_id: ID, idempotency_key: "run-1" })).toEqual({ workspace_id: ID, ticket_id: ID, idempotency_key: "run-1" });
    expect(TransitionRunCommandSchema.parse({ workspace_id: ID, run_id: ID, to_status: "paused", expected_version: 1 })).toMatchObject({ run_id: ID, to_status: "paused" });
  });

  it("rejects unknown fields, invalid scope IDs, and non-positive versions", () => {
    expect(CreateRunCommandSchema.safeParse({ workspace_id: ID, ticket_id: ID, idempotency_key: "run-1", secret: "x" }).success).toBe(false);
    expect(TransitionRunCommandSchema.safeParse({ workspace_id: "bad", run_id: ID, to_status: "paused", expected_version: 1 }).success).toBe(false);
    expect(TransitionRunCommandSchema.safeParse({ workspace_id: ID, run_id: ID, to_status: "paused", expected_version: 0 }).success).toBe(false);
  });
});
