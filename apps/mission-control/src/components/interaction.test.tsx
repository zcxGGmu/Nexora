import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KanbanBoard } from "./goals/KanbanBoard.js";
import { goalWorkspaceFixture } from "../pages/GoalPage.js";
import { DecisionSheet } from "./review/DecisionSheet.js";
import { staleReviewFixture } from "../pages/ReviewPage.js";
import { ReceiptTabs } from "./artifacts/ReceiptTabs.js";
import { artifactFixture } from "../pages/ArtifactPage.js";
import { ConflictResolver } from "./memory/ConflictResolver.js";
import { memoryFixture } from "../pages/MemoryPage.js";

describe("C11 interaction contracts", () => {
  it("Given kanban status controls When rendered Then drag has a keyboard menu alternative and never auto-runs an Agent", () => {
    const markup = renderToStaticMarkup(<KanbanBoard lanes={goalWorkspaceFixture.lanes} />);

    expect(markup).toContain("Drag updates planning only");
    expect(markup).toContain("does not start an Agent");
    expect(markup).toContain("aria-label=\"Change ticket status\"");
  });

  it("Given stale review evidence When rendered Then the approve control is disabled but reject and request changes remain reasoned decisions", () => {
    const markup = renderToStaticMarkup(<DecisionSheet review={staleReviewFixture.review} />);

    expect(markup).toContain("Payload hash stale");
    expect(markup).toContain("Refresh evidence before approval");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain("Reject");
    expect(markup).toContain("Request changes");
  });

  it("Given receipts and memory conflicts When rendered Then tabs and resolver expose source evidence before mutation", () => {
    const markup = renderToStaticMarkup(
      <section>
        <ReceiptTabs artifact={artifactFixture.artifact} />
        <ConflictResolver conflict={memoryFixture.conflict} />
      </section>,
    );

    expect(markup).toContain("Receipt rcp-artifact-v1");
    expect(markup).toContain("role=\"tabpanel\"");
    expect(markup).toContain("Diff compares v1 with the previous version");
    expect(markup).toContain("Source Run run-active created receipt rcp-artifact-v1");
    expect(markup).toContain("Review candidate version");
    expect(markup).toContain("Never silently overwrite memory");
  });
});
