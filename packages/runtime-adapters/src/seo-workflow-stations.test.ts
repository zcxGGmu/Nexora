import { describe, expect, it } from "vitest";

import { AttemptIdSchema, LeaseIdSchema, RunIdSchema, StepIdSchema, TraceIdSchema } from "@nexora/contracts";
import { DeterministicAdapter } from "./index.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("C12 deterministic workflow stations", () => {
  it("Given the seo_draft_v1 scenario When collected Then stations end at review_needed without business publish success", async () => {
    const adapter = new DeterministicAdapter({ scenario: "seo_draft_v1", now: () => "2026-08-28T04:00:00.000Z" });
    const handle = await adapter.start({
      attempt_id: AttemptIdSchema.parse(ID),
      deadline_at: "2026-08-28T04:01:00.000Z",
      fencing_token: 8,
      input: { workflow_id: "seo_draft_v1" },
      lease_id: LeaseIdSchema.parse(ID),
      run_id: RunIdSchema.parse(ID),
      step_id: StepIdSchema.parse(ID),
      trace_id: TraceIdSchema.parse(ID),
    });

    const events = [];
    for await (const event of adapter.collect(handle)) events.push(event);

    expect(events.map((event) => event.type)).toEqual(["started", "tool_called", "artifact_created", "judge_completed", "review_needed"]);
    expect(events.at(-1)?.data).toMatchObject({ publish_disabled: true, run_status: "waiting_review", workflow_id: "seo_draft_v1" });
    expect(events.at(-1)?.data).not.toHaveProperty("business_status");
  });
});
