import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GoalPage, goalWorkspaceFixture } from "./GoalPage.js";
import { TicketPage, ticketFixture } from "./TicketPage.js";

describe("C11 Goal and Ticket pages", () => {
  it("Given the goal workspace When rendered Then hierarchy and kanban lanes are separate and keyboard status changes do not start Agents", () => {
    const markup = renderToStaticMarkup(<GoalPage view={goalWorkspaceFixture} />);

    for (const expected of [
      "Goal Portfolio",
      "Goal: Ship verified SEO workflow",
      "Milestone: Source-backed launch draft",
      "Ticket SEO-147",
      "Run run-active",
      "Backlog",
      "Ready",
      "Running",
      "Review",
      "Done",
      "Blocked",
      "Paused",
      "Failed",
      "Drag updates planning only",
      "does not start an Agent",
      "aria-label=\"Change ticket status\"",
    ]) {
      expect(markup).toContain(expected);
    }
    expect(markup.indexOf("Goal: Ship verified SEO workflow")).toBeLessThan(markup.indexOf("Milestone: Source-backed launch draft"));
    expect(markup.indexOf("Milestone: Source-backed launch draft")).toBeLessThan(markup.indexOf("Ticket SEO-147"));
    expect(markup.indexOf("Ticket SEO-147")).toBeLessThan(markup.indexOf("Run run-active"));
  });

  it("Given a ticket deep link When rendered Then the ticket shows run evidence and reviewer handoff without pretending work has executed", () => {
    const markup = renderToStaticMarkup(<TicketPage view={ticketFixture} />);

    expect(markup).toContain("Ticket Detail");
    expect(markup).toContain("SEO-147");
    expect(markup).toContain("Linked Run run-active");
    expect(markup).toContain("Pending R2 review");
    expect(markup).toContain("Open Run evidence");
    expect(markup).toContain("Start Agent requires explicit command");
    expect(markup).not.toContain("Agent started");
  });
});
