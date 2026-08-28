import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RunDetailPage, runDetailFixture } from "./RunDetailPage.js";

describe("C11 Run Detail page", () => {
  it("Given an observable run When rendered Then trigger runtime budget timeline artifacts receipts and recovery actions stay visible", () => {
    const markup = renderToStaticMarkup(<RunDetailPage view={runDetailFixture} />);

    for (const expected of [
      "Run Detail",
      "Trigger",
      "Quick Cowork command",
      "Ticket SEO-147",
      "Agent Writer",
      "Model gpt-5.6-terra",
      "Tools draft-writer, judge, memory.read",
      "Budget used $1.42 of $3.00",
      "Location local deterministic runtime",
      "Attempt 2 of 3",
      "Timeline",
      "Artifact evidence-summary.md v1",
      "Receipt rcp-run-active-02",
      "Pause run",
      "Stop run",
      "Retry failed step",
      "Completed side effects remain recorded",
      "Retry creates a new attempt",
    ]) {
      expect(markup).toContain(expected);
    }
    expect(markup.indexOf("Accepted command")).toBeLessThan(markup.indexOf("Draft artifact created"));
    expect(markup.indexOf("Draft artifact created")).toBeLessThan(markup.indexOf("Waiting for R2 review"));
    expect(markup).not.toContain("Completed successfully");
  });
});
