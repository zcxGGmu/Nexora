import type { Run } from "@nexora/contracts";

export const ACTIVE_SCHEDULE_RUN_STATUSES = ["queued", "running", "paused", "waiting_review", "partial"] as const satisfies readonly Run["status"][];

export function isActiveScheduleRunStatus(status: Run["status"]): boolean {
  return ACTIVE_SCHEDULE_RUN_STATUSES.some((active) => active === status);
}
