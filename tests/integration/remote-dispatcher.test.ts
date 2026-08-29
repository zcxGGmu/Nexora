import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { RemoteRuntimeAdapter, type RemoteWorkerTransport } from "../../apps/remote-worker/src/adapter.js";
import { buildRemoteSnapshot } from "../../apps/remote-worker/src/snapshot.js";
import { createRemoteSessionToken, createRemoteWorkerServer, type RemoteWorkerRequest, type RemoteWorkerResponse } from "../../apps/remote-worker/src/server.js";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, TIME } from "../../apps/api/src/routes/test-fixtures.js";
import { createRuntimeDispatcher } from "../../apps/worker/src/runtime-dispatcher.js";
import { WorkerLoop, type RetryAttemptFactory } from "../../apps/worker/src/worker-loop.js";
import { AttemptManager, DurableQueue, LeaseManager } from "../../packages/orchestration/src/index.js";
import { EgressReceiptRepository } from "../../packages/persistence/src/index.js";
import { DeterministicAdapter, RuntimeAdapterError, type AttemptHandle, type CancelResult, type CapabilityDescriptor, type HealthReport, type RuntimeAdapter, type RuntimeCommand, type RuntimeEvent, type StartInput } from "../../packages/runtime-adapters/src/index.js";

const NEW = {
  run: "01SRZ3NDEKTSV4RRFFQ69S5FAV",
  attempt: "01TRZ3NDEKTSV4RRFFQ69T5FAV",
  step: "01VRZ3NDEKTSV4RRFFQ69V5FAV",
  job: "01WRZ3NDEKTSV4RRFFQ69W5FAV",
  createdEvent: "01XRZ3NDEKTSV4RRFFQ69X5FAV",
  lease: "01YRZ3NDEKTSV4RRFFQ69Y5FAV",
  receipt: "01ZRZ3NDEKTSV4RRFFQ69Z5FAV",
  retryAttempt: "020RZ3NDEKTSV4RRFFQ69Z5FAV",
  retryStep: "021RZ3NDEKTSV4RRFFQ69Z5FAV",
} as const;
const SECRET = "remote-dispatcher-secret";

