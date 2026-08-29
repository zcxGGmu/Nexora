import { createHash } from "node:crypto";
import {
  EventEnvelopeSchema,
  RunSchema,
  ScheduleFiredEventSchema,
  ScheduleOccurrenceSchema,
  StepSchema,
  type Clock,
  type Run,
  type Schedule,
  type ScheduleOccurrence,
  type ScheduleOccurrenceStatus,
} from "@nexora/contracts";
import { AttemptRepository, RunRepository, ScheduleOccurrenceRepository, ScheduleRepository, StepRepository, withTransaction, type SqliteDatabase } from "@nexora/persistence";
import { DurableQueue } from "./queue.js";
import { nextFireAfter, resolveTimeResolution } from "./misfire.js";
import { isActiveScheduleRunStatus } from "./overlap.js";
import { readInteger, readText } from "./storage.js";

export type SchedulerFireInput = { readonly workspace_id: string; readonly now: string };
export type SchedulerFireResult =
  | { readonly kind: "enqueued"; readonly occurrence: ScheduleOccurrence; readonly run_id: string }
  | { readonly kind: "blocked_policy"; readonly occurrence: ScheduleOccurrence; readonly run_id: null }
  | { readonly kind: "skipped_overlap"; readonly occurrence: ScheduleOccurrence; readonly run_id: null }
  | { readonly kind: "duplicate"; readonly occurrence: ScheduleOccurrence; readonly run_id: string | null };
type ScheduleRunGraphInput = { readonly schedule: Schedule; readonly runId: string; readonly attemptId: string; readonly stepId: string; readonly jobId: string; readonly traceId: string; readonly occurrenceId: string; readonly scheduledFor: string; readonly now: string };
type PreparedScheduleOutcome = { readonly occurrence: ScheduleOccurrence; readonly result: Exclude<SchedulerFireResult, { readonly kind: "duplicate" }>; readonly runGraph: ScheduleRunGraphInput | null; readonly cancelRunIds: readonly string[] };

export class DurableScheduler {
  private readonly attempts: AttemptRepository;
  private readonly occurrences: ScheduleOccurrenceRepository;
  private readonly queue: DurableQueue;
  private readonly runs: RunRepository;
  private readonly schedules: ScheduleRepository;
  private readonly steps: StepRepository;

  constructor(private readonly options: { readonly database: SqliteDatabase; readonly clock: Clock; readonly idFactory: () => string }) {
    this.attempts = new AttemptRepository(options.database);
    this.occurrences = new ScheduleOccurrenceRepository(options.database);
    this.queue = new DurableQueue(options.database, options.clock);
    this.runs = new RunRepository(options.database);
    this.schedules = new ScheduleRepository(options.database);
    this.steps = new StepRepository(options.database);
  }

  fireDue(input: SchedulerFireInput): readonly SchedulerFireResult[] {
    const due = this.schedules.listDue(input.workspace_id, input.now);
    const results: SchedulerFireResult[] = [];
    for (const schedule of due) {
      let candidate: Schedule | undefined = schedule;
      let catchUpCount = 0;
      while (candidate !== undefined && candidate.enabled && candidate.next_fire_at !== null && candidate.next_fire_at <= input.now && catchUpCount < candidate.max_catch_up) {
        const advanceReference = candidate.misfire_policy === "skip_missed" || catchUpCount + 1 >= candidate.max_catch_up ? input.now : candidate.next_fire_at;
        const result = this.fireSchedule(candidate, input.now, advanceReference);
        if (result === null || result.kind === "duplicate") break;
        results.push(result);
        catchUpCount += 1;
        candidate = this.schedules.get(schedule.workspace_id, schedule.id);
      }
    }
    return results;
  }

