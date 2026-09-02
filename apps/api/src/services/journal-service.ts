import { z } from "zod";
import {
  GraphIndexSnapshotSchema,
  JournalEntryDescriptorSchema,
  JournalSourceSchema,
  MemoryCandidateSchema,
  VaultBridgeDescriptorSchema,
  WorkspaceIdSchema,
  WritebackDecisionSchema,
  WritebackRequestSchema,
  type GraphIndexSnapshot,
  type JournalEntryDescriptor,
  type JournalSource,
  type MemoryCandidate,
  type VaultBridgeDescriptor,
} from "@nexora/contracts";
import {
  GraphIndexSnapshotRepository,
  IdempotencyRepository,
  JournalEntryRepository,
  JournalMemoryCandidateRepository,
  JournalSourceRepository,
  VaultBridgeRepository,
  WritebackDecisionRepository,
  WritebackRequestRepository,
  withTransaction,
  type SqliteDatabase,
} from "@nexora/persistence";
import { assertScope, type PolicyActor } from "@nexora/policy";
import { accepted, requestHash } from "./command-helpers.js";
import type { AcceptedCommand, IdFactory } from "./command-service.js";
import { ApiHttpError } from "./errors.js";

export type JournalServiceOptions = {
  readonly database: SqliteDatabase;
  readonly clock: { readonly now: () => string };
  readonly idFactory: IdFactory;
};

const WritebackRequestInputSchema = WritebackRequestSchema.omit({ id: true, created_at: true, updated_at: true, revision: true, requested_by: true, requested_at: true })
  .extend({
    id: WritebackRequestSchema.shape.id.optional(),
    created_at: WritebackRequestSchema.shape.created_at.optional(),
    updated_at: WritebackRequestSchema.shape.updated_at.optional(),
    revision: WritebackRequestSchema.shape.revision.optional(),
    requested_by: WritebackRequestSchema.shape.requested_by.optional(),
    requested_at: WritebackRequestSchema.shape.requested_at.optional(),
    status: z.literal("pending_review").optional(),
  })
  .strict();

const MemoryCandidateInputSchema = MemoryCandidateSchema.omit({ status: true })
  .extend({ status: z.literal("needs_review").optional() })
  .strict();

const WritebackDecisionInputSchema = z.object({
  schema_version: z.literal(1),
  workspace_id: WorkspaceIdSchema,
  reason: WritebackDecisionSchema.shape.reason,
  descriptor_only: z.literal(true),
}).strict();

type WritebackDecisionKind = "approve" | "reject";
type RegisterableJournalRecord = VaultBridgeDescriptor | JournalEntryDescriptor | JournalSource | GraphIndexSnapshot | MemoryCandidate;
type EventTimestampField = "captured_at" | "indexed_at";
type WritebackRequestInput = z.infer<typeof WritebackRequestInputSchema>;

export class JournalService {
  private readonly idempotency: IdempotencyRepository;
  private readonly vaults: VaultBridgeRepository;
  private readonly entries: JournalEntryRepository;
  private readonly sources: JournalSourceRepository;
  private readonly graphs: GraphIndexSnapshotRepository;
  private readonly candidates: JournalMemoryCandidateRepository;
  private readonly requests: WritebackRequestRepository;
  private readonly decisions: WritebackDecisionRepository;

  constructor(private readonly options: JournalServiceOptions) {
    this.idempotency = new IdempotencyRepository(options.database);
    this.vaults = new VaultBridgeRepository(options.database);
    this.entries = new JournalEntryRepository(options.database);
    this.sources = new JournalSourceRepository(options.database);
    this.graphs = new GraphIndexSnapshotRepository(options.database);
    this.candidates = new JournalMemoryCandidateRepository(options.database);
    this.requests = new WritebackRequestRepository(options.database);
    this.decisions = new WritebackDecisionRepository(options.database);
  }

  registerVault(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const parsed = VaultBridgeDescriptorSchema.parse(fillMissingJournalTimestamps(input, now));
    const descriptor = VaultBridgeDescriptorSchema.parse({ ...parsed, created_at: now, updated_at: now });
    this.requireAdmin(actor, descriptor.workspace_id);
    return this.register(descriptor, idempotencyKey, journalRegisterHash(input), "vault", () => this.vaults.create(descriptor));
  }

