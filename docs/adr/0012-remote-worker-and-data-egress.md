# ADR-0012: Remote Worker and Data Egress

## Status

Accepted for the C13 protocol fixture. Remote execution remains explicit opt-in; local execution is the default.

## Decision

Remote work is bound to an immutable Attempt location. A remote Attempt receives only a bounded `RemoteExecutionSnapshot`: the current step identifiers, lease and fencing metadata, budget, selected artifact references, redacted memory content, policy scope/decision, and a canonical snapshot hash. The worker has no vault, database, chat-history, or secret-reference access.

The worker accepts the existing runtime envelope protocol (`hello`, `start`, `event`, `heartbeat`, `resume`, `cancel`, `close`). Every message is schema parsed and checked against the run, attempt, step, trace, lease, fencing token, deadline, and short-lived capability token. A transport failure is surfaced as `CONNECTOR_UNAVAILABLE`; it never selects a local adapter implicitly. Recovery resumes the same remote session from its cursor. Changing location creates a new queued Attempt linked by `previous_attempt_id`, leaving the failed Attempt immutable.

Origin-side egress decisions produce a strict `EgressReceipt` containing actual execution location, provider, region, data classification, redaction count, policy decision, snapshot hash, and creation time. A denied decision fails before network work. The receipt does not contain the token or raw snapshot content.

## Security Notes

The current `token_secret` option is a deterministic in-process fixture for integration tests. A deployed worker must use an origin-held signing key (Ed25519 or mTLS/private ingress), a worker verification key, audience/issuer/key-id claims, replay protection, and an expiry no later than the active lease and run deadline. Bearer tokens must never be logged or persisted.

Remote egress requires HTTPS, an allowlisted provider and region, and resolved public IPv4 evidence. Userinfo, non-standard remote ports, private/mapped/IPv6/non-IP resolutions, path traversal, and missing snapshot evidence are denied.

## Consequences

The remote worker is intentionally authority-free: it emits runtime observations only. The origin remains responsible for lease fencing, event append, artifact writes, review gates, receipt persistence, and explicit operator recovery or location switching.
