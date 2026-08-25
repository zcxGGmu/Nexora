import { RunStatusSchema, type Run } from "@nexora/contracts";
import { DomainError } from "./errors.js";

export type RunStatus = Run["status"];

const transitions: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  queued: ["running", "cancelled", "failed"],
  running: ["paused", "waiting_review", "succeeded", "partial", "failed", "cancelled"],
  paused: ["running", "cancelled", "failed"],
  waiting_review: ["running", "succeeded", "partial", "failed", "cancelled"],
  succeeded: [],
  partial: ["running", "succeeded", "failed", "cancelled"],
  failed: ["running", "cancelled"],
  cancelled: [],
};

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function transitionRun(from: RunStatus, to: RunStatus): RunStatus {
  RunStatusSchema.parse(from);
  RunStatusSchema.parse(to);
  if (!canTransitionRun(from, to)) throw new DomainError("INVALID_STATE_TRANSITION", `Run cannot transition from ${from} to ${to}`);
  return to;
}

export function runTransitions(): Readonly<Record<RunStatus, readonly RunStatus[]>> {
  return transitions;
}
