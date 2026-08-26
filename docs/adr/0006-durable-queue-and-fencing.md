# ADR-0006: Durable Queue, Lease, and Fencing

Status: Accepted
Date: 2026-08-26

## Context

C03 provides append-only events and C04 provides policy decisions, but a worker still needs a durable claim boundary. An in-memory worker flag cannot prevent two processes from continuing the same Step after a crash or a delayed message.

## Decision

- SQLite remains the queue fact source. Migration `0003_orchestration.sql` adds `queue_jobs` and `leases` with workspace-scoped foreign keys, idempotency/request hashes, attempt counters, lease expiry and a unique active lease per Step.
- `LeaseManager.claimNext` runs inside `BEGIN IMMEDIATE`, expires only leases in the requested workspace, increments the fencing token on every takeover, and updates the queue row with a compare-and-set status transition.
- A lease is 30 seconds by default. Heartbeats renew the expiry only while the lease and fencing token are current. Recovery marks an expired running job queued (or failed after the attempt limit); a cancellation race becomes `cancel_unknown`.
- Writes that can change Step state must call the worker's `withCurrentLease` guard before the Event/Artifact/Receipt writer. A stale or expired token raises `STALE_LEASE` and the callback is not invoked.
- Retry is limited to network/runtime availability errors and at most three attempts with exponential backoff. Scope, policy, auth and budget errors are terminal. Retry creates a new Attempt/Step record in the same transaction as requeueing, and never overwrites the failed record.
- Cancellation is explicit: queued jobs become `cancelled`, running jobs become `cancel_requested`, an adapter acknowledgement becomes `cancelled`, and an unconfirmed crash/timeout becomes `cancel_unknown`.
- Budget checks cover tokens, cost and duration before a new Step starts. The gate raises `BUDGET_EXCEEDED` without executing the Step.

## Recovery and rollback

Recovery starts from the last committed queue/event state. A failed worker can be stopped without deleting queue, lease, Attempt or Event facts; a new worker claims the queued Step with a higher token. Rollback stops workers first, then reverts the C05 package and drops only `leases` and `queue_jobs` through the existing migration rollback helper. C00-C04 facts and the Demo service are unaffected.

## Evidence

- `artifacts/progress/c05/tdd-red.log`
- `artifacts/progress/c05/db-migrate.log`
- `artifacts/progress/c05/verification.log`
- `artifacts/progress/c05/g4-recovery-smoke.log`
