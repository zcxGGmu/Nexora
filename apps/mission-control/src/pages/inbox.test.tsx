import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InboxPage, inboxFixture } from "./InboxPage.js";

describe("C10 Inbox page", () => {
  it("Given inbox work items When rendered Then tabs and selected evidence detail are visible", () => {
    const markup = renderToStaticMarkup(<InboxPage view={inboxFixture} />);

    for (const label of ["Attention", "Mentions", "Approvals", "Failures", "Handoffs"]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("R3 publish review");
    expect(markup).toContain("Evidence detail");
    expect(markup).toContain("Open Run");
  });

  it("Given permission-filtered inbox When rendered Then the page distinguishes empty from unavailable", () => {
    const markup = renderToStaticMarkup(<InboxPage view={{ ...inboxFixture, items: [], mode: "permission-filtered" }} />);

    expect(markup).toContain("Inbox hidden by policy");
    expect(markup).toContain("Request an Owner to grant access");
  });
});
