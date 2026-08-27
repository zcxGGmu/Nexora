# Nexora Memory Vault

This directory is the checked-in vault layout template. Runtime data is read from `NEXORA_DATA_DIR/vault`; this template documents the allowed top-level buckets and keeps the structure visible in fresh checkouts.

## Buckets

- `About/` stores workspace-level business, voice, offer, and founder context.
- `Sites/` stores site-scoped notes.
- `Agents/` stores agent profiles and operating notes.
- `Skills/` stores SOPs and reusable rules.
- `Tickets/` stores human-readable ticket notes.
- `Reports/` stores research and measurement summaries.
- `Artifacts/` stores immutable artifact content by content hash and version.
- `Runs/` stores run receipt summaries.

Memory writes must carry scope, source refs, trust state, and provenance. Facts without verified sources stay marked `[unverified]`; concurrent edits create conflict candidates instead of overwriting the active note.
