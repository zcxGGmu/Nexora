import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MissionControlPage, missionControlFixture } from "./MissionControlPage.js";

describe("C10 Mission Control page", () => {
  it("Given the default projection When rendered Then attention runs goals artifacts and review rail appear in priority order", () => {
    const markup = renderToStaticMarkup(<MissionControlPage view={missionControlFixture} />);

    expect(markup.indexOf("Needs Attention")).toBeLessThan(markup.indexOf("Active Runs"));
    expect(markup.indexOf("Active Runs")).toBeLessThan(markup.indexOf("Goals"));
    expect(markup.indexOf("Goals")).toBeLessThan(markup.indexOf("Recent Artifacts"));
    expect(markup).toContain("Open Review");
    expect(markup).toContain("Pause allowed run");
    expect(markup).toContain("R3 review expires");
    expect(markup).not.toContain("Run everything");
  });

  it("Given no projection rows When rendered Then an actionable empty state replaces blank panels", () => {
    const markup = renderToStaticMarkup(
      <MissionControlPage
        view={{ ...missionControlFixture, activeRuns: [], attention: [], goals: [], recentArtifacts: [] }}
      />,
    );

    expect(markup).toContain("No attention items in this scope");
    expect(markup).toContain("Create a Goal or clear the filter");
    expect(markup).not.toContain("Loading forever");
  });
});
