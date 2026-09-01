# ADR-0015: Goal Mode, Loop, and Judge Control Plane

## Context

Nexora needs long-running Goal Mode semantics before adding higher-risk Skills, browser control, voice, NotebookLM, or business connectors. C20 must make continuation, Judge, pause/resume, budget/deadline, and restart recovery observable as durable local facts without delegating completion claims to an external model or provider.

## Decision

- Add a strict Goal Mode contract around `GoalLoopDescriptor`, `GoalContinuation`, `GoalLoopCommand`, and `JudgeDecision { done, reason }`.
- Keep Goal Mode as descriptor/control-plane only. Judge decisions are validated JSON facts, not live provider calls. A future auxiliary Judge adapter can consume the same contract only after an explicit provider authorization phase.
- Store loops, continuations, and control commands in SQLite migration 11. Continuation and command payloads must match their indexed columns through database triggers so replay/recovery cannot diverge from canonical facts.
- Treat `done=false` Judge decisions as continuation facts: record the next cursor, keep the loop `running`, and do not claim success. Treat `done=true` as success only when the loop is still within max-turn, budget, and deadline constraints.
- Record max-turn, deadline, and budget exhaustion as controlled terminal outcomes. Judge failure, malformed JSON, or missing reason cannot mark a goal complete.
- Require workspace/run/session scope on Goal Mode descriptors and command payloads. API writes require Owner/admin authority, an `Idempotency-Key`, and `If-Match` where the command mutates an existing loop revision.
- Expose the same control-plane semantics through CLI commands, API routes, orchestration controller, and Mission Control Goal Mode page.
- Reject secret-shaped text in Goal Mode objectives, definition-of-done items, Judge reasons, steer instructions, and subgoal descriptions before persistence or client-visible error detail.

## Consequences

Operators can now observe and steer multi-turn goals, recover from restart/orphan conditions, and inspect Judge decisions without needing a real external provider. The UI, CLI, and API all show the same boundary: accepted control commands update local facts only. C21 Skills/Learning can build on this loop model without inventing a second continuation or completion protocol.

The main tradeoff is that C20 does not evaluate quality with a live auxiliary model. It intentionally validates and persists Judge decision facts while leaving provider execution, skill learning, browser use, NotebookLM, voice, and business SaaS integrations for later scoped stages.

## Rollback

Disable Goal Mode routes and CLI entry points first, then apply a planned migration rollback for migration 11 if needed. Preserve existing goal loop, continuation, and command rows for audit export before removing local route access. Do not delete or rewrite continuations as part of disabling future external execution.
