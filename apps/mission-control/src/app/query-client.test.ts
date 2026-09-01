import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { isLoopbackControlApiBaseUrl, queryStateTransitions, writeStateTransitions } from "./query-client.js";

const SOURCE_PATH = join(dirname(fileURLToPath(import.meta.url)), "query-client.ts");

describe("C10 query and write state matrix", () => {
  it("Given a query load When it resolves Then only documented read states are reachable", () => {
    expect(queryStateTransitions.loading).toEqual(["ready", "empty", "error", "offline", "permission-filtered"]);
  });

  it("Given a write submission When it resolves Then success conflict validation and permission states are distinct", () => {
    expect(writeStateTransitions.submitting).toEqual(["success", "validation_error", "permission_denied", "conflict"]);
  });

  it("uses same-site HttpOnly cookie auth without reading a build-time bearer token", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");

    expect(source).not.toContain("VITE_NEXORA_CONTROL_TOKEN");
    expect(source).not.toContain("authorizationHeader");
    expect(source).toContain("credentials: \"include\"");
    expect(source).toContain("/v1/auth/local-session");
  });

  it("limits automatic local-session bootstrap to loopback control APIs", () => {
    expect(isLoopbackControlApiBaseUrl("http://127.0.0.1:4310")).toBe(true);
    expect(isLoopbackControlApiBaseUrl("http://localhost:4310")).toBe(true);
    expect(isLoopbackControlApiBaseUrl("https://control.nexora.example")).toBe(false);
    expect(isLoopbackControlApiBaseUrl("not-a-url")).toBe(false);
  });
});
