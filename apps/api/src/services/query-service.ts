import { z } from "zod";
import {
  AgentProfileSchema,
  ArtifactSchema,
  AttemptSchema,
  GoalSchema,
  MemoryNoteSchema,
  ReceiptSchema,
  ReviewDecisionSchema,
  RunSchema,
  ScheduleOccurrenceSchema,
  ScheduleSchema,
  StepSchema,
  TicketSchema,
  EgressReceiptSchema,
  type AgentProfile,
  type Artifact,
  type Attempt,
  type EgressReceipt,
  type Goal,
  type MemoryProvenance,
  type MemoryNote,
  type Receipt,
  type ReviewDecision,
  type Run,
  type Schedule,
  type ScheduleOccurrence,
  type Step,
  type Ticket,
} from "@nexora/contracts";
import type { QueueJob } from "@nexora/orchestration";
import type { SqliteDatabase } from "@nexora/persistence";
import { ApiHttpError } from "./errors.js";

export type QueueJobSummary = Pick<QueueJob, "id" | "workspace_id" | "run_id" | "step_id" | "status" | "available_at" | "attempts" | "max_attempts" | "created_at" | "updated_at">;
export type PublicTicket = Omit<Ticket, "idempotency_key">;
export type PublicReviewDecision = Omit<ReviewDecision, "approved_payload_hash" | "policy_decision" | "reviewer_id" | "reviewer_role">;
export type PublicMemoryProvenance = Omit<MemoryProvenance, "created_by">;
export type PublicMemoryNote = Omit<MemoryNote, "provenance"> & { readonly provenance: PublicMemoryProvenance };

export type RunDetail = {
  readonly run: Run;
  readonly version: number;
  readonly attempts: readonly Attempt[];
  readonly steps: readonly Step[];
  readonly queue_jobs: readonly QueueJobSummary[];
};

export class QueryService {
  constructor(private readonly database: SqliteDatabase) {}

  listAgents(workspaceId: string): readonly AgentProfile[] { return this.list("agents", workspaceId, AgentProfileSchema); }
  getAgent(workspaceId: string, id: string): AgentProfile { return this.get("agents", workspaceId, id, AgentProfileSchema); }
  listGoals(workspaceId: string): readonly Goal[] { return this.list("goals", workspaceId, GoalSchema); }
  getGoal(workspaceId: string, id: string): Goal { return this.get("goals", workspaceId, id, GoalSchema); }
  listTickets(workspaceId: string): readonly PublicTicket[] { return this.list("tickets", workspaceId, TicketSchema).map(publicTicket); }
  getTicket(workspaceId: string, id: string): PublicTicket { return publicTicket(this.get("tickets", workspaceId, id, TicketSchema)); }
  listRuns(workspaceId: string): readonly Run[] { return this.list("runs", workspaceId, RunSchema); }
  listSchedules(workspaceId: string): readonly Schedule[] { return this.list("schedules", workspaceId, ScheduleSchema); }
  getSchedule(workspaceId: string, id: string): Schedule { return this.get("schedules", workspaceId, id, ScheduleSchema); }
  listScheduleOccurrences(workspaceId: string, scheduleId: string): readonly ScheduleOccurrence[] {
    this.getSchedule(workspaceId, scheduleId);
    const rows = this.database.prepare("SELECT payload_json FROM schedule_occurrences WHERE workspace_id = ? AND schedule_id = ? ORDER BY scheduled_for ASC, id ASC").all(workspaceId, scheduleId);
    return rows.map((row) => ScheduleOccurrenceSchema.parse(JSON.parse(readText(row["payload_json"]))));
  }
  listArtifacts(workspaceId: string): readonly Artifact[] { return this.list("artifacts", workspaceId, ArtifactSchema); }
  listReceipts(workspaceId: string): readonly Receipt[] { return this.list("receipts", workspaceId, ReceiptSchema); }
  listEgressReceipts(workspaceId: string): readonly EgressReceipt[] { return this.list("egress_receipts", workspaceId, EgressReceiptSchema); }
  listReviews(workspaceId: string): readonly PublicReviewDecision[] { return this.list("review_decisions", workspaceId, ReviewDecisionSchema).map(publicReviewDecision); }
  listMemory(workspaceId: string): readonly PublicMemoryNote[] { return this.list("memory_notes", workspaceId, MemoryNoteSchema).map(publicMemoryNote); }

  getRunDetail(workspaceId: string, runId: string): RunDetail {
    const row = this.database.prepare("SELECT payload_json, version FROM runs WHERE workspace_id = ? AND id = ?").get(workspaceId, runId);
    if (row === undefined) throw notFound();
    return {
      run: RunSchema.parse(JSON.parse(readText(row["payload_json"]))),
      version: readInteger(row["version"]),
      attempts: this.listByRun("attempts", workspaceId, runId, AttemptSchema),
      steps: this.listByRun("steps", workspaceId, runId, StepSchema),
      queue_jobs: this.listQueueJobs(workspaceId, runId),
    };
  }

  getArtifact(workspaceId: string, id: string, version: number): Artifact {
    const row = this.database.prepare("SELECT payload_json FROM artifacts WHERE workspace_id = ? AND id = ? AND artifact_version = ?").get(workspaceId, id, version);
    if (row === undefined) throw notFound();
    return ArtifactSchema.parse(JSON.parse(readText(row["payload_json"])));
  }

