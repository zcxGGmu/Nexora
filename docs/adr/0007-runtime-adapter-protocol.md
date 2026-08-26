# ADR-0007: Runtime Adapter Protocol

## Status

Accepted for C06.

## Context

Nexora needs one typed boundary for deterministic fixtures and local subprocess runtimes. The boundary must carry enough run identity to reject stale worker output, support reconnect from a committed cursor, and make runtime completion distinct from business success. Local execution must not become an arbitrary shell or an unredacted log sink.

## Decision

- Runtime messages use `schema_version: 1` and `protocol_version: 1`, with `message_id`, `message_type`, run/attempt/step/trace IDs, sequence, cursor, deadline, lease ID, and fencing token.
- The lifecycle is `hello`, `hello_ack`, `start`, `event`, `heartbeat`, `resume`, `cancel`, `cancel_ack`, and `close`. Payloads are strict Zod schemas; unknown event names are preserved and surfaced as `unmapped_event` by the adapter.
- `RuntimeAdapter` exposes `capabilities`, `start`, `send`, `cancel`, `health`, and streaming `collect`. A runtime `completed` event only records runtime termination; Judge and Review decide business quality.
- The deterministic adapter emits the same ordered fixture events for `success`, `judge_fail`, `timeout`, `partial`, and `review_needed`. It supports cursor-based replay without changing the lease fencing token.
- The local adapter starts only an absolute executable present in an explicit allowlist, with a fixed absolute cwd, argument arrays, and `shell: false`. stdout is parsed line-by-line as envelopes. stderr is retained only after configured sentinel redaction.
- A protocol version mismatch is a typed `PROTOCOL_MISMATCH` error. Non-zero process exit is `RUNTIME_CRASHED`; a cancel without acknowledgement before the bounded timeout is `cancel_unknown` and the child is terminated.

## Consequences

The adapter package is local-only in C06 and does not access the database or emit domain events directly. Worker/orchestration code remains responsible for fencing checks and mapping runtime events into append-only Nexora events. Remote adapters, egress receipts, and provider-specific protocol translation are deferred to C13.
