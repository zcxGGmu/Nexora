# ADR-0008: Memory Vault and Artifact Provenance Boundaries

## Status

Accepted for C07.

## Context

Nexora needs a shared Memory Vault that agents can read and update without silently promoting unverified claims or overwriting competing facts. It also needs an Artifact Store that keeps generated outputs immutable and traceable back to the Ticket, Run, Agent, model, receipt, Judge, and Review that produced or approved them. SQLite remains the operational fact source; Markdown and artifact files remain inspectable local files under the workspace vault.

## Decision

- Runtime vault content is rooted at `NEXORA_DATA_DIR/vault`; the repository `vault/` directory is a checked-in layout template for About, Sites, Agents, Skills, Tickets, Reports, Artifacts, and Runs.
- Vault paths are resolved relative to the configured vault root. Absolute paths, `..` segments, null bytes, and symlink escapes are rejected before filesystem reads or writes.
- Memory writes require a policy-checked actor, workspace scope, path, base version, source refs, and provenance. Viewer roles can read but cannot write. Agent and Operator writes are still scoped by C04 policy.
- Facts with no verified source refs are stored with a visible `[unverified]` marker and `unverified` trust state. Verified source refs can produce `trusted` note versions.
- Memory versions are immutable. Updating a note inserts a new version and advances `memory_notes.current_version`; stale writes create a candidate version with conflict group and review ID, leaving the active note unchanged.
- Snapshots persist note IDs, paths, versions, and content hashes. Rollback restores by inserting a new active version from the snapshot rather than mutating or deleting historical versions.
- Artifact content is written under `Artifacts/<artifact_id>/v<version>/<content_hash>.txt`. `artifact_versions` binds content hash, content ref, content type, byte size, source Ticket/Run/Agent, model, receipts, Judge, Review, parent refs, metadata, and bounded preview.
- `memory_versions` and `artifact_versions` have SQLite update/delete triggers so version facts are append-only. Detailed provenance stays in metadata rows and receipts; base `EventEnvelope.payload` remains narrow until later typed event payloads are introduced.

## Consequences

C07 gives later Control API and UI work enough lineage to answer where memory and artifacts came from, who produced them, what version was reviewed, and whether facts were verified. It does not yet expose HTTP routes, Review decision APIs for memory conflicts, artifact editing UI, remote storage, vector search, or full receipt export; those remain C08-C15 responsibilities. Rollback removes the C07 packages, migration `0004_memory_artifacts.sql`, vault template, ADR, tests, and evidence while preserving earlier Run/Event/Queue facts.
