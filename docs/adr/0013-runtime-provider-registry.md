# ADR-0013: Runtime and Provider Registry

## Context

C17/C18 needs one workspace-scoped catalog for Hermes, OpenClaw, Claude, Codex, Antigravity, local/remote backends, model providers, models, built-in tools, connectors, and MCP tools. Existing `AgentProfile.runtime` and connector descriptors are declarative fields, but they do not provide a queryable registry, health facts, or a stable control-plane status URL. The registry must not imply that a descriptor is connected or executable.

## Decision

- Add strict versioned contracts for `RuntimeDescriptor`, `ProviderDescriptor`, `ModelDescriptor`, `BackendDescriptor`, `ToolDescriptor`, and `RegistryCatalog`.
- Use stable lowercase descriptor IDs within a workspace. Store the complete contract in `payload_json` and selected query columns in SQLite migration 8.
- Keep the registry workspace-scoped. `run:read` can query it; `workspace:admin` is required to register a descriptor.
- Require an idempotency key for every registration. Replays return the original accepted command and status URL. Descriptor creation never starts a process, calls a provider, installs MCP, or sends egress.
- Model descriptors must reference a registered Provider in the same workspace. Unknown Provider references fail at the database boundary.
- Health, enabled state, execution location, capability declarations, data classification, and endpoint/secret references are facts to display and audit. They are not runtime health probes or proof of external connectivity.
- Expose a unified catalog, typed single-descriptor reads, and owner-only versioned updates under `/v1/registry`; keep external runtime/provider/tool adapters for later stages.

## Consequences

Positive:

- Mission Control can show one reliable catalog without coupling the UI to repositories.
- Future adapters can resolve requested vs actual runtime/provider/backend while preserving Run/Attempt/Receipt semantics.
- Workspace scope, idempotency, strict schema validation, and foreign keys prevent cross-tenant or dangling model references.

Tradeoffs:

- The registry duplicates selected fields for query performance and must keep them aligned with `payload_json` through typed repositories.
- Runtime descriptors carry nullable `requested_*` and `actual_*` resolution facts. A null actual value means that no adapter has resolved the request; it must not be rendered as a live connection.
- Update commands require both `Idempotency-Key` and `If-Match`; IDs and `created_at` remain immutable, and stale versions map to `VERSION_CONFLICT`.
- `health` is currently an operator-supplied fact. Heartbeats, provider probes, and automatic quarantine require a later runtime integration.
- Descriptor endpoint fields are references only; secret resolution remains outside the catalog.

## Rollback

Disable the registry routes and remove migration 8 only through a planned database rollback. Existing C00-C16 facts do not depend on registry rows. Do not delete descriptor rows as part of disabling execution; preserve them for audit and re-enablement.
