import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReviewPage, reviewFixture, staleReviewFixture } from "./ReviewPage.js";

describe("C11 Review workspace", () => {
  it("Given a current review When rendered Then diff evidence judge cost risk scope hash and exact decisions share one screen", () => {
    const markup = renderToStaticMarkup(<ReviewPage view={reviewFixture} />);

    for (const expected of [
      "Review Center",
      "Payload Diff",
      "Source Receipts",
      "Judge independent-source-check",
      "Cost $0.38",
      "Risk R2",
      "Scope Workspace / SEO launch",
      "Reversible by creating artifact v2",
      "Payload hash sha256:7f4a6d15c0e2",
      "Expires 2026-08-28 10:30 UTC",
      "Approve",
      "Reject",
      "Request changes",
      "Reason required",
      "Confirm exact payload hash",
    ]) {
      expect(markup).toContain(expected);
    }
    expect(markup).not.toContain("Auto approve");
  });

  it("Given a stale review When rendered Then approval is disabled and the next action requires refresh", () => {
    const markup = renderToStaticMarkup(<ReviewPage view={staleReviewFixture} />);

    expect(markup).toContain("Payload hash stale");
    expect(markup).toContain("Refresh evidence before approval");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).not.toContain("approval available");
  });
});
