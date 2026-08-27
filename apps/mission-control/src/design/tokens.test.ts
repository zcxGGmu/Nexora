import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { statusTokens } from "./status.js";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

describe("C10 design tokens", () => {
  it("Given shell controls When styles are loaded Then every interactive family has a 44px target floor", () => {
    expect(css).toContain(".nav-link, .mobile-nav a, .topbar button, .topbar a, .row-action, .primary-action { min-block-size: 44px; min-inline-size: 44px;");
    expect(css).toContain(".search-control input { min-block-size: 44px;");
  });

  it("Given the mobile shell When styles are loaded Then topbar keeps only primary actions visible", () => {
    expect(css).toContain(".topbar-search-label, .topbar-create-label, .topbar-status-label, .scope-access-label { display: none; }");
    expect(css).toContain(".topbar .primary-action { display: none; }");
  });

  it("Given status badges When rendered Then color is paired with readable labels", () => {
    expect(Object.values(statusTokens).map((token) => token.label)).toEqual([
      "Needs action",
      "Informational",
      "Unavailable",
      "Verified",
      "Review required",
    ]);
  });
});
