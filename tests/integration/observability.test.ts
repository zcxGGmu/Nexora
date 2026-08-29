import { describe, expect, it } from "vitest";
import { EventEnvelopeSchema } from "../../packages/contracts/src/index.js";
import { collectOperationalMetrics, exportAuditLog, verifyAuditLog } from "../../packages/observability/src/index.js";
import { EventStore } from "../../packages/event-store/src/index.js";
import { closeControlFixture, createControlFixture, IDS, seedAttemptStepAndJob, seedRun, TIME } from "../../apps/api/src/routes/test-fixtures.js";

const EVENT_ID = "01VRZ3NDEKTSV4RRFFQ69V5FAV";
const TRACE_ID = "01WRZ3NDEKTSV4RRFFQ69W5FAV";

describe("C15 observability integration", () => {
  it("Given a configured database When health is requested Then queue metrics and DB status are reported", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database);
    seedAttemptStepAndJob(fixture.database);

    try {
      const response = await fixture.api.inject({ method: "GET", url: "/v1/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "ok",
        checks: {
          db: { status: "ok" },
          queue: { status: "ok", backlog: 1, by_status: { queued: 1 } },
          costs: { budgeted_runs: 1, max_cost_usd: 10 },
        },
      });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given queue and run state When metrics are collected Then status counts and budget totals are scoped to the workspace", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database);
    seedAttemptStepAndJob(fixture.database);

    try {
      const metrics = collectOperationalMetrics(fixture.database, { workspace_id: IDS.workspace });

      expect(metrics.queue.by_status).toMatchObject({ queued: 1 });
      expect(metrics.runs.by_status).toMatchObject({ queued: 1 });
      expect(metrics.costs).toMatchObject({ budgeted_runs: 1, max_tokens: 10_000, max_cost_usd: 10 });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an event stream When an audit log is exported Then the hash chain detects tampering", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database);
    const events = new EventStore(fixture.database, { now: () => TIME });
    events.append(EventEnvelopeSchema.parse({
      event_id: EVENT_ID,
      event_type: "run.created",
      schema_version: 1,
      occurred_at: TIME,
      workspace_id: IDS.workspace,
      scope: { kind: "run", id: IDS.run },
      trace_id: TRACE_ID,
      run_id: IDS.run,
      attempt_id: null,
      step_id: null,
      actor: { type: "system", id: null },
      payload: { status: "queued" },
      redactions: [],
      sequence: 0,
    }), -1);

    try {
      const audit = exportAuditLog(fixture.database, { workspace_id: IDS.workspace });
      const tampered = { ...audit, entries: audit.entries.map((entry) => entry.event_id === EVENT_ID ? { ...entry, event_type: "run.failed" } : entry) };
      const tamperedResult = verifyAuditLog(tampered);

      expect(verifyAuditLog(audit)).toEqual({ valid: true, failures: [] });
      expect(tamperedResult.valid).toBe(false);
      expect(tamperedResult.failures).toContainEqual({ event_id: EVENT_ID, code: "RECORD_HASH_MISMATCH" });
    } finally {
      await closeControlFixture(fixture);
    }
  });
});