  private fireSchedule(candidate: Schedule, now: string, advanceReference: string): SchedulerFireResult | null {
    return withTransaction(this.options.database, () => {
      const schedule = this.schedules.get(candidate.workspace_id, candidate.id);
      if (schedule === undefined || !schedule.enabled || schedule.next_fire_at === null || schedule.next_fire_at > now) return null;
      if (isAfterEnd(schedule, schedule.next_fire_at)) {
        this.schedules.update({ ...schedule, next_fire_at: null, updated_at: now });
        return null;
      }
      const scheduledFor = schedule.next_fire_at;
      const dedupeKey = `${schedule.id}:${scheduledFor}:r${schedule.revision}`;
      const duplicate = this.occurrences.getByDedupeKey(schedule.workspace_id, dedupeKey);
      if (duplicate !== undefined) return { kind: "duplicate", occurrence: duplicate, run_id: duplicate.run_id };

      const activeRunIds = this.activeRunIds(schedule.workspace_id, schedule.id);
      const occurrenceId = this.options.idFactory();
      const firedEventId = this.options.idFactory();
      const traceId = firedEventId;
      const outcome = this.prepareOutcome(schedule, scheduledFor, now, occurrenceId, firedEventId, traceId, activeRunIds);
      const createResult = this.occurrences.create(outcome.occurrence);
      if (createResult.kind === "duplicate") return { kind: "duplicate", occurrence: createResult.occurrence, run_id: createResult.occurrence.run_id };
      for (const runId of outcome.cancelRunIds) this.cancelRun(schedule.workspace_id, runId, now);
      if (outcome.runGraph !== null) this.createRunGraph(outcome.runGraph);
      this.appendScheduleFired(outcome.occurrence, traceId);
      this.schedules.update({ ...schedule, last_fire_at: scheduledFor, next_fire_at: nextFireAfter(schedule, scheduledFor, advanceReference), updated_at: now });
      return outcome.result;
    });
  }

  private prepareOutcome(schedule: Schedule, scheduledFor: string, now: string, occurrenceId: string, firedEventId: string, traceId: string, activeRunIds: readonly string[]): PreparedScheduleOutcome {
    if (schedule.misfire_policy === "skip_missed" && Date.parse(scheduledFor) < Date.parse(now)) {
      const occurrence = this.occurrence({ schedule, scheduledFor, now, occurrenceId, firedEventId, runId: null, status: "blocked_policy", reason: "missed schedule skipped by misfire policy" });
      return { occurrence, result: { kind: "blocked_policy", occurrence, run_id: null }, runGraph: null, cancelRunIds: [] };
    }

    if (activeRunIds.length > 0 && schedule.overlap_policy === "skip_if_active") {
      const occurrence = this.occurrence({ schedule, scheduledFor, now, occurrenceId, firedEventId, runId: null, status: "skipped_overlap", reason: "active schedule run skipped by overlap policy" });
      return { occurrence, result: { kind: "skipped_overlap", occurrence, run_id: null }, runGraph: null, cancelRunIds: [] };
    }

    const runId = this.options.idFactory();
    const attemptId = this.options.idFactory();
    const stepId = this.options.idFactory();
    const jobId = this.options.idFactory();
    const occurrence = this.occurrence({ schedule, scheduledFor, now, occurrenceId, firedEventId, runId, status: "enqueued", reason: "scheduled run enqueued" });
    return { occurrence, result: { kind: "enqueued", occurrence, run_id: runId }, runGraph: { schedule, runId, attemptId, stepId, jobId, traceId, occurrenceId, scheduledFor, now }, cancelRunIds: schedule.overlap_policy === "cancel_previous" ? activeRunIds : [] };
  }

  private createRunGraph(input: ScheduleRunGraphInput): void {
    const run = RunSchema.parse({ id: input.runId, workspace_id: input.schedule.workspace_id, schema_version: 1, created_at: input.now, updated_at: input.now, ticket_id: input.schedule.run_template.ticket_id, execution_location: input.schedule.run_template.execution_location, status: "queued", budget: { max_tokens: 100_000, max_cost_usd: 100 }, memory_snapshot: { snapshot_id: input.schedule.workspace_id, version: 1 }, connector_versions: { deterministic: "1.0.0" } });
    this.runs.create(run);
    this.attempts.create({ id: input.attemptId, workspace_id: input.schedule.workspace_id, schema_version: 1, created_at: input.now, updated_at: input.now, run_id: input.runId, status: "queued", execution_location: input.schedule.run_template.execution_location });
    this.steps.create(StepSchema.parse({ id: input.stepId, workspace_id: input.schedule.workspace_id, schema_version: 1, created_at: input.now, updated_at: input.now, run_id: input.runId, attempt_id: input.attemptId, agent_id: input.schedule.run_template.agent_id, status: "pending", inputs: [`schedule://${input.schedule.id}`, `ticket://${input.schedule.run_template.ticket_id}`], outputs: [`run://${input.runId}`], retry_policy: { max_attempts: 3, backoff_ms: 100 }, requires_review: false }));
    this.queue.enqueue({ id: input.jobId, workspace_id: input.schedule.workspace_id, run_id: input.runId, step_id: input.stepId, idempotency_key: `schedule:${input.schedule.id}:${input.scheduledFor}:r${input.schedule.revision}`, request_hash: requestHash({ occurrence_id: input.occurrenceId, run_id: input.runId, schedule_id: input.schedule.id, scheduled_for: input.scheduledFor, revision: input.schedule.revision }), available_at: input.now, max_attempts: 3, payload: { kind: input.schedule.run_template.execution_location === "remote" ? "remote" : "deterministic", execution_location: input.schedule.run_template.execution_location, occurrence_id: input.occurrenceId, schedule_id: input.schedule.id, workflow_id: input.schedule.workflow_id, trace_id: input.traceId } });
  }

