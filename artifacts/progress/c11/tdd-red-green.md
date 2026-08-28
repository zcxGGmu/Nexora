# C11 TDD Red / Green Evidence

## Red

- Added C11 page/component/E2E tests first for Run Detail, Goal/Kanban, Ticket, Review, Artifact, Memory, and interaction contracts.
- Initial targeted mission-control run failed because `RunDetailPage`, `GoalPage`, `ReviewPage`, `ArtifactPage`, `MemoryPage`, and `KanbanBoard` did not exist.
- Reviewer-driven interaction RED later failed because Kanban status changes had no visible planning update and current Review approval was enabled before reason/hash confirmation.
- Code-review RED added interaction and route coverage for Artifact tabs, Stop/Retry recovery actions, Approve/Reject decision acknowledgements, and unknown detail IDs. `pnpm --filter @nexora/mission-control test --run apps/mission-control/src/components/interaction.test.tsx` failed on the missing `role="tabpanel"`; `pnpm test:e2e -- operator-reviewer.spec.ts` failed on Retry acknowledgement and unknown Run not-found state.

## Green

- Implemented fixture-backed workspaces and components under `apps/mission-control/src/pages` and `apps/mission-control/src/components`.
- Routed `/goals`, `/tickets`, `/runs/:id`, `/review/:id`, `/artifacts/:id`, and `/memory` away from C10 placeholders.
- Added local UI state for keyboard Kanban status changes, recovery action selection, and Review reason/hash confirmation without calling the API or claiming external side effects.
- Added ARIA Artifact tabs with visible tab panels, route-level C11 fixture boundaries for unknown Run/Review/Artifact IDs, and E2E coverage for Stop, Retry, Approve, Reject, tab switching, and not-found states.
- `pnpm --filter @nexora/mission-control test --run` passes 14 files / 28 tests.
- `pnpm test --run` passes 65 files / 307 tests.
- `pnpm test:integration` passes 6 files / 10 tests.
- `pnpm test:e2e -- operator-reviewer.spec.ts` passes 2 Operator/Reviewer tests.
