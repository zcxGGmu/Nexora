# Scheduler Operations

## Scope

C14 introduces durable schedules and schedule occurrences. The scheduler never relies on in-memory timers as the source of truth: it rebuilds due work from persisted `schedules.next_fire_at`, writes one `schedule_occurrences` row per accepted trigger, and records `schedule.fired` audit events for observable outcomes.

## Data Model

- Store `next_fire_at`, `last_fire_at`, `scheduled_for`, and `fired_at` as UTC timestamps.
- Preserve the workspace timezone, trigger expression, schedule revision, misfire policy, max catch-up, and overlap policy in the Schedule payload.
- Use `schedule_id:scheduled_for:r<revision>` as the occurrence dedupe key so competing scheduler instances converge on one occurrence.
- Keep `events.run_id` nullable so `schedule.fired` can audit skipped or blocked triggers without inventing a Run.

## Scheduler Loop

1. List enabled schedules whose durable `next_fire_at` is due for the workspace.
2. Re-read each Schedule inside the transaction to avoid stale candidate state.
3. Create or reuse the occurrence dedupe key before enqueueing work.
4. Apply the explicit overlap policy:
   - `skip_if_active`: write an occurrence with `skipped_overlap` and no Run.
   - `queue_after_active`: create a new queued Run and queue job while preserving active Runs.
   - `cancel_previous`: cancel active queue jobs/Runs, then enqueue the new Run.
5. Write `schedule.fired` with Schedule scope and the occurrence payload.
6. Advance `last_fire_at` and `next_fire_at` from persisted state.

## Recovery

- On restart, call the scheduler loop for each workspace. Due work is reconstructed from `next_fire_at`; no process-local timer state is required.
- `run_once_after_recovery` fires persisted due occurrences up to `max_catch_up`, then advances the next fire time beyond the current clock.
- `skip_missed` writes a `blocked_policy` occurrence without a Run, then advances the next fire time beyond the current clock.
- DST transitions must preserve UTC timestamps and record occurrence `time_resolution` as `exact`, `ambiguous_time`, or `skipped_time`.

## Failure Handling

- A duplicate occurrence means another scheduler instance won the durable dedupe race; do not enqueue a second Run.
- Scope or policy denial should be surfaced at the API boundary before Schedule creation.
- If enqueue fails after an occurrence is prepared, keep the occurrence/audit evidence and investigate the queue constraint before retrying.
- Do not disable or restart the launchd-managed demo service on port 5173 while operating C14 scheduler code.

## Verification Surface

- Unit contracts: `packages/contracts/src/schedules.test.ts`
- Persistence: `packages/persistence/src/schedules.test.ts`
- Scheduler behavior: `packages/orchestration/src/scheduler.test.ts`
- Restart/API recovery: `tests/integration/schedule-recovery.test.ts`
- Type gate: `pnpm typecheck`
- Broad gates: `pnpm test:integration`, `pnpm test --run`, and demo smoke via `curl -fsS -I http://127.0.0.1:5173/`
