import {
  AllowlistEntrySchema,
  ChannelDescriptorSchema,
  DeliveryReceiptSchema,
  GatewayDescriptorSchema,
  MessageEnvelopeSchema,
  SessionCommandSchema,
  SessionSchema,
  UlidSchema,
  WorkspaceIdSchema,
  canTransitionSession,
  type AllowlistEntry,
  type ChannelDescriptor,
  type DeliveryReceipt,
  type GatewayDescriptor,
  type MessageEnvelope,
  type Session,
  type SessionCommand,
} from "@nexora/contracts";
import {
  AllowlistRepository,
  ChannelRepository,
  DeliveryReceiptRepository,
  GatewayRepository,
  IdempotencyRepository,
  MessageRepository,
  SessionCursorRepository,
  SessionRepository,
  withTransaction,
  type SqliteDatabase,
} from "@nexora/persistence";
import { assertScope, type PolicyActor } from "@nexora/policy";
import { accepted, requestHash } from "./command-helpers.js";
import type { AcceptedCommand, IdFactory } from "./command-service.js";
import { ApiHttpError } from "./errors.js";

export type GatewayServiceOptions = {
  readonly database: SqliteDatabase;
  readonly clock: { readonly now: () => string };
  readonly idFactory: IdFactory;
};

const MessageInputSchema = MessageEnvelopeSchema.omit({ message_id: true, session_id: true, occurred_at: true, idempotency_key: true }).extend({ occurred_at: MessageEnvelopeSchema.shape.occurred_at.optional(), idempotency_key: MessageEnvelopeSchema.shape.idempotency_key.optional() }).strict();
const SessionCommandInputSchema = SessionCommandSchema.innerType().omit({ command_id: true, created_at: true, idempotency_key: true }).extend({ command_id: SessionCommandSchema.innerType().shape.command_id.optional(), created_at: SessionCommandSchema.innerType().shape.created_at.optional(), idempotency_key: SessionCommandSchema.innerType().shape.idempotency_key.optional() }).strict();

export class GatewayService {
  private readonly idempotency: IdempotencyRepository;
  private readonly gateways: GatewayRepository;
  private readonly channels: ChannelRepository;
  private readonly sessions: SessionRepository;
  private readonly messages: MessageRepository;
  private readonly deliveries: DeliveryReceiptRepository;
  private readonly allowlist: AllowlistRepository;
  private readonly cursors: SessionCursorRepository;

  constructor(private readonly options: GatewayServiceOptions) {
    this.idempotency = new IdempotencyRepository(options.database);
    this.gateways = new GatewayRepository(options.database);
    this.channels = new ChannelRepository(options.database);
    this.sessions = new SessionRepository(options.database);
    this.messages = new MessageRepository(options.database);
    this.deliveries = new DeliveryReceiptRepository(options.database);
    this.allowlist = new AllowlistRepository(options.database);
    this.cursors = new SessionCursorRepository(options.database);
  }

  listGateways(workspaceId: string): readonly GatewayDescriptor[] { return this.gateways.list(WorkspaceIdSchema.parse(workspaceId)); }
  getGateway(workspaceId: string, id: string): GatewayDescriptor { return this.require(this.gateways.get(WorkspaceIdSchema.parse(workspaceId), id)); }
  listChannels(workspaceId: string): readonly ChannelDescriptor[] { return this.channels.list(WorkspaceIdSchema.parse(workspaceId)); }
  getChannel(workspaceId: string, id: string): ChannelDescriptor { return this.require(this.channels.get(WorkspaceIdSchema.parse(workspaceId), id)); }
  listSessions(workspaceId: string): readonly Session[] { return this.sessions.list(WorkspaceIdSchema.parse(workspaceId)); }
  getSession(workspaceId: string, id: string): Session { return this.require(this.sessions.get(WorkspaceIdSchema.parse(workspaceId), UlidSchema.parse(id))); }
  getCursor(workspaceId: string, sessionId: string) { return this.cursors.get(WorkspaceIdSchema.parse(workspaceId), UlidSchema.parse(sessionId)) ?? null; }

