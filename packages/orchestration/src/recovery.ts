import { systemClock, type Clock } from "@nexora/contracts";
import type { SqliteDatabase } from "@nexora/persistence";
import { LeaseManager, type LeaseRecord } from "./lease.js";
import { DurableQueue } from "./queue.js";

export type RecoveryCandidate = {
  readonly lease: LeaseRecord;
  readonly reason: "lease_expired";
  readonly resume_from_attempt: boolean;
};

export class RecoveryManager {
  constructor(private readonly leases: LeaseManager, private readonly queue: DurableQueue, private readonly clock: Clock = systemClock) {}

  recoverExpired(workspaceId: string, now = this.clock.now()): readonly RecoveryCandidate[] {
    return this.leases.recoverExpired(workspaceId, now).map((lease) => ({ lease, reason: "lease_expired", resume_from_attempt: this.queue.get(lease.workspace_id, lease.job_id)?.status === "queued" }));
  }
}

export function createRecoveryManager(database: SqliteDatabase, clock: Clock = systemClock): RecoveryManager {
  return new RecoveryManager(new LeaseManager(database, clock), new DurableQueue(database, clock), clock);
}
