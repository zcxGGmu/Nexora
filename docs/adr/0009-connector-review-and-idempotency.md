# ADR-0009: Connector Review and Idempotency Gates

## Status

Accepted for C08.

## Context

Nexora connectors need a common execution boundary before C09 exposes Control API routes. The boundary must let low-risk internal connectors run deterministically while requiring exact human approval for risky side effects. C07 already provides immutable artifact versions, append-only provenance, and the idempotency table, so C08 can build the connector gate without adding another persistence surface.

## Decision

- Connector contracts now model request, preview, review-required, and execution receipt payloads with schema version, descriptor version, workspace/run binding, requested scope, request hash, payload hash, idempotency key, artifact version, side effects, and verification status.
- Review contracts now include a review request schema plus typed `review.requested` and `review.decided` event schemas. Review decisions bind requested scope and expiry in addition to artifact ID, artifact version, review version, reviewer, role, risk level, and approved payload hash.
- Connector implementations follow `validate -> preview -> authorize -> execute -> verify -> rollback`. The mock draft connector is intentionally local-only and writes only C07 artifact versions; it performs no network calls.
- Connector authorization is an opaque runtime capability issued by the connector implementation. `authorize()` loads review decisions from the repository by request review ID/version instead of accepting caller-supplied review objects, and `execute()` does not trust structural authorization objects, copied symbols, or package-level factory exports.
- Risk R0/R1 requests can authorize without review when scope, role, and egress policy allow them. Risk R2/R3 requests return a review-required payload until an approved review decision binds the exact preview hash.
- Stale review decisions fail before execution. Mismatched workspace, scope, artifact ID, artifact version, review version, risk level, expired decision, or changed payload hash all return `REVIEW_STALE` and do not write an artifact.
- `approved_with_edits` represents a newly reviewed payload and writes the next artifact version. The connector does not reuse an earlier approval for edited content.
- Idempotency reuses C02 `idempotency_records`: the same key and request hash reuses the original receipt reference; the same key with a different request hash returns `IDEMPOTENCY_KEY_REUSED`; execution reserves the key as an unknown side effect before writing and confirms it to the receipt only after the artifact write succeeds, leaving failed writes frozen with `DUPLICATE_SIDE_EFFECT` until reconcile.
- Review lookup is kept as a repository read helper over the existing `review_decisions` table. No new migration is required for C08.

## Consequences

C08 gives later API/UI work a typed connector lifecycle and a concrete review gate that proves which exact payload was approved before a risky action executes. The implementation stays scoped to local mock connector behavior, immutable artifact writes, idempotency reuse, and stale-review rejection. Remote connector execution, review HTTP routes, persistent connector receipts, and reviewer UI workflows remain later-stage responsibilities.
