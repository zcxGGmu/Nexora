import { z } from "zod";
import {
  AgentProfileSchema,
  EventEnvelopeSchema,
  GoalSchema,
  MemoryNoteSchema,
  MemoryVersionSchema,
  PayloadHashSchema,
  PolicyDecisionSchema,
  PolicyScopeSchema,
  AgentIdSchema,
  ArtifactIdSchema,
  ReviewDecidedEventSchema,
  ReviewDecisionSchema,
  ReviewRequestedEventSchema,
  RiskLevelSchema,
  RunSchema,
  StepSchema,
  TimestampSchema,
  TicketIdSchema,
  TicketSchema,
  UlidSchema,
  WorkspaceIdSchema,
  type EventEnvelope,
  type MemoryTrustState,
  type ReviewDecision,
  type ReviewRequestedEvent,
  type Run,
} from "@nexora/contracts";
import { applyRunStatus, createRunAggregate } from "@nexora/domain";
import { EventStore } from "@nexora/event-store";
import { DurableQueue } from "@nexora/orchestration";
import { AgentRepository, ArtifactRepository, GoalRepository, IdempotencyRepository, ReviewRepository, RunRepository, StepRepository, TicketRepository, withTransaction, type SqliteDatabase } from "@nexora/persistence";
import { assertScope, type PolicyActor } from "@nexora/policy";
import { accepted, acceptedRun, currentSequence, isReviewApproval, notFound, readInteger, readText, requestHash, reviewStale, runEventType, scopesEqual } from "./command-helpers.js";
import { ApiHttpError } from "./errors.js";

export type IdFactory = () => string;
export type CommandServiceOptions = { readonly database: SqliteDatabase; readonly idFactory: IdFactory; readonly clock: { readonly now: () => string } };
export type AcceptedCommand = {
  readonly schema_version: 1;
  readonly command_id: string;
  readonly status: "accepted";
  readonly object_type: string;
  readonly object_id: string;
  readonly status_url: string;
  readonly events_url: string | null;
  readonly run_id?: string;
};

const CreateAgentBodySchema = AgentProfileSchema.omit({ id: true, created_at: true, updated_at: true }).strict();
const CreateGoalBodySchema = GoalSchema.omit({ id: true, created_at: true, updated_at: true }).strict();
const CreateTicketBodySchema = TicketSchema.omit({ id: true, created_at: true, updated_at: true }).strict();
const CreateRunBodySchema = z.object({ schema_version: z.literal(1), workspace_id: WorkspaceIdSchema, ticket_id: TicketIdSchema, agent_id: AgentIdSchema, execution_location: z.enum(["local", "remote"]).default("local") }).strict();
const TransitionBodySchema = z.object({ schema_version: z.literal(1), workspace_id: WorkspaceIdSchema }).strict();
const ReviewDecisionBodySchema = z.object({
  schema_version: z.literal(1),
  workspace_id: WorkspaceIdSchema,
  artifact_id: ArtifactIdSchema,
  artifact_version: z.number().int().positive(),
  review_version: z.number().int().positive(),
  requested_scope: PolicyScopeSchema,
  expires_at: TimestampSchema,
  judge_result: z.enum(["pass", "fail", "needs_revision"]),
  human_decision: z.enum(["approved", "rejected", "changes_requested", "approved_with_edits", "pending"]),
  reason: z.string().min(1),
  approved_payload_hash: PayloadHashSchema.nullable(),
  risk_level: RiskLevelSchema,
  policy_decision: PolicyDecisionSchema,
}).strict();
const ResolveMemoryBodySchema = z.object({ schema_version: z.literal(1), workspace_id: WorkspaceIdSchema, note_id: UlidSchema, note_version: z.number().int().positive(), decision: z.enum(["accept_candidate", "reject_candidate"]) }).strict();

type ReviewDecisionBody = z.infer<typeof ReviewDecisionBodySchema>;

