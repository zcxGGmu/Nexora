import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactPage, artifactFixture } from "./ArtifactPage.js";

describe("C11 Artifact workspace", () => {
  it("Given a fixed artifact version When rendered Then preview diff source and receipt tabs explain versioned provenance", () => {
    const markup = renderToStaticMarkup(<ArtifactPage view={artifactFixture} />);

    for (const expected of [
      "Artifact Workspace",
      "Artifact evidence-summary.md",
      "Fixed version v1",
      "Preview",
      "Diff",
      "Source",
      "Receipt",
      "Source Run run-active",
      "Receipt rcp-artifact-v1",
      "Editing creates a new artifact version",
      "old approvals stay bound to v1",
    ]) {
      expect(markup).toContain(expected);
    }
  });

  it("Given a receipt tab deep link When rendered Then the receipt panel is selected first", () => {
    const markup = renderToStaticMarkup(<ArtifactPage selectedTab="Receipt" view={artifactFixture} />);

    expect(markup).toMatch(/<button[^>]*aria-selected="true"[^>]*id="artifact-tab-receipt"[^>]*>Receipt<\/button>/);
    expect(markup).toContain("Receipt rcp-artifact-v1 verifies evidence-summary.md v1.");
  });
});
