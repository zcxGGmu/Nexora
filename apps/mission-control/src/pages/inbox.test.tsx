import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { pageForRoute } from "../app/detail-pages.js";
import { parseRouteUrl } from "../app/router.js";
import { InboxPage, inboxFixture, inboxItemsForTab } from "./InboxPage.js";

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

  it("Given inbox tabs When a category is selected Then only matching attention items remain", () => {
    expect(inboxItemsForTab(inboxFixture.items, "Approvals").map((item) => item.type)).toEqual(["Approval"]);
    expect(inboxItemsForTab(inboxFixture.items, "Failures").map((item) => item.type)).toEqual(["Failure"]);
    expect(inboxItemsForTab(inboxFixture.items, "Mentions")).toEqual([]);
    expect(inboxItemsForTab(inboxFixture.items, "Handoffs")).toEqual([]);
  });

  it("Given an inbox tab deep link When the route renders Then the requested tab is selected", () => {
    const route = parseRouteUrl("http://nexora.local/inbox?workspace=ws-demo&tab=approvals");
    const markup = renderToStaticMarkup(pageForRoute(route));

    expect(markup).toMatch(/<button[^>]*id="inbox-tab-approvals"[^>]*aria-selected="true"[^>]*>Approvals<\/button>/);
    expect(markup).toContain("R3 publish review");
    expect(markup).not.toContain("Run needs operator attention");
  });
});
