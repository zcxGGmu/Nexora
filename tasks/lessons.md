# Lessons

## 2026-08-24 — UI demo requests require rendered artifacts

- Pattern: When the user asks for “UI 设计图 / 布局图” after an implementation plan, do not assume Markdown diagrams are sufficient.
- Correction: The user clarified they wanted a UI demo, not only concept design documents.
- Rule: For future Nexora frontend/UI requests, produce a directly openable rendered surface first when the wording includes demo, prototype, UI 图, mockup, or visual reference.
- Rule: Keep source boundaries explicit: if a referenced video cannot be directly verified, use it as inspiration only and do not invent screenshots, timestamps, or UI details.

## 2026-08-24 — Local demo URLs require a live-process check

- Pattern: A previously reported Vite URL can become unreachable when the terminal/server process exits after the agent turn.
- Correction: When a user reports `127.0.0.1` is unavailable, check the listener and HTTP response first, then restart the dev server from the actual demo directory.
- Rule: Never treat a past “server started” message as persistent runtime state; verify `lsof` plus an HTTP smoke request in the same turn and keep the server process alive for handoff.

## 2026-08-25 — Detached handoff for local demo server

- Pattern: A Vite process launched through an interactive agent terminal can disappear after the turn/session ends, leaving the documented URL unreachable.
- Correction: Start the demo with a detached process (`nohup`/`setsid`), redirect logs to a temporary path, then verify the listener and HTTP response in the same turn.
- Rule: Do not hand off a localhost URL until the server survives a detached launch and a fresh browser navigation; a prior terminal session is not a service manager.

## 2026-08-29 — C13 completion claims require end-to-end wiring review

- Pattern: Green fixture tests and a narrowly scoped commit did not prove that an API-created remote queue job had a worker dispatcher or that an egress receipt was durable.
- Correction: Independent review found the remote path stopped at queue metadata and `createEgressReceipt` returned only an in-memory object.
- Rule: Before marking a runtime stage complete, trace the normal trigger path from API command through queue claim, adapter selection, execution, receipt persistence, and observable query; direct adapter/server tests are insufficient evidence for end-to-end wiring.

## 2026-08-29 - C16 visual gate requires current evidence and real state transitions

- Pattern: A screenshot filename that says stale and inert category tabs can invalidate an otherwise passing mobile layout review.
- Correction: Regenerate captures after the last rendered-source edit with current state names, and test every visible tab/action through the real browser.
- Rule: Visual QA evidence must be fresh, stateful, and independently inspectable; static ARIA labels without a state transition do not satisfy a functional surface.

## 2026-08-29 - Seed containment must include final file targets

- Pattern: Checking only parent directories does not prevent `writeFileSync` from following a pre-existing file symlink outside the data directory.
- Correction: The C16 review reproduced external-file overwrite through both memory and artifact targets; seed now checks every final path with `lstatSync` before writing and regression tests assert outside files remain unchanged.
- Rule: Any filesystem fixture or importer must validate the complete path, including the final file entry and dangling symlinks, immediately before writes.

## 2026-08-30 — Network recovery must trigger direct-source revalidation

- Pattern: A previous network failure led to a YouTube evidence boundary based only on noembed metadata and related pages.
- Correction: After the user reported updated network access, `yt-dlp` successfully retrieved the target video's metadata, description, chapters, automatic subtitles, and storyboard fragments.
- Rule: When network conditions change, rerun a reproducible direct-source probe before preserving an “unavailable” conclusion; keep raw signed URLs temporary, separate direct video evidence from upstream/runtime facts, and label automatic captions and marketing claims with their evidence level.

## 2026-08-30 — Green fixture tests do not prove production page wiring

- Pattern: C19 focused tests passed while the Gateway route still supplied a local fixture and never called the control API.
- Correction: Trace the browser route from `pageForRoute` through the page component and verify network requests plus post-command rereads in a real browser.
- Rule: A UI stage cannot be marked complete from projection/helper tests alone; production route wiring, loading/error/empty states, real command feedback, and fresh browser evidence are required.

## 2026-08-31 — Deployment auth wiring is part of control-plane completion

- Pattern: A control-plane route can pass direct API tests while the documented local stack disables auth-gated control routes or fails to provide the browser token needed by the UI.
- Correction: Treat Compose/Dockerfile env wiring and workspace alias resolution as part of the feature surface, then cover them with hardening tests and a live local API/browser smoke.
- Rule: Before closing a descriptor-only stage, verify the documented deployment path registers the control routes under local auth, passes a token to Mission Control without committing token values, and rejects unknown workspace aliases instead of silently forwarding fixture strings.

## 2026-09-01 — Authorize before resource lookup in scoped write paths

- Pattern: A cross-workspace write path can leak resource existence when it looks up the target session before checking whether the actor has admin scope for the request workspace.
- Correction: Move the admin scope check before session lookup in message enqueue and session command paths, then add a RED/GREEN regression that compares existing and missing other-workspace session IDs.
- Rule: For scoped API writes, parse only enough request data to identify the requested workspace, authorize that scope first, and only then load workspace-owned resources; tests must assert unauthorized existing and missing foreign resources return the same client-visible status/code.

## 2026-09-01 — Resume interrupted stage work from evidence, not memory

- Pattern: After repeated continuation prompts, it is easy to restart broad discovery or stop at a prior handoff summary instead of finishing the remaining commit-stage work.
- Correction: Re-read the local fact sources, verification artifacts, and Git state first, then continue from the smallest incomplete gate without assuming the previous report is sufficient.
- Rule: On Nexora continuation turns, identify the current Cxx stage, last scoped commit, dirty/untracked boundary, freshest verification logs, and next unchecked gate before editing or reporting completion.

