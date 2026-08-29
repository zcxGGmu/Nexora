import { EgressReceiptRepository, RunRepository, StepRepository, type SqliteDatabase } from "@nexora/persistence";
import { EgressPolicyDeniedError, createEgressReceipt, evaluateEgressPolicy, toDecisionRecord, type EgressPolicyInput } from "@nexora/policy";
import { RuntimeAdapterError, type RuntimeAdapter, type RuntimeEvent, type RuntimePayload, type StartInput } from "@nexora/runtime-adapters";
import { AttemptIdSchema, LeaseIdSchema, RunIdSchema, StepIdSchema, TraceIdSchema, type DataClassification, type EgressReceipt, type RemoteExecutionSnapshot } from "@nexora/contracts";
import type { LeaseRecord, QueueJob } from "@nexora/orchestration";
import type { WorkerExecutionResult, WorkerHandler } from "./worker-loop.js";

export type RemoteDispatchPolicy = {
  readonly provider: string;
  readonly region: string;
  readonly data_classification: DataClassification;
  readonly target_url: string;
  readonly resolved_ips: readonly string[];
  readonly secret_refs: readonly string[];
};

export type RemoteAdapterFactoryInput = {
  readonly job: QueueJob;
  readonly lease: LeaseRecord;
  readonly snapshot: RemoteExecutionSnapshot;
  readonly egress_receipt: EgressReceipt;
};

export type RuntimeDispatcherOptions = {
  readonly database: SqliteDatabase;
  readonly clock: { readonly now: () => string };
  readonly receipt_id_factory: () => string;
  readonly local_adapter: RuntimeAdapter;
  readonly remote_policy: RemoteDispatchPolicy;
  readonly remote_adapter_factory: (input: RemoteAdapterFactoryInput) => RuntimeAdapter;
  readonly build_remote_snapshot: (input: unknown) => RemoteExecutionSnapshot;
};

export function createRuntimeDispatcher(options: RuntimeDispatcherOptions): WorkerHandler {
  const runs = new RunRepository(options.database);
  const steps = new StepRepository(options.database);
  const egressReceipts = new EgressReceiptRepository(options.database);

  return async (job, lease) => {
    try {
      const run = runs.get(job.workspace_id, job.run_id);
      const step = steps.get(job.workspace_id, job.step_id);
      if (run === undefined || step === undefined) return { kind: "failed", error_code: "SCOPE_DENIED" };
      const traceId = traceIdFor(job);
      if (runtimeKind(job) !== "remote") return await executeAdapter(options.local_adapter, startInput({ job, lease, attempt_id: step.attempt_id, trace_id: traceId, payload: {} }));

      const policyInput = remotePolicyInput(options.remote_policy);
      const policyDecision = toDecisionRecord(evaluateEgressPolicy(policyInput));
      const snapshot = options.build_remote_snapshot({
        workspace_id: job.workspace_id,
        run_id: job.run_id,
        attempt_id: step.attempt_id,
        step_id: job.step_id,
        trace_id: traceId,
        lease_id: lease.lease_id,
        fencing_token: lease.fencing_token,
        deadline_at: lease.expires_at,
        budget: run.budget,
        artifact_refs: [],
        memory_refs: [],
        policy_snapshot: { scope: { kind: "run", id: job.run_id }, data_classification: options.remote_policy.data_classification, provider: options.remote_policy.provider, region: options.remote_policy.region, decision: policyDecision },
        secret_refs: options.remote_policy.secret_refs,
      });
      const egressReceipt = createEgressReceipt({ receipt_id: options.receipt_id_factory(), workspace_id: job.workspace_id, run_id: job.run_id, attempt_id: step.attempt_id, step_id: job.step_id, trace_id: traceId, execution_location: "remote", provider: options.remote_policy.provider, region: options.remote_policy.region, data_classification: options.remote_policy.data_classification, redaction_count: snapshot.redaction_count, policy_decision: snapshot.policy_snapshot.decision, snapshot_hash: snapshot.snapshot_hash, created_at: options.clock.now() });
      egressReceipts.create(egressReceipt);
      const remoteAdapter = options.remote_adapter_factory({ job, lease, snapshot, egress_receipt: egressReceipt });
      return await executeAdapter(remoteAdapter, startInput({ job, lease, attempt_id: step.attempt_id, trace_id: traceId, payload: { snapshot, egress_receipt: egressReceipt } }));
    } catch (error) {
      if (error instanceof RuntimeAdapterError) return { kind: "failed", error_code: error.code };
      if (error instanceof EgressPolicyDeniedError) return { kind: "failed", error_code: "POLICY_DENIED" };
      throw error;
    }
  };
}

async function executeAdapter(adapter: RuntimeAdapter, input: StartInput): Promise<WorkerExecutionResult> {
  const handle = await adapter.start(input);
  let terminal: WorkerExecutionResult | undefined;
  for await (const event of adapter.collect(handle)) {
    const result = resultForRuntimeEvent(event);
    if (result !== undefined) terminal = result;
  }
  return terminal ?? { kind: "failed", error_code: "RUNTIME_CRASHED" };
}

function startInput(input: { readonly job: QueueJob; readonly lease: LeaseRecord; readonly attempt_id: string; readonly trace_id: string; readonly payload: RuntimePayload }): StartInput {
  return { run_id: RunIdSchema.parse(input.job.run_id), attempt_id: AttemptIdSchema.parse(input.attempt_id), step_id: StepIdSchema.parse(input.job.step_id), trace_id: TraceIdSchema.parse(input.trace_id), deadline_at: input.lease.expires_at, lease_id: LeaseIdSchema.parse(input.lease.lease_id), fencing_token: input.lease.fencing_token, input: input.payload };
}

function resultForRuntimeEvent(event: RuntimeEvent): WorkerExecutionResult | undefined {
  switch (event.type) {
    case "completed":
    case "review_needed":
      return { kind: "succeeded" };
    case "cancelled":
      return { kind: "cancelled" };
    case "cancel_unknown":
      return { kind: "cancel_unknown", error_code: errorCode(event.data, "CANCEL_UNKNOWN") };
    case "timeout":
      return { kind: "failed", error_code: errorCode(event.data, "CONNECTOR_TIMEOUT") };
    case "failed":
    case "runtime_crashed":
    case "judge_failed":
    case "partial":
      return { kind: "failed", error_code: errorCode(event.data, "RUNTIME_CRASHED") };
    case "started":
    case "tool_called":
    case "artifact_created":
    case "judge_completed":
    case "progress":
    case "heartbeat":
    case "unmapped_event":
      return undefined;
    default:
      return assertNeverEvent(event.type);
  }
}

function runtimeKind(job: QueueJob): "deterministic" | "retry" | "remote" {
  const value = job.payload["kind"];
  if (value === "remote" || value === "retry" || value === "deterministic") return value;
  return "deterministic";
}

function traceIdFor(job: QueueJob): string {
  const value = job.payload["trace_id"];
  return typeof value === "string" && value.length > 0 ? value : job.id;
}

function errorCode(payload: RuntimePayload, fallback: string): string {
  const value = payload["error_code"];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function remotePolicyInput(policy: RemoteDispatchPolicy): EgressPolicyInput {
  return { execution_location: "remote", provider: policy.provider, region: policy.region, data_classification: policy.data_classification, allowed_providers: [policy.provider], allowed_regions: [policy.region], minimal_snapshot: true, target_url: policy.target_url, resolved_ips: [...policy.resolved_ips] };
}

function assertNeverEvent(value: never): never {
  throw new RuntimeAdapterError("SCHEMA_INVALID", `Unhandled runtime event type ${String(value)}`);
}
