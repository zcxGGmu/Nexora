# C05 Review

Review target: C05 implementation before final commit `0b5dd96c753f06deb6cf99e7f70e88e46f25af1f`.

The first review found cancellation read/modify/write races, non-atomic lease completion, a retry path that reused the same Step, malformed budget/retry inputs, and recovery candidates that claimed terminal jobs were resumable. A follow-up review also required writer-aware fencing, persisted failed-Step validation, terminal-state guards and a restricted lease release API.

Resolutions verified in the final tree:

- `requestCancel` uses `BEGIN IMMEDIATE` and compare-and-set status transitions.
- `LeaseManager.complete` and `reschedule` update queue and lease rows atomically with workspace/lease/fencing predicates.
- `EventStore.appendFenced` validates the current lease in the same transaction as append; asynchronous generic fenced callbacks are rejected.
- Retry marks only a persisted pending/running Step failed, creates a new queued Attempt and pending Step in the same transaction, and moves the queue to the new Step.
- Budget and retry timing fields are explicitly finite, non-negative, and integer-constrained where required.
- Recovery candidates derive `resume_from_attempt` from the resulting queue status; `release` cannot mark a lease expired and strand its job.

Evidence: `verification.log`, `g4-recovery-smoke.log`, and the targeted event-store/orchestration/worker tests. Verdict: PASS.
