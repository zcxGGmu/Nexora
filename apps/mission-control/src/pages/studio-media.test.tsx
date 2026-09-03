import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pageForRoute } from "../app/detail-pages.js";
import { buildRouteHref, parseRouteUrl } from "../app/router.js";
import { StudioMediaPage, StudioMediaPageContent, studioMediaFixture } from "./StudioMediaPage.js";

describe("C25 Studio/Media Mission Control surface", () => {
  it("shows media render notebook generation avatar consent and descriptor-only boundaries", () => {
    const markup = renderToStaticMarkup(<StudioMediaPage view={studioMediaFixture} />);

    expect(markup).toContain("Studio / Media");
    expect(markup).toContain("Descriptor-only studio control");
    expect(markup).toContain("No external provider");
    expect(markup).toContain("Notebook snapshots");
    expect(markup).toContain("Notebook sources");
    expect(markup).toContain("Notebook generations");
    expect(markup).toContain("Avatar consent");
    expect(markup).toContain("Render queue");
    expect(markup).toContain("Share facts");
    expect(markup).toContain("Temporary URL");
    expect(markup).not.toContain("<table");
  });

  it("wires Preview Share Rerender Generate and Revoke controls to real handlers", () => {
    const commands: string[] = [];
    const element = StudioMediaPageContent({
      view: studioMediaFixture,
      onStudioCommand: (targetId, command) => commands.push(`${command}:${targetId}`),
    });

    expect(renderToStaticMarkup(element)).toContain("Preview");
    expect(renderToStaticMarkup(element)).toContain("Share");
    expect(renderToStaticMarkup(element)).toContain("Rerender");
    expect(renderToStaticMarkup(element)).toContain("Generate brief");
    expect(renderToStaticMarkup(element)).toContain("Revoke avatar");
  });

  it("routes the production Studio/Media page by workspace instead of injecting the fixture", () => {
    const route = parseRouteUrl("http://nexora.local/studio-media?workspace=ws-demo");
    const page = pageForRoute(route);

    expect(route.key).toBe("studio-media");
    expect(buildRouteHref("studio-media", route.urlState)).toBe("/studio-media?workspace=ws-demo");
    expect(page).toMatchObject({ props: { workspaceId: "ws-demo" } });
    expect(page).not.toMatchObject({ props: { view: expect.anything() } });
  });
});