export class CommandService {
  private readonly idempotency: IdempotencyRepository;
  private readonly queue: DurableQueue;
  private readonly runs: RunRepository;

  constructor(private readonly options: CommandServiceOptions) {
    this.idempotency = new IdempotencyRepository(options.database);
    this.queue = new DurableQueue(options.database, options.clock);
    this.runs = new RunRepository(options.database);
  }

  createAgent(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const body = CreateAgentBodySchema.parse(input);
    return withTransaction(this.options.database, () => {
      this.requireScope(actor, "workspace:admin", body.workspace_id);
      const id = this.reserve({ workspace_id: body.workspace_id, key: idempotencyKey, hash: requestHash(body), resource_type: "agent" });
      if (id.kind === "new") new AgentRepository(this.options.database).create(AgentProfileSchema.parse({ ...body, id: id.resource_id, created_at: this.now(), updated_at: this.now() }));
      return accepted({ command_id: idempotencyKey, object_type: "agent", object_id: id.resource_id, workspace_id: body.workspace_id });
    });
  }

  createGoal(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const body = CreateGoalBodySchema.parse(input);
    return withTransaction(this.options.database, () => {
      this.requireScope(actor, "run:write", body.workspace_id);
      const id = this.reserve({ workspace_id: body.workspace_id, key: idempotencyKey, hash: requestHash(body), resource_type: "goal" });
      if (id.kind === "new") new GoalRepository(this.options.database).create(GoalSchema.parse({ ...body, id: id.resource_id, created_at: this.now(), updated_at: this.now() }));
      return accepted({ command_id: idempotencyKey, object_type: "goal", object_id: id.resource_id, workspace_id: body.workspace_id });
    });
  }

  createTicket(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const raw = z.record(z.unknown()).parse(input);
    const body = CreateTicketBodySchema.parse({ ...raw, idempotency_key: idempotencyKey });
    return withTransaction(this.options.database, () => {
      this.requireScope(actor, "run:write", body.workspace_id);
      const id = this.reserve({ workspace_id: body.workspace_id, key: idempotencyKey, hash: requestHash(body), resource_type: "ticket" });
      if (id.kind === "new") new TicketRepository(this.options.database).create(TicketSchema.parse({ ...body, id: id.resource_id, created_at: this.now(), updated_at: this.now() }));
      return accepted({ command_id: idempotencyKey, object_type: "ticket", object_id: id.resource_id, workspace_id: body.workspace_id });
    });
  }