## 2026-09-02 — Descriptor command idempotency must compare semantic payloads

- Pattern: A descriptor-only command can appear idempotent while replaying a changed underlying resource payload when only the command wrapper fields are compared.
- Correction: C21 `/learn` now compares the persisted candidate semantics, including lesson, diff, run, loop, source event, proposed skill, descriptor flag, and evidence refs, and rejects changed replay with `IDEMPOTENCY_KEY_REUSED`.
- Rule: For Nexora descriptor stages, idempotency must bind the full client-controlled resource semantics, and database triggers must mirror repository scope checks for cross-resource pairings such as run/goal loop or skill/version/installation.

## 2026-09-02 — QA seeds must follow hardened persistence invariants

- Pattern: A manual QA seed can keep an obsolete insert order after a migration adds semantic triggers, causing the visual gate to fail even when production code is correct.
- Correction: C21 visual QA now creates the goal loop/session facts before inserting the `learning.source` event required by the hardened source-event trigger.
- Rule: After adding DB trigger invariants, rerun all manual QA seed scripts from scratch and update fixture ordering to satisfy the same production scope constraints.

## 2026-09-02 — Dual optimistic concurrency must stay documented as implemented

- Pattern: Fixing lifecycle concurrency in code can leave ADR/runbook text claiming the old single-revision contract, which misleads operators and future reviewers.
- Correction: C21 docs now state that `If-Match` is always the skill descriptor revision, while revoke/quarantine/rollback also require `installation_revision` in the request body.
- Rule: When a review changes a public API concurrency contract, update tests, API/UI callers, ADR, runbook, and verification notes in the same stage before commit.

## 2026-09-02 — Rollback semantics need write-layer parity

- Pattern: A lifecycle API can reject a no-op rollback while repository and raw SQL paths still allow the same invalid state.
- Correction: C21 rollback now rejects `rollback_to_version_id === version_id` in service/repository logic and migration triggers, with RED/GREEN tests that include raw SQL bypass attempts.
- Rule: For reversible lifecycle states, enforce semantic impossibilities at every write layer and include raw persistence bypass tests before closing the stage.

## 2026-09-02 — Cross-resource scope invariants need raw SQL parity

- Pattern: A repository can correctly reject cross-resource pairing while the database still permits a raw SQL insert that combines two valid parents from different scoped children.
- Correction: C22 writeback requests now require the referenced memory candidate to match the same workspace and same vault at the migration trigger layer, not only in repository code.
- Rule: For append-only descriptor stages, test parent-child invariants with raw SQL bypass attempts whenever a fact references both a parent descriptor and a child fact, especially same-workspace/same-vault pairings.

## 2026-09-02 — SQLite LIKE is not descriptor grammar validation

- Pattern: SQLite `LIKE` is ASCII case-insensitive by default, so `CHECK (ref LIKE 'workspace://%')` can admit uppercase descriptor schemes that contract schemas reject later.
- Correction: C22 journal refs now use case-sensitive `GLOB` table checks plus raw-SQL trigger coverage for lowercase scheme, non-empty path, whitespace, nested scheme, traversal, encoded traversal, and backslash rejection.
- Rule: For descriptor-reference columns, use positive case-sensitive grammar checks at the database layer and prove them with raw SQL bypass tests; never rely on `LIKE` for scheme validation.

## 2026-09-02 — Invisible and encoded secret markers need DB parity

- Pattern: Contract-level scanners can reject percent-decoded secrets and default-ignorable characters while raw SQL still stores visually safe-looking descriptor refs or encoded secret markers.
- Correction: C22 added RED/GREEN coverage for default-ignorable descriptor refs and percent/double-percent encoded secret/path markers, then mirrored the rejection in contracts and migration triggers.
- Rule: When a descriptor stage rejects secrets, paths, or refs after normalization/decoding, add raw persistence bypass tests for the same transformed forms before closing the stage.

## 2026-09-02 — Descriptor policy fields require write-layer enforcement

- Pattern: A descriptor can expose policy fields such as allowed source kinds or graph/FTS enablement while repository and raw SQL writes still accept facts that violate those fields.
- Correction: C22 added RED/GREEN coverage and repository plus migration trigger enforcement for vault `allowed_source_kinds`, `graph_enabled`, and `fts_enabled` before closing Journal source and graph index writes.
- Rule: Whenever a descriptor records an allowlist, mode, capability, or disable flag, add both repository and raw SQL bypass tests that prove the policy is enforced at write time, not only displayed in the UI.

## 2026-09-02 — Server-owned timestamps must not poison idempotency

- Pattern: A CLI/control-plane command that injects fresh wall-clock timestamps can make an identical retry reuse the same idempotency key with a different request hash.
- Correction: C22 changed Journal CLI descriptor commands to omit server-owned timestamps and changed the API service to fill missing timestamps while hashing only stable client-controlled semantics for `created_at` and `updated_at`.
- Rule: For idempotent descriptor commands, keep volatile metadata server-owned or explicit stable inputs, and make replay/conflict tests run the same command across different wall-clock times.

## 2026-09-03 — Visual QA must use the same auth and database as the app

- Pattern: A browser QA rerun can fail for reasons unrelated to UI code when the seed script, API, and browser use different tokens, relative database paths, stale seeded descriptors, or obsolete selectors.
- Correction: C22 Journal visual QA was rerun with a fresh temp data dir, HMAC local auth token, quoted URLs, an absolute `NEXORA_DB_PATH`, API-seeded journal facts, and the current `.mobile-nav a` selector.
- Rule: For Nexora control-plane visual gates, start from a clean fixture root, seed through the same local API/database path the browser will read, verify the token mode after auth hardening, quote shell URLs with query strings, and refresh selectors from current DOM before declaring a visual failure or pass.
