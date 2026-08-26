import { describe, expect, test } from "vitest";

import { createApiServer } from "../server.js";

describe("GET /v1/health", () => {
  test("Given a running API When health is requested Then it returns the complete bootstrap checks", async () => {
    const api = createApiServer({ version: "0.1.0" });

    try {
      const response = await api.inject({
        method: "GET",
        url: "/v1/health",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "ok",
        version: "0.1.0",
        checks: {
          api: "ok",
          db: "not_configured",
          queue: "not_configured",
        },
      });
    } finally {
      await api.close();
    }
  });

  test("Given projection health When health is requested Then it includes event-store lag", async () => {
    const api = createApiServer({ version: "0.1.0", projectionHealth: { status: "degraded", projection_lag: 2 } });

    try {
      const response = await api.inject({
        method: "GET",
        url: "/v1/health",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "ok",
        version: "0.1.0",
        checks: {
          api: "ok",
          db: "not_configured",
          queue: "not_configured",
          event_store: {
            status: "degraded",
            projection_lag: 2,
          },
        },
      });
    } finally {
      await api.close();
    }
  });

  test("Given live projection health When lag changes Then health reflects the latest value", async () => {
    let projectionLag = 0;
    const api = createApiServer({ version: "0.1.0", projectionHealth: () => ({ status: projectionLag === 0 ? "ok" : "degraded", projection_lag: projectionLag }) });

    try {
      const first = await api.inject({ method: "GET", url: "/v1/health" });
      projectionLag = 3;
      const second = await api.inject({ method: "GET", url: "/v1/health" });

      expect(first.json()["checks"]["event_store"]).toEqual({ status: "ok", projection_lag: 0 });
      expect(second.json()["checks"]["event_store"]).toEqual({ status: "degraded", projection_lag: 3 });
    } finally {
      await api.close();
    }
  });
});
