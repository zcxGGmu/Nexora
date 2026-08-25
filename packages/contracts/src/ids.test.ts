import { describe, expect, it } from "vitest";
import { AgentIdSchema, GoalIdSchema, WorkspaceIdSchema } from "./index.js";

const VALID_ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("entity IDs", () => {
  it("parses a canonical uppercase ULID when the wire value is valid", () => {
    // Given
    const wireValue = VALID_ULID;

    // When
    const parsed = AgentIdSchema.safeParse(wireValue);

    // Then
    expect(parsed).toEqual({ success: true, data: wireValue });
  });

  it.each([
    "01arz3ndektsv4rrffq69g5fav",
    "agent_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "01ARZ3NDEKTSV4RRFFQ69G5FA",
    "01ARZ3NDEKTSV4RRFFQ69G5FAI",
    "81ARZ3NDEKTSV4RRFFQ69G5FAV",
  ])("rejects malformed ID %s", (wireValue) => {
    // Given / When
    const parsed = AgentIdSchema.safeParse(wireValue);

    // Then
    expect(parsed.success).toBe(false);
  });

  it("exports independently branded entity schemas", () => {
    // Given / When
    const agent = AgentIdSchema.parse(VALID_ULID);
    const goal = GoalIdSchema.parse(VALID_ULID);
    const workspace = WorkspaceIdSchema.parse(VALID_ULID);

    // Then
    expect([agent, goal, workspace]).toEqual([VALID_ULID, VALID_ULID, VALID_ULID]);
  });
});
