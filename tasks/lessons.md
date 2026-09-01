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