  listMessages(workspaceId: string, sessionId: string, after: string | null, limit: number): { readonly messages: readonly MessageEnvelope[]; readonly next_cursor: string | null; readonly last_message_id: string | null } {
    const parsedWorkspace = WorkspaceIdSchema.parse(workspaceId);
    const parsedSession = UlidSchema.parse(sessionId);
    const page = this.messages.listAfter(parsedWorkspace, parsedSession, after, limit);
    return { messages: page.messages, next_cursor: page.next_cursor, last_message_id: page.messages.at(-1)?.message_id ?? null };
  }

  listDeliveries(workspaceId: string, sessionId?: string): readonly DeliveryReceipt[] {
    const workspace = WorkspaceIdSchema.parse(workspaceId);
    return this.deliveries.list(workspace, sessionId === undefined ? undefined : UlidSchema.parse(sessionId));
  }

  getDelivery(workspaceId: string, receiptId: string): DeliveryReceipt { return this.require(this.deliveries.get(WorkspaceIdSchema.parse(workspaceId), UlidSchema.parse(receiptId))); }

  listAllowlist(workspaceId: string, channelId?: string): readonly AllowlistEntry[] {
    return this.allowlist.list(WorkspaceIdSchema.parse(workspaceId), channelId);
  }

  registerGateway(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const descriptor = GatewayDescriptorSchema.parse(input);
    this.requireAdmin(actor, descriptor.workspace_id);
    return this.register(descriptor, idempotencyKey, "gateway", () => this.gateways.create(descriptor));
  }

  registerChannel(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const descriptor = ChannelDescriptorSchema.parse(input);
    this.requireAdmin(actor, descriptor.workspace_id);
    if (this.gateways.get(descriptor.workspace_id, descriptor.gateway_id) === undefined) throw notFound();
    return this.register(descriptor, idempotencyKey, "channel", () => this.channels.create(descriptor));
  }

  registerSession(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const session = SessionSchema.parse(input);
    this.requireAdmin(actor, session.workspace_id);
    this.requireSessionTopology(session);
    return this.register(session, idempotencyKey, "session", () => this.sessions.create(session));
  }

  updateGateway(input: unknown, id: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const descriptor = GatewayDescriptorSchema.parse(input);
    if (descriptor.id !== id) throw invalidRouteId();
    this.requireAdmin(actor, descriptor.workspace_id);
    return this.update(descriptor, idempotencyKey, expectedVersion, "gateway", this.gateways);
  }

  updateChannel(input: unknown, id: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const descriptor = ChannelDescriptorSchema.parse(input);
    if (descriptor.id !== id) throw invalidRouteId();
    this.requireAdmin(actor, descriptor.workspace_id);
    if (this.gateways.get(descriptor.workspace_id, descriptor.gateway_id) === undefined) throw notFound();
    return this.update(descriptor, idempotencyKey, expectedVersion, "channel", this.channels, (current, next) => this.requireImmutableChannelFacts(current, next));
  }

  updateSession(input: unknown, id: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const session = SessionSchema.parse(input);
    if (session.id !== id) throw invalidRouteId();
    this.requireAdmin(actor, session.workspace_id);
    this.requireSessionTopology(session);
    return this.update(session, idempotencyKey, expectedVersion, "session", this.sessions, (current, next) => this.requireMutableSessionState(current, next));
  }

  createAllowlist(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const entry = AllowlistEntrySchema.parse(input);
    this.requireAdmin(actor, entry.workspace_id);
    if (this.channels.get(entry.workspace_id, entry.channel_id) === undefined) throw notFound();
    return this.register(entry, idempotencyKey, "allowlist", () => this.allowlist.create(entry));
  }