  createRun(input: unknown, actor: PolicyActor, idempotencyKey: string, traceId: string): AcceptedCommand {
    const body = CreateRunBodySchema.parse(input);
    return withTransaction(this.options.database, () => {
      this.requireScope(actor, "run:write", body.workspace_id);
      if (new TicketRepository(this.options.database).get(body.workspace_id, body.ticket_id) === undefined) throw notFound();
      if (new AgentRepository(this.options.database).get(body.workspace_id, body.agent_id) === undefined) throw notFound();
      const reserved = this.reserve({ workspace_id: body.workspace_id, key: idempotencyKey, hash: requestHash(body), resource_type: "run" });
      if (reserved.kind === "existing") return acceptedRun(idempotencyKey, body.workspace_id, reserved.resource_id);
      const runId = reserved.resource_id;
      const attemptId = this.options.idFactory();
      const stepId = this.options.idFactory();
      const jobId = this.options.idFactory();
      const run = RunSchema.parse({ id: runId, workspace_id: body.workspace_id, schema_version: 1, created_at: this.now(), updated_at: this.now(), ticket_id: body.ticket_id, execution_location: body.execution_location, status: "queued", budget: { max_tokens: 100_000, max_cost_usd: 100 }, memory_snapshot: { snapshot_id: body.workspace_id, version: 1 }, connector_versions: { deterministic: "1.0.0" } });
      this.runs.create(run);
      this.options.database.prepare("INSERT INTO attempts(id, workspace_id, run_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, 1, ?, ?)").run(attemptId, body.workspace_id, runId, JSON.stringify({ id: attemptId, workspace_id: body.workspace_id, schema_version: 1, created_at: this.now(), updated_at: this.now(), run_id: runId, status: "queued", execution_location: body.execution_location }), this.now(), this.now());
      new StepRepository(this.options.database).create(StepSchema.parse({ id: stepId, workspace_id: body.workspace_id, schema_version: 1, created_at: this.now(), updated_at: this.now(), run_id: runId, attempt_id: attemptId, agent_id: body.agent_id, status: "pending", inputs: [`ticket://${body.ticket_id}`], outputs: [`run://${runId}`], retry_policy: { max_attempts: 3, backoff_ms: 100 }, requires_review: false }));
      this.queue.enqueue({ id: jobId, workspace_id: body.workspace_id, run_id: runId, step_id: stepId, idempotency_key: `queue:${idempotencyKey}`, request_hash: requestHash({ runId, stepId, execution_location: body.execution_location, trace_id: traceId }), available_at: this.now(), max_attempts: 3, payload: { kind: body.execution_location === "remote" ? "remote" : "deterministic", execution_location: body.execution_location, trace_id: traceId } });
      this.appendRunEvent({ workspace_id: body.workspace_id, run_id: runId, event_type: "run.created", trace_id: traceId, actor_id: actor.id });
      return acceptedRun(idempotencyKey, body.workspace_id, runId);
    });
  }

  transitionRun(input: unknown, runId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number, traceId: string, toStatus: "paused" | "running" | "cancelled"): AcceptedCommand {
    const body = TransitionBodySchema.parse(input);
    return withTransaction(this.options.database, () => {
      this.requireScope(actor, "run:write", body.workspace_id);
      const reserved = this.reserve({ workspace_id: body.workspace_id, key: idempotencyKey, hash: requestHash({ body, runId, expectedVersion, toStatus }), resource_type: `run.${toStatus}`, resource_id: runId });
      if (reserved.kind === "existing") return acceptedRun(idempotencyKey, body.workspace_id, runId);
      const row = this.runWithVersion(body.workspace_id, runId);
      const updated = applyRunStatus(createRunAggregate(row.run), toStatus, this.options.clock).run;
      this.runs.update(updated, expectedVersion);
      if (toStatus === "cancelled") this.queue.requestCancelRun(body.workspace_id, runId);
      this.appendRunEvent({ workspace_id: body.workspace_id, run_id: runId, event_type: runEventType(toStatus), trace_id: traceId, actor_id: actor.id });
      return acceptedRun(idempotencyKey, body.workspace_id, runId);
    });
  }

  retryRun(input: unknown, runId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number, traceId: string): AcceptedCommand {
    const body = TransitionBodySchema.parse(input);
    return withTransaction(this.options.database, () => {
      this.requireScope(actor, "run:write", body.workspace_id);
      const reserved = this.reserve({ workspace_id: body.workspace_id, key: idempotencyKey, hash: requestHash({ body, runId, expectedVersion, retry: true }), resource_type: "run.retry", resource_id: runId });
      if (reserved.kind === "existing") return acceptedRun(idempotencyKey, body.workspace_id, runId);
      const row = this.runWithVersion(body.workspace_id, runId);
      const failedStep = this.firstFailedStep(body.workspace_id, runId);
      const attemptId = this.options.idFactory();
      const stepId = this.options.idFactory();
      const jobId = this.options.idFactory();
      this.options.database.prepare("INSERT INTO attempts(id, workspace_id, run_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, 1, ?, ?)").run(attemptId, body.workspace_id, runId, JSON.stringify({ id: attemptId, workspace_id: body.workspace_id, schema_version: 1, created_at: this.now(), updated_at: this.now(), run_id: runId, status: "queued", execution_location: row.run.execution_location, previous_attempt_id: failedStep.attempt_id }), this.now(), this.now());
      const retryStep = StepSchema.parse({ ...failedStep, id: stepId, attempt_id: attemptId, status: "pending", created_at: this.now(), updated_at: this.now() });
      new StepRepository(this.options.database).create(retryStep);
      this.runs.update(applyRunStatus(createRunAggregate(row.run), "running", this.options.clock).run, expectedVersion);
      this.queue.enqueue({ id: jobId, workspace_id: body.workspace_id, run_id: runId, step_id: stepId, idempotency_key: `queue:${idempotencyKey}`, request_hash: requestHash({ runId, stepId, execution_location: row.run.execution_location, trace_id: traceId }), available_at: this.now(), max_attempts: 3, payload: { kind: row.run.execution_location === "remote" ? "remote" : "retry", execution_location: row.run.execution_location, trace_id: traceId } });
      this.appendRunEvent({ workspace_id: body.workspace_id, run_id: runId, event_type: "step.retry_scheduled", trace_id: traceId, actor_id: actor.id, step_id: stepId, attempt_id: attemptId });
      return acceptedRun(idempotencyKey, body.workspace_id, runId);
    });
  }

