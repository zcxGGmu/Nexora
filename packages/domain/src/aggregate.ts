import { systemClock, type Clock, type Run } from "@nexora/contracts";
import { transitionRun, type RunStatus } from "./run-state.js";

export type RunAggregate = { readonly run: Run };

export function createRunAggregate(run: Run): RunAggregate {
  return { run };
}

export function applyRunStatus(aggregate: RunAggregate, status: RunStatus, clock: Clock = systemClock): RunAggregate {
  const nextStatus = transitionRun(aggregate.run.status, status);
  return { run: { ...aggregate.run, status: nextStatus, updated_at: clock.now() } };
}
