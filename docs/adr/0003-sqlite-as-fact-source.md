# ADR-0003: SQLite as the Domain Fact Source

- Status: Accepted
- Date: 2026-08-26
- Decision owners: Nexora Agent OS maintainers

## Context

C02 needs durable domain state before event projections, orchestration, or Control API routes exist. The system must preserve workspace scope, optimistic versions, immutable Attempt/Receipt facts, and idempotency records while remaining local-first.

## Decision

1. Use Node 22.13+'s built-in `node:sqlite` `DatabaseSync` API, after the module no longer required the `--experimental-sqlite` flag. This keeps the C02 package dependency-free beyond the workspace contracts/config packages and avoids native addon installation during bootstrap.
2. Store the canonical C02 tables in a versioned `0001_core.sql` migration. The database enables foreign keys, WAL journal mode, and a bounded busy timeout. SQL writes use prepared statements and transactions.
3. Persist validated `@nexora/contracts` payloads as JSON alongside indexed relationship/status/version columns. Repositories require workspace scope and use `expected_version` for mutable aggregate updates. Attempts, Receipts, Artifacts, and Reviews are append-oriented and are never silently overwritten.
4. `NEXORA_MIGRATION_MODE=auto` applies missing migrations; `validate` checks the recorded version without changing the database; `disabled` skips migration startup.
5. C02 defines domain Run transitions and command DTOs, but does not implement event projections, queue leases, policy enforcement, external connectors, or API creation routes.

## Consequences

- SQLite is the local source of truth and can be backed up as a single file.
- JSON payload columns retain the versioned contract while relational columns support scope, status, uniqueness, and foreign-key checks.
- `node:sqlite` is still marked release-candidate in Node 22; the project therefore pins the minimum supported Node minor to 22.13 and records runtime verification on the host Node version.
- Later stages may add event-store tables and read projections without changing the C02 fact tables.

## Rejected alternatives

- `better-sqlite3`/`sqlite3`: rejected for C02 because native dependency installation adds platform and Node ABI risk before the domain boundary is stable.
- In-memory maps: rejected because restart recovery and durable scope/version constraints are explicit requirements.
- Event log as the only write model: deferred to C03; C02 first establishes relational facts and repositories.