describe("C13 remote worker dispatcher integration", () => {
  it("Given an API-created remote run When the worker claims its queue job Then it executes remotely and persists a queryable egress receipt", async () => {
    const fixture = createControlFixture([NEW.run, NEW.attempt, NEW.step, NEW.job, NEW.createdEvent]);
    const remoteWorker = createRemoteWorkerServer({ token_secret: SECRET, now: () => TIME, provider: "fixture-provider", region: "us-test-1" });
    const transport = new InjectTransport(remoteWorker);

    try {
      const runResponse = await fixture.api.inject({ method: "POST", url: "/v1/runs", headers: commandHeaders("remote-run:create"), payload: { schema_version: 1, workspace_id: IDS.workspace, ticket_id: IDS.ticket, agent_id: IDS.agent, execution_location: "remote" } });
      expect(runResponse.statusCode).toBe(202);

      const queue = new DurableQueue(fixture.database, { now: () => TIME });
      const leases = new LeaseManager(fixture.database, { now: () => TIME });
      const loop = new WorkerLoop({
        queue,
        leases,
        attempt_manager: new AttemptManager(fixture.database),
        retry_attempt_factory: retryAttemptFactory,
        workspace_id: IDS.workspace,
        worker_id: "worker-remote",
        lease_id_factory: () => NEW.lease,
        handler: createRuntimeDispatcher({
          database: fixture.database,
          clock: { now: () => TIME },
          receipt_id_factory: () => NEW.receipt,
          local_adapter: new DeterministicAdapter({ now: () => TIME }),
          build_remote_snapshot: buildRemoteSnapshot,
          remote_policy: { provider: "fixture-provider", region: "us-test-1", data_classification: "internal", target_url: "https://worker.example.com/v1/runtime/messages", resolved_ips: ["8.8.8.8"], secret_refs: [] },
          remote_adapter_factory: ({ snapshot }) => {
            const token = createRemoteSessionToken({ workspace_id: snapshot.workspace_id, run_id: snapshot.run_id, attempt_id: snapshot.attempt_id, step_id: snapshot.step_id, trace_id: snapshot.trace_id, lease_id: snapshot.lease_id, fencing_token: snapshot.fencing_token, snapshot_hash: snapshot.snapshot_hash, provider: snapshot.policy_snapshot.provider, region: snapshot.policy_snapshot.region, lease_expires_at: "2026-08-27T04:00:30.000Z", issued_at: TIME, expires_at: "2026-08-27T04:00:30.000Z" }, SECRET);
            transport.setToken(token);
            return new RemoteRuntimeAdapter({ transport, token_provider: () => token, now: () => TIME });
          },
        }),
        clock: { now: () => TIME },
        heartbeat_ms: 100,
      });

      await expect(loop.runOnce(TIME)).resolves.toMatchObject({ kind: "succeeded", job_id: NEW.job });
      const receipt = new EgressReceiptRepository(fixture.database).get(IDS.workspace, NEW.receipt);
      expect(receipt).toMatchObject({ execution_location: "remote", provider: "fixture-provider", region: "us-test-1", data_classification: "internal", run_id: NEW.run, attempt_id: NEW.attempt, step_id: NEW.step });
      expect(receipt?.snapshot_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(transport.requests.some((request) => request.message.message_type === "start")).toBe(true);
      expect(transport.requests.every((request) => request.message.payload["reason"] !== "fallback_to_local")).toBe(true);
      const queryResponse = await fixture.api.inject({ method: "GET", url: `/v1/egress-receipts/${NEW.receipt}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(queryResponse.statusCode).toBe(200);
      expect(queryResponse.json()).toMatchObject({ egress_receipt: { receipt_id: NEW.receipt, execution_location: "remote", provider: "fixture-provider", snapshot_hash: receipt?.snapshot_hash } });
      const listResponse = await fixture.api.inject({ method: "GET", url: `/v1/receipts?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toMatchObject({ receipts: [], egress_receipts: [{ receipt_id: NEW.receipt, execution_location: "remote", provider: "fixture-provider", region: "us-test-1", snapshot_hash: receipt?.snapshot_hash }] });
    } finally {
      await remoteWorker.close();
      await closeControlFixture(fixture);
    }
  });

  it("Given a remote transport failure When the dispatcher handles the job Then it records remote egress and never falls back to local execution", async () => {
    const fixture = createControlFixture([NEW.run, NEW.attempt, NEW.step, NEW.job, NEW.createdEvent]);
    const localAdapter = new RecordingLocalAdapter();

    try {
      const runResponse = await fixture.api.inject({ method: "POST", url: "/v1/runs", headers: commandHeaders("remote-run:transport-failure"), payload: { schema_version: 1, workspace_id: IDS.workspace, ticket_id: IDS.ticket, agent_id: IDS.agent, execution_location: "remote" } });
      expect(runResponse.statusCode).toBe(202);

      const queue = new DurableQueue(fixture.database, { now: () => TIME });
      const leases = new LeaseManager(fixture.database, { now: () => TIME });
      const loop = new WorkerLoop({
        queue,
        leases,
        attempt_manager: new AttemptManager(fixture.database),
        retry_attempt_factory: retryAttemptFactory,
        workspace_id: IDS.workspace,
        worker_id: "worker-remote",
        lease_id_factory: () => NEW.lease,
        handler: createRuntimeDispatcher({
          database: fixture.database,
          clock: { now: () => TIME },
          receipt_id_factory: () => NEW.receipt,
          local_adapter: localAdapter,
          build_remote_snapshot: buildRemoteSnapshot,
          remote_policy: { provider: "fixture-provider", region: "us-test-1", data_classification: "internal", target_url: "https://worker.example.com/v1/runtime/messages", resolved_ips: ["8.8.8.8"], secret_refs: [] },
          remote_adapter_factory: () => new UnavailableRemoteAdapter(),
        }),
        clock: { now: () => TIME },
        heartbeat_ms: 100,
      });

      await expect(loop.runOnce(TIME)).resolves.toMatchObject({ kind: "retry_scheduled", job_id: NEW.job });
      expect(localAdapter.starts).toBe(0);
      expect(queue.get(IDS.workspace, NEW.job)).toMatchObject({ status: "queued", last_error_code: "CONNECTOR_UNAVAILABLE", payload: { kind: "remote", execution_location: "remote" } });
      expect(new EgressReceiptRepository(fixture.database).get(IDS.workspace, NEW.receipt)).toMatchObject({ receipt_id: NEW.receipt, execution_location: "remote", run_id: NEW.run, attempt_id: NEW.attempt, step_id: NEW.step });
    } finally {
      await closeControlFixture(fixture);
    }
  });
});

class InjectTransport implements RemoteWorkerTransport {
  readonly requests: RemoteWorkerRequest[] = [];
  private token: string | null = null;

  constructor(private readonly app: FastifyInstance) {}

  setToken(token: string): void {
    this.token = token;
  }

  async exchange(request: RemoteWorkerRequest): Promise<RemoteWorkerResponse> {
    if (this.token === null) throw new Error("Remote token was not minted");
    this.requests.push(request);
    const response = await this.app.inject({ method: "POST", url: "/v1/runtime/messages", headers: { authorization: `Bearer ${this.token}` }, payload: request.message });
    if (response.statusCode >= 400) throw new Error(response.body);
    return response.json<RemoteWorkerResponse>();
  }
}

class RecordingLocalAdapter implements RuntimeAdapter {
  readonly id = "local-fixture";
  starts = 0;

  capabilities(): Promise<CapabilityDescriptor> {
    return Promise.resolve({ adapter_id: this.id, protocol_version: 1, execution_location: "local", supports_resume: false, supports_cancel: false, supports_streaming: false });
  }

  start(input: StartInput): Promise<AttemptHandle> {
    this.starts += 1;
    return Promise.resolve({ adapter_id: this.id, session_id: "local-fixture-session", run_id: input.run_id, attempt_id: input.attempt_id, step_id: input.step_id, trace_id: input.trace_id, lease_id: input.lease_id, fencing_token: input.fencing_token, deadline_at: input.deadline_at, cursor: null });
  }

  send(_handle: AttemptHandle, _command: RuntimeCommand): Promise<void> {
    return Promise.resolve();
  }

  cancel(_handle: AttemptHandle): Promise<CancelResult> {
    return Promise.resolve({ state: "cancel_unknown", reason: "local fixture should not be cancelled" });
  }

  health(): Promise<HealthReport> {
    return Promise.resolve({ status: "healthy", checked_at: TIME, details: {} });
  }

  async *collect(_handle: AttemptHandle): AsyncIterable<RuntimeEvent> {
    return;
  }
}

class UnavailableRemoteAdapter implements RuntimeAdapter {
  readonly id = "remote";

  capabilities(): Promise<CapabilityDescriptor> {
    return Promise.resolve({ adapter_id: this.id, protocol_version: 1, execution_location: "remote", supports_resume: true, supports_cancel: true, supports_streaming: true });
  }

  start(_input: StartInput): Promise<AttemptHandle> {
    throw new RuntimeAdapterError("CONNECTOR_UNAVAILABLE", "remote fixture unavailable");
  }

  send(_handle: AttemptHandle, _command: RuntimeCommand): Promise<void> {
    return Promise.resolve();
  }

  cancel(_handle: AttemptHandle): Promise<CancelResult> {
    return Promise.resolve({ state: "cancel_unknown", reason: "remote fixture unavailable" });
  }

  health(): Promise<HealthReport> {
    return Promise.resolve({ status: "unavailable", checked_at: TIME, details: { reason: "fixture" } });
  }

  async *collect(_handle: AttemptHandle): AsyncIterable<RuntimeEvent> {
    return;
  }
}

const retryAttemptFactory: RetryAttemptFactory = () => ({
  attempt: { id: NEW.retryAttempt, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, run_id: NEW.run, status: "queued", execution_location: "remote", previous_attempt_id: NEW.attempt },
  step: { id: NEW.retryStep, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, run_id: NEW.run, attempt_id: NEW.retryAttempt, agent_id: IDS.agent, status: "pending", inputs: ["ticket://retry"], outputs: ["run://retry"], retry_policy: { max_attempts: 3, backoff_ms: 100 }, requires_review: false },
});

function commandHeaders(key: string): Record<string, string> {
  return { authorization: ownerHeader(), "idempotency-key": key, traceparent: IDS.owner };
}
