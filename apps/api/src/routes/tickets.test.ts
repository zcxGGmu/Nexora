import { describe, expect, it } from "vitest";
import { closeControlFixture, createControlFixture, IDS, ownerHeader } from "./test-fixtures.js";

describe("Control API ticket queries", () => {
  it("Given persisted tickets When queried through the API Then idempotency keys are omitted", async () => {
    const fixture = createControlFixture();

    try {
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/tickets/${IDS.ticket}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      const list = await fixture.api.inject({ method: "GET", url: `/v1/tickets?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(detail.statusCode).toBe(200);
      expect(list.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ ticket: { id: IDS.ticket, goal_id: IDS.goal } });
      expect(JSON.stringify(detail.json())).not.toContain("idempotency_key");
      expect(JSON.stringify(list.json())).not.toContain("idempotency_key");
    } finally {
      await closeControlFixture(fixture);
    }
  });
});