  recordDelivery(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const receipt = DeliveryReceiptSchema.parse(input);
    this.requireAdmin(actor, receipt.workspace_id);
    if (receipt.idempotency_key !== idempotencyKey) throw invalidScope();
    const session = this.sessions.get(receipt.workspace_id, receipt.session_id);
    if (session === undefined) throw notFound();
    const message = this.messages.get(receipt.workspace_id, receipt.message_id);
    if (message === undefined || message.session_id !== session.id) throw notFound();
    return withTransaction(this.options.database, () => {
      const requestDigest = requestHash(receipt);
      const existing = this.idempotency.get(receipt.workspace_id, idempotencyKey);
      if (existing !== undefined) {
        if (existing.resource_type !== "delivery" || existing.request_hash !== requestDigest) throw new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency key was reused with a different request", retryable: false, required_action: "use_new_idempotency_key" });
        return accepted({ command_id: idempotencyKey, object_type: "delivery", object_id: existing.resource_id, workspace_id: receipt.workspace_id });
      }
      this.idempotency.reserve({ workspace_id: receipt.workspace_id, idempotency_key: idempotencyKey, request_hash: requestDigest, resource_type: "delivery", resource_id: receipt.receipt_id, created_at: this.options.clock.now() });
      this.deliveries.create(receipt);
      return accepted({ command_id: idempotencyKey, object_type: "delivery", object_id: receipt.receipt_id, workspace_id: receipt.workspace_id });
    });
  }

  sendMessage(input: unknown, sessionId: string, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const body = MessageInputSchema.parse(input);
    this.requireAdmin(actor, body.workspace_id);
    const session = this.require(this.sessions.get(body.workspace_id, UlidSchema.parse(sessionId)));
    if (body.idempotency_key !== undefined && body.idempotency_key !== idempotencyKey) throw invalidScope();
    const request = { ...body, session_id: session.id, idempotency_key: idempotencyKey };
    const requestDigest = requestHash(request);
    return withTransaction(this.options.database, () => {
      const existing = this.idempotency.get(body.workspace_id, idempotencyKey);
      if (existing !== undefined) {
        if (existing.resource_type !== "message" || existing.request_hash !== requestDigest) throw new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency key was reused with a different request", retryable: false, required_action: "use_new_idempotency_key" });
        return accepted({ command_id: idempotencyKey, object_type: "message", object_id: existing.resource_id, workspace_id: body.workspace_id });
      }
      if (session.status !== "active") throw invalidSessionState();
      if (body.channel_id !== session.channel_id) throw invalidScope();
      const recipient = body.recipient_ref;
      if (body.direction === "outbound" && (recipient === null || !this.allowlist.isAllowed(body.workspace_id, session.channel_id, "user", recipient, this.options.clock.now()))) throw deniedAllowlist();
      const message = MessageEnvelopeSchema.parse({ ...request, message_id: this.options.idFactory(), occurred_at: body.occurred_at ?? this.options.clock.now() });
      const reservation = this.idempotency.reserveOrGet({ workspace_id: message.workspace_id, idempotency_key: idempotencyKey, request_hash: requestDigest, resource_type: "message", resource_id: message.message_id, created_at: this.options.clock.now() });
      if (reservation.kind === "existing") return accepted({ command_id: idempotencyKey, object_type: "message", object_id: reservation.record.resource_id, workspace_id: message.workspace_id });
      const created = this.messages.create(message);
      const persisted = created.message ?? message;
      if (created.kind === "created") {
        const receipt = DeliveryReceiptSchema.parse({ schema_version: 1, receipt_id: this.options.idFactory(), workspace_id: message.workspace_id, session_id: message.session_id, message_id: persisted.message_id, idempotency_key: idempotencyKey, status: "queued", provider_receipt_ref: null, delivered_at: null, error_code: null, error_message: null, created_at: this.options.clock.now(), trace_id: message.trace_id });
        this.deliveries.create(receipt);
        if (persisted.cursor !== null) this.cursors.checkpoint({ workspace_id: persisted.workspace_id, session_id: persisted.session_id, cursor: persisted.cursor, message_id: persisted.message_id, updated_at: this.options.clock.now() });
        const currentSession = this.require(this.sessions.get(persisted.workspace_id, persisted.session_id));
        this.sessions.update({ ...currentSession, cursor: persisted.cursor ?? currentSession.cursor, last_message_id: persisted.message_id, last_event_at: persisted.occurred_at, updated_at: this.options.clock.now() }, currentSession.revision);
      }
      return accepted({ command_id: idempotencyKey, object_type: "message", object_id: persisted.message_id, workspace_id: message.workspace_id });
    });
  }

