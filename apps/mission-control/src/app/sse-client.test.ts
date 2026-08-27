import { describe, expect, it } from "vitest";

import { buildRunEventsUrl, createEventStreamState, reduceEventStreamState } from "./sse-client.js";

describe("C10 SSE client contract", () => {
  it("Given duplicate event ids When stream events are reduced Then only first event is applied", () => {
    const first = reduceEventStreamState(createEventStreamState(), {
      event_id: "event-1",
      event_type: "run.started",
      occurred_at: "2026-08-27T04:00:00.000Z",
      run_id: "run-1",
      schema_version: 1,
      sequence: 1,
      workspace_id: "ws-a",
      attempt_id: null,
      step_id: null,
    });
    const duplicate = reduceEventStreamState(first, {
      event_id: "event-1",
      event_type: "run.started",
      occurred_at: "2026-08-27T04:00:00.000Z",
      run_id: "run-1",
      schema_version: 1,
      sequence: 1,
      workspace_id: "ws-a",
      attempt_id: null,
      step_id: null,
    });
    const second = reduceEventStreamState(duplicate, {
      event_id: "event-2",
      event_type: "review.requested",
      occurred_at: "2026-08-27T04:01:00.000Z",
      run_id: "run-1",
      schema_version: 1,
      sequence: 2,
      workspace_id: "ws-a",
      attempt_id: "attempt-1",
      step_id: "step-1",
    });

    expect(second.events.map((event) => event.event_id)).toEqual(["event-1", "event-2"]);
    expect(second.lastEventId).toBe("event-2");
    expect(second.cursor).toBe("2");
  });

  it("Given run stream coordinates When URL is built Then C09 endpoint and cursor parameters are preserved", () => {
    const url = buildRunEventsUrl({
      after: "cursor-7",
      apiBaseUrl: "http://127.0.0.1:4310",
      limit: 50,
      runId: "run-1",
      stepId: "step-1",
      workspace: "ws-a",
    });

    expect(url).toBe("http://127.0.0.1:4310/v1/runs/run-1/events?workspace_id=ws-a&after=cursor-7&limit=50&step_id=step-1");
  });
});
