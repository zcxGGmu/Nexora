import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { AttemptManager } from "../../packages/orchestration/src/index.js";
import { AttemptIdSchema, LeaseIdSchema, RunIdSchema, StepIdSchema, TraceIdSchema, type RuntimeMessage } from "../../packages/contracts/src/index.js";
import { createEgressReceipt } from "../../packages/policy/src/index.js";
import { createRemoteWorkerServer, createRemoteSessionToken, type RemoteWorkerRequest, type RemoteWorkerResponse } from "../../apps/remote-worker/src/server.js";
import { RemoteRuntimeAdapter, type RemoteWorkerTransport } from "../../apps/remote-worker/src/adapter.js";
import { buildRemoteSnapshot } from "../../apps/remote-worker/src/snapshot.js";
import { openDatabase, migrate } from "../../packages/persistence/src/index.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  attempt: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
  step: "01KRZ3NDEKTSV4RRFFQ69K5FAV",
  trace: "01VRZ3NDEKTSV4RRFFQ69V5FAV",
  lease: "01MRZ3NDEKTSV4RRFFQ69M5FAV",
  agent: "01NRZ3NDEKTSV4RRFFQ69N5FAV",
};
const NOW = "2026-08-28T14:00:00.000Z";
const SECRET = "remote-test-secret";

function snapshotInput() {
  const snapshot = buildRemoteSnapshot({
    workspace_id: IDS.workspace,
    run_id: IDS.run,
    attempt_id: IDS.attempt,
    step_id: IDS.step,
    trace_id: IDS.trace,
    lease_id: IDS.lease,
    fencing_token: 4,
    deadline_at: "2026-08-28T14:05:00.000Z",
    budget: { max_tokens: 1000, max_cost_usd: 2 },
    artifact_refs: [],
    memory_refs: [],
    policy_snapshot: { scope: { kind: "workspace", id: IDS.workspace }, data_classification: "internal", provider: "fixture-provider", region: "us-test-1", decision: { allowed: true, code: null, event_type: null, reason: "approved", required_action: "none", redactions: [] } },
    secret_refs: [],
    now: NOW,
  });
  return {
    snapshot,
    egress_receipt: createEgressReceipt({
      receipt_id: IDS.agent,
      workspace_id: IDS.workspace,
      run_id: IDS.run,
      attempt_id: IDS.attempt,
      step_id: IDS.step,
      trace_id: IDS.trace,
      execution_location: "remote",
      provider: "fixture-provider",
      region: "us-test-1",
      data_classification: "internal",
      redaction_count: snapshot.redaction_count,
      policy_decision: snapshot.policy_snapshot.decision,
      snapshot_hash: snapshot.snapshot_hash,
      created_at: NOW,
    }),
  };
}

class InjectTransport implements RemoteWorkerTransport {
  readonly requests: RemoteWorkerRequest[] = [];
  private shouldDisconnect = true;

  constructor(private readonly app: FastifyInstance, private readonly token: string) {}

  async exchange(request: RemoteWorkerRequest): Promise<RemoteWorkerResponse> {
    this.requests.push(request);
    if (this.shouldDisconnect && request.message.message_type === "resume") {
      this.shouldDisconnect = false;
      throw new Error("network disconnected");
    }
    const response = await this.app.inject({ method: "POST", url: "/v1/runtime/messages", headers: { authorization: `Bearer ${this.token}` }, payload: request.message });
    if (response.statusCode >= 400) throw new Error(response.body);
    return response.json() as RemoteWorkerResponse;
  }
}