  createEntry(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const parsed = JournalEntryDescriptorSchema.parse(fillMissingJournalTimestamps(input, now));
    const entry = JournalEntryDescriptorSchema.parse({ ...parsed, created_at: now, updated_at: now });
    this.requireAdmin(actor, entry.workspace_id);
    return this.register(entry, idempotencyKey, journalRegisterHash(input), "journal_entry", () => this.entries.create(entry));
  }

  recordSource(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const parsed = JournalSourceSchema.parse(fillMissingJournalTimestamps(input, now, "captured_at"));
    const source = JournalSourceSchema.parse({ ...parsed, created_at: now, updated_at: now });
    this.requireAdmin(actor, source.workspace_id);
    return this.register(source, idempotencyKey, journalRegisterHash(input), "journal_source", () => this.sources.record(source));
  }

  recordGraphIndex(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const parsed = GraphIndexSnapshotSchema.parse(fillMissingJournalTimestamps(input, now, "indexed_at"));
    const graph = GraphIndexSnapshotSchema.parse({ ...parsed, created_at: now, updated_at: now });
    this.requireAdmin(actor, graph.workspace_id);
    return this.register(graph, idempotencyKey, journalRegisterHash(input), "journal_graph_index", () => this.graphs.record(graph));
  }

  createMemoryCandidate(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const body = MemoryCandidateInputSchema.parse(fillMissingJournalTimestamps(input, now));
    const candidate = MemoryCandidateSchema.parse({ ...body, created_at: now, updated_at: now, status: "needs_review" });
    this.requireAdmin(actor, candidate.workspace_id);
    return this.register(candidate, idempotencyKey, journalRegisterHash(input), "journal_memory_candidate", () => this.candidates.create(candidate));
  }

  requestWriteback(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const body = WritebackRequestInputSchema.parse(input);
    this.requireAdmin(actor, body.workspace_id);
    const pendingBody = { ...body, status: "pending_review" as const };
    return withTransaction(this.options.database, () => {
      const reservation = this.idempotency.reserveOrGet({
        workspace_id: body.workspace_id,
        idempotency_key: idempotencyKey,
        request_hash: writebackRequestHash(body),
        resource_type: "journal_writeback",
        resource_id: body.id ?? this.options.idFactory(),
        created_at: this.now(),
      });
      if (reservation.kind === "existing") {
        if (reservation.record.resource_type !== "journal_writeback") throw idempotencyConflict("Idempotency key was reused for another journal resource");
        return accepted({ command_id: idempotencyKey, object_type: "journal_writeback", object_id: reservation.record.resource_id, workspace_id: body.workspace_id });
      }
      const request = WritebackRequestSchema.parse({
        ...pendingBody,
        id: reservation.record.resource_id,
        revision: 1,
        requested_by: actorRef(actor),
        requested_at: this.now(),
        created_at: this.now(),
        updated_at: this.now(),
      });
      this.requests.create(request);
      return accepted({ command_id: idempotencyKey, object_type: "journal_writeback", object_id: request.id, workspace_id: request.workspace_id });
    });
  }

  decideWriteback(input: unknown, requestId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number, decision: WritebackDecisionKind): AcceptedCommand {
    const body = WritebackDecisionInputSchema.parse(input);
    this.requireAdmin(actor, body.workspace_id);
    return withTransaction(this.options.database, () => {
      const reservation = this.idempotency.reserveOrGet({
        workspace_id: body.workspace_id,
        idempotency_key: idempotencyKey,
        request_hash: requestHash({ ...body, request_id: requestId, decision, expected_version: expectedVersion }),
        resource_type: `journal_writeback.${decision}`,
        resource_id: requestId,
        created_at: this.now(),
      });
      if (reservation.kind === "existing") {
        if (reservation.record.resource_type !== `journal_writeback.${decision}`) throw idempotencyConflict("Idempotency key was reused for another journal command");
        return accepted({ command_id: idempotencyKey, object_type: "journal_writeback", object_id: requestId, workspace_id: body.workspace_id });
      }
      const current = this.requests.get(body.workspace_id, requestId);
      if (current === undefined) throw notFound();
      if (current.revision !== expectedVersion) throw versionConflict("Journal writeback request revision is stale");
      if (current.status !== "pending_review") throw invalidWritebackState();
      const decisionRecord = WritebackDecisionSchema.parse({
        id: this.options.idFactory(),
        workspace_id: body.workspace_id,
        schema_version: 1,
        created_at: this.now(),
        updated_at: this.now(),
        request_id: requestId,
        decision,
        decided_by: actorRef(actor),
        decided_at: this.now(),
        reason: body.reason,
        descriptor_only: true,
      });
      this.decisions.record(decisionRecord);
      const nextStatus = decision === "approve" ? "approved" : "rejected";
      this.requests.update({ ...current, status: nextStatus, updated_at: this.now() }, expectedVersion);
      return accepted({ command_id: idempotencyKey, object_type: "journal_writeback", object_id: requestId, workspace_id: body.workspace_id });
    });
  }

