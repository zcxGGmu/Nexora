# ADR-0017: Obsidian, OMI, and Journal Control Plane

## Context

Nexora needs a local journal surface after Skills/Learning so operators can inspect vault bridge descriptors, daily journal facts, source descriptors, graph/FTS index snapshots, memory candidates, and writeback approval requests. C22 must make those facts queryable and reviewable without connecting to real Obsidian, OMI, MCP servers, external providers, credentials, or user vault writeback paths.

## Decision

- Add strict contracts for `VaultBridgeDescriptor`, `JournalEntryDescriptor`, `JournalSource`, `GraphIndexSnapshot`, `MemoryCandidate`, `WritebackRequest`, and `WritebackDecision`.
- Keep C22 descriptor/control-plane only. API `202 Accepted` responses record local facts and command receipts; they do not read a real vault, sync OMI, call MCP, contact providers, or write files into a user vault.
- Use descriptor namespaces only for journal references: `workspace://`, `artifact://`, `memory://`, and `journal://`. Reject `file://`, `secret://`, raw absolute paths, path traversal, HTTP(S), and secret-shaped text in contracts and database triggers.
- Store all journal facts workspace-scoped. Vaults, entries, sources, graph indexes, candidates, writeback requests, and decisions carry `workspace_id`; repository reads and writes always include that scope.
- Make root journal facts append-only. Vault bridges, entries, sources, graph indexes, memory candidates, and decisions cannot be updated or deleted. Writeback requests can move only from `pending_review` to `approved` or `rejected` through an appended matching decision fact.
- Enforce parent/child scope at both repository and database layers. Sources and candidates must belong to the same vault and entry; writeback requests must reference a memory candidate in the same workspace and same vault; writeback `target_ref` must equal the selected vault `root_ref` or a child descriptor path under that root; journal entries with goal loop scope must match the same run.
- Enforce vault policy fields at both repository and database layers. `JournalSource` writes must use a `source_kind` listed in the vault descriptor, and graph/FTS snapshots must honor `graph_enabled` and `fts_enabled` instead of treating those fields as display-only metadata.
- Require Owner write authority for journal writes and `run:read` for descriptor reads. Writeback request creation and decisions require an opaque, safe `Idempotency-Key` that passes the shared contract schema and is safe to echo as an accepted command id; decisions also require `If-Match` against the request revision.
- Treat `created_at` and `updated_at` as server-owned metadata for Journal API writes. CLI-shaped descriptor commands omit volatile timestamps, and idempotency compares stable client-controlled semantics so normal retries do not become conflicts because wall-clock time changed. Source and graph event timestamps remain semantic inputs when supplied, while request/descriptor metadata timestamps are canonicalized server-side.
- Default vault bridge access mode is read-only for C22. Writeback approval means the local request descriptor is approved, not that an external write happened.
- Expose the control plane through API routes, CLI parser semantics, and Mission Control `/journal` with graph/FTS, memory, writeback, approval-only, and no-external-connection status visible on desktop and mobile.

## Consequences

Operators can review journal-derived memory candidates and stage approval decisions with durable local facts while preserving the no-side-effect boundary. The database now defends the critical invariants even if a caller bypasses repositories with raw SQL, including append-only facts, vault source/index policy enforcement, same-vault writeback candidate scope, target-root containment, exact JSON payload keys, descriptor reference grammar, and monotonic writeback request revisions.

The main tradeoff is that C22 does not import real Obsidian notes, OMI transcripts, MCP graph data, or write approved diffs back to a vault. Those capabilities require later explicit connector stages with credential policy, outbound allowlists, audit receipts, and manual approval gates.

## Rollback

Disable the `/v1/vaults` and `/v1/journal/*` routes and remove Mission Control `/journal` navigation first. Preserve migration 13 rows for audit/export before a planned rollback. Do not mutate or delete existing journal/writeback facts outside a controlled migration rollback because they are append-only audit records.