  decideReview(input: unknown, reviewId: string, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const body = ReviewDecisionBodySchema.parse(input);
    return withTransaction(this.options.database, () => {
      this.requireScope(actor, "review:decide", body.workspace_id);
      const reserved = this.reserve({ workspace_id: body.workspace_id, key: idempotencyKey, hash: requestHash({ body, reviewId, actor_id: actor.id, actor_role: actor.role }), resource_type: "review", resource_id: reviewId });
      if (reserved.kind === "existing") return accepted({ command_id: idempotencyKey, object_type: "review", object_id: reviewId, workspace_id: body.workspace_id });
      const request = this.requireReviewRequest(reviewId, body);
      if (Date.parse(body.expires_at) <= Date.parse(this.now())) throw reviewStale("Review decision is expired");
      if (new ArtifactRepository(this.options.database).get(body.workspace_id, body.artifact_id, body.artifact_version) === undefined) throw notFound();
      const latest = new ReviewRepository(this.options.database).latestForArtifactVersion(body.workspace_id, body.artifact_id, body.artifact_version);
      if (latest !== undefined && latest.review_version >= body.review_version) throw reviewStale("Review decision is stale");
      const decision = new ReviewRepository(this.options.database).create(ReviewDecisionSchema.parse({ ...body, id: reviewId, reviewer_id: actor.id, reviewer_role: actor.role, created_at: this.now(), updated_at: this.now() }));
      if (decision.human_decision !== "pending") this.appendReviewDecidedEvent({ request, decision, actor_id: actor.id });
      return accepted({ command_id: idempotencyKey, object_type: "review", object_id: reviewId, workspace_id: body.workspace_id });
    });
  }

  resolveMemory(input: unknown, noteId: string, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const body = ResolveMemoryBodySchema.parse(input);
    if (noteId !== body.note_id) throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Memory route id must match body note_id", retryable: false, required_action: "correct_request" });
    return withTransaction(this.options.database, () => {
      this.requireScope(actor, "memory:write", body.workspace_id);
      if (body.decision === "reject_candidate") throw new ApiHttpError({ status_code: 409, code: "MEMORY_CONFLICT", message: "Rejecting memory candidates requires append-only rejection semantics", retryable: false, required_action: "resolve_append_only_rejection" });
      const reserved = this.reserve({ workspace_id: body.workspace_id, key: idempotencyKey, hash: requestHash(body), resource_type: "memory", resource_id: body.note_id });
      if (reserved.kind === "new") this.acceptMemoryCandidate(body.workspace_id, body.note_id, body.note_version);
      return accepted({ command_id: idempotencyKey, object_type: "memory", object_id: body.note_id, workspace_id: body.workspace_id });
    });
  }

