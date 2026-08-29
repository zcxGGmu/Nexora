import { describe, expect, it } from "vitest";
import { AttemptSchema, RunSchema } from "@nexora/contracts";
import { migrate, openDatabase } from "@nexora/persistence";
import { AttemptManager, DurableQueue, LeaseManager } from "@nexora/orchestration";
import { WorkerLoop, type RetryAttemptFactory } from "./worker-loop.js";

const ID = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV", agent: "01BRZ3NDEKTSV4RRFFQ69G5FAV", goal: "01CRZ3NDEKTSV4RRFFQ69G5FAV", ticket: "01DRZ3NDEKTSV4RRFFQ69G5FAV", run: "01ERZ3NDEKTSV4RRFFQ69G5FAV", attempt: "01FRZ3NDEKTSV4RRFFQ69F5FAV", step: "01GRZ3NDEKTSV4RRFFQ69G5FAV", job: "01HRZ3NDEKTSV4RRFFQ69H5FAV", leaseA: "01JRZ3NDEKTSV4RRFFQ69J5FAV", leaseB: "01KRZ3NDEKTSV4RRFFQ69K5FAV"
} as const;
const START = "2026-08-26T04:00:00.000Z";

function createWorkerState(): { readonly database: ReturnType<typeof openDatabase>; readonly queue: DurableQueue; readonly leases: LeaseManager } {
  const database = openDatabase(":memory:");
  migrate(database, { now: () => START });
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(ID.workspace, "Demo", START, START);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(ID.agent, ID.workspace, "{}", START, START);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ID.goal, ID.workspace, "Goal", "Objective", "[]", "{}", START, START);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ID.ticket, ID.workspace, ID.goal, "ready", "ticket:worker", "{}", START, START);
  const runPayload = RunSchema.parse({ id: ID.run, workspace_id: ID.workspace, schema_version: 1, created_at: START, updated_at: START, ticket_id: ID.ticket, execution_location: "local", status: "queued", budget: { max_tokens: 10_000, max_cost_usd: 10 }, memory_snapshot: { snapshot_id: ID.workspace, version: 1 }, connector_versions: { deterministic: "1.0.0" } });
  const attemptPayload = AttemptSchema.parse({ id: ID.attempt, workspace_id: ID.workspace, schema_version: 1, created_at: START, updated_at: START, run_id: ID.run, status: "queued", execution_location: "local" });
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(ID.run, ID.workspace, ID.ticket, runPayload.status, JSON.stringify(runPayload), START, START);
  database.prepare("INSERT INTO attempts(id, workspace_id, run_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(ID.attempt, ID.workspace, ID.run, attemptPayload.status, JSON.stringify(attemptPayload), START, START);
  const stepPayload = { id: ID.step, workspace_id: ID.workspace, schema_version: 1, created_at: START, updated_at: START, run_id: ID.run, attempt_id: ID.attempt, agent_id: ID.agent, status: "pending", inputs: ["input://worker"], outputs: ["output://worker"], retry_policy: { max_attempts: 3, backoff_ms: 100 }, requires_review: false };
  database.prepare("INSERT INTO steps(id, workspace_id, run_id, attempt_id, agent_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ID.step, ID.workspace, ID.run, ID.attempt, ID.agent, "pending", JSON.stringify(stepPayload), START, START);
  const queue = new DurableQueue(database, { now: () => START });
  const leases = new LeaseManager(database, { now: () => START });
  queue.enqueue({ id: ID.job, workspace_id: ID.workspace, run_id: ID.run, step_id: ID.step, idempotency_key: "run:worker:step", request_hash: "sha256:worker", available_at: START, max_attempts: 3, payload: { fixture: "success" } });
  return { database, queue, leases };
}

function retryOptions(database: ReturnType<typeof openDatabase>): { readonly attempt_manager: AttemptManager; readonly retry_attempt_factory: RetryAttemptFactory } {
  return {
    attempt_manager: new AttemptManager(database),
    retry_attempt_factory: (_job, _lease, _next) => ({
      attempt: { id: "01SRZ3NDEKTSV4RRFFQ69S5FAV", workspace_id: ID.workspace, schema_version: 1 as const, created_at: START, updated_at: START, run_id: ID.run, status: "queued" as const },
      step: { id: "01TRZ3NDEKTSV4RRFFQ69T5FAV", workspace_id: ID.workspace, schema_version: 1 as const, created_at: START, updated_at: START, run_id: ID.run, attempt_id: "01SRZ3NDEKTSV4RRFFQ69S5FAV", agent_id: ID.agent, status: "pending" as const, inputs: ["input://worker"], outputs: ["output://worker"], retry_policy: { max_attempts: 3, backoff_ms: 100 }, requires_review: false },
    }),
  };
}

describe("worker loop", () => {
  it("Given a queued step When the worker completes Then it releases the lease and records a terminal queue state", async () => {
    const state = createWorkerState();
    const loop = new WorkerLoop({ queue: state.queue, leases: state.leases, workspace_id: ID.workspace, ...retryOptions(state.database), worker_id: "worker-a", lease_id_factory: () => ID.leaseA, handler: async () => ({ kind: "succeeded" }), clock: { now: () => START }, heartbeat_ms: 100 });

    await expect(loop.runOnce()).resolves.toEqual({ kind: "succeeded", job_id: ID.job, fencing_token: 1 });
    expect(state.queue.get(ID.workspace, ID.job)?.status).toBe("completed");
    expect(state.leases.get(ID.leaseA)?.status).toBe("released");
    expect(state.database.prepare("SELECT status FROM runs WHERE workspace_id = ? AND id = ?").get(ID.workspace, ID.run)?.["status"]).toBe("succeeded");
    expect(state.database.prepare("SELECT status FROM attempts WHERE workspace_id = ? AND id = ?").get(ID.workspace, ID.attempt)?.["status"]).toBe("succeeded");
    expect(state.database.prepare("SELECT status FROM steps WHERE workspace_id = ? AND id = ?").get(ID.workspace, ID.step)?.["status"]).toBe("succeeded");
    state.database.close();
  });

  it("Given cancellation is unknown When the worker completes Then the queue records unknown and the Run leaves active status", async () => {
    const state = createWorkerState();
    const loop = new WorkerLoop({ queue: state.queue, leases: state.leases, workspace_id: ID.workspace, ...retryOptions(state.database), worker_id: "worker-a", lease_id_factory: () => ID.leaseA, handler: async () => ({ kind: "cancel_unknown", error_code: "CANCEL_UNKNOWN" }), clock: { now: () => START }, heartbeat_ms: 100 });

    await expect(loop.runOnce()).resolves.toEqual({ kind: "cancel_unknown", job_id: ID.job });
    expect(state.queue.get(ID.workspace, ID.job)?.status).toBe("cancel_unknown");
    expect(state.database.prepare("SELECT status FROM runs WHERE workspace_id = ? AND id = ?").get(ID.workspace, ID.run)?.["status"]).toBe("cancelled");
    expect(state.database.prepare("SELECT status FROM attempts WHERE workspace_id = ? AND id = ?").get(ID.workspace, ID.attempt)?.["status"]).toBe("cancelled");
    expect(state.database.prepare("SELECT status FROM steps WHERE workspace_id = ? AND id = ?").get(ID.workspace, ID.step)?.["status"]).toBe("cancelled");
    state.database.close();
  });

  it("Given a retryable failure When the worker runs again after backoff Then it retries only that step", async () => {
    const state = createWorkerState();
    let calls = 0;
    const loop = new WorkerLoop({ queue: state.queue, leases: state.leases, workspace_id: ID.workspace, ...retryOptions(state.database), worker_id: "worker-a", lease_id_factory: () => calls === 0 ? ID.leaseA : ID.leaseB, handler: async () => { calls += 1; return calls === 1 ? { kind: "failed", error_code: "CONNECTOR_TIMEOUT" } : { kind: "succeeded" }; }, clock: { now: () => calls === 1 ? START : "2026-08-26T04:00:00.101Z" }, heartbeat_ms: 100 });

    await expect(loop.runOnce(START)).resolves.toMatchObject({ kind: "retry_scheduled", delay_ms: 100 });
    await expect(loop.runOnce("2026-08-26T04:00:00.101Z")).resolves.toMatchObject({ kind: "succeeded" });
    expect(calls).toBe(2);
    expect(state.queue.get(ID.workspace, ID.job)?.status).toBe("completed");
    expect(state.queue.get(ID.workspace, ID.job)?.step_id).toBe("01TRZ3NDEKTSV4RRFFQ69T5FAV");
    expect(state.database.prepare("SELECT status FROM steps WHERE workspace_id = ? AND id = ?").get(ID.workspace, ID.step)?.["status"]).toBe("failed");
    expect(state.database.prepare("SELECT COUNT(*) AS count FROM attempts WHERE workspace_id = ? AND run_id = ?").get(ID.workspace, ID.run)?.["count"]).toBe(2);
    state.database.close();
  });

  it("Given an old lease When a late event write arrives Then the worker receives STALE_LEASE and the write callback is not called", () => {
    const state = createWorkerState();
    const loop = new WorkerLoop({ queue: state.queue, leases: state.leases, workspace_id: ID.workspace, ...retryOptions(state.database), worker_id: "worker-a", lease_id_factory: () => ID.leaseA, handler: async () => ({ kind: "succeeded" }), clock: { now: () => START }, heartbeat_ms: 100 });
    const first = state.leases.claimNext({ workspace_id: ID.workspace, worker_id: "worker-a", lease_id: ID.leaseA, now: START });
    if (first === undefined) throw new Error("Expected first lease");
    state.leases.recoverExpired(ID.workspace, "2026-08-26T04:00:31.000Z");
    state.leases.claimNext({ workspace_id: ID.workspace, worker_id: "worker-b", lease_id: ID.leaseB, now: "2026-08-26T04:00:31.000Z" });
    let writes = 0;

    expect(() => loop.withCurrentLease(first, () => { writes += 1; })).toThrowError("Worker lease is no longer current");
    expect(writes).toBe(0);
    state.database.close();
  });
});
