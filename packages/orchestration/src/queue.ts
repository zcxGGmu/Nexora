import { systemClock, type Clock } from "@nexora/contracts";
import { withTransaction, type SqliteDatabase } from "@nexora/persistence";
import { OrchestrationError } from "./errors.js";
import type { LeaseToken } from "./lease.js";
import { assertTableReady, readInteger, readJsonObject, readNullableText, readText } from "./storage.js";

export const QUEUE_JOB_STATUSES = ["queued", "leased", "completed", "failed", "cancel_requested", "cancelled", "cancel_unknown"] as const;
export type QueueJobStatus = (typeof QUEUE_JOB_STATUSES)[number];
export type QueuePayload = Readonly<Record<string, string | number | boolean | null>>;

export type QueueJob = {
  readonly id: string;
  readonly workspace_id: string;
  readonly run_id: string;
  readonly step_id: string;
  readonly idempotency_key: string;
  readonly request_hash: string;
  readonly status: QueueJobStatus;
  readonly available_at: string;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly fencing_token: number;
  readonly lease_id: string | null;
  readonly last_error_code: string | null;
  readonly payload: QueuePayload;
  readonly created_at: string;
  readonly updated_at: string;
};

export type EnqueueInput = {
  readonly id: string;
  readonly workspace_id: string;
  readonly run_id: string;
  readonly step_id: string;
  readonly idempotency_key: string;
  readonly request_hash: string;
  readonly available_at: string;
  readonly max_attempts: number;
  readonly payload: QueuePayload;
};

export class DurableQueue {
  constructor(private readonly database: SqliteDatabase, private readonly clock: Clock = systemClock) {
    assertTableReady(database, "queue_jobs");
  }

