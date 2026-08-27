# ADR-0010: Control API Boundary and Event Streams

## Status

Accepted for C09.

## Context

C08 delivered connector contracts and review gates, but the API still exposed only `/v1/health`. C09 needs an operator-facing control plane that can create and inspect work without coupling the UI directly to repositories, queues, or runtime adapters. The API must preserve workspace scope, command idempotency, optimistic concurrency, and append-only event observation.

## Decision

- The API now composes persistence, query, command, and SSE services from `createApiServer` only when a SQLite database and local auth configuration are provided. Health remains available without a database or with auth disabled for bootstrap checks.
- Write endpoints return `202 Accepted` with `schema_version`, stable `command_id`, object identifiers, `status_url`, and `events_url` for run commands. A `200` response is not used to imply domain success for asynchronous commands.
- Boundary parsing is API-local: Authorization uses signed local HMAC bearer tokens for this phase, `Idempotency-Key` is required for writes and capped at 128 characters, non-empty `traceparent` values must be Nexora ULID trace IDs, path/query identifiers are ULID-validated, and `If-Match` is required as a safe positive integer for state transitions.
- Server startup requires `NEXORA_CONTROL_TOKEN_SECRET` when `NEXORA_AUTH_MODE=local`. `NEXORA_AUTH_MODE=disabled` intentionally leaves control routes unavailable while preserving `/v1/health`.
- Control routes cover agents, goals, tickets, runs, artifacts, receipts, reviews, memory, and run event streams. Query routes scope every lookup by workspace and return 404 without leaking the owning workspace.
- Run creation persists a queued run, attempt, pending step, durable queue job, and `run.created` event. The idempotency table binds repeated create requests to the original resource and rejects mismatched reuse with `IDEMPOTENCY_KEY_REUSED`.
- Command acceptance and side effects are wrapped in one SQLite transaction. Failed commands roll back idempotency reservations, and nested repository/service operations reuse the active transaction.
- Run pause/resume/cancel use the domain state machine and optimistic version checks. C09 extends the state machine to allow `queued -> paused` so operators can pause a run before a worker claims it.
- Durable queue claiming now joins the run row and only claims work for `queued` or `running` runs. Run-level cancellation updates queued jobs to `cancelled` and leased jobs to `cancel_requested` without adding queue schema.
- `/v1/runs/:id/events` first verifies the scoped run exists, then emits `text/event-stream` formatted historical catch-up with cursor metadata. It supports `after`, `Last-Event-ID`, `limit`, and SQL-level `step_id` filtering so clients can reconnect without duplicating events.
- SSE responses expose public run event summaries only. Full envelope internals such as actor identity, payload hashes, redactions, and scope remain storage/internal concerns.
- Review decision and memory conflict resolution commands are exposed through the same command envelope and scope checks. Review decision bodies reject caller-supplied reviewer identity through strict parsing, and persisted decisions use the authenticated actor from the signed local token.
- New review decisions must bind to a persisted `review.requested` event payload for review id, artifact id/version, review version, risk, scope, and approved payload hash. Replay checks happen before stale detection, and expired or stale mismatches are rejected.
- Accepted non-pending review decisions append a `review.decided` event. Public review query and SSE summaries omit reviewer identity, approved payload hashes, and policy decision internals.
- Memory candidate acceptance is append-only through persisted candidate versions, requires the candidate to be exactly `current_version + 1`, and updates the active note with a conditional compare so stale candidates cannot regress newer notes. Accepted trust state is resolved from verified source references instead of copying candidate conflict state. Candidate rejection currently returns `409 MEMORY_CONFLICT` with `resolve_append_only_rejection` because immutable rejection semantics need a later design instead of a no-op acceptance.
- Query responses return public summaries for tickets, reviews, memory notes, SSE events, and queue jobs. Public tickets omit idempotency keys; public memory notes omit provenance actor identity; public queue jobs omit idempotency keys, request hashes, payloads, leases, and fencing tokens.

## Consequences

C09 gives Mission Control and curl users a stable HTTP control surface for creating, observing, pausing, resuming, retrying, cancelling, reviewing, and resolving work while keeping local control authentication explicit and storage internals off public responses. The implementation remains narrowly scoped to API composition and minimal orchestration controls. Long-lived SSE broadcaster fan-out, richer command status projections, and append-only memory rejection records can be added later without changing the C09 response envelope.
