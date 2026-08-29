import { systemClock, type Clock } from "@nexora/contracts";
import { AttemptManager, DurableQueue, decideRetry, LeaseManager, OrchestrationError, type LeaseRecord, type LeaseToken, type QueueJob } from "@nexora/orchestration";
import type { Attempt, Step } from "@nexora/contracts";

export type WorkerExecutionResult =
  | { readonly kind: "succeeded" }
  | { readonly kind: "failed"; readonly error_code: string }
  | { readonly kind: "cancelled" }
  | { readonly kind: "cancel_unknown"; readonly error_code?: string };

export type WorkerRunResult =
  | { readonly kind: "idle" }
  | { readonly kind: "succeeded"; readonly job_id: string; readonly fencing_token: number }
  | { readonly kind: "retry_scheduled"; readonly job_id: string; readonly delay_ms: number }
  | { readonly kind: "failed"; readonly job_id: string; readonly error_code: string }
  | { readonly kind: "cancelled"; readonly job_id: string }
  | { readonly kind: "cancel_unknown"; readonly job_id: string }
  | { readonly kind: "stale_lease"; readonly job_id: string };

export type WorkerHandler = (job: QueueJob, lease: LeaseRecord) => Promise<WorkerExecutionResult>;
export type RetryAttemptFactory = (job: QueueJob, lease: LeaseRecord, nextAttempt: number) => { readonly attempt: Attempt; readonly step: Step };

export type WorkerLoopOptions = {
  readonly queue: DurableQueue;
  readonly leases: LeaseManager;
  readonly attempt_manager: AttemptManager;
  readonly retry_attempt_factory: RetryAttemptFactory;
  readonly workspace_id: string;
  readonly worker_id: string;
  readonly lease_id_factory: () => string;
  readonly handler: WorkerHandler;
  readonly clock?: Clock;
  readonly heartbeat_ms?: number;
};

export class WorkerLoop {
  private readonly clock: Clock;
  private readonly heartbeatMs: number;

  constructor(private readonly options: WorkerLoopOptions) {
    this.clock = options.clock ?? systemClock;
    this.heartbeatMs = options.heartbeat_ms ?? 10_000;
    if (!Number.isInteger(this.heartbeatMs) || this.heartbeatMs < 100 || this.heartbeatMs >= 30_000) throw new Error("Worker heartbeat must be between 100ms and 30s");
  }

  async runOnce(now = this.clock.now()): Promise<WorkerRunResult> {
    const lease = this.options.leases.claimNext({ workspace_id: this.options.workspace_id, worker_id: this.options.worker_id, lease_id: this.options.lease_id_factory(), now });
    if (lease === undefined) return { kind: "idle" };
    const job = this.options.queue.get(lease.workspace_id, lease.job_id);
    if (job === undefined) throw new OrchestrationError("NOT_FOUND", "Claimed queue job was not found");

    let heartbeatError: OrchestrationError | undefined;
    const heartbeatHandle = setInterval(() => {
      try {
        this.options.leases.heartbeat(lease, this.clock.now());
      } catch (error) {
        if (error instanceof OrchestrationError) heartbeatError = error;
        else heartbeatError = new OrchestrationError("STALE_LEASE", "Worker heartbeat failed");
      }
    }, this.heartbeatMs);

    try {
      const execution = await this.options.handler(job, lease);
      if (heartbeatError !== undefined) throw heartbeatError;
      this.options.leases.assertCurrent(lease, this.clock.now());
      return this.commitResult(job, lease, execution);
    } catch (error) {
      if (error instanceof OrchestrationError && error.code === "STALE_LEASE") return { kind: "stale_lease", job_id: job.id };
      const errorCode = error instanceof OrchestrationError ? error.code : "RUNTIME_CRASHED";
      this.options.leases.assertCurrent(lease, this.clock.now());
      return this.commitResult(job, lease, { kind: "failed", error_code: errorCode });
    } finally {
      clearInterval(heartbeatHandle);
    }
  }

  cancel(workspaceId: string, jobId: string): QueueJob {
    return this.options.queue.requestCancel(workspaceId, jobId);
  }

  withCurrentLease<T>(token: LeaseToken, write: () => T): T {
    return this.options.leases.withCurrent(token, this.clock.now(), write);
  }

  private commitResult(job: QueueJob, lease: LeaseRecord, execution: WorkerExecutionResult): WorkerRunResult {
    switch (execution.kind) {
      case "succeeded": {
        const now = this.clock.now();
        this.options.leases.completeAndWrite({ token: lease, status: "completed", error_code: null, now, write: () => {
          this.options.attempt_manager.markStepTerminalInTransaction({ workspace_id: job.workspace_id, step_id: job.step_id, now, status: "succeeded" });
        } });
        return { kind: "succeeded", job_id: job.id, fencing_token: lease.fencing_token };
      }
      case "cancelled": {
        const now = this.clock.now();
        this.options.leases.completeAndWrite({ token: lease, status: "cancelled", error_code: null, now, write: () => {
          this.options.attempt_manager.markStepTerminalInTransaction({ workspace_id: job.workspace_id, step_id: job.step_id, now, status: "cancelled" });
        } });
        return { kind: "cancelled", job_id: job.id };
      }
      case "cancel_unknown": {
        const now = this.clock.now();
        this.options.leases.completeAndWrite({ token: lease, status: "cancel_unknown", error_code: execution.error_code ?? "CANCEL_UNKNOWN", now, write: () => {
          this.options.attempt_manager.markStepTerminalInTransaction({ workspace_id: job.workspace_id, step_id: job.step_id, now, status: "cancelled" });
        } });
        return { kind: "cancel_unknown", job_id: job.id };
      }
      case "failed": {
        const decision = decideRetry({ attempt: job.attempts, max_attempts: job.max_attempts, error_code: execution.error_code, base_delay_ms: 100 });
        if (decision.kind === "retry") {
          const now = this.clock.now();
          const retryRecords = this.options.retry_attempt_factory(job, lease, decision.next_attempt);
          this.options.leases.reschedule(lease, retryRecords.step.id, addMilliseconds(now, decision.delay_ms), execution.error_code, () => {
            this.options.attempt_manager.markStepFailedInTransaction(job.workspace_id, job.step_id, now);
            this.options.attempt_manager.createRetryAttemptForQueueInTransaction(job.workspace_id, job.step_id, retryRecords.attempt, retryRecords.step);
          }, now);
          return { kind: "retry_scheduled", job_id: job.id, delay_ms: decision.delay_ms };
        }
        const now = this.clock.now();
        this.options.leases.completeAndWrite({ token: lease, status: "failed", error_code: execution.error_code, now, write: () => {
          this.options.attempt_manager.markStepTerminalInTransaction({ workspace_id: job.workspace_id, step_id: job.step_id, now, status: "failed" });
        } });
        return { kind: "failed", job_id: job.id, error_code: execution.error_code };
      }
      default:
        return assertNever(execution);
    }
  }
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) throw new Error("Worker clock returned an invalid timestamp");
  return new Date(parsed + milliseconds).toISOString();
}

function assertNever(value: never): never {
  throw new Error(`Unhandled worker execution result: ${String(value)}`);
}
