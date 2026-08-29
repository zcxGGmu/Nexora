import { describe, expect, it } from "vitest";
import { AttemptSchema, RunSchema } from "../../packages/contracts/src/index.js";
import { migrate, openDatabase } from "../../packages/persistence/src/index.js";
import { AttemptManager, DurableQueue, LeaseManager } from "../../packages/orchestration/src/index.js";
import { WorkerLoop, type RetryAttemptFactory } from "../../apps/worker/src/worker-loop.js";

const ID = { workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV", agent: "01BRZ3NDEKTSV4RRFFQ69G5FAV", goal: "01CRZ3NDEKTSV4RRFFQ69G5FAV", ticket: "01DRZ3NDEKTSV4RRFFQ69G5FAV", run: "01ERZ3NDEKTSV4RRFFQ69G5FAV", attempt: "01FRZ3NDEKTSV4RRFFQ69F5FAV", step: "01GRZ3NDEKTSV4RRFFQ69G5FAV", job: "01HRZ3NDEKTSV4RRFFQ69H5FAV", leaseA: "01JRZ3NDEKTSV4RRFFQ69J5FAV", leaseB: "01KRZ3NDEKTSV4RRFFQ69K5FAV" } as const;
const START = "2026-08-26T04:00:00.000Z";
const RECOVERED = "2026-08-26T04:00:31.000Z";

function setup(): { readonly database: ReturnType<typeof openDatabase>; readonly queue: DurableQueue; readonly leases: LeaseManager } {
  const database = openDatabase(":memory:");
  migrate(database, { now: () => START });
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(ID.workspace, "Recovery", START, START);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(ID.agent, ID.workspace, "{}", START, START);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ID.goal, ID.workspace, "Goal", "Recover", "[]", "{}", START, START);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ID.ticket, ID.workspace, ID.goal, "ready", "ticket:recovery", "{}", START, START);
  const runPayload = RunSchema.parse({ id: ID.run, workspace_id: ID.workspace, schema_version: 1, created_at: START, updated_at: START, ticket_id: ID.ticket, execution_location: "local", status: "queued", budget: { max_tokens: 10_000, max_cost_usd: 10 }, memory_snapshot: { snapshot_id: ID.workspace, version: 1 }, connector_versions: { deterministic: "1.0.0" } });
  const attemptPayload = AttemptSchema.parse({ id: ID.attempt, workspace_id: ID.workspace, schema_version: 1, created_at: START, updated_at: START, run_id: ID.run, status: "queued", execution_location: "local" });
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(ID.run, ID.workspace, ID.ticket, runPayload.status, JSON.stringify(runPayload), START, START);
  database.prepare("INSERT INTO attempts(id, workspace_id, run_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(ID.attempt, ID.workspace, ID.run, attemptPayload.status, JSON.stringify(attemptPayload), START, START);
  const stepPayload = { id: ID.step, workspace_id: ID.workspace, schema_version: 1, created_at: START, updated_at: START, run_id: ID.run, attempt_id: ID.attempt, agent_id: ID.agent, status: "pending", inputs: ["input://recovery"], outputs: ["output://recovery"], retry_policy: { max_attempts: 3, backoff_ms: 100 }, requires_review: false };
  database.prepare("INSERT INTO steps(id, workspace_id, run_id, attempt_id, agent_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ID.step, ID.workspace, ID.run, ID.attempt, ID.agent, "pending", JSON.stringify(stepPayload), START, START);
  const queue = new DurableQueue(database, { now: () => START });
  const leases = new LeaseManager(database, { now: () => START });
  queue.enqueue({ id: ID.job, workspace_id: ID.workspace, run_id: ID.run, step_id: ID.step, idempotency_key: "run:recovery:step", request_hash: "sha256:recovery", available_at: START, max_attempts: 3, payload: { fixture: "recovery" } });
  return { database, queue, leases };
}

function retryOptions(database: ReturnType<typeof openDatabase>): { readonly attempt_manager: AttemptManager; readonly retry_attempt_factory: RetryAttemptFactory } {
  return {
    attempt_manager: new AttemptManager(database),
    retry_attempt_factory: (_job, _lease, _next) => ({
      attempt: { id: "01SRZ3NDEKTSV4RRFFQ69S5FAV", workspace_id: ID.workspace, schema_version: 1 as const, created_at: START, updated_at: START, run_id: ID.run, status: "queued" as const },
      step: { id: "01TRZ3NDEKTSV4RRFFQ69T5FAV", workspace_id: ID.workspace, schema_version: 1 as const, created_at: START, updated_at: START, run_id: ID.run, attempt_id: "01SRZ3NDEKTSV4RRFFQ69S5FAV", agent_id: ID.agent, status: "pending" as const, inputs: ["input://recovery"], outputs: ["output://recovery"], retry_policy: { max_attempts: 3, backoff_ms: 100 }, requires_review: false },
    }),
  };
}

describe("C05 recovery integration", () => {
  it("Given worker A crashes after lease acquisition When worker B recovers Then only the new fencing token can complete the step", async () => {
    const state = setup();
    const first = state.leases.claimNext({ workspace_id: ID.workspace, worker_id: "worker-a", lease_id: ID.leaseA, now: START });
    if (first === undefined) throw new Error("Expected worker A lease");
    expect(first.fencing_token).toBe(1);

    expect(state.leases.recoverExpired(ID.workspace, RECOVERED)).toHaveLength(1);
    const workerB = new WorkerLoop({ queue: state.queue, leases: state.leases, workspace_id: ID.workspace, ...retryOptions(state.database), worker_id: "worker-b", lease_id_factory: () => ID.leaseB, handler: async () => ({ kind: "succeeded" }), clock: { now: () => RECOVERED }, heartbeat_ms: 100 });
    await expect(workerB.runOnce(RECOVERED)).resolves.toMatchObject({ kind: "succeeded", fencing_token: 2 });

    let staleWrite = false;
    expect(() => workerB.withCurrentLease(first, () => { staleWrite = true; })).toThrow();
    expect(staleWrite).toBe(false);
    expect(state.queue.get(ID.workspace, ID.job)?.status).toBe("completed");
    expect(state.database.prepare("SELECT fencing_token FROM leases WHERE workspace_id = ? AND step_id = ? ORDER BY fencing_token").all(ID.workspace, ID.step).map((row) => row["fencing_token"])).toEqual([1, 2]);
    state.database.close();
  });
});
