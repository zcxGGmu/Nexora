import { AttemptSchema, StepSchema, type Attempt, type Step } from "@nexora/contracts";
import { withTransaction, type SqliteDatabase } from "@nexora/persistence";
import { AttemptRepository, StepRepository } from "@nexora/persistence";
import { OrchestrationError } from "./errors.js";

export type CancelState = "none" | "cancel_requested" | "cancelled" | "cancel_unknown";
export type CancelResult = { readonly state: Exclude<CancelState, "none">; readonly reason?: string };

export class AttemptManager {
  private readonly attempts: AttemptRepository;
  private readonly steps: StepRepository;

  constructor(private readonly database: SqliteDatabase) {
    this.attempts = new AttemptRepository(database);
    this.steps = new StepRepository(database);
  }

  create(attempt: Attempt): Attempt {
    return this.attempts.create(AttemptSchema.parse(attempt));
  }

  createRetryAttempt(attempt: Attempt, failedStep: Step, retryStep: Step): { readonly attempt: Attempt; readonly step: Step } {
    const parsedAttempt = AttemptSchema.parse(attempt);
    const parsedInputStep = StepSchema.parse(failedStep);
    const parsedRetryStep = StepSchema.parse(retryStep);
    return withTransaction(this.database, () => {
      const persisted = this.steps.get(parsedInputStep.workspace_id, parsedInputStep.id);
      if (persisted === undefined) throw new OrchestrationError("NOT_FOUND", "Failed step was not found for retry");
      return this.createRetryAttemptInTransaction(parsedAttempt, persisted, parsedRetryStep);
    });
  }

  createRetryAttemptForQueueInTransaction(workspaceId: string, stepId: string, attempt: Attempt, retryStep: Step): { readonly attempt: Attempt; readonly step: Step } {
    const failedStep = this.steps.get(workspaceId, stepId);
    if (failedStep === undefined) throw new OrchestrationError("NOT_FOUND", "Failed step was not found for retry");
    const parsedAttempt = AttemptSchema.parse(attempt);
    const parsedStep = StepSchema.parse(failedStep);
    const parsedRetryStep = StepSchema.parse(retryStep);
    return this.createRetryAttemptInTransaction(parsedAttempt, parsedStep, parsedRetryStep);
  }

  markStepFailedInTransaction(workspaceId: string, stepId: string, now: string): Step {
    const current = this.steps.get(workspaceId, stepId);
    if (current === undefined) throw new OrchestrationError("NOT_FOUND", "Step was not found");
    if (current.status !== "pending" && current.status !== "running") throw new OrchestrationError("RETRY_NOT_ALLOWED", "Only a pending or running step can be marked failed");
    const failed = StepSchema.parse({ ...current, status: "failed", updated_at: now });
    const versionRow = this.database.prepare("SELECT version FROM steps WHERE workspace_id = ? AND id = ?").get(workspaceId, stepId);
    const version = versionRow === undefined ? undefined : readVersion(versionRow["version"]);
    if (version === undefined) throw new OrchestrationError("NOT_FOUND", "Step version was not found");
    const result = this.database.prepare("UPDATE steps SET status = 'failed', payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?").run(JSON.stringify(failed), now, workspaceId, stepId, version);
    if (result.changes !== 1 && result.changes !== 1n) throw new OrchestrationError("STALE_LEASE", "Step failure write lost its version race");
    return failed;
  }

  private createRetryAttemptInTransaction(attempt: Attempt, failedStep: Step, retryStep: Step): { readonly attempt: Attempt; readonly step: Step } {
    if (failedStep.status !== "failed") throw new OrchestrationError("RETRY_NOT_ALLOWED", "Only a failed step can create a retry attempt");
    if (failedStep.run_id !== attempt.run_id) throw new OrchestrationError("RETRY_NOT_ALLOWED", "Retry attempt must belong to the same run");
    if (attempt.status !== "queued") throw new OrchestrationError("RETRY_NOT_ALLOWED", "Retry attempt must start queued");
    if (retryStep.id === failedStep.id || retryStep.run_id !== failedStep.run_id || retryStep.attempt_id !== attempt.id || retryStep.status !== "pending") throw new OrchestrationError("RETRY_NOT_ALLOWED", "Retry step must be a new pending step in the new attempt");
    this.attempts.create(attempt);
    this.steps.create(retryStep);
    return { attempt, step: retryStep };
  }

  cancelResult(input: { readonly requested: boolean; readonly adapter_acknowledged: boolean; readonly adapter_unknown: boolean }): CancelResult {
    if (!input.requested) throw new OrchestrationError("CANCEL_UNKNOWN", "Cancellation was not requested");
    if (input.adapter_acknowledged) return { state: "cancelled" };
    if (input.adapter_unknown) return { state: "cancel_unknown", reason: "Runtime did not confirm cancellation" };
    return { state: "cancel_requested" };
  }
}

function readVersion(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint" && Number.isSafeInteger(Number(value))) return Number(value);
  return undefined;
}
