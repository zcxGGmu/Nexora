import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { pageForRoute } from "../app/detail-pages.js";
import { parseRouteUrl } from "../app/router.js";
import { WorkflowPage, WorkflowRunPage, seoWorkflowRunFixture, seoWorkflowTemplateFixture } from "./WorkflowPage.js";

describe("C12 Workflow pages", () => {
  it("Given the SEO workflow page When rendered Then stations gates budget retry and no-publish review boundary are visible", () => {
    const markup = renderToStaticMarkup(<WorkflowPage view={seoWorkflowTemplateFixture} />);

    for (const expected of ["Workflow Studio", "seo_draft_v1", "GSC fixture", "Draft writer", "Independent Judge", "Human Review", "retry failed step only", "publish disabled", "unknown side effect reconcile", "Start SEO draft run"]) {
      expect(markup).toContain(expected);
    }
  });

  it("Given an SEO workflow run page When rendered Then source receipt judge handoff and waiting review are visible", () => {
    const markup = renderToStaticMarkup(<WorkflowRunPage view={seoWorkflowRunFixture} />);

    for (const expected of ["SEO Draft Run", "waiting_review", "fixtures/gsc/acme-2026-08-28.json", "Judge pass", "No publish or indexing call executed", "Review pending", "handoff expires", "Open Review"] ) {
      expect(markup).toContain(expected);
    }
  });

  it("Given an unknown workflow run deep link When rendered Then the shell shows a missing run boundary", () => {
    const route = parseRouteUrl("http://nexora.local/workflows/seo_draft_v1/runs/unknown-run?workspace=ws-demo");
    const markup = renderToStaticMarkup(pageForRoute(route));

    expect(markup).toContain("Run not found");
    expect(markup).toContain("unknown-run");
  });
});