describe("remote runtime recovery", () => {
  it("Given a remote run When the first event poll loses the network Then no local fallback occurs and resume continues from the cursor", async () => {
    const app = createRemoteWorkerServer({ token_secret: SECRET, now: () => NOW, provider: "fixture-provider", region: "us-test-1" });
    const inputPayload = snapshotInput();
    const token = createRemoteSessionToken({ workspace_id: IDS.workspace, run_id: IDS.run, attempt_id: IDS.attempt, step_id: IDS.step, trace_id: IDS.trace, lease_id: IDS.lease, fencing_token: 4, snapshot_hash: inputPayload.snapshot.snapshot_hash, provider: "fixture-provider", region: "us-test-1", lease_expires_at: "2026-08-28T14:04:00.000Z", issued_at: NOW, expires_at: "2026-08-28T14:04:00.000Z" }, SECRET);
    const transport = new InjectTransport(app, token);
    const adapter = new RemoteRuntimeAdapter({ transport, token_provider: () => token, now: () => NOW });
    const input = { run_id: RunIdSchema.parse(IDS.run), attempt_id: AttemptIdSchema.parse(IDS.attempt), step_id: StepIdSchema.parse(IDS.step), trace_id: TraceIdSchema.parse(IDS.trace), deadline_at: "2026-08-28T14:05:00.000Z", lease_id: LeaseIdSchema.parse(IDS.lease), fencing_token: 4, input: inputPayload } as const;

    expect((await adapter.capabilities()).execution_location).toBe("remote");
    const handle = await adapter.start(input);
    await expect(collect(adapter, handle)).rejects.toThrow("network disconnected");
    await adapter.send(handle, { type: "resume", cursor: null });
    const events = await collect(adapter, handle);
    expect(events.map((event) => event.type)).toEqual(["started", "completed"]);
    expect(events.every((event) => event.data["execution_location"] === "remote")).toBe(true);
    expect(transport.requests.some((request) => request.message.message_type === "start")).toBe(true);
    expect(transport.requests.every((request) => request.message.message_type !== "close" || request.message.payload["reason"] !== "fallback_to_local")).toBe(true);
    await app.close();
  });

  it("Given an expired token When a remote message is sent Then the worker rejects it without executing", async () => {
    const app = createRemoteWorkerServer({ token_secret: SECRET, now: () => "2026-08-28T14:05:00.000Z", provider: "fixture-provider", region: "us-test-1" });
    const expired = createRemoteSessionToken({ workspace_id: IDS.workspace, run_id: IDS.run, attempt_id: IDS.attempt, step_id: IDS.step, trace_id: IDS.trace, lease_id: IDS.lease, fencing_token: 4, snapshot_hash: "sha256:" + "0".repeat(64), provider: "fixture-provider", region: "us-test-1", lease_expires_at: "2026-08-28T14:04:00.000Z", issued_at: NOW, expires_at: "2026-08-28T14:04:00.000Z" }, SECRET);
    const response = await app.inject({ method: "POST", url: "/v1/runtime/messages", headers: { authorization: `Bearer ${expired}` }, payload: { schema_version: 1, protocol_version: 1, message_id: IDS.trace, message_type: "hello", run_id: IDS.run, attempt_id: IDS.attempt, step_id: IDS.step, trace_id: IDS.trace, sequence: 0, cursor: null, deadline_at: "2026-08-28T14:05:00.000Z", lease_id: IDS.lease, fencing_token: 4, payload: { adapter_id: "remote", protocol_version: 1, capabilities: { resume: true, cancel: true, streaming: true } } } satisfies RuntimeMessage });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "AUTH_EXPIRED" });
    await app.close();
  });

  it("Given a failed local attempt When switching execution location Then a new remote attempt is linked and the old attempt remains unchanged", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(IDS.workspace, "Remote", NOW, NOW);
    database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.agent, IDS.workspace, "Goal", "Remote", "[]", "{}", NOW, NOW);
    database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(IDS.agent, IDS.workspace, "{}", NOW, NOW);
    database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'ready', ?, ?, 1, ?, ?)").run(IDS.agent, IDS.workspace, IDS.agent, "remote:test", "{}", NOW, NOW);
    database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'failed', ?, 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.agent, JSON.stringify({ id: IDS.run, workspace_id: IDS.workspace, ticket_id: IDS.agent, schema_version: 1, created_at: NOW, updated_at: NOW, execution_location: "local", status: "failed", budget: { max_tokens: 1, max_cost_usd: 1 }, memory_snapshot: { snapshot_id: IDS.workspace, version: 1 }, connector_versions: {} }), NOW, NOW);
    const manager = new AttemptManager(database);
    const oldAttempt = { id: IDS.attempt, workspace_id: IDS.workspace, schema_version: 1 as const, created_at: NOW, updated_at: NOW, run_id: IDS.run, status: "failed" as const, execution_location: "local" as const };
    const oldStep = { id: IDS.step, workspace_id: IDS.workspace, schema_version: 1 as const, created_at: NOW, updated_at: NOW, run_id: IDS.run, attempt_id: IDS.attempt, agent_id: IDS.agent, status: "failed" as const, inputs: ["input://one"], outputs: ["output://one"], retry_policy: { max_attempts: 3, backoff_ms: 10 }, requires_review: false };
    manager.create(oldAttempt);
    database.prepare("INSERT INTO steps(id, workspace_id, run_id, attempt_id, agent_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)").run(oldStep.id, oldStep.workspace_id, oldStep.run_id, oldStep.attempt_id, oldStep.agent_id, oldStep.status, JSON.stringify(oldStep), NOW, NOW);
    const nextAttempt = { id: "01PRZ3NDEKTSV4RRFFQ69P5FAV", workspace_id: IDS.workspace, schema_version: 1 as const, created_at: NOW, updated_at: NOW, run_id: IDS.run, status: "queued" as const, execution_location: "remote" as const, previous_attempt_id: IDS.attempt };
    const nextStep = { ...oldStep, id: "01QRZ3NDEKTSV4RRFFQ69Q5FAV", attempt_id: nextAttempt.id, status: "pending" as const };
    const result = manager.createLocationSwitchAttempt({ previous_attempt: oldAttempt, previous_step: oldStep, attempt: nextAttempt, step: nextStep });
    expect(result.attempt).toMatchObject({ execution_location: "remote", previous_attempt_id: IDS.attempt });
    expect(manager.get(IDS.workspace, IDS.attempt)).toMatchObject({ execution_location: "local", status: "failed" });
    database.close();
  });
});

async function collect(adapter: RemoteRuntimeAdapter, handle: Awaited<ReturnType<RemoteRuntimeAdapter["start"]>>) {
  const events = [];
  for await (const event of adapter.collect(handle)) events.push(event);
  return events;
}