  private reserve(input: { readonly workspace_id: string; readonly key: string; readonly hash: string; readonly resource_type: string; readonly resource_id?: string }): { readonly kind: "existing" | "new"; readonly resource_id: string } {
    const existing = this.idempotency.get(input.workspace_id, input.key);
    const resourceId = input.resource_id ?? existing?.resource_id ?? this.options.idFactory();
    const record = this.idempotency.reserve({ workspace_id: input.workspace_id, idempotency_key: input.key, request_hash: input.hash, resource_type: input.resource_type, resource_id: resourceId, created_at: this.now() });
    if (record.resource_type !== input.resource_type || (input.resource_id !== undefined && record.resource_id !== input.resource_id)) throw new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency key was reused with a different request", retryable: false, required_action: "use_new_idempotency_key" });
    return { kind: existing === undefined ? "new" : "existing", resource_id: record.resource_id };
  }

  private requireScope(actor: PolicyActor, action: Parameters<typeof assertScope>[0]["action"], workspaceId: string): void {
    const decision = assertScope({ actor, action, enforcement_point: "api", requested_scope: { kind: "workspace", id: workspaceId } });
    if (!decision.allowed) throw new ApiHttpError({ status_code: 403, code: decision.code, message: decision.reason, retryable: false, required_action: decision.required_action });
  }

  private runWithVersion(workspaceId: string, runId: string): { readonly run: Run; readonly version: number } {
    const row = this.options.database.prepare("SELECT payload_json, version FROM runs WHERE workspace_id = ? AND id = ?").get(workspaceId, runId);
    if (row === undefined) throw notFound();
    return { run: RunSchema.parse(JSON.parse(readText(row["payload_json"]))), version: readInteger(row["version"]) };
  }

  private firstFailedStep(workspaceId: string, runId: string) {
    const row = this.options.database.prepare("SELECT payload_json FROM steps WHERE workspace_id = ? AND run_id = ? AND status = 'failed' ORDER BY updated_at DESC LIMIT 1").get(workspaceId, runId);
    if (row === undefined) throw new ApiHttpError({ status_code: 409, code: "INVALID_STATE_TRANSITION", message: "Run retry requires a failed step", retryable: false, required_action: "select_failed_run" });
    return StepSchema.parse(JSON.parse(readText(row["payload_json"])));
  }

  private acceptMemoryCandidate(workspaceId: string, noteId: string, noteVersion: number): void {
    const versionRow = this.options.database.prepare("SELECT payload_json FROM memory_versions WHERE workspace_id = ? AND note_id = ? AND note_version = ? AND status = 'candidate'").get(workspaceId, noteId, noteVersion);
    if (versionRow === undefined) throw new ApiHttpError({ status_code: 409, code: "MEMORY_CONFLICT", message: "Memory candidate was not found", retryable: false, required_action: "reload_memory" });
    const version = MemoryVersionSchema.parse(JSON.parse(readText(versionRow["payload_json"])));
    const noteRow = this.options.database.prepare("SELECT payload_json FROM memory_notes WHERE workspace_id = ? AND id = ?").get(workspaceId, noteId);
    if (noteRow === undefined) throw notFound();
    const note = MemoryNoteSchema.parse(JSON.parse(readText(noteRow["payload_json"])));
    const expectedCurrentVersion = version.note_version - 1;
    if (note.current_version !== expectedCurrentVersion) throw new ApiHttpError({ status_code: 409, code: "MEMORY_CONFLICT", message: "Memory candidate is no longer current", retryable: false, required_action: "reload_memory" });
    const updated = MemoryNoteSchema.parse({ ...note, current_version: version.note_version, trust_state: resolvedTrustState(version.source_refs), source_refs: version.source_refs, provenance: version.provenance, updated_at: this.now() });
    const result = this.options.database.prepare("UPDATE memory_notes SET current_version = ?, trust_state = ?, source_refs_json = ?, provenance_json = ?, payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND current_version = ?").run(updated.current_version, updated.trust_state, JSON.stringify(updated.source_refs), JSON.stringify(updated.provenance), JSON.stringify(updated), updated.updated_at, workspaceId, noteId, expectedCurrentVersion);
    if (result.changes !== 1 && result.changes !== 1n) throw new ApiHttpError({ status_code: 409, code: "MEMORY_CONFLICT", message: "Memory candidate is no longer current", retryable: false, required_action: "reload_memory" });
  }