  enqueue(input: EnqueueInput): QueueJob {
    if (!Number.isInteger(input.max_attempts) || input.max_attempts < 1 || input.max_attempts > 3) {
      throw new OrchestrationError("INVALID_QUEUE_STATE", "Queue max_attempts must be between 1 and 3");
    }
    return withTransaction(this.database, () => {
      const existing = this.findByIdempotency(input.workspace_id, input.idempotency_key);
      if (existing !== undefined) {
        if (existing.request_hash !== input.request_hash) throw new OrchestrationError("IDEMPOTENCY_KEY_REUSED", "Queue idempotency key was reused with a different request");
        return existing;
      }
      const now = this.clock.now();
      try {
        this.database.prepare("INSERT INTO queue_jobs(id, workspace_id, run_id, step_id, idempotency_key, request_hash, status, available_at, attempts, max_attempts, fencing_token, lease_id, last_error_code, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, 0, ?, 0, NULL, NULL, ?, ?, ?)").run(input.id, input.workspace_id, input.run_id, input.step_id, input.idempotency_key, input.request_hash, input.available_at, input.max_attempts, JSON.stringify(input.payload), now, now);
      } catch (error) {
        if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
          const retry = this.findByIdempotency(input.workspace_id, input.idempotency_key);
          if (retry !== undefined && retry.request_hash === input.request_hash) return retry;
          throw new OrchestrationError("IDEMPOTENCY_KEY_REUSED", "Queue idempotency key was already reserved");
        }
        throw error;
      }
      const created = this.get(input.workspace_id, input.id);
      if (created === undefined) throw new OrchestrationError("NOT_FOUND", "Queued job was not persisted");
      return created;
    });
  }

  get(workspaceId: string, jobId: string): QueueJob | undefined {
    const row = this.database.prepare("SELECT id, workspace_id, run_id, step_id, idempotency_key, request_hash, status, available_at, attempts, max_attempts, fencing_token, lease_id, last_error_code, payload_json, created_at, updated_at FROM queue_jobs WHERE workspace_id = ? AND id = ?").get(workspaceId, jobId);
    return row === undefined ? undefined : readQueueJob(row);
  }

  requestCancel(workspaceId: string, jobId: string): QueueJob {
    return withTransaction(this.database, () => {
      const job = this.get(workspaceId, jobId);
      if (job === undefined) throw new OrchestrationError("NOT_FOUND", "Queue job was not found");
      if (job.status === "completed" || job.status === "failed" || job.status === "cancelled" || job.status === "cancel_unknown") return job;
      const now = this.clock.now();
      if (job.status === "queued") {
        const result = this.database.prepare("UPDATE queue_jobs SET status = 'cancelled', lease_id = NULL, updated_at = ? WHERE workspace_id = ? AND id = ? AND status = 'queued'").run(now, workspaceId, jobId);
        if (result.changes !== 1 && result.changes !== 1n) throw new OrchestrationError("INVALID_QUEUE_STATE", "Queued cancellation lost its compare-and-set race");
      } else {
        const result = this.database.prepare("UPDATE queue_jobs SET status = 'cancel_requested', updated_at = ? WHERE workspace_id = ? AND id = ? AND status IN ('leased', 'cancel_requested')").run(now, workspaceId, jobId);
        if (result.changes !== 1 && result.changes !== 1n) throw new OrchestrationError("INVALID_QUEUE_STATE", "Running cancellation lost its compare-and-set race");
      }
      return this.get(workspaceId, jobId) ?? (() => { throw new OrchestrationError("NOT_FOUND", "Queue job disappeared"); })();
    });
  }

  requestCancelRun(workspaceId: string, runId: string): readonly QueueJob[] {
    return withTransaction(this.database, () => {
      const now = this.clock.now();
      this.database.prepare("UPDATE queue_jobs SET status = 'cancelled', lease_id = NULL, updated_at = ? WHERE workspace_id = ? AND run_id = ? AND status = 'queued'").run(now, workspaceId, runId);
      this.database.prepare("UPDATE queue_jobs SET status = 'cancel_requested', updated_at = ? WHERE workspace_id = ? AND run_id = ? AND status IN ('leased', 'cancel_requested')").run(now, workspaceId, runId);
      const rows = this.database.prepare("SELECT id, workspace_id, run_id, step_id, idempotency_key, request_hash, status, available_at, attempts, max_attempts, fencing_token, lease_id, last_error_code, payload_json, created_at, updated_at FROM queue_jobs WHERE workspace_id = ? AND run_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, runId);
      return rows.map((row) => readQueueJob(row));
    });
  }

  setTerminal(token: LeaseToken, status: Extract<QueueJobStatus, "completed" | "failed" | "cancelled" | "cancel_unknown">, errorCode: string | null = null): QueueJob {
    const result = this.database.prepare("UPDATE queue_jobs SET status = ?, lease_id = NULL, last_error_code = ?, updated_at = ? WHERE workspace_id = ? AND id = ? AND lease_id = ? AND fencing_token = ? AND status IN ('leased', 'cancel_requested', 'cancel_unknown')").run(status, errorCode, this.clock.now(), token.workspace_id, token.job_id, token.lease_id, token.fencing_token);
    if (result.changes !== 1 && result.changes !== 1n) throw new OrchestrationError("STALE_LEASE", "Queue terminal write was rejected by fencing");
    return this.get(token.workspace_id, token.job_id) ?? (() => { throw new OrchestrationError("NOT_FOUND", "Queue job disappeared"); })();
  }

  reschedule(token: LeaseToken, availableAt: string, errorCode: string): QueueJob {
    const result = this.database.prepare("UPDATE queue_jobs SET status = 'queued', lease_id = NULL, last_error_code = ?, available_at = ?, updated_at = ? WHERE workspace_id = ? AND id = ? AND lease_id = ? AND fencing_token = ? AND status = 'leased'").run(errorCode, availableAt, this.clock.now(), token.workspace_id, token.job_id, token.lease_id, token.fencing_token);
    if (result.changes !== 1 && result.changes !== 1n) throw new OrchestrationError("STALE_LEASE", "Queue reschedule was rejected by fencing");
    return this.get(token.workspace_id, token.job_id) ?? (() => { throw new OrchestrationError("NOT_FOUND", "Queue job disappeared"); })();
  }

  private findByIdempotency(workspaceId: string, key: string): QueueJob | undefined {
    const row = this.database.prepare("SELECT id, workspace_id, run_id, step_id, idempotency_key, request_hash, status, available_at, attempts, max_attempts, fencing_token, lease_id, last_error_code, payload_json, created_at, updated_at FROM queue_jobs WHERE workspace_id = ? AND idempotency_key = ?").get(workspaceId, key);
    return row === undefined ? undefined : readQueueJob(row);
  }
}

function readQueueJob(row: Record<string, unknown>): QueueJob {
  const status = readText(row["status"]);
  if (!isQueueJobStatus(status)) throw new OrchestrationError("INVALID_QUEUE_STATE", "Stored queue status is invalid");
  return {
    id: readText(row["id"]),
    workspace_id: readText(row["workspace_id"]),
    run_id: readText(row["run_id"]),
    step_id: readText(row["step_id"]),
    idempotency_key: readText(row["idempotency_key"]),
    request_hash: readText(row["request_hash"]),
    status,
    available_at: readText(row["available_at"]),
    attempts: readInteger(row["attempts"]),
    max_attempts: readInteger(row["max_attempts"]),
    fencing_token: readInteger(row["fencing_token"]),
    lease_id: readNullableText(row["lease_id"]),
    last_error_code: readNullableText(row["last_error_code"]),
    payload: readJsonObject(row["payload_json"]),
    created_at: readText(row["created_at"]),
    updated_at: readText(row["updated_at"]),
  };
}

function isQueueJobStatus(value: string): value is QueueJobStatus {
  return QUEUE_JOB_STATUSES.some((status) => status === value);
}
