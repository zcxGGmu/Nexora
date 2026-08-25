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
});
