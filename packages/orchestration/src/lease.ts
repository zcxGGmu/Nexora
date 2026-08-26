import { systemClock, type Clock } from "@nexora/contracts";
import { withTransaction, type SqliteDatabase } from "@nexora/persistence";
import { OrchestrationError } from "./errors.js";
import { readInteger, readText } from "./storage.js";

export type LeaseStatus = "active" | "expired" | "released";
export type LeaseRecord = {
  readonly lease_id: string;
  readonly workspace_id: string;
  readonly job_id: string;
  readonly run_id: string;
  readonly step_id: string;
  readonly worker_id: string;
  readonly fencing_token: number;
  readonly status: LeaseStatus;
  readonly heartbeat_at: string;
  readonly expires_at: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export type LeaseToken = Pick<LeaseRecord, "lease_id" | "workspace_id" | "job_id" | "run_id" | "step_id" | "fencing_token">;
export type ClaimInput = {
  readonly workspace_id: string;
  readonly worker_id: string;
  readonly lease_id: string;
  readonly now: string;
  readonly lease_seconds?: number;
};

export class LeaseManager {
  constructor(private readonly database: SqliteDatabase, private readonly clock: Clock = systemClock) {}

  claimNext(input: ClaimInput): LeaseRecord | undefined {
    const leaseSeconds = input.lease_seconds ?? 30;
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 3600) throw new OrchestrationError("LEASE_BUSY", "Lease duration must be between 1 and 3600 seconds");
    return withTransaction(this.database, () => {
      this.expireLeases(input.workspace_id, input.now);
      const row = this.database.prepare("SELECT id, workspace_id, run_id, step_id, attempts, max_attempts, fencing_token FROM queue_jobs WHERE workspace_id = ? AND status = 'queued' AND available_at <= ? ORDER BY available_at ASC, created_at ASC LIMIT 1").get(input.workspace_id, input.now);
      if (row === undefined) return undefined;
      const jobId = readText(row["id"]);
      const workspaceId = readText(row["workspace_id"]);
      const runId = readText(row["run_id"]);
      const stepId = readText(row["step_id"]);
      const nextToken = readInteger(row["fencing_token"]) + 1;
      const now = input.now;
      const expiresAt = addSeconds(now, leaseSeconds);
      this.database.prepare("INSERT INTO leases(lease_id, workspace_id, job_id, run_id, step_id, worker_id, fencing_token, status, heartbeat_at, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)").run(input.lease_id, workspaceId, jobId, runId, stepId, input.worker_id, nextToken, now, expiresAt, now, now);
      const updated = this.database.prepare("UPDATE queue_jobs SET status = 'leased', lease_id = ?, fencing_token = ?, attempts = attempts + 1, updated_at = ? WHERE workspace_id = ? AND id = ? AND status = 'queued'").run(input.lease_id, nextToken, this.clock.now(), workspaceId, jobId);
      if (updated.changes !== 1 && updated.changes !== 1n) throw new OrchestrationError("LEASE_BUSY", "Queue claim lost its compare-and-set race");
      return this.get(input.lease_id) ?? (() => { throw new OrchestrationError("LEASE_NOT_FOUND", "Lease was not persisted"); })();
    });
  }

  heartbeat(token: LeaseToken, now: string, leaseSeconds = 30): LeaseRecord {
    const result = this.database.prepare("UPDATE leases SET heartbeat_at = ?, expires_at = ?, updated_at = ? WHERE workspace_id = ? AND lease_id = ? AND fencing_token = ? AND status = 'active' AND expires_at > ?").run(now, addSeconds(now, leaseSeconds), this.clock.now(), token.workspace_id, token.lease_id, token.fencing_token, now);
    if (result.changes !== 1 && result.changes !== 1n) throw new OrchestrationError("STALE_LEASE", "Lease heartbeat was rejected by fencing");
    return this.get(token.lease_id) ?? (() => { throw new OrchestrationError("LEASE_NOT_FOUND", "Lease was not found"); })();
  }

  assertCurrent(token: LeaseToken, now: string): void {
    const row = this.database.prepare("SELECT workspace_id, job_id, run_id, step_id, fencing_token, status, expires_at FROM leases WHERE workspace_id = ? AND lease_id = ?").get(token.workspace_id, token.lease_id);
    if (row === undefined || readText(row["status"]) !== "active" || readInteger(row["fencing_token"]) !== token.fencing_token || readText(row["job_id"]) !== token.job_id || readText(row["run_id"]) !== token.run_id || readText(row["step_id"]) !== token.step_id || readText(row["expires_at"]) <= now) {
      throw new OrchestrationError("STALE_LEASE", "Worker lease is no longer current");
    }
    const job = this.database.prepare("SELECT lease_id, fencing_token, status FROM queue_jobs WHERE workspace_id = ? AND id = ?").get(token.workspace_id, token.job_id);
    const jobStatus = job === undefined ? null : readText(job["status"]);
    if (job === undefined || (jobStatus !== "leased" && jobStatus !== "cancel_requested") || readText(job["lease_id"]) !== token.lease_id || readInteger(job["fencing_token"]) !== token.fencing_token) throw new OrchestrationError("STALE_LEASE", "Queue job fencing token is stale");
  }

  withCurrent<T>(token: LeaseToken, now: string, write: () => T): T {
    this.assertCurrent(token, now);
    const result = write();
    if (isPromiseLike(result)) throw new OrchestrationError("INVALID_QUEUE_STATE", "Fenced writes must be synchronous and token-conditional");
    return result;
  }

  complete(token: LeaseToken, status: "completed" | "failed" | "cancelled" | "cancel_unknown", errorCode: string | null = null, now = this.clock.now()): LeaseRecord {
    return withTransaction(this.database, () => {
      this.assertCurrent(token, now);
      const queueResult = this.database.prepare("UPDATE queue_jobs SET status = ?, lease_id = NULL, last_error_code = ?, updated_at = ? WHERE workspace_id = ? AND id = ? AND lease_id = ? AND fencing_token = ? AND status IN ('leased', 'cancel_requested', 'cancel_unknown')").run(status, errorCode, now, token.workspace_id, token.job_id, token.lease_id, token.fencing_token);
      if (queueResult.changes !== 1 && queueResult.changes !== 1n) throw new OrchestrationError("STALE_LEASE", "Queue completion was rejected by fencing");
      const leaseResult = this.database.prepare("UPDATE leases SET status = 'released', updated_at = ? WHERE workspace_id = ? AND lease_id = ? AND fencing_token = ? AND status = 'active'").run(now, token.workspace_id, token.lease_id, token.fencing_token);
      if (leaseResult.changes !== 1 && leaseResult.changes !== 1n) throw new OrchestrationError("STALE_LEASE", "Lease completion was rejected by fencing");
      return this.get(token.lease_id) ?? (() => { throw new OrchestrationError("LEASE_NOT_FOUND", "Lease was not found"); })();
    });
  }

  reschedule(token: LeaseToken, newStepId: string, availableAt: string, errorCode: string, prepareRetry: () => void = () => undefined, now = this.clock.now()): LeaseRecord {
    return withTransaction(this.database, () => {
      this.assertCurrent(token, now);
      prepareRetry();
      const queueResult = this.database.prepare("UPDATE queue_jobs SET status = 'queued', step_id = ?, lease_id = NULL, last_error_code = ?, available_at = ?, updated_at = ? WHERE workspace_id = ? AND id = ? AND lease_id = ? AND fencing_token = ? AND status = 'leased'").run(newStepId, errorCode, availableAt, now, token.workspace_id, token.job_id, token.lease_id, token.fencing_token);
      if (queueResult.changes !== 1 && queueResult.changes !== 1n) throw new OrchestrationError("STALE_LEASE", "Queue reschedule was rejected by fencing");
      const leaseResult = this.database.prepare("UPDATE leases SET status = 'released', updated_at = ? WHERE workspace_id = ? AND lease_id = ? AND fencing_token = ? AND status = 'active'").run(now, token.workspace_id, token.lease_id, token.fencing_token);
      if (leaseResult.changes !== 1 && leaseResult.changes !== 1n) throw new OrchestrationError("STALE_LEASE", "Lease reschedule was rejected by fencing");
      return this.get(token.lease_id) ?? (() => { throw new OrchestrationError("LEASE_NOT_FOUND", "Lease was not found"); })();
    });
  }

  recoverExpired(workspaceId: string, now: string): readonly LeaseRecord[] {
    return withTransaction(this.database, () => {
      const rows = this.database.prepare("SELECT lease_id FROM leases WHERE workspace_id = ? AND status = 'active' AND expires_at <= ? ORDER BY expires_at ASC").all(workspaceId, now);
      const recovered: LeaseRecord[] = [];
      for (const row of rows) {
        const leaseId = readText(row["lease_id"]);
        this.expireLease(leaseId, now);
        const lease = this.get(leaseId);
        if (lease !== undefined) recovered.push(lease);
      }
      return recovered;
    });
  }

  get(leaseId: string): LeaseRecord | undefined {
    const row = this.database.prepare("SELECT lease_id, workspace_id, job_id, run_id, step_id, worker_id, fencing_token, status, heartbeat_at, expires_at, created_at, updated_at FROM leases WHERE lease_id = ?").get(leaseId);
    return row === undefined ? undefined : readLease(row);
  }

  private expireLeases(workspaceId: string, now: string): void {
    const rows = this.database.prepare("SELECT lease_id FROM leases WHERE workspace_id = ? AND status = 'active' AND expires_at <= ?").all(workspaceId, now);
    for (const row of rows) this.expireLease(readText(row["lease_id"]), now);
  }

  private expireLease(leaseId: string, now: string): void {
    const lease = this.get(leaseId);
    if (lease === undefined) return;
    this.database.prepare("UPDATE leases SET status = 'expired', updated_at = ? WHERE lease_id = ? AND status = 'active'").run(now, leaseId);
    const job = this.database.prepare("SELECT attempts, max_attempts, status FROM queue_jobs WHERE workspace_id = ? AND id = ?").get(lease.workspace_id, lease.job_id);
    if (job === undefined) return;
    const attempts = readInteger(job["attempts"]);
    const maxAttempts = readInteger(job["max_attempts"]);
    const status = readText(job["status"]);
    if (status === "leased" || status === "cancel_requested") {
      const nextStatus = status === "cancel_requested" ? "cancel_unknown" : attempts >= maxAttempts ? "failed" : "queued";
      const errorCode = status === "cancel_requested" ? "CANCEL_UNKNOWN" : "RUNTIME_CRASHED";
      this.database.prepare("UPDATE queue_jobs SET status = ?, lease_id = NULL, last_error_code = ?, updated_at = ? WHERE workspace_id = ? AND id = ? AND status IN ('leased', 'cancel_requested')").run(nextStatus, errorCode, now, lease.workspace_id, lease.job_id);
    }
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null && typeof value === "object" && "then" in value && typeof value.then === "function";
}

function readLease(row: Record<string, unknown>): LeaseRecord {
  const status = readText(row["status"]);
  if (status !== "active" && status !== "expired" && status !== "released") throw new OrchestrationError("LEASE_NOT_FOUND", "Stored lease status is invalid");
  return {
    lease_id: readText(row["lease_id"]),
    workspace_id: readText(row["workspace_id"]),
    job_id: readText(row["job_id"]),
    run_id: readText(row["run_id"]),
    step_id: readText(row["step_id"]),
    worker_id: readText(row["worker_id"]),
    fencing_token: readInteger(row["fencing_token"]),
    status,
    heartbeat_at: readText(row["heartbeat_at"]),
    expires_at: readText(row["expires_at"]),
    created_at: readText(row["created_at"]),
    updated_at: readText(row["updated_at"]),
  };
}

function addSeconds(timestamp: string, seconds: number): string {
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) throw new OrchestrationError("LEASE_BUSY", "Lease timestamp is invalid");
  return new Date(milliseconds + seconds * 1000).toISOString();
}