  private occurrence(input: { readonly schedule: Schedule; readonly scheduledFor: string; readonly now: string; readonly occurrenceId: string; readonly firedEventId: string; readonly runId: string | null; readonly status: ScheduleOccurrenceStatus; readonly reason: string }): ScheduleOccurrence {
    return ScheduleOccurrenceSchema.parse({ id: input.occurrenceId, workspace_id: input.schedule.workspace_id, schema_version: 1, created_at: input.now, updated_at: input.now, schedule_id: input.schedule.id, workflow_id: input.schedule.workflow_id, scheduled_for: input.scheduledFor, fired_at: input.now, run_id: input.runId, status: input.status, dedupe_key: `${input.schedule.id}:${input.scheduledFor}:r${input.schedule.revision}`, schedule_revision: input.schedule.revision, misfire_policy: input.schedule.misfire_policy, overlap_policy: input.schedule.overlap_policy, timezone: input.schedule.timezone, time_resolution: resolveTimeResolution(input.schedule, input.scheduledFor), fired_event_id: input.firedEventId, reason: input.reason });
  }

  private appendScheduleFired(occurrence: ScheduleOccurrence, traceId: string): void {
    const sequence = this.nextScheduleSequence(occurrence.workspace_id);
    const event = ScheduleFiredEventSchema.parse({ event_id: occurrence.fired_event_id, event_type: "schedule.fired", schema_version: 1, occurred_at: occurrence.fired_at, workspace_id: occurrence.workspace_id, scope: { kind: "schedule", id: occurrence.schedule_id }, trace_id: traceId, run_id: occurrence.run_id, attempt_id: null, step_id: null, actor: { type: "system", id: null }, payload: occurrence, redactions: [], sequence });
    this.options.database.prepare("INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(event.event_id, event.workspace_id, event.run_id, event.sequence, event.event_type, event.occurred_at, this.options.clock.now(), event.trace_id, event.attempt_id, event.step_id, JSON.stringify(EventEnvelopeSchema.parse(event)), event.schema_version);
  }

  private nextScheduleSequence(workspaceId: string): number {
    const row = this.options.database.prepare("SELECT MAX(sequence) AS sequence FROM events WHERE workspace_id = ? AND event_type = 'schedule.fired'").get(workspaceId);
    const value = row?.["sequence"];
    if (value === null || value === undefined) return 0;
    return readInteger(value) + 1;
  }

  private activeRunIds(workspaceId: string, scheduleId: string): readonly string[] {
    const rows = this.options.database.prepare("SELECT r.payload_json FROM schedule_occurrences o INNER JOIN runs r ON r.workspace_id = o.workspace_id AND r.id = o.run_id WHERE o.workspace_id = ? AND o.schedule_id = ? AND o.status = 'enqueued' AND o.run_id IS NOT NULL ORDER BY o.scheduled_for ASC").all(workspaceId, scheduleId);
    const active: string[] = [];
    for (const row of rows) {
      const run = RunSchema.parse(JSON.parse(readText(row["payload_json"])));
      if (isActiveScheduleRunStatus(run.status)) active.push(run.id);
    }
    return active;
  }

  private cancelRun(workspaceId: string, runId: string, now: string): void {
    this.queue.requestCancelRun(workspaceId, runId);
    const row = this.options.database.prepare("SELECT payload_json FROM runs WHERE workspace_id = ? AND id = ?").get(workspaceId, runId);
    if (row === undefined) return;
    const run = RunSchema.parse(JSON.parse(readText(row["payload_json"])));
    if (!isActiveScheduleRunStatus(run.status)) return;
    this.updateRunStatus({ ...run, status: "cancelled", updated_at: now });
  }

  private updateRunStatus(run: Run): void {
    this.options.database.prepare("UPDATE runs SET status = ?, payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ?").run(run.status, JSON.stringify(run), run.updated_at, run.workspace_id, run.id);
  }
}

function requestHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function isAfterEnd(schedule: Schedule, timestamp: string): boolean {
  return schedule.end_at !== null && Date.parse(timestamp) > Date.parse(schedule.end_at);
}
