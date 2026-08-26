# ADR-0004: Append-only Event Store and Rebuildable Projections

- Status: Accepted
- Date: 2026-08-26
- Decision owners: Nexora Agent OS maintainers

## Context

C03 adds the event ledger required for reconnectable streams, projection rebuilds, and later queue/recovery work. C02 already provides scoped relational facts; C03 must add immutable runtime facts without replacing those repositories or introducing UI/API command behavior ahead of C09.

## Decision

1. Add a second SQLite migration, `0002_event_store.sql`, instead of rewriting only the C02 migration. Fresh databases apply `0001` then `0002`; existing C02 databases can receive the C03 tables through the same migrator.
2. Store raw events in `events` with unique `(workspace_id, event_id)` and `(workspace_id, run_id, sequence)` constraints. `EventStore.append(event, expectedSequence)` validates the strict `EventEnvelope`, requires run-scoped events, and writes inside a transaction.
3. Enforce append-only behavior at the table boundary with SQLite triggers that reject `UPDATE` and `DELETE` against `events`. Database connections enable `PRAGMA recursive_triggers = ON` so `INSERT OR REPLACE` cannot bypass those triggers. Later corrections must append new facts instead of mutating historical rows.
4. Represent projection progress in `projection_checkpoints`, one row per Run projection: `runs`, `steps`, `artifacts`, and `reviews`. Rebuilds replay raw events and upsert checkpoints atomically; degraded reducers mark the last successfully applied sequence without modifying raw events.
5. Use opaque event cursors shaped as `run:<run_id>:<sequence>` for paged reads and SSE catch-up. Unknown, mismatched, or pruned cursor positions return `EVENT_CURSOR_EXPIRED` so clients can request a fresh snapshot cursor.
6. Surface projection lag in API health only when projection health is wired into the route. The health route accepts a live provider so lag changes are visible on later requests. The C00 no-database health shape remains unchanged when no event-store dependency is configured.

## Consequences

- Run event streams are replayable, page-able, and safe for reconnecting consumers.
- Projection failures do not corrupt or delete the raw event ledger; operators can rebuild checkpoints from events.
- C03 remains bounded to persistence, event-store logic, and a narrow health surface. Queue leases, policy gates, richer read models, and SSE HTTP routes arrive in later stages.
- Changing the migration chain from a single migration to ordered migrations requires validation to check all applied versions, not only the latest table set.

## Rejected alternatives

- Mutable event rows: rejected because recovery, audit, and approval semantics require immutable historical facts.
- In-memory cursor state: rejected because reconnect and process restart must use durable sequence/event IDs.
- Projecting directly into C02 domain tables in C03: deferred because C05-C09 will define orchestration/API write semantics; C03 only establishes rebuildable checkpoints and lag.