  commandSession(input: unknown, sessionId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number, kind: SessionCommand["kind"]): AcceptedCommand {
    const body = SessionCommandInputSchema.parse(input);
    const command = SessionCommandSchema.parse({ ...body, command_id: body.command_id ?? this.options.idFactory(), created_at: body.created_at ?? this.options.clock.now(), idempotency_key: idempotencyKey });
    if (command.session_id !== sessionId || command.kind !== kind || (body.idempotency_key !== undefined && body.idempotency_key !== idempotencyKey)) throw invalidScope();
    this.requireAdmin(actor, command.workspace_id);
    const current = this.require(this.sessions.get(command.workspace_id, UlidSchema.parse(sessionId)));
    if (command.expected_revision !== expectedVersion) throw versionConflict();
    return withTransaction(this.options.database, () => {
      const requestDigest = requestHash({ workspace_id: command.workspace_id, session_id: command.session_id, kind: command.kind, idempotency_key: idempotencyKey, expected_revision: expectedVersion, cursor: command.cursor, instruction: command.instruction });
      const reservation = this.idempotency.reserveOrGet({ workspace_id: command.workspace_id, idempotency_key: idempotencyKey, request_hash: requestDigest, resource_type: `session.${kind}`, resource_id: sessionId, created_at: this.options.clock.now() });
      if (reservation.kind === "existing") {
        if (reservation.record.resource_type !== `session.${kind}`) throw new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency key was reused for another command", retryable: false, required_action: "use_new_idempotency_key" });
        return accepted({ command_id: idempotencyKey, object_type: "session", object_id: sessionId, workspace_id: command.workspace_id });
      }
      if (current.revision !== expectedVersion) throw versionConflict();
      const nextStatus = kind === "pause" ? "paused" : kind === "resume" ? "active" : current.status;
      if (kind === "pause" && current.status !== "active") throw invalidSessionState();
      if (kind === "resume" && current.status !== "paused") throw invalidSessionState();
      if (kind === "steer" && (current.status === "closed" || current.status === "error")) throw invalidSessionState();
      const recoveryCursor = this.cursors.get(current.workspace_id, current.id)?.cursor ?? current.cursor;
      if (command.cursor !== null && command.cursor !== recoveryCursor) throw versionConflict();
      const next = SessionSchema.parse({ ...current, status: nextStatus, cursor: recoveryCursor, updated_at: this.options.clock.now() });
      this.sessions.update(next, expectedVersion);
      return accepted({ command_id: idempotencyKey, object_type: "session", object_id: sessionId, workspace_id: command.workspace_id });
    });
  }

