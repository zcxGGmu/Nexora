import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { pageForRoute } from "../app/detail-pages.js";
import { parseRouteUrl } from "../app/router.js";
import { GoalModeUnavailableFallback, GoalPage, goalWorkspaceFixture } from "./GoalPage.js";

describe("C20 Mission Control Goal Mode surface", () => {
  it("Given the Goal page When rendered Then loop judge continuation and descriptor-only controls are visible", () => {
    const markup = renderToStaticMarkup(<GoalPage view={goalWorkspaceFixture} />);

    for (const expected of [
      "Goal Mode",
      "Descriptor-only loop",
      "No external connection",
      "Judge JSON { done, reason }",
      "Max turns",
      "Deadline",
      "Budget",
      "Continuation cursor",
      "Run scope",
      "Session scope",
      "/goal resume",
      "/subgoal",
      "Orphan recovery",
      "Judge failure cannot claim success",
      "Pause",
      "Resume",
      "Steer",
      "Judge",
    ]) {
      expect(markup).toContain(expected);
    }

    expect(markup).toContain("data-control-kind=\"pause\"");
    expect(markup).toContain("data-control-kind=\"resume\"");
    expect(markup).toContain("data-control-kind=\"judge\"");
    expect(markup).toContain("data-control-kind=\"subgoal\"");
    expect(markup).not.toContain("Send external message");
  });

  it("Given the Goal Mode API is unavailable When rendered Then the planning fixture remains usable", () => {
    const markup = renderToStaticMarkup(<GoalModeUnavailableFallback />);

    for (const expected of [
      "Goal Mode control data unavailable; showing local planning fixture",
      "No external connection was attempted",
      "Drag updates planning only",
      "aria-label=\"Change ticket status\"",
      "Status change queued as planning update only; no Agent started.",
      "Descriptor-only loop",
      "Pause",
      "Steer",
      "/goal resume",
      "/subgoal",
    ]) {
      expect(markup).toContain(expected);
    }
  });

  it("Given the C20 Goal Mode deep link When routed Then Mission Control renders the live Goal page", () => {
    const page = pageForRoute(parseRouteUrl("http://nexora.local/goal-mode?workspace=ws-demo"));

    expect(page).toMatchObject({ props: { workspaceId: "ws-demo" } });
    expect(page).not.toMatchObject({ props: { view: expect.anything() } });
  });

  it("Given the legacy Goals route When routed Then Mission Control keeps the planning fixture", () => {
    const markup = renderToStaticMarkup(pageForRoute(parseRouteUrl("http://nexora.local/goals?workspace=ws-demo&filter=running")));

    expect(markup).toContain("Drag updates planning only");
    expect(markup).toContain("Status change queued as planning update only; no Agent started.");
  });
});
