# ADR-0014: Gateway, Channels, and Sessions Control Plane

## Context

Hermes exposes messaging gateways and persistent sessions across Telegram, Discord, Slack, WhatsApp, Signal, web, and API transports. Nexora needs an auditable workspace-scoped representation of those resources before any external connector is authorized.

## Decision

- Store Gateway and Channel descriptors with readable workspace-local IDs; store Session, Message, DeliveryReceipt, and Allowlist IDs as ULIDs.
- Keep Gateway/Channel/Session state and revisions in SQLite migration 9, with migration 10 adding topology, allowlist, cursor, and append-only hardening triggers. Messages and delivery receipts are append-only facts. Session cursor checkpoints advance monotonically and support reconnect catch-up.
- Require `workspace:admin` for writes and `run:read` for reads. Every command requires an `Idempotency-Key`; mutable descriptors and session commands require `If-Match`/expected revision.
- Default outbound delivery to deny. A message is accepted only when the channel's active workspace-scoped allowlist entry permits the recipient. Denied messages do not create delivery receipts or perform network calls.
- Pause, steer, and resume are control-plane state transitions that return accepted command receipts. They do not claim that a remote session was changed until a future adapter records an execution receipt.
- Connector credentials and endpoints are secret references (`secret://...`) only. This phase never resolves secrets or opens Telegram, Discord, Slack, WhatsApp, Signal, Web, or provider connections.

## Consequences

Mission Control can show gateway health, channel queue state, session status, cursor, delivery, and allowlist evidence with deterministic recovery semantics. A future adapter can consume the same contracts without changing audit history. The current statuses are declared/control-plane facts, not transport liveness probes.

## Rollback

Disable Gateway routes and roll back migrations 9 and 10 only through a planned database migration. Preserve descriptor, message, receipt, and cursor facts for audit; never delete them as part of disabling external execution.
