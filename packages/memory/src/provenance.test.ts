import { describe, expect, it } from "vitest";
import { canonicalSnapshotHash } from "./provenance.js";

describe("remote snapshot provenance", () => {
  it("Given equivalent snapshot values with different key order When hashed Then the canonical hashes match", () => {
    const first = canonicalSnapshotHash({ run_id: "run", budget: { max_tokens: 10, max_cost_usd: 1 }, refs: ["a", "b"] });
    const second = canonicalSnapshotHash({ refs: ["a", "b"], budget: { max_cost_usd: 1, max_tokens: 10 }, run_id: "run" });

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("Given snapshots with different array order When hashed Then the hashes differ", () => {
    const first = canonicalSnapshotHash({ refs: ["a", "b"] });
    const second = canonicalSnapshotHash({ refs: ["b", "a"] });

    expect(first).not.toBe(second);
  });
});