  getReceipt(workspaceId: string, id: string): Receipt { return this.get("receipts", workspaceId, id, ReceiptSchema); }
  getEgressReceipt(workspaceId: string, id: string): EgressReceipt { return this.get("egress_receipts", workspaceId, id, EgressReceiptSchema); }
  getReview(workspaceId: string, id: string, reviewVersion: number): PublicReviewDecision {
    const row = this.database.prepare("SELECT payload_json FROM review_decisions WHERE workspace_id = ? AND id = ? AND review_version = ?").get(workspaceId, id, reviewVersion);
    if (row === undefined) throw notFound();
    return publicReviewDecision(ReviewDecisionSchema.parse(JSON.parse(readText(row["payload_json"]))));
  }
  getMemory(workspaceId: string, id: string): PublicMemoryNote { return publicMemoryNote(this.get("memory_notes", workspaceId, id, MemoryNoteSchema)); }

  private list<TSchema extends z.ZodTypeAny>(table: string, workspaceId: string, schema: TSchema): readonly z.output<TSchema>[] {
    const rows = this.database.prepare(`SELECT payload_json FROM ${table} WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC`).all(workspaceId);
    return rows.map((row) => schema.parse(JSON.parse(readText(row["payload_json"]))));
  }

  private get<TSchema extends z.ZodTypeAny>(table: string, workspaceId: string, id: string, schema: TSchema): z.output<TSchema> {
    const row = this.database.prepare(`SELECT payload_json FROM ${table} WHERE workspace_id = ? AND id = ?`).get(workspaceId, id);
    if (row === undefined) throw notFound();
    return schema.parse(JSON.parse(readText(row["payload_json"])));
  }

  private listByRun<TSchema extends z.ZodTypeAny>(table: string, workspaceId: string, runId: string, schema: TSchema): readonly z.output<TSchema>[] {
    const rows = this.database.prepare(`SELECT payload_json FROM ${table} WHERE workspace_id = ? AND run_id = ? ORDER BY created_at ASC, id ASC`).all(workspaceId, runId);
    return rows.map((row) => schema.parse(JSON.parse(readText(row["payload_json"]))));
  }

  private listQueueJobs(workspaceId: string, runId: string): readonly QueueJobSummary[] {
    const rows = this.database.prepare("SELECT id, workspace_id, run_id, step_id, status, available_at, attempts, max_attempts, created_at, updated_at FROM queue_jobs WHERE workspace_id = ? AND run_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, runId);
    return rows.map((row) => ({
      id: readText(row["id"]),
      workspace_id: readText(row["workspace_id"]),
      run_id: readText(row["run_id"]),
      step_id: readText(row["step_id"]),
      status: z.enum(["queued", "leased", "completed", "failed", "cancel_requested", "cancelled", "cancel_unknown"]).parse(row["status"]),
      available_at: readText(row["available_at"]),
      attempts: readInteger(row["attempts"]),
      max_attempts: readInteger(row["max_attempts"]),
      created_at: readText(row["created_at"]),
      updated_at: readText(row["updated_at"]),
    }));
  }
}

function publicTicket(ticket: Ticket): PublicTicket {
  return { id: ticket.id, workspace_id: ticket.workspace_id, schema_version: ticket.schema_version, created_at: ticket.created_at, updated_at: ticket.updated_at, goal_id: ticket.goal_id, status: ticket.status, definition_of_done: ticket.definition_of_done, assigned_agents: ticket.assigned_agents, approval_policy: ticket.approval_policy };
}

function publicReviewDecision(review: ReviewDecision): PublicReviewDecision {
  return { id: review.id, workspace_id: review.workspace_id, schema_version: review.schema_version, created_at: review.created_at, updated_at: review.updated_at, artifact_id: review.artifact_id, artifact_version: review.artifact_version, review_version: review.review_version, requested_scope: review.requested_scope, expires_at: review.expires_at, judge_result: review.judge_result, human_decision: review.human_decision, reason: review.reason, risk_level: review.risk_level };
}

function publicMemoryNote(note: MemoryNote): PublicMemoryNote {
  return { id: note.id, workspace_id: note.workspace_id, schema_version: note.schema_version, created_at: note.created_at, updated_at: note.updated_at, path: note.path, scope: note.scope, current_version: note.current_version, trust_state: note.trust_state, source_refs: note.source_refs, provenance: { run_id: note.provenance.run_id, artifact_refs: note.provenance.artifact_refs, receipt_refs: note.provenance.receipt_refs } };
}

function notFound(): ApiHttpError {
  return new ApiHttpError({ status_code: 404, code: "SCOPE_DENIED", message: "Resource not found", retryable: false, required_action: "check_scope" });
}

function readText(value: unknown): string {
  if (typeof value !== "string") throw new ApiHttpError({ status_code: 500, code: "SCHEMA_INVALID", message: "Stored text column failed validation", retryable: false, required_action: "inspect_storage" });
  return value;
}

function readInteger(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint") return Number(value);
  throw new ApiHttpError({ status_code: 500, code: "SCHEMA_INVALID", message: "Stored integer column failed validation", retryable: false, required_action: "inspect_storage" });
}
