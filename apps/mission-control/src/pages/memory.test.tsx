import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MemoryPage, memoryFixture } from "./MemoryPage.js";

describe("C11 Memory workspace", () => {
  it("Given memory provenance When rendered Then scope type source consumers trust diff conflict and rollback are inspectable", () => {
    const markup = renderToStaticMarkup(<MemoryPage view={memoryFixture} />);

    for (const expected of [
      "Memory Explorer",
      "Scope Project / Content refresh",
      "Type SOP",
      "Source Run run-active",
      "Consumers draft-writer, reviewer-checklist",
      "Trust verified with receipt",
      "Version Diff",
      "Conflict Resolver",
      "Rollback to v2",
      "Never silently overwrite memory",
      "Open source receipt",
    ]) {
      expect(markup).toContain(expected);
    }
  });
});
