import { describe, expect, it } from "vitest";
import { migrate, openDatabase } from "@nexora/persistence";
import { AttemptManager, createRecoveryManager, DurableQueue, LeaseManager, OrchestrationError, assertBudget, decideRetry, evaluateBudget } from "./index.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  agent: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  attempt: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  step: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  job: "01HRZ3NDEKTSV4RRFFQ69G5FAV",
  leaseA: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
  leaseB: "01KRZ3NDEKTSV4RRFFQ69K5FAV",
} as const;
const TIME = "2026-08-26T04:00:00.000Z";

function seed(database: ReturnType<typeof openDatabase>): void {
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(IDS.workspace, "Demo", TIME, TIME);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(IDS.agent, IDS.workspace, "{}", TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.goal, IDS.workspace, "Goal", "Objective", "[]", "{}", TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.ticket, IDS.workspace, IDS.goal, "ready", "ticket:c05", "{}", TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.ticket, "queued", "{}", TIME, TIME);
  database.prepare("INSERT INTO attempts(id, workspace_id, run_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.attempt, IDS.workspace, IDS.run, "queued", "{}", TIME, TIME);
  database.prepare("INSERT INTO steps(id, workspace_id, run_id, attempt_id, agent_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.step, IDS.workspace, IDS.run, IDS.attempt, IDS.agent, "pending", "{}", TIME, TIME);
}

function database(): ReturnType<typeof openDatabase> {
  const value = openDatabase(":memory:");
  migrate(value, { now: () => TIME });
  seed(value);
  return value;
}

describe("durable queue and fencing", () => {
  it("Given an idempotent enqueue When two workers claim Then only one active lease exists", () => {
    const value = database();
    const queue = new DurableQueue(value, { now: () => TIME });
    const leases = new LeaseManager(value, { now: () => TIME });
    const job = queue.enqueue({ id: IDS.job, workspace_id: IDS.workspace, run_id: IDS.run, step_id: IDS.step, idempotency_key: "run:c05:step", request_hash: "sha256:a", available_at: TIME, max_attempts: 3, payload: { kind: "deterministic" } });
    expect(queue.enqueue({ id: "01LRZ3NDEKTSV4RRFFQ69L5FAV", workspace_id: IDS.workspace, run_id: IDS.run, step_id: IDS.step, idempotency_key: "run:c05:step", request_hash: "sha256:a", available_at: TIME, max_attempts: 3, payload: { kind: "deterministic" } })).toEqual(job);

    const first = leases.claimNext({ workspace_id: IDS.workspace, worker_id: "worker-a", lease_id: IDS.leaseA, now: TIME });
    const second = leases.claimNext({ workspace_id: IDS.workspace, worker_id: "worker-b", lease_id: IDS.leaseB, now: TIME });

    expect(first?.fencing_token).toBe(1);
    expect(second).toBeUndefined();
    expect(value.prepare("SELECT COUNT(*) AS count FROM leases WHERE status = 'active'").get()?.["count"]).toBe(1);
    value.close();
  });

  it("Given an expired lease When recovery claims the step Then fencing advances and the old worker is rejected", () => {
    const value = database();
    const queue = new DurableQueue(value, { now: () => TIME });
    const leases = new LeaseManager(value, { now: () => TIME });
    queue.enqueue({ id: IDS.job, workspace_id: IDS.workspace, run_id: IDS.run, step_id: IDS.step, idempotency_key: "run:c05:recovery", request_hash: "sha256:b", available_at: TIME, max_attempts: 3, payload: { kind: "crash" } });
    const first = leases.claimNext({ workspace_id: IDS.workspace, worker_id: "worker-a", lease_id: IDS.leaseA, now: TIME });
    if (first === undefined) throw new Error("Expected first lease");
    const recovered = leases.recoverExpired(IDS.workspace, "2026-08-26T04:00:31.000Z");
    const second = leases.claimNext({ workspace_id: IDS.workspace, worker_id: "worker-b", lease_id: IDS.leaseB, now: "2026-08-26T04:00:31.000Z" });

    expect(recovered).toHaveLength(1);
    expect(second?.fencing_token).toBe(2);
    expect(() => leases.assertCurrent(first, "2026-08-26T04:00:31.000Z")).toThrowError(new OrchestrationError("STALE_LEASE", "Worker lease is no longer current"));
    if (second === undefined) throw new Error("Expected recovery lease");
    expect(() => leases.assertCurrent(second, "2026-08-26T04:00:31.000Z")).not.toThrow();
    value.close();
  });

  it("Given a current lease When a writer is asynchronous Then the fenced helper rejects it before the transaction can escape", () => {
    const value = database();
    const queue = new DurableQueue(value, { now: () => TIME });
    const leases = new LeaseManager(value, { now: () => TIME });
    queue.enqueue({ id: IDS.job, workspace_id: IDS.workspace, run_id: IDS.run, step_id: IDS.step, idempotency_key: "run:c05:async", request_hash: "sha256:async", available_at: TIME, max_attempts: 3, payload: { kind: "async" } });
    const token = leases.claimNext({ workspace_id: IDS.workspace, worker_id: "worker-a", lease_id: IDS.leaseA, now: TIME });
    if (token === undefined) throw new Error("Expected lease");
    expect(() => leases.withCurrent(token, TIME, async () => undefined)).toThrow("Fenced writes must be synchronous");
    value.close();
  });

  it("Given a cancellation request When the job is queued or leased Then the terminal state is explicit", () => {
    const value = database();
    const queue = new DurableQueue(value, { now: () => TIME });
    const leases = new LeaseManager(value, { now: () => TIME });
    queue.enqueue({ id: IDS.job, workspace_id: IDS.workspace, run_id: IDS.run, step_id: IDS.step, idempotency_key: "run:c05:cancel", request_hash: "sha256:c", available_at: TIME, max_attempts: 3, payload: { kind: "cancel" } });
    expect(queue.requestCancel(IDS.workspace, IDS.job).status).toBe("cancelled");
    expect(leases.claimNext({ workspace_id: IDS.workspace, worker_id: "worker-a", lease_id: IDS.leaseA, now: TIME })).toBeUndefined();

    queue.enqueue({ id: "01LRZ3NDEKTSV4RRFFQ69L5FAV", workspace_id: IDS.workspace, run_id: IDS.run, step_id: IDS.step, idempotency_key: "run:c05:cancel-running", request_hash: "sha256:d", available_at: TIME, max_attempts: 3, payload: { kind: "cancel" } });
    const running = leases.claimNext({ workspace_id: IDS.workspace, worker_id: "worker-a", lease_id: IDS.leaseB, now: TIME });
    if (running === undefined) throw new Error("Expected running lease");
    const runningJob = queue.requestCancel(IDS.workspace, running.job_id);
    expect(runningJob.status).toBe("cancel_requested");
    expect(leases.recoverExpired(IDS.workspace, "2026-08-26T04:00:31.000Z")[0]?.status).toBe("expired");
    expect(queue.get(IDS.workspace, running.job_id)?.status).toBe("cancel_unknown");
    value.close();
  });

  it("Given an exhausted lease When recovery builds candidates Then terminal jobs are not marked resumable", () => {
    const value = database();
    const queue = new DurableQueue(value, { now: () => TIME });
    const leases = new LeaseManager(value, { now: () => TIME });
    queue.enqueue({ id: IDS.job, workspace_id: IDS.workspace, run_id: IDS.run, step_id: IDS.step, idempotency_key: "run:c05:exhausted", request_hash: "sha256:e", available_at: TIME, max_attempts: 1, payload: { kind: "crash" } });
    leases.claimNext({ workspace_id: IDS.workspace, worker_id: "worker-a", lease_id: IDS.leaseA, now: TIME });
    const candidates = createRecoveryManager(value, { now: () => "2026-08-26T04:00:31.000Z" }).recoverExpired(IDS.workspace);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.resume_from_attempt).toBe(false);
    expect(queue.get(IDS.workspace, IDS.job)?.status).toBe("failed");
    value.close();
  });
});

describe("retry, cancel, and budget gates", () => {
  it("Given a network failure When retry policy evaluates Then it backs off only until three attempts", () => {
    expect(decideRetry({ attempt: 1, max_attempts: 3, error_code: "CONNECTOR_TIMEOUT", base_delay_ms: 100 })).toEqual({ kind: "retry", next_attempt: 2, delay_ms: 100, error_code: "CONNECTOR_TIMEOUT" });
    expect(decideRetry({ attempt: 3, max_attempts: 3, error_code: "CONNECTOR_TIMEOUT", base_delay_ms: 100 })).toMatchObject({ kind: "stop", reason: "attempts_exhausted" });
    expect(decideRetry({ attempt: 1, max_attempts: 3, error_code: "POLICY_DENIED", base_delay_ms: 100 })).toMatchObject({ kind: "stop", reason: "non_retryable" });
  });

  it("Given current usage When the next step crosses a budget Then the gate blocks it before execution", () => {
    const budget = { max_tokens: 100, max_cost_usd: 1, max_duration_seconds: 60 };
    expect(evaluateBudget(budget, { tokens: 20, cost_usd: 0.1, duration_seconds: 10 }, { tokens: 30, cost_usd: 0.2, duration_seconds: 10 })).toMatchObject({ allowed: true });
    expect(evaluateBudget(budget, { tokens: 90, cost_usd: 0.1, duration_seconds: 10 }, { tokens: 20, cost_usd: 0, duration_seconds: 0 })).toEqual({ allowed: false, exceeded: ["tokens"] });
    expect(() => assertBudget(budget, { tokens: 90, cost_usd: 0.1, duration_seconds: 10 }, { tokens: 20, cost_usd: 0, duration_seconds: 0 })).toThrowError(OrchestrationError);
    expect(() => evaluateBudget({ ...budget, max_tokens: Number.NaN }, { tokens: 0, cost_usd: 0, duration_seconds: 0 })).toThrowError(OrchestrationError);
    expect(() => evaluateBudget(budget, { tokens: -1, cost_usd: 0, duration_seconds: 0 })).toThrowError(OrchestrationError);
  });

  it("Given malformed retry timing When policy evaluates Then it never schedules an unbounded retry", () => {
    expect(decideRetry({ attempt: 1, max_attempts: 3, error_code: "CONNECTOR_TIMEOUT", base_delay_ms: Number.NaN })).toMatchObject({ kind: "stop" });
    expect(decideRetry({ attempt: 1, max_attempts: 3, error_code: "CONNECTOR_TIMEOUT", base_delay_ms: -1 })).toMatchObject({ kind: "stop" });
  });

  it("Given a failed step When a retry attempt is requested Then only failed steps are eligible and cancel unknown is explicit", () => {
    const value = database();
    const manager = new AttemptManager(value);
    const failedStep = { id: IDS.step, workspace_id: IDS.workspace, schema_version: 1 as const, created_at: TIME, updated_at: TIME, run_id: IDS.run, attempt_id: IDS.attempt, agent_id: IDS.agent, status: "failed" as const, inputs: ["input://one"], outputs: ["output://one"], retry_policy: { max_attempts: 3, backoff_ms: 10 }, requires_review: false };
    const retryAttempt = { id: "01MRZ3NDEKTSV4RRFFQ69M5FAV", workspace_id: IDS.workspace, schema_version: 1 as const, created_at: TIME, updated_at: TIME, run_id: IDS.run, status: "queued" as const };
    const retryStep = { ...failedStep, id: "01NRZ3NDEKTSV4RRFFQ69N5FAV", attempt_id: retryAttempt.id, status: "pending" as const };
    value.prepare("UPDATE steps SET status = 'failed', payload_json = ? WHERE workspace_id = ? AND id = ?").run(JSON.stringify(failedStep), IDS.workspace, IDS.step);
    expect(manager.createRetryAttempt(retryAttempt, failedStep, retryStep)).toMatchObject({ attempt: retryAttempt, step: retryStep });
    expect(manager.cancelResult({ requested: true, adapter_acknowledged: false, adapter_unknown: true })).toEqual({ state: "cancel_unknown", reason: "Runtime did not confirm cancellation" });
    value.prepare("UPDATE steps SET status = 'pending', payload_json = ? WHERE workspace_id = ? AND id = ?").run(JSON.stringify({ ...failedStep, status: "pending" }), IDS.workspace, IDS.step);
    expect(() => manager.createRetryAttempt({ ...retryAttempt, id: "01PRZ3NDEKTSV4RRFFQ69P5FAV" }, failedStep, { ...retryStep, id: "01QRZ3NDEKTSV4RRFFQ69Q5FAV", attempt_id: "01PRZ3NDEKTSV4RRFFQ69P5FAV" })).toThrowError(OrchestrationError);
    value.close();
  });
});
