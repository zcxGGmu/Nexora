# ADR-0016: Skills, Learning, and Approved Snapshot Control Plane

## Context

Nexora needs reusable skills and learning capture after Goal Mode can persist loops, continuations, and operator commands. C21 must make skill versions, source hashes, scans, reviews, installations, invocations, and `/learn` candidates visible and recoverable without executing real MCP servers, reading external URLs or PDFs, reading credentials, installing external skills, or sending provider/SaaS side effects.

## Decision

- Add strict contracts for `SkillDescriptor`, `SkillVersion`, `SkillSource`, `SkillScan`, `SkillReview`, `SkillInstallation`, `SkillInvocationFact`, `LearningCandidate`, and `LearningCommand`.
- Treat every skill operation as descriptor/control-plane only. A `202 Accepted` response records a local command fact and state transition; it does not execute a skill, install code, call MCP, or contact an external provider.
- Require approved snapshots before invocation. Installation needs a version with `status=approved`, a non-null snapshot hash, and a non-null snapshot reference.
- Allow only one active installation per workspace and skill across installed, quarantined, and rolled-back states so operators cannot accidentally run competing approved snapshots for the same skill.
- Preserve audit facts as append-only rows for sources, scans, reviews, invocation facts, and learning commands.
- Enforce scope at multiple layers: workspace IDs on every fact, goal loop/run/source-event pairing for learning candidates and invocation facts, and installation/version/skill pairing for approved snapshots.
- Reject local path intent and credential refs in C21 text and references. `artifact://`, `workspace://`, `memory://`, and `skill://` are allowed descriptor references; `file://`, `secret://`, and `vault://providers/...` are rejected for Skills/Learning input.
- Make `/learn` idempotency exact by comparing the full persisted candidate request, including lesson text, diff summary, run, loop, source event, proposed skill, descriptor flag, and evidence refs. Reusing an idempotency key with changed semantics is a conflict.
- Use optimistic concurrency intentionally: every lifecycle command uses the skill descriptor revision in `If-Match`; revoke, quarantine, and rollback also require the target installation revision in the request body so descriptor state and installation state are both freshness-checked.
- Keep rollback local to the same skill and only to an approved snapshot target that differs from the currently installed version. Cross-skill, current-version, draft, missing, or unsnapshotted targets are rejected before changing installation state.
- Expose Skills/Learning through the API, CLI parser, and Mission Control `/skills` route with approve, install, revoke, quarantine, rollback, and `/learn` controls.

## Consequences

Operators can inspect skill trust state, capture corrections as reviewable learning candidates, promote reviewed snapshots, and quarantine or roll back local skill descriptors without expanding Nexora into real external execution. The database carries enough constraints and triggers to reject raw SQL bypasses for the critical scope, snapshot, and no-op rollback invariants.

The main tradeoff is that C21 does not yet apply a learning candidate to a real skill file or execute any installed skill. Those behaviors require later stages with explicit file write policy, secret scanning, review gates, and external connector authorization.

## Rollback

Disable the `/v1/skills`, `/v1/learning/candidates`, and Mission Control `/skills` entry points first. Preserve C21 rows for audit export before applying a planned migration rollback for migration 12. Do not rewrite source, scan, review, invocation, or learning command facts during rollback.
