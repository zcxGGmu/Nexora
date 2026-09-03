# ADR-0020: Studio, Media, Notebook, and Avatar Control Plane

## Context

Nexora needs a Studio surface after Voice/Jarvis so operators can inspect media artifact descriptors, render queue facts, Notebook source snapshots, Notebook generation descriptors, Avatar consent descriptors, preview/share commands, and temporary URL expiry recovery. C25 is still a control-plane stage. It must not connect to NotebookLM, media generation providers, Avatar providers, MCP tools, external URLs, PDFs, Drive, credentials, render workers, or publishing channels.

## Decision

- Add strict contracts for `MediaArtifactDescriptor`, `RenderJobDescriptor`, `NotebookDescriptor`, `NotebookSourceDescriptor`, `NotebookGenerationDescriptor`, `AvatarProfileDescriptor`, `StudioShareDescriptor`, and `StudioCommand`.
- Keep C25 descriptor-only. API `202 Accepted` responses record local descriptor and command facts; they do not generate media, call NotebookLM, call avatar providers, pull URLs/PDFs/Drive files, read credentials, publish previews, or send outbound traffic.
- Store every C25 fact with `workspace_id`. Media artifacts, notebooks, avatar profiles, render jobs, Notebook sources/generations, shares, and commands bind to a run in the same workspace.
- Treat render jobs, Notebook generations, shares, and Studio commands as append-only facts. New operator actions allocate fresh command ids per new idempotency key; idempotent replay returns the persisted command resource id.
- Require Owner workspace authority for C25 writes and `run:read` for reads. Operator commands require `If-Match` against the descriptor revision and reject stale versions.
- Require descriptor references to use safe local schemes only: `artifact://`, `workspace://`, `memory://`, `journal://`, or `skill://`. `secret://`, `file://`, `vault://`, raw paths, HTTP(S), traversal, backslashes, percent-encoded secret/path markers, default-ignorable characters, and credential-shaped text are rejected.
- Bind Notebook generations to existing source descriptors from the same workspace, notebook, and run. Bind Studio commands to target descriptors whose type and command kind match the route.
- Persist payload/column parity and raw-SQL bypass protection in migration 16 so serialized payloads cannot drift from indexed columns and raw SQL cannot inject unsafe refs, provider calls, cross-scope facts, or non-descriptor execution claims.
- Expose the control plane through API routes, CLI parser semantics, and Mission Control `/studio-media` with media artifacts, render queue, Notebook snapshots/sources/generations, Avatar consent, share facts, command receipts, preview/share/rerender/generate/revoke controls, responsive layout, and the no-external-connection boundary visible.

## Consequences

Operators can coordinate media, Notebook, and avatar intent without enabling provider execution or external side effects. The database backs the critical invariants even when callers bypass repositories with raw SQL, including workspace/run scope, append-only facts, command target binding, payload parity, temporary URL expiry semantics, avatar consent state, idempotency, optimistic concurrency, and normalized secret/path rejection.

The tradeoff is that C25 intentionally does not create media, call NotebookLM, synthesize avatars, host preview URLs, or publish shares. Future live Studio stages require a separate execution ADR covering explicit consent, provider credential mediation, sandboxing, artifact persistence, storage retention, publish/revoke receipts, rate limits, and incident response.

## Rollback

Disable `/v1/studio-*` routes and remove Mission Control `/studio-media` navigation first. Preserve migration 16 rows for audit/export before a planned rollback. Do not mutate or delete existing render, generation, share, or command facts outside a controlled migration rollback because they are append-only audit records.
