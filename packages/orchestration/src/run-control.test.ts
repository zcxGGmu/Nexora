import { describe, expect, it } from "vitest";
import { migrate, openDatabase } from "@nexora/persistence";
import { DurableQueue } from "./queue.js";
import { LeaseManager } from "./lease.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  agent: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  attempt: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  step: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  job: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  lease: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
} as const;
const TIME = "2026-08-27T04:00:00.000Z";

describe("run-level orchestration controls", () => {
  it("Given a paused run When a worker claims work Then queued jobs for that run are skipped", () => {
    const database = createDatabase("paused");
    const leases = new LeaseManager(database, { now: () => TIME });

    try {
      const claim = leases.claimNext({ workspace_id: IDS.workspace, worker_id: "worker-a", lease_id: IDS.lease, now: TIME });

      expect(claim).toBeUndefined();
      expect(new DurableQueue(database).get(IDS.workspace, IDS.job)?.status).toBe("queued");
    } finally {
      database.close();
    }
  });

  it("Given a run with queued and leased jobs When run cancel is requested Then every job gets an explicit cancel state", () => {
    const database = createDatabase("running");
    const queue = new DurableQueue(database, { now: () => TIME });
    const leases = new LeaseManager(database, { now: () => TIME });
    const lease = leases.claimNext({ workspace_id: IDS.workspace, worker_id: "worker-a", lease_id: IDS.lease, now: TIME });
    if (lease === undefined) throw new Error("Expected first lease");
    queue.enqueue({ id: "01KRZ3NDEKTSV4RRFFQ69K5FAV", workspace_id: IDS.workspace, run_id: IDS.run, step_id: IDS.step, idempotency_key: "run-control:queued", request_hash: "sha256:queued", available_at: TIME, max_attempts: 3, payload: { kind: "queued" } });

    try {
      const cancelled = queue.requestCancelRun(IDS.workspace, IDS.run);

      expect(cancelled.map((job) => job.status).sort()).toEqual(["cancel_requested", "cancelled"]);
      expect(queue.get(IDS.workspace, IDS.job)?.status).toBe("cancel_requested");
      expect(queue.get(IDS.workspace, "01KRZ3NDEKTSV4RRFFQ69K5FAV")?.status).toBe("cancelled");
    } finally {
      database.close();
    }
  });
});

function createDatabase(runStatus: "running" | "paused"): ReturnType<typeof openDatabase> {
  const database = openDatabase(":memory:");
  migrate(database, { now: () => TIME });
  const run = { id: IDS.run, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, ticket_id: IDS.ticket, execution_location: "local", status: runStatus, budget: { max_tokens: 10, max_cost_usd: 1 }, memory_snapshot: { snapshot_id: IDS.workspace, version: 1 }, connector_versions: { deterministic: "1.0.0" } };
  const step = { id: IDS.step, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, run_id: IDS.run, attempt_id: IDS.attempt, agent_id: IDS.agent, status: "pending", inputs: ["input://request"], outputs: ["output://result"], retry_policy: { max_attempts: 3, backoff_ms: 100 }, requires_review: false };
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(IDS.workspace, "Demo", TIME, TIME);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(IDS.agent, IDS.workspace, "{}", TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.goal, IDS.workspace, "Goal", "Objective", "[]", "{}", TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'ready', ?, ?, 1, ?, ?)").run(IDS.ticket, IDS.workspace, IDS.goal, "ticket:run-control", "{}", TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.ticket, runStatus, JSON.stringify(run), TIME, TIME);
  database.prepare("INSERT INTO attempts(id, workspace_id, run_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, 1, ?, ?)").run(IDS.attempt, IDS.workspace, IDS.run, "{}", TIME, TIME);
  database.prepare("INSERT INTO steps(id, workspace_id, run_id, attempt_id, agent_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, 1, ?, ?)").run(IDS.step, IDS.workspace, IDS.run, IDS.attempt, IDS.agent, JSON.stringify(step), TIME, TIME);
  new DurableQueue(database, { now: () => TIME }).enqueue({ id: IDS.job, workspace_id: IDS.workspace, run_id: IDS.run, step_id: IDS.step, idempotency_key: "run-control:leased", request_hash: "sha256:leased", available_at: TIME, max_attempts: 3, payload: { kind: "leased" } });
  return database;
}