  private register<TRecord extends { readonly id: string; readonly workspace_id: string }>(record: TRecord, idempotencyKey: string, objectType: string, create: () => TRecord): AcceptedCommand {
    return withTransaction(this.options.database, () => {
      const reservation = this.idempotency.reserveOrGet({ workspace_id: record.workspace_id, idempotency_key: idempotencyKey, request_hash: requestHash(record), resource_type: objectType, resource_id: record.id, created_at: this.options.clock.now() });
      if (reservation.kind === "existing") {
        if (reservation.record.resource_type !== objectType) throw new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency key was reused for another resource", retryable: false, required_action: "use_new_idempotency_key" });
        return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: reservation.record.resource_id, workspace_id: record.workspace_id });
      }
      create();
      return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: record.id, workspace_id: record.workspace_id });
    });
  }

  private update<TRecord extends { readonly id: string; readonly workspace_id: string; readonly revision: number; readonly created_at: string }>(record: TRecord, idempotencyKey: string, expectedVersion: number, objectType: string, repository: { readonly get: (workspaceId: string, id: string) => TRecord | undefined; readonly update: (record: TRecord, expectedVersion: number) => TRecord }, validate?: (current: TRecord, next: TRecord) => void): AcceptedCommand {
    return withTransaction(this.options.database, () => {
      const reservation = this.idempotency.reserveOrGet({ workspace_id: record.workspace_id, idempotency_key: idempotencyKey, request_hash: requestHash({ record, expectedVersion }), resource_type: `${objectType}.update`, resource_id: record.id, created_at: this.options.clock.now() });
      if (reservation.kind === "existing") {
        if (reservation.record.resource_type !== `${objectType}.update`) throw new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency key was reused for another update", retryable: false, required_action: "use_new_idempotency_key" });
        return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: record.id, workspace_id: record.workspace_id });
      }
      const current = repository.get(record.workspace_id, record.id);
      if (current === undefined) throw notFound();
      validate?.(current, record);
      if (record.created_at !== current.created_at || record.revision !== expectedVersion) throw versionConflict();
      repository.update({ ...record, updated_at: this.options.clock.now() }, expectedVersion);
      return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: record.id, workspace_id: record.workspace_id });
    });
  }

  private requireAdmin(actor: PolicyActor, workspaceId: string): void {
    const decision = assertScope({ actor, action: "workspace:admin", enforcement_point: "api", requested_scope: { kind: "workspace", id: WorkspaceIdSchema.parse(workspaceId) } });
    if (!decision.allowed) throw new ApiHttpError({ status_code: 403, code: decision.code, message: decision.reason, retryable: false, required_action: decision.required_action });
  }

  private requireSessionTopology(session: Session): void {
    if (this.gateways.get(session.workspace_id, session.gateway_id) === undefined) throw notFound();
    const channel = this.channels.get(session.workspace_id, session.channel_id);
    if (channel === undefined || channel.gateway_id !== session.gateway_id) throw notFound();
  }

  private requireImmutableChannelFacts(current: ChannelDescriptor, next: ChannelDescriptor): void {
    if (next.gateway_id !== current.gateway_id) throw versionConflict();
  }

  private requireImmutableSessionFacts(current: Session, next: Session): void {
    if (next.gateway_id !== current.gateway_id || next.channel_id !== current.channel_id || next.cursor !== current.cursor || next.last_message_id !== current.last_message_id || next.last_event_at !== current.last_event_at) throw versionConflict();
  }

  private requireMutableSessionState(current: Session, next: Session): void {
    this.requireImmutableSessionFacts(current, next);
    if (next.status !== current.status && !canTransitionSession(current.status, next.status)) throw invalidSessionState();
  }

  private require<T>(value: T | undefined): T { if (value === undefined) throw notFound(); return value; }
}

function notFound(): ApiHttpError { return new ApiHttpError({ status_code: 404, code: "SCOPE_DENIED", message: "Resource not found", retryable: false, required_action: "check_scope" }); }
function invalidRouteId(): ApiHttpError { return new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Route id must match body id", retryable: false, required_action: "correct_request" }); }
function invalidScope(): ApiHttpError { return new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Request scope does not match resource", retryable: false, required_action: "correct_request" }); }
function deniedAllowlist(): ApiHttpError { return new ApiHttpError({ status_code: 403, code: "POLICY_DENIED", message: "Channel recipient is not allowlisted", retryable: false, required_action: "approve_recipient" }); }
function versionConflict(): ApiHttpError { return new ApiHttpError({ status_code: 409, code: "VERSION_CONFLICT", message: "Session revision is stale", retryable: true, required_action: "refresh_state" }); }
function invalidSessionState(): ApiHttpError { return new ApiHttpError({ status_code: 409, code: "INVALID_STATE_TRANSITION", message: "Session state does not allow this command", retryable: false, required_action: "refresh_state" }); }