  private requireReviewRequest(reviewId: string, body: ReviewDecisionBody): ReviewRequestedEvent {
    const rows = this.options.database.prepare("SELECT payload_json FROM events WHERE workspace_id = ? AND event_type = 'review.requested' ORDER BY sequence DESC").all(body.workspace_id);
    for (const row of rows) {
      const event = ReviewRequestedEventSchema.parse(JSON.parse(readText(row["payload_json"])));
      const payload = event.payload;
      if (payload["review_id"] !== reviewId) continue;
      if (payload["artifact_id"] !== body.artifact_id || payload["artifact_version"] !== body.artifact_version || payload["review_version"] !== body.review_version) throw reviewStale("Review decision does not match issued review request");
      if (payload["risk_level"] !== body.risk_level || !scopesEqual(payload["requested_scope"], body.requested_scope)) throw reviewStale("Review decision does not match issued review request");
      if (isReviewApproval(body.human_decision) && body.approved_payload_hash !== payload["payload_hash"]) throw reviewStale("Review payload hash does not match issued review request");
      return event;
    }
    throw reviewStale("Review request is not available");
  }

  private appendReviewDecidedEvent(input: { readonly request: ReviewRequestedEvent; readonly decision: ReviewDecision; readonly actor_id: string }): void {
    const sequence = currentSequence(this.options.database, input.decision.workspace_id, input.request.run_id) + 1;
    new EventStore(this.options.database, this.options.clock).append(ReviewDecidedEventSchema.parse({ event_id: this.options.idFactory(), event_type: "review.decided", schema_version: 1, occurred_at: this.now(), workspace_id: input.decision.workspace_id, scope: { kind: "run", id: input.request.run_id }, trace_id: input.request.trace_id, run_id: input.request.run_id, attempt_id: input.request.attempt_id, step_id: input.request.step_id, actor: { type: "human", id: input.actor_id }, payload: { review_id: input.decision.id, artifact_id: input.decision.artifact_id, artifact_version: input.decision.artifact_version, review_version: input.decision.review_version, payload_hash: input.request.payload["payload_hash"], risk_level: input.decision.risk_level, requested_scope: input.decision.requested_scope, human_decision: input.decision.human_decision, reviewer_id: input.actor_id }, redactions: [], sequence }), sequence - 1);
  }

  private appendRunEvent(input: { readonly workspace_id: string; readonly run_id: string; readonly event_type: EventEnvelope["event_type"]; readonly trace_id: string; readonly actor_id: string; readonly attempt_id?: string; readonly step_id?: string }): void {
    const sequence = currentSequence(this.options.database, input.workspace_id, input.run_id) + 1;
    new EventStore(this.options.database, this.options.clock).append(EventEnvelopeSchema.parse({ event_id: this.options.idFactory(), event_type: input.event_type, schema_version: 1, occurred_at: this.now(), workspace_id: input.workspace_id, scope: { kind: "run", id: input.run_id }, trace_id: input.trace_id, run_id: input.run_id, attempt_id: input.attempt_id ?? null, step_id: input.step_id ?? null, actor: { type: "human", id: input.actor_id }, payload: {}, redactions: [], sequence }), sequence - 1);
  }

  private now(): string { return this.options.clock.now(); }
}

function resolvedTrustState(sourceRefs: readonly { readonly verified: boolean }[]): MemoryTrustState {
  return sourceRefs.some((source) => source.verified) ? "trusted" : "unverified";
}
