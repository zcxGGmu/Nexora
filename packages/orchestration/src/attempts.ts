import { AttemptSchema, RunSchema, StepSchema, type Attempt, type Run, type Step } from "@nexora/contracts";
import { withTransaction, type SqliteDatabase } from "@nexora/persistence";
import { AttemptRepository, StepRepository } from "@nexora/persistence";
import { OrchestrationError } from "./errors.js";

type StepTerminalStatus = Extract<Step["status"], "succeeded" | "failed" | "cancelled">;

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

  get(workspaceId: string, attemptId: string): Attempt | undefined {
    return this.attempts.get(workspaceId, attemptId);
  }

  createLocationSwitchAttempt(input: {
    readonly previous_attempt: Attempt;
    readonly previous_step: Step;
    readonly attempt: Attempt;
    readonly step: Step;
  }): { readonly attempt: Attempt; readonly step: Step } {
    const previousAttempt = AttemptSchema.parse(input.previous_attempt);
    const previousStep = StepSchema.parse(input.previous_step);
    const attempt = AttemptSchema.parse(input.attempt);
    const step = StepSchema.parse(input.step);
    return withTransaction(this.database, () => {
      const persisted = this.attempts.get(previousAttempt.workspace_id, previousAttempt.id);
      if (persisted === undefined) throw new OrchestrationError("NOT_FOUND", "Previous attempt was not found");
      const persistedStep = this.steps.get(previousStep.workspace_id, previousStep.id);
      if (persistedStep === undefined) throw new OrchestrationError("NOT_FOUND", "Previous step was not found");
      if (persisted.status !== "failed" && persisted.status !== "cancelled") throw new OrchestrationError("RETRY_NOT_ALLOWED", "Only a terminal attempt can switch execution location");
      if (persistedStep.status !== "failed" && persistedStep.status !== "cancelled") throw new OrchestrationError("RETRY_NOT_ALLOWED", "Only a terminal step can switch execution location");
      if (persistedStep.workspace_id !== persisted.workspace_id || persistedStep.run_id !== persisted.run_id || persistedStep.attempt_id !== persisted.id) throw new OrchestrationError("RETRY_NOT_ALLOWED", "Previous step is outside the attempt scope");
      if (attempt.id === persisted.id || attempt.workspace_id !== persisted.workspace_id || attempt.run_id !== persisted.run_id || attempt.previous_attempt_id !== persisted.id || attempt.status !== "queued" || attempt.execution_location === undefined || attempt.execution_location === persisted.execution_location) throw new OrchestrationError("RETRY_NOT_ALLOWED", "Location switch must create a new queued attempt in the same run");
      if (step.id === previousStep.id || step.workspace_id !== attempt.workspace_id || step.run_id !== attempt.run_id || step.attempt_id !== attempt.id || step.status !== "pending") throw new OrchestrationError("RETRY_NOT_ALLOWED", "Location switch step must be a new pending step");
      if (this.attempts.get(attempt.workspace_id, attempt.id) !== undefined) throw new OrchestrationError("RETRY_NOT_ALLOWED", "Location switch attempt already exists");
      this.attempts.create(attempt);
      this.steps.create(step);
      return { attempt, step };
    });
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

  markStepTerminalInTransaction(input: { readonly workspace_id: string; readonly step_id: string; readonly now: string; readonly status: StepTerminalStatus }): Step {
    const current = this.steps.get(input.workspace_id, input.step_id);
    if (current === undefined) throw new OrchestrationError("NOT_FOUND", "Step was not found");
    if (current.status !== "pending" && current.status !== "running") throw new OrchestrationError("INVALID_QUEUE_STATE", "Only a pending or running step can become terminal");
    const attempt = this.attempts.get(current.workspace_id, current.attempt_id);
    if (attempt === undefined) throw new OrchestrationError("NOT_FOUND", "Attempt was not found");
    const run = this.readRun(current.workspace_id, current.run_id);
    const terminalStep = StepSchema.parse({ ...current, status: input.status, updated_at: input.now });
    const terminalAttempt = AttemptSchema.parse({ ...attempt, status: input.status, updated_at: input.now });
    const terminalRun = RunSchema.parse({ ...run, status: input.status, updated_at: input.now });
    this.updateStep(terminalStep);
    this.updateAttempt(terminalAttempt);
    this.updateRun(terminalRun);
    return terminalStep;
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

  private readRun(workspaceId: string, runId: string): Run {
    const row = this.database.prepare("SELECT payload_json FROM runs WHERE workspace_id = ? AND id = ?").get(workspaceId, runId);
    if (row === undefined) throw new OrchestrationError("NOT_FOUND", "Run was not found");
    return RunSchema.parse(JSON.parse(readText(row["payload_json"])));
  }

  private updateRun(run: Run): void {
    const result = this.database.prepare("UPDATE runs SET status = ?, payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ?").run(run.status, JSON.stringify(run), run.updated_at, run.workspace_id, run.id);
    if (result.changes !== 1 && result.changes !== 1n) throw new OrchestrationError("STALE_LEASE", "Run terminal write lost its version race");
  }

  private updateAttempt(attempt: Attempt): void {
    const result = this.database.prepare("UPDATE attempts SET status = ?, payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ?").run(attempt.status, JSON.stringify(attempt), attempt.updated_at, attempt.workspace_id, attempt.id);
    if (result.changes !== 1 && result.changes !== 1n) throw new OrchestrationError("STALE_LEASE", "Attempt terminal write lost its version race");
  }

  private updateStep(step: Step): void {
    const result = this.database.prepare("UPDATE steps SET status = ?, payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ?").run(step.status, JSON.stringify(step), step.updated_at, step.workspace_id, step.id);
    if (result.changes !== 1 && result.changes !== 1n) throw new OrchestrationError("STALE_LEASE", "Step terminal write lost its version race");
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

function readText(value: unknown): string {
  if (typeof value !== "string") throw new OrchestrationError("INVALID_QUEUE_STATE", "Expected text column");
  return value;
}
