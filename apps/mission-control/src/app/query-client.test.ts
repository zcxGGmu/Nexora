import { describe, expect, it } from "vitest";

import { queryStateTransitions, writeStateTransitions } from "./query-client.js";

describe("C10 query and write state matrix", () => {
  it("Given a query load When it resolves Then only documented read states are reachable", () => {
    expect(queryStateTransitions.loading).toEqual(["ready", "empty", "error", "offline", "permission-filtered"]);
  });

  it("Given a write submission When it resolves Then success conflict validation and permission states are distinct", () => {
    expect(writeStateTransitions.submitting).toEqual(["success", "validation_error", "permission_denied", "conflict"]);
  });
});
