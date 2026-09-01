import { z } from "zod";
import {
  AgentProfileSchema,
  BudgetSchema,
  EventEnvelopeSchema,
  GoalSchema,
  GoalLoopCommandSchema,
  GoalLoopDescriptorSchema,
  JudgeDecisionSchema,
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
  canTransitionGoalLoop,
  containsSecretLikeText,
  type EventEnvelope,
  type GoalLoopDescriptor,
  type MemoryTrustState,
  type ReviewDecision,
  type ReviewRequestedEvent,
  type Run,
  type GoalLoopCommandKind,
} from "@nexora/contracts";
import { applyRunStatus, createRunAggregate } from "@nexora/domain";
import { EventStore } from "@nexora/event-store";
import { DurableQueue, GoalLoopController } from "@nexora/orchestration";
import { AgentRepository, ArtifactRepository, GoalContinuationRepository, GoalLoopCommandRepository, GoalLoopRepository, GoalRepository, IdempotencyRepository, ReviewRepository, RunRepository, StepRepository, TicketRepository, withTransaction, type SqliteDatabase } from "@nexora/persistence";
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
const CreateGoalLoopBodySchema = z.object({ schema_version: z.literal(1), workspace_id: WorkspaceIdSchema, goal_id: UlidSchema, run_id: UlidSchema, session_id: UlidSchema, objective: z.string().min(1).max(4000), definition_of_done: z.array(z.string().min(1).max(1000)).min(1).max(50), max_turns: z.number().int().positive().max(1000), budget: BudgetSchema, deadline_at: TimestampSchema }).strict();
const CreateTicketBodySchema = TicketSchema.omit({ id: true, created_at: true, updated_at: true }).strict();
const CreateRunBodySchema = z.object({ schema_version: z.literal(1), workspace_id: WorkspaceIdSchema, ticket_id: TicketIdSchema, agent_id: AgentIdSchema, execution_location: z.enum(["local", "remote"]).default("local") }).strict();
const TransitionBodySchema = z.object({ schema_version: z.literal(1), workspace_id: WorkspaceIdSchema }).strict();
const GoalLoopResumeBodySchema = z.object({ schema_version: z.literal(1), workspace_id: WorkspaceIdSchema, cursor: z.string().min(1).max(512).optional() }).strict();
const GoalLoopSteerBodySchema = z.object({ schema_version: z.literal(1), workspace_id: WorkspaceIdSchema, instruction: z.string().min(1).max(4000) }).strict();
const GoalLoopSubgoalBodySchema = z.object({ schema_version: z.literal(1), workspace_id: WorkspaceIdSchema, objective: z.string().min(1).max(4000), max_turns: z.number().int().positive().max(1000), deadline_at: TimestampSchema, budget: BudgetSchema.optional() }).strict();
const GoalLoopJudgeBodySchema = z.object({ schema_version: z.literal(1), workspace_id: WorkspaceIdSchema, done: z.boolean(), reason: z.string().min(1).max(2000) }).strict();
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

  createGoalLoop(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const body = CreateGoalLoopBodySchema.parse(input);
    requireNoSecretLikeText([body.objective, ...body.definition_of_done]);
    return withTransaction(this.options.database, () => {
      this.requireScope(actor, "run:write", body.workspace_id);
      const existing = this.idempotency.get(body.workspace_id, idempotencyKey);
      if (existing !== undefined) {
        const replay = this.reserve({ workspace_id: body.workspace_id, key: idempotencyKey, hash: requestHash(body), resource_type: "goal_loop", resource_id: existing.resource_id });
        return accepted({ command_id: idempotencyKey, object_type: "goal_loop", object_id: replay.resource_id, workspace_id: body.workspace_id });
      }
      this.requireGoalLoopGraph(body.workspace_id, body.goal_id, body.run_id, body.session_id);
      requireGoalLoopLimits({ max_turns: body.max_turns, turn_count: 0, budget: body.budget, deadline_at: body.deadline_at }, this.now());
      const id = this.reserve({ workspace_id: body.workspace_id, key: idempotencyKey, hash: requestHash(body), resource_type: "goal_loop" });
      if (id.kind === "new") {
        new GoalLoopRepository(this.options.database).create(GoalLoopDescriptorSchema.parse({
          ...body,
          id: id.resource_id,
          created_at: this.now(),
          updated_at: this.now(),
          parent_loop_id: null,
          root_loop_id: id.resource_id,
          status: "running",
          turn_count: 0,
          continuation_cursor: null,
          judge: null,
          descriptor_only: true,
        }));
      }
      return accepted({ command_id: idempotencyKey, object_type: "goal_loop", object_id: id.resource_id, workspace_id: body.workspace_id });
    });
  }

  pauseGoalLoop(input: unknown, loopId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const body = TransitionBodySchema.parse(input);
    return this.updateGoalLoop({ workspace_id: body.workspace_id, loop_id: loopId, actor, idempotency_key: idempotencyKey, expected_version: expectedVersion, resource_type: "goal_loop.pause", to_status: "paused", command_kind: "pause", cursor: null, instruction: null });
  }

  resumeGoalLoop(input: unknown, loopId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const body = GoalLoopResumeBodySchema.parse(input);
    return this.updateGoalLoop({ workspace_id: body.workspace_id, loop_id: loopId, actor, idempotency_key: idempotencyKey, expected_version: expectedVersion, resource_type: "goal_loop.resume", to_status: "running", command_kind: "resume", cursor: body.cursor ?? null, instruction: null });
  }

  steerGoalLoop(input: unknown, loopId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const body = GoalLoopSteerBodySchema.parse(input);
    requireNoSecretLikeText([body.instruction]);
    return this.updateGoalLoop({ workspace_id: body.workspace_id, loop_id: loopId, actor, idempotency_key: idempotencyKey, expected_version: expectedVersion, resource_type: "goal_loop.steer", to_status: "running", command_kind: "steer", cursor: null, instruction: body.instruction });
  }

  createSubgoalLoop(input: unknown, parentLoopId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const body = GoalLoopSubgoalBodySchema.parse(input);
    requireNoSecretLikeText([body.objective]);
    return withTransaction(this.options.database, () => {
      this.requireScope(actor, "run:write", body.workspace_id);
      const reserved = this.reserve({ workspace_id: body.workspace_id, key: idempotencyKey, hash: requestHash({ body, parentLoopId, expectedVersion }), resource_type: "goal_loop" });
      if (reserved.kind === "existing") return accepted({ command_id: idempotencyKey, object_type: "goal_loop", object_id: reserved.resource_id, workspace_id: body.workspace_id });
      const parent = this.goalLoopWithVersion(body.workspace_id, parentLoopId);
      requireExpectedGoalLoopVersion(parent.version, expectedVersion);
      if (isTerminalGoalLoopStatus(parent.loop.status)) throw invalidGoalLoopTransition(parent.loop.status, "running");
      this.requireActiveRunSessionForLoop(parent.loop);
      requireGoalLoopLimits(parent.loop, this.now());
      requireGoalLoopLimits({ max_turns: body.max_turns, turn_count: 0, budget: body.budget ?? parent.loop.budget, deadline_at: body.deadline_at }, this.now());
      this.recordGoalLoopCommand({ loop: parent.loop, kind: "subgoal", idempotency_key: idempotencyKey, expected_revision: expectedVersion, cursor: null, instruction: body.objective, subgoal: { objective: body.objective, max_turns: body.max_turns, deadline_at: body.deadline_at }, judge: null });
      const child = GoalLoopDescriptorSchema.parse({
        id: reserved.resource_id,
        workspace_id: body.workspace_id,
        schema_version: 1,
        created_at: this.now(),
        updated_at: this.now(),
        goal_id: parent.loop.goal_id,
        run_id: parent.loop.run_id,
        session_id: parent.loop.session_id,
        parent_loop_id: parent.loop.id,
        root_loop_id: parent.loop.root_loop_id,
        status: "running",
        objective: body.objective,
        definition_of_done: parent.loop.definition_of_done,
        max_turns: body.max_turns,
        turn_count: 0,
        budget: body.budget ?? parent.loop.budget,
        deadline_at: body.deadline_at,
        continuation_cursor: null,
        judge: null,
        descriptor_only: true,
      });
      const repository = new GoalLoopRepository(this.options.database);
      repository.create(child);
      repository.update(GoalLoopDescriptorSchema.parse({ ...parent.loop, updated_at: this.now() }), expectedVersion);
      return accepted({ command_id: idempotencyKey, object_type: "goal_loop", object_id: child.id, workspace_id: body.workspace_id });
    });
  }

  recordGoalLoopJudge(input: unknown, loopId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const body = GoalLoopJudgeBodySchema.parse(input);
    requireNoSecretLikeText([body.reason]);
    return withTransaction(this.options.database, () => {
      this.requireScope(actor, "review:decide", body.workspace_id);
      const row = this.goalLoopWithVersion(body.workspace_id, loopId);
      const judge = JudgeDecisionSchema.parse({ done: body.done, reason: body.reason });
      const reserved = this.reserve({ workspace_id: body.workspace_id, key: idempotencyKey, hash: requestHash({ body, loopId, expectedVersion }), resource_type: "goal_loop.judge", resource_id: loopId });
      if (reserved.kind === "existing") return accepted({ command_id: idempotencyKey, object_type: "goal_loop", object_id: loopId, workspace_id: body.workspace_id });
      requireExpectedGoalLoopVersion(row.version, expectedVersion);
      this.requireActiveRunSessionForLoop(row.loop);
      if (row.loop.status !== "waiting_judge") throw invalidGoalLoopTransition(row.loop.status, body.done ? "succeeded" : "running");
      const planned = new GoalLoopController({ now: () => this.now(), continuationIdFactory: () => this.options.idFactory() }).planNextTurn({ workspace_id: body.workspace_id, loop: row.loop, judge, next_cursor: nextGoalLoopCursor(row.loop), idempotency_key: idempotencyKey });
      this.recordGoalLoopCommand({ loop: row.loop, kind: "judge", idempotency_key: idempotencyKey, expected_revision: expectedVersion, cursor: row.loop.continuation_cursor, instruction: null, subgoal: null, judge });
      if (planned.continuation === null) {
        if (planned.loop !== row.loop) new GoalLoopRepository(this.options.database).update(planned.loop, expectedVersion);
      } else {
        new GoalContinuationRepository(this.options.database).record(planned.continuation);
      }
      return accepted({ command_id: idempotencyKey, object_type: "goal_loop", object_id: loopId, workspace_id: body.workspace_id });
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

  private updateGoalLoop(input: { readonly workspace_id: string; readonly loop_id: string; readonly actor: PolicyActor; readonly idempotency_key: string; readonly expected_version: number; readonly resource_type: string; readonly to_status: "paused" | "running"; readonly command_kind: "pause" | "resume" | "steer"; readonly cursor: string | null; readonly instruction: string | null }): AcceptedCommand {
    return withTransaction(this.options.database, () => {
      this.requireScope(input.actor, "run:write", input.workspace_id);
      const reserved = this.reserve({ workspace_id: input.workspace_id, key: input.idempotency_key, hash: requestHash({ workspace_id: input.workspace_id, loop_id: input.loop_id, expected_version: input.expected_version, to_status: input.to_status, command_kind: input.command_kind, cursor: input.cursor, instruction: input.instruction }), resource_type: input.resource_type, resource_id: input.loop_id });
      if (reserved.kind === "existing") return accepted({ command_id: input.idempotency_key, object_type: "goal_loop", object_id: input.loop_id, workspace_id: input.workspace_id });
      const row = this.goalLoopWithVersion(input.workspace_id, input.loop_id);
      requireExpectedGoalLoopVersion(row.version, input.expected_version);
      if (input.command_kind === "steer" && isTerminalGoalLoopStatus(row.loop.status)) throw invalidGoalLoopTransition(row.loop.status, input.to_status);
      if (input.command_kind !== "steer" && !canTransitionGoalLoop(row.loop.status, input.to_status, row.loop.judge)) throw invalidGoalLoopTransition(row.loop.status, input.to_status);
      if (input.command_kind !== "pause") {
        this.requireActiveRunSessionForLoop(row.loop);
        requireGoalLoopLimits(row.loop, this.now());
      }
      const nextStatus = input.command_kind === "steer" ? row.loop.status : input.to_status;
      const continuationCursor = input.command_kind === "resume" ? resumeCursor(row.loop.continuation_cursor, input.cursor) : row.loop.continuation_cursor;
      this.recordGoalLoopCommand({ loop: row.loop, kind: input.command_kind, idempotency_key: input.idempotency_key, expected_revision: input.expected_version, cursor: input.cursor, instruction: input.instruction, subgoal: null, judge: null });
      const updated = GoalLoopDescriptorSchema.parse({ ...row.loop, status: nextStatus, continuation_cursor: continuationCursor, updated_at: this.now() });
      new GoalLoopRepository(this.options.database).update(updated, input.expected_version);
      return accepted({ command_id: input.idempotency_key, object_type: "goal_loop", object_id: input.loop_id, workspace_id: input.workspace_id });
    });
  }

  private goalLoopWithVersion(workspaceId: string, loopId: string): { readonly loop: GoalLoopDescriptor; readonly version: number } {
    const row = new GoalLoopRepository(this.options.database).getWithVersion(workspaceId, loopId);
    if (row === undefined) throw notFound();
    return row;
  }

  private requireGoalLoopGraph(workspaceId: string, goalId: string, runId: string, sessionId: string): void {
    const goal = this.options.database.prepare("SELECT 1 AS present FROM goals WHERE workspace_id = ? AND id = ?").get(workspaceId, goalId);
    if (goal === undefined) throw notFound();
    const run = this.options.database.prepare("SELECT runs.status AS status FROM runs JOIN tickets ON tickets.workspace_id = runs.workspace_id AND tickets.id = runs.ticket_id WHERE runs.workspace_id = ? AND runs.id = ? AND tickets.goal_id = ?").get(workspaceId, runId, goalId);
    if (run === undefined) throw notFound();
    const session = this.options.database.prepare("SELECT status FROM sessions WHERE workspace_id = ? AND id = ? AND run_id = ?").get(workspaceId, sessionId, runId);
    if (session === undefined) throw notFound();
    if (readText(run["status"]) !== "running" || readText(session["status"]) !== "active") throw invalidActiveRunSession();
  }

  private requireActiveRunSessionForLoop(loop: GoalLoopDescriptor): void {
    const row = this.options.database.prepare("SELECT runs.status AS run_status, sessions.status AS session_status FROM runs JOIN sessions ON sessions.workspace_id = runs.workspace_id AND sessions.run_id = runs.id WHERE runs.workspace_id = ? AND runs.id = ? AND sessions.id = ?").get(loop.workspace_id, loop.run_id, loop.session_id);
    if (row === undefined) throw notFound();
    if (readText(row["run_status"]) !== "running" || readText(row["session_status"]) !== "active") throw invalidActiveRunSession();
  }

  private recordGoalLoopCommand(input: { readonly loop: GoalLoopDescriptor; readonly kind: GoalLoopCommandKind; readonly idempotency_key: string; readonly expected_revision: number; readonly cursor: string | null; readonly instruction: string | null; readonly subgoal: { readonly objective: string; readonly max_turns: number; readonly deadline_at: string } | null; readonly judge: { readonly done: boolean; readonly reason: string } | null }): void {
    new GoalLoopCommandRepository(this.options.database).record(GoalLoopCommandSchema.parse({
      schema_version: 1,
      command_id: this.options.idFactory(),
      workspace_id: input.loop.workspace_id,
      goal_loop_id: input.loop.id,
      run_id: input.loop.run_id,
      session_id: input.loop.session_id,
      kind: input.kind,
      idempotency_key: input.idempotency_key,
      expected_revision: input.expected_revision,
      cursor: input.cursor,
      instruction: input.instruction,
      subgoal: input.subgoal,
      judge: input.judge,
      created_at: this.now(),
    }));
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
    if (input.request.run_id === null || input.request.scope.kind !== "run" || input.request.scope.id !== input.request.run_id) throw reviewStale("Review request is not run scoped");
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

function invalidGoalLoopTransition(from: string, to: string): ApiHttpError {
  return new ApiHttpError({ status_code: 409, code: "INVALID_STATE_TRANSITION", message: `Goal loop cannot transition from ${from} to ${to}`, retryable: false, required_action: "refresh_state" });
}

function invalidActiveRunSession(): ApiHttpError {
  return new ApiHttpError({ status_code: 409, code: "INVALID_STATE_TRANSITION", message: "Goal loop requires an active run and session", retryable: false, required_action: "select_active_run_session" });
}

function requireExpectedGoalLoopVersion(actual: number, expected: number): void {
  if (actual !== expected) throw new ApiHttpError({ status_code: 409, code: "VERSION_CONFLICT", message: "Goal loop version conflict", retryable: true, required_action: "refresh_state" });
}

function requireGoalLoopLimits(loop: Pick<GoalLoopDescriptor, "max_turns" | "turn_count" | "budget" | "deadline_at">, now: string): void {
  if (loop.turn_count >= loop.max_turns) throw goalLoopLimitExceeded("Goal loop max turns are exhausted");
  if (loop.budget.max_tokens === 0 || loop.budget.max_cost_usd === 0) throw goalLoopLimitExceeded("Goal loop budget is exhausted");
  if (Date.parse(now) >= Date.parse(loop.deadline_at)) throw goalLoopLimitExceeded("Goal loop deadline has passed");
}

function goalLoopLimitExceeded(message: string): ApiHttpError {
  return new ApiHttpError({ status_code: 409, code: "GOAL_LOOP_LIMIT_EXCEEDED", message, retryable: false, required_action: "refresh_state" });
}

function requireNoSecretLikeText(values: readonly string[]): void {
  if (values.some(containsSecretLikeText)) throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Goal loop text contains forbidden secret-shaped content", retryable: false, required_action: "correct_request" });
}

function isTerminalGoalLoopStatus(status: GoalLoopDescriptor["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function resumeCursor(current: string | null, requested: string | null): string | null {
  if (requested === null) return current;
  if (requested !== current) throw new ApiHttpError({ status_code: 409, code: "VERSION_CONFLICT", message: "Goal loop resume cursor must match current checkpoint", retryable: true, required_action: "refresh_state" });
  return current;
}

function nextGoalLoopCursor(loop: Pick<GoalLoopDescriptor, "turn_count">): string {
  return `turn-${String(loop.turn_count + 1)}`;
}
