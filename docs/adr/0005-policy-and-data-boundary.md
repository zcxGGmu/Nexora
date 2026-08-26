# ADR-0005: Policy and Data Boundary

## Status

Accepted for C04.

## Context

Nexora runs local and future remote agents against scoped workspace data, connectors, artifacts, and review gates. External content can contain prompt injection, agents can request broader scopes, and high-risk connectors can create irreversible side effects. C04 needs one policy boundary shared by API, worker, and connector evaluation rather than ad hoc checks in each caller.

## Decision

Introduce `@nexora/policy` as a pure TypeScript package. It evaluates role permissions, requested scope, connector risk, egress constraints, and redaction without performing side effects. Callers receive a typed `PolicyDecision`; denied decisions can be converted into append-only audit events with `scope.denied`, `policy.denied`, or `secret.redacted` event types.

Contracts now publish shared policy primitives: `Owner`, `Operator`, `Reviewer`, `Viewer`, `Agent`; `R0` through `R3`; data classifications; enforcement points; policy scopes; policy decision records; and egress metadata. Agent profiles carry role and allowed scopes. Connector descriptors carry allowed scopes and egress policy. Review decisions carry risk level and the policy decision record that was approved.

The policy defaults are deliberately conservative:

- `Agent` can read run/memory scope and execute connectors, but cannot issue human review decisions.
- `R3` and connectors marked `requires_review` require an Owner/Reviewer human approval bound to a canonical `sha256:<64 hex>` payload hash.
- API, worker, and connector enforcement points call the same scope evaluator.
- Remote egress for non-public data requires a minimal snapshot and explicit provider/region allowlists.
- Remote egress rejects non-HTTPS schemes, IPv6 hosts, private/link-local hosts, path traversal inputs, missing resolved public IPv4 evidence, and non-IP DNS evidence before any external call.
- Secret redaction is recursive and returns both a redacted value and auditable redaction paths.

## Consequences

Policy enforcement remains testable without a database or network. C05+ orchestration can call these pure functions before leasing work or executing connector side effects. C07+ memory/artifact code can reuse the same redaction function before writing previews, logs, or event payloads.

Audit events remain append-only and run scoped so they pass the C03 event-store invariant. The first C04 event helper writes an empty payload plus redaction metadata to avoid leaking denied inputs; richer typed policy payloads can be introduced later by extending the event envelope payload strategy intentionally.

## Verification

- `packages/policy/src/*.test.ts` covers RBAC, scope, risk, egress, and redaction.
- `tests/integration/policy-boundary.test.ts` verifies Site A to Site B scope denial, connector scope denial, and confirms an R3 connector without approval makes zero external calls.
- Contract tests verify the new policy fields and policy audit event types.
