# ADR-0002: Versioned Contracts and Async Commands

- Status: Accepted
- Date: 2026-08-26

## Context

Nexora crosses HTTP, event, runtime, and connector boundaries. Those boundaries need deterministic validation, safe error reporting, and an explicit distinction between an accepted command and completed business work.

## Decision

1. Wire identifiers are raw canonical uppercase 26-character ULIDs. TypeScript brands distinguish entity references without adding semantic prefixes to persisted values.
2. `schema_version` and `protocol_version` are independent axes. Persisted schemas and runtime transport protocol compatibility are validated separately.
3. Persisted records carry common metadata (`id`, `workspace_id`, `schema_version: 1`, `created_at`, `updated_at`). Transport envelopes and connector descriptors use their explicit fields and are not treated as persisted entities.
4. Zod objects are strict at every known nested boundary. Unknown fields fail parsing. The typed parse boundary returns `SCHEMA_INVALID` details containing only issue paths and codes.
5. Entity status enums are conservative and distinct where lifecycle meanings differ. C01 defines shapes only; it does not implement transitions, persistence, policy enforcement, connector execution, or review authorization.
   Artifact statuses are `draft`, `verified`, `approved`, `published`, `superseded`, and `side_effect_unknown`; review decisions are `approved`, `rejected`, `changes_requested`, `approved_with_edits`, and `pending`. Connector descriptors use strict `retry` and `rollback` fields.
6. Commands are asynchronous: HTTP acceptance is not business completion.

## Boundaries

C01 owns versioned domain and transport contracts. C06 adds concrete runtime adapter behavior. C08 adds connector lifecycle and execution. Production create routes arrive in C09; C01 manual probing is validation-only and performs no persistence.

## Consequences

Clients can reject incompatible versions before executing work, and logs can correlate errors with opaque trace IDs without leaking rejected input. Future protocol evolution can proceed independently from persisted schema evolution.