  private register<TRecord extends RegisterableJournalRecord>(record: TRecord, idempotencyKey: string, requestDigest: string, objectType: string, create: () => TRecord): AcceptedCommand {
    return withTransaction(this.options.database, () => {
      const reservation = this.idempotency.reserveOrGet({ workspace_id: record.workspace_id, idempotency_key: idempotencyKey, request_hash: requestDigest, resource_type: objectType, resource_id: record.id, created_at: this.now() });
      if (reservation.kind === "existing") {
        if (reservation.record.resource_type !== objectType) throw idempotencyConflict("Idempotency key was reused for another journal resource");
        return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: reservation.record.resource_id, workspace_id: record.workspace_id });
      }
      create();
      return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: record.id, workspace_id: record.workspace_id });
    });
  }

  private requireAdmin(actor: PolicyActor, workspaceId: string): void {
    const decision = assertScope({ actor, action: "workspace:admin", enforcement_point: "api", requested_scope: { kind: "workspace", id: WorkspaceIdSchema.parse(workspaceId) } });
    if (!decision.allowed) throw new ApiHttpError({ status_code: 403, code: decision.code, message: decision.reason, retryable: false, required_action: decision.required_action });
  }

  private now(): string { return this.options.clock.now(); }
}

function actorRef(actor: PolicyActor): string {
  return `${actor.role.toLowerCase()}:${actor.id}`;
}

function idempotencyConflict(message: string): ApiHttpError {
  return new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message, retryable: false, required_action: "use_new_idempotency_key" });
}

function notFound(): ApiHttpError {
  return new ApiHttpError({ status_code: 404, code: "SCOPE_DENIED", message: "Resource not found", retryable: false, required_action: "check_scope" });
}

function versionConflict(message: string): ApiHttpError {
  return new ApiHttpError({ status_code: 409, code: "VERSION_CONFLICT", message, retryable: true, required_action: "refresh_state" });
}

function invalidWritebackState(): ApiHttpError {
  return new ApiHttpError({ status_code: 409, code: "INVALID_STATE_TRANSITION", message: "Journal writeback request is no longer pending review", retryable: false, required_action: "refresh_state" });
}

function fillMissingJournalTimestamps(input: unknown, now: string, eventTimestampField?: EventTimestampField): unknown {
  if (!isPlainRecord(input)) return input;
  const filled: Record<string, unknown> = { ...input };
  if (filled["created_at"] === undefined) filled["created_at"] = now;
  if (filled["updated_at"] === undefined) filled["updated_at"] = now;
  if (eventTimestampField !== undefined && filled[eventTimestampField] === undefined) filled[eventTimestampField] = now;
  return filled;
}

function journalRegisterHash(input: unknown): string {
  return requestHash(stripMetadataTimestamps(input));
}

function writebackRequestHash(input: WritebackRequestInput): string {
  return requestHash({
    id: input.id,
    workspace_id: input.workspace_id,
    schema_version: input.schema_version,
    vault_id: input.vault_id,
    candidate_id: input.candidate_id,
    target_ref: input.target_ref,
    diff_hash: input.diff_hash,
    reason: input.reason,
    status: "pending_review",
    expected_target_revision: input.expected_target_revision,
    descriptor_only: input.descriptor_only,
  });
}

function stripMetadataTimestamps(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => stripMetadataTimestamps(item));
  if (!isPlainRecord(input)) return input;
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "created_at" || key === "updated_at") continue;
    stripped[key] = stripMetadataTimestamps(value);
  }
  return stripped;
}

function isPlainRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
