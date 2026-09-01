import { describe, expect, it } from "vitest";

import { buildRouteHref, parseRouteUrl, routeDefinitions } from "./router.js";

describe("C10 route contract", () => {
  it("Given required app destinations When routes are declared Then shell covers every C10 deep link", () => {
    const paths = routeDefinitions.map((route) => route.path);

    expect(paths).toEqual([
      "/design-system",
      "/mission-control",
      "/cowork/:conversationId?",
      "/inbox",
      "/goals",
      "/tickets",
      "/runs/:id",
      "/workflows/:workflowId/runs/:runId",
      "/workflows/:workflowId?",
      "/review/:id",
      "/artifacts/:id",
      "/memory",
      "/settings",
      "/registry",
      "/gateway",
    ]);
  });

  it("Given a run deep link When parsed Then scope filters tabs and cursor are preserved", () => {
    const route = parseRouteUrl("http://nexora.local/runs/run-01?workspace=ws-a&site=site-a&project=proj-a&filter=active&tab=events&cursor=evt-12");

    expect(route.key).toBe("runs");
    expect(route.params).toEqual({ id: "run-01" });
    expect(route.urlState).toEqual({
      workspace: "ws-a",
      site: "site-a",
      project: "proj-a",
      filter: "active",
      tab: "events",
      cursor: "evt-12",
    });
  });

  it("Given URL state When a route href is built Then back navigation can restore the same view", () => {
    const href = buildRouteHref("inbox", {
      workspace: "ws-a",
      site: "site-a",
      project: "proj-a",
      filter: "approvals",
      tab: "handoffs",
      cursor: "after-7",
    });

    expect(href).toBe("/inbox?workspace=ws-a&site=site-a&project=proj-a&filter=approvals&tab=handoffs&cursor=after-7");
  });

  it("preserves workspace and health filter on the registry deep link", () => {
    const route = parseRouteUrl("http://nexora.local/registry?workspace=ws-a&filter=degraded");
    expect(route.key).toBe("registry");
    expect(route.urlState.workspace).toBe("ws-a");
    expect(route.urlState.filter).toBe("degraded");
    expect(buildRouteHref("registry", route.urlState)).toBe("/registry?workspace=ws-a&filter=degraded");
  });
});
