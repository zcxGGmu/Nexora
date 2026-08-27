# C09 Red/Green Evidence

## Red

- `pnpm test --run packages/orchestration/src/run-control.test.ts` initially failed because `LeaseManager.claimNext()` still claimed queued jobs for paused runs and `DurableQueue.requestCancelRun()` did not exist.
- `pnpm test --run apps/api/src/routes/runs.test.ts apps/api/src/routes/events.test.ts` initially failed before collection because `@nexora/api` did not yet declare the Control API workspace dependencies required by the new API tests.
- After the first implementation pass, API tests exposed transition idempotency consuming unrelated generated IDs, filtered SSE cursor metadata exposing a filtered-out event ID, and the missing `queued -> paused` control-plane transition required before worker claim.
- Review-fix red tests then covered signed local authorization, invalid `traceparent`, unsafe `If-Match`, transactional idempotency rollback, authenticated reviewer attribution, stale review replay, review request binding, memory URL/body mismatch, missing memory candidate replay, nonexistent run event streams, SSE public summaries, JSON payload envelopes, and public queue job summaries.
- Post-review red tests failed on the reviewer findings: stale memory candidate acceptance regressed the active note, accepted review decisions did not emit `review.decided`, oversized idempotency keys were accepted, invalid path IDs reached scoped lookup, ticket/review/memory query responses exposed internal fields, and review bodies accepted caller-supplied reviewer identity.

## Green

- Added run-level queue cancellation and made lease claiming skip non-executable run states.
- Added API-local request parsing, command/query/SSE services, resource routes, and server composition around the existing persistence/domain/event-store/orchestration packages.
- Hardened local control authentication with signed HMAC bearer tokens and gated control routes behind `NEXORA_AUTH_MODE=local` plus `NEXORA_CONTROL_TOKEN_SECRET`; disabled mode leaves health available without exposing command routes.
- Wrapped command acceptance and side effects in SQLite transactions so failed commands roll back idempotency reservations; nested transaction calls now reuse the active transaction.
- Bound review decisions to persisted `review.requested` events, rejected body-supplied reviewer identity, stored the authenticated actor, emitted `review.decided` for non-pending accepted decisions, rejected expired/stale mismatches, and preserved idempotent replay before stale checks.
- Resolved memory conflict routing by requiring URL/body note agreement, avoiding idempotency poisoning on missing candidates, requiring accepted candidates to be exactly `current_version + 1`, updating with a conditional compare, deriving accepted trust state from verified sources, and explicitly rejecting candidate rejection until append-only rejection semantics are designed.
- Scoped event streaming to existing runs, filtered `step_id` in SQL, emitted public SSE summaries only, and kept query response queue jobs free of idempotency hashes, payloads, leases, and fencing internals.
- Public query projections now omit ticket idempotency keys, review reviewer/payload/policy internals, memory provenance actor identity, SSE envelope internals, and queue execution internals.
- Current verification is recorded in `artifacts/progress/c09/verification.log`: typecheck, 51-file/279-test unit suite, 6-file/10-test integration suite, migration, audit, Mission Control build, demo smoke, no-excuse availability, and fallback no-excuse text scan.
- Manual HTTP smoke is recorded in `artifacts/progress/c09/curl-smoke.log`: temporary API startup, seeded workspace/agent, goal/ticket/run create, ticket query, event stream, pause/resume/cancel, review decision/query/SSE, memory query, final run detail, and public leak checks.
