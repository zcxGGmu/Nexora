import {
  AllowlistEntrySchema,
  ChannelDescriptorSchema,
  DeliveryReceiptSchema,
  GatewayDescriptorSchema,
  MessageEnvelopeSchema,
  SessionSchema,
  type AllowlistEntry,
  type ChannelDescriptor,
  type DeliveryReceipt,
  type GatewayDescriptor,
  type MessageEnvelope,
  type Session,
} from "@nexora/contracts";
import { withTransaction, type SqliteDatabase } from "../db.js";
import { PersistenceError, json, readJson, readText, sqliteError } from "./utils.js";
import { VersionedRepository, type VersionedCodec } from "./versioned.js";

export class GatewayRepository extends VersionedRepository<GatewayDescriptor> {
  constructor(database: SqliteDatabase) { super(database, gatewayCodec); }
}

export class ChannelRepository extends VersionedRepository<ChannelDescriptor> {
  constructor(database: SqliteDatabase) { super(database, channelCodec); }
}

export class SessionRepository extends VersionedRepository<Session> {
  constructor(database: SqliteDatabase) { super(database, sessionCodec); }

  updateState(workspaceId: string, id: string, status: Session["status"], expectedVersion: number, updatedAt: string): Session {
    const existing = this.get(workspaceId, id);
    if (existing === undefined) throw new PersistenceError("NOT_FOUND", "Session not found");
    return this.update({ ...existing, status, updated_at: updatedAt }, expectedVersion);
  }
}

const gatewayCodec: VersionedCodec<GatewayDescriptor> = {
  table: "gateways", schema: GatewayDescriptorSchema,
  columns: "id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at",
  values: (record) => [record.id, record.workspace_id, record.name, record.kind, record.version, record.requested_version, record.actual_version, record.protocol_version, json(record.capabilities), record.health, record.status, record.enabled ? 1 : 0, record.execution_location, record.endpoint_ref, record.data_classification, record.last_heartbeat_at, json(record), record.schema_version, record.created_at, record.updated_at],
  updateValues: (record) => [record.name, record.kind, record.version, record.requested_version, record.actual_version, record.protocol_version, json(record.capabilities), record.health, record.status, record.enabled ? 1 : 0, record.execution_location, record.endpoint_ref, record.data_classification, record.last_heartbeat_at],
};

const channelCodec: VersionedCodec<ChannelDescriptor> = {
  table: "channels", schema: ChannelDescriptorSchema,
  columns: "id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at",
  values: (record) => [record.id, record.workspace_id, record.gateway_id, record.name, record.kind, record.version, record.status, record.enabled ? 1 : 0, json(record.capabilities), record.credential_ref, record.endpoint_ref, record.allowlist_mode, record.data_classification, json(record), record.schema_version, record.created_at, record.updated_at],
  updateValues: (record) => [record.gateway_id, record.name, record.kind, record.version, record.status, record.enabled ? 1 : 0, json(record.capabilities), record.credential_ref, record.endpoint_ref, record.allowlist_mode, record.data_classification],
};

const sessionCodec: VersionedCodec<Session> = {
  table: "sessions", schema: SessionSchema,
  columns: "id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at",
  values: (record) => [record.id, record.workspace_id, record.gateway_id, record.channel_id, record.agent_id, record.run_id, record.external_session_ref, record.mode, record.status, record.cursor, record.last_message_id, record.last_event_at, json(record), record.schema_version, record.created_at, record.updated_at],
  updateValues: (record) => [record.gateway_id, record.channel_id, record.agent_id, record.run_id, record.external_session_ref, record.mode, record.status, record.cursor, record.last_message_id, record.last_event_at],
};

export type MessageCreateResult =
  | { readonly kind: "created"; readonly message: MessageEnvelope }
  | { readonly kind: "duplicate"; readonly message: MessageEnvelope };

export class MessageRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: MessageEnvelope): MessageCreateResult {
    const parsed = MessageEnvelopeSchema.parse(record);
    if (parsed.direction === "outbound" && !this.hasActiveAllowlistEntry(parsed)) throw new PersistenceError("CONSTRAINT_VIOLATION", "Outbound message recipient is not allowlisted");
    try {
      this.database.prepare("INSERT INTO session_messages(message_id, workspace_id, session_id, channel_id, direction, status, idempotency_key, sequence, cursor, occurred_at, trace_id, sender_ref, recipient_ref, content_json, content_type, content_hash, payload_json, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(parsed.message_id, parsed.workspace_id, parsed.session_id, parsed.channel_id, parsed.direction, parsed.status, parsed.idempotency_key, parsed.sequence, parsed.cursor, parsed.occurred_at, parsed.trace_id, parsed.sender_ref, parsed.recipient_ref, json(parsed.content), parsed.content_type, parsed.content_hash, json(parsed), parsed.schema_version);
      return { kind: "created", message: parsed };
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed: session_messages\./i.test(error.message)) {
        const existing = this.getByIdempotencyKey(parsed.workspace_id, parsed.session_id, parsed.idempotency_key);
        if (existing !== undefined && JSON.stringify(existing) === JSON.stringify(parsed)) return { kind: "duplicate", message: existing };
        throw new PersistenceError("IDEMPOTENCY_KEY_REUSED", "Message idempotency key was reused with a different payload");
      }
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, messageId: string): MessageEnvelope | undefined {
    const row = this.database.prepare("SELECT payload_json FROM session_messages WHERE workspace_id = ? AND message_id = ?").get(workspaceId, messageId);
    return row === undefined ? undefined : readJson(row["payload_json"], MessageEnvelopeSchema);
  }

  getByIdempotencyKey(workspaceId: string, sessionId: string, key: string): MessageEnvelope | undefined {
    const row = this.database.prepare("SELECT payload_json FROM session_messages WHERE workspace_id = ? AND session_id = ? AND idempotency_key = ?").get(workspaceId, sessionId, key);
    return row === undefined ? undefined : readJson(row["payload_json"], MessageEnvelopeSchema);
  }

  listBySession(workspaceId: string, sessionId: string, after?: string, limit = 100): readonly MessageEnvelope[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new PersistenceError("CONSTRAINT_VIOLATION", "Message limit must be between 1 and 500");
    return this.readAfter(workspaceId, sessionId, after, limit);
  }

  listAfter(workspaceId: string, sessionId: string, after: string | null, limit: number): { readonly messages: readonly MessageEnvelope[]; readonly next_cursor: string | null } {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new PersistenceError("CONSTRAINT_VIOLATION", "Message limit must be between 1 and 500");
    const messages = this.readAfter(workspaceId, sessionId, after ?? undefined, limit + 1);
    const page = messages.slice(0, limit);
    const boundary = page.at(-1);
    return { messages: page, next_cursor: messages.length > limit && boundary !== undefined ? pageCursor(boundary.sequence) : null };
  }

  private readList(rows: readonly Record<string, unknown>[]): readonly MessageEnvelope[] { return rows.map((row) => readJson(row["payload_json"], MessageEnvelopeSchema)); }

  private hasActiveAllowlistEntry(message: MessageEnvelope): boolean {
    if (message.recipient_ref === null) return false;
    return this.database.prepare("SELECT 1 AS present FROM channel_allowlist WHERE workspace_id = ? AND channel_id = ? AND subject_type = 'user' AND subject_ref = ? AND decision = 'allow' AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) LIMIT 1").get(message.workspace_id, message.channel_id, message.recipient_ref) !== undefined;
  }

  private readAfter(workspaceId: string, sessionId: string, after: string | undefined, limit: number): readonly MessageEnvelope[] {
    if (after === undefined) return this.readList(this.database.prepare("SELECT payload_json FROM session_messages WHERE workspace_id = ? AND session_id = ? ORDER BY sequence ASC LIMIT ?").all(workspaceId, sessionId, limit));
    const pageSequence = sequenceFromPageCursor(after);
    const sequence = pageSequence ?? this.providerCursorSequence(workspaceId, sessionId, after);
    if (sequence === undefined) throw new PersistenceError("NOT_FOUND", "Message cursor was not found");
    return this.readList(this.database.prepare("SELECT payload_json FROM session_messages WHERE workspace_id = ? AND session_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT ?").all(workspaceId, sessionId, sequence, limit));
  }

  private providerCursorSequence(workspaceId: string, sessionId: string, cursor: string): number | undefined {
    const rows = this.database.prepare("SELECT sequence FROM session_messages WHERE workspace_id = ? AND session_id = ? AND cursor = ? ORDER BY sequence ASC").all(workspaceId, sessionId, cursor);
    if (rows.length === 0) return undefined;
    if (rows.length > 1) throw new PersistenceError("CONSTRAINT_VIOLATION", "Message provider cursor is ambiguous; use next_cursor");
    const row = rows[0];
    if (row === undefined) return undefined;
    return readSequence(row["sequence"]);
  }
}

export class DeliveryReceiptRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: DeliveryReceipt): DeliveryReceipt {
    const parsed = DeliveryReceiptSchema.parse(record);
    if (!this.messageBelongsToSession(parsed.workspace_id, parsed.session_id, parsed.message_id)) throw new PersistenceError("NOT_FOUND", "Delivery receipt message/session scope was not found");
    try {
      this.database.prepare("INSERT INTO delivery_receipts(receipt_id, workspace_id, session_id, message_id, idempotency_key, status, provider_receipt_ref, delivered_at, error_code, error_message, created_at, trace_id, payload_json, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(parsed.receipt_id, parsed.workspace_id, parsed.session_id, parsed.message_id, parsed.idempotency_key, parsed.status, parsed.provider_receipt_ref, parsed.delivered_at, parsed.error_code, parsed.error_message, parsed.created_at, parsed.trace_id, json(parsed), parsed.schema_version);
      return parsed;
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed: delivery_receipts\./i.test(error.message)) {
        const existing = this.getByMessageAndKey(parsed.workspace_id, parsed.message_id, parsed.idempotency_key);
        if (existing !== undefined && JSON.stringify(existing) === JSON.stringify(parsed)) return existing;
        throw new PersistenceError("IDEMPOTENCY_KEY_REUSED", "Delivery idempotency key was reused with a different payload");
      }
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, receiptId: string): DeliveryReceipt | undefined {
    const row = this.database.prepare("SELECT payload_json FROM delivery_receipts WHERE workspace_id = ? AND receipt_id = ?").get(workspaceId, receiptId);
    return row === undefined ? undefined : readJson(row["payload_json"], DeliveryReceiptSchema);
  }

  listByMessage(workspaceId: string, messageId: string): readonly DeliveryReceipt[] {
    return this.database.prepare("SELECT payload_json FROM delivery_receipts WHERE workspace_id = ? AND message_id = ? ORDER BY created_at ASC, receipt_id ASC").all(workspaceId, messageId).map((row) => readJson(row["payload_json"], DeliveryReceiptSchema));
  }

  private getByMessageAndKey(workspaceId: string, messageId: string, key: string): DeliveryReceipt | undefined {
    const row = this.database.prepare("SELECT payload_json FROM delivery_receipts WHERE workspace_id = ? AND message_id = ? AND idempotency_key = ?").get(workspaceId, messageId, key);
    return row === undefined ? undefined : readJson(row["payload_json"], DeliveryReceiptSchema);
  }

  private messageBelongsToSession(workspaceId: string, sessionId: string, messageId: string): boolean {
    return this.database.prepare("SELECT 1 AS present FROM session_messages WHERE workspace_id = ? AND session_id = ? AND message_id = ?").get(workspaceId, sessionId, messageId) !== undefined;
  }

  list(workspaceId: string, sessionId?: string): readonly DeliveryReceipt[] {
    if (sessionId === undefined) return this.database.prepare("SELECT payload_json FROM delivery_receipts WHERE workspace_id = ? ORDER BY created_at ASC, receipt_id ASC").all(workspaceId).map((row) => readJson(row["payload_json"], DeliveryReceiptSchema));
    return this.listBySession(workspaceId, sessionId);
  }

  private listBySession(workspaceId: string, sessionId: string): readonly DeliveryReceipt[] {
    return this.database.prepare("SELECT payload_json FROM delivery_receipts WHERE workspace_id = ? AND session_id = ? ORDER BY created_at ASC, receipt_id ASC").all(workspaceId, sessionId).map((row) => readJson(row["payload_json"], DeliveryReceiptSchema));
  }
}

export class AllowlistRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: AllowlistEntry): AllowlistEntry {
    const parsed = AllowlistEntrySchema.parse(record);
    try {
      this.database.prepare("INSERT INTO channel_allowlist(id, workspace_id, channel_id, subject_type, subject_ref, decision, reason, expires_at, created_by, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.channel_id, parsed.subject_type, parsed.subject_ref, parsed.decision, parsed.reason, parsed.expires_at, parsed.created_by, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): AllowlistEntry | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM channel_allowlist WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    if (row === undefined) return undefined;
    const revision = typeof row["version"] === "bigint" ? Number(row["version"]) : row["version"];
    return AllowlistEntrySchema.parse({ ...readJson(row["payload_json"], AllowlistEntrySchema), revision });
  }

  listByChannel(workspaceId: string, channelId: string): readonly AllowlistEntry[] {
    return this.database.prepare("SELECT payload_json, version FROM channel_allowlist WHERE workspace_id = ? AND channel_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId, channelId).map((row) => AllowlistEntrySchema.parse({ ...readJson(row["payload_json"], AllowlistEntrySchema), revision: typeof row["version"] === "bigint" ? Number(row["version"]) : row["version"] }));
  }

  list(workspaceId: string, channelId?: string): readonly AllowlistEntry[] {
    if (channelId === undefined) return this.database.prepare("SELECT payload_json, version FROM channel_allowlist WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId).map((row) => AllowlistEntrySchema.parse({ ...readJson(row["payload_json"], AllowlistEntrySchema), revision: typeof row["version"] === "bigint" ? Number(row["version"]) : row["version"] }));
    return this.listByChannel(workspaceId, channelId);
  }

  isAllowed(workspaceId: string, channelId: string, subjectType: AllowlistEntry["subject_type"], subjectRef: string, now: string): boolean {
    const row = this.database.prepare("SELECT decision FROM channel_allowlist WHERE workspace_id = ? AND channel_id = ? AND subject_type = ? AND subject_ref = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY updated_at DESC, id DESC LIMIT 1").get(workspaceId, channelId, subjectType, subjectRef, now);
    return row !== undefined && readText(row["decision"]) === "allow";
  }
}

export type SessionCursorCheckpoint = { readonly workspace_id: string; readonly session_id: string; readonly cursor: string; readonly message_id: string | null; readonly updated_at: string };

export class SessionCursorRepository {
  constructor(private readonly database: SqliteDatabase) {}

  checkpoint(record: SessionCursorCheckpoint): SessionCursorCheckpoint {
    return withTransaction(this.database, () => this.checkpointLocked(record));
  }

  get(workspaceId: string, sessionId: string): SessionCursorCheckpoint | undefined {
    const row = this.database.prepare("SELECT workspace_id, session_id, cursor, message_id, updated_at FROM session_cursor_checkpoints WHERE workspace_id = ? AND session_id = ?").get(workspaceId, sessionId);
    if (row === undefined) return undefined;
    return { workspace_id: readText(row["workspace_id"]), session_id: readText(row["session_id"]), cursor: readText(row["cursor"]), message_id: row["message_id"] === null ? null : readText(row["message_id"]), updated_at: readText(row["updated_at"]) };
  }

  private hasComparableProgress(previous: SessionCursorCheckpoint, next: SessionCursorCheckpoint): boolean {
    if (previous.message_id === null || next.message_id === null || previous.message_id === next.message_id) return false;
    const previousMessage = this.database.prepare("SELECT sequence FROM session_messages WHERE workspace_id = ? AND session_id = ? AND message_id = ?").get(previous.workspace_id, previous.session_id, previous.message_id);
    const nextMessage = this.database.prepare("SELECT sequence FROM session_messages WHERE workspace_id = ? AND session_id = ? AND message_id = ?").get(next.workspace_id, next.session_id, next.message_id);
    if (previousMessage === undefined || nextMessage === undefined) return false;
    return readSequence(nextMessage["sequence"]) > readSequence(previousMessage["sequence"]);
  }

  private messageBelongsToSession(workspaceId: string, sessionId: string, messageId: string): boolean {
    return this.database.prepare("SELECT 1 AS present FROM session_messages WHERE workspace_id = ? AND session_id = ? AND message_id = ?").get(workspaceId, sessionId, messageId) !== undefined;
  }

  private checkpointLocked(record: SessionCursorCheckpoint): SessionCursorCheckpoint {
    const existing = this.get(record.workspace_id, record.session_id);
    if (record.message_id !== null && !this.messageBelongsToSession(record.workspace_id, record.session_id, record.message_id)) throw new PersistenceError("NOT_FOUND", "Session cursor checkpoint message/session scope was not found");
    if (record.message_id !== null && !this.messageCursorMatches(record.workspace_id, record.session_id, record.message_id, record.cursor)) throw new PersistenceError("VERSION_CONFLICT", "Session cursor checkpoint message cursor does not match");
    if (existing !== undefined && existing.cursor === record.cursor) {
      if (existing.message_id !== record.message_id) throw new PersistenceError("VERSION_CONFLICT", "Session cursor checkpoint replay changed message");
      return existing;
    }
    if (existing !== undefined && existing.cursor !== record.cursor && (isStaleCursor(existing.cursor, record.cursor) || !this.hasComparableProgress(existing, record))) throw new PersistenceError("VERSION_CONFLICT", "Session cursor checkpoint is stale");
    this.database.prepare("INSERT INTO session_cursor_checkpoints(workspace_id, session_id, cursor, message_id, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(workspace_id, session_id) DO UPDATE SET cursor = excluded.cursor, message_id = excluded.message_id, updated_at = excluded.updated_at").run(record.workspace_id, record.session_id, record.cursor, record.message_id, record.updated_at);
    return record;
  }

  private messageCursorMatches(workspaceId: string, sessionId: string, messageId: string, cursor: string): boolean {
    const row = this.database.prepare("SELECT cursor FROM session_messages WHERE workspace_id = ? AND session_id = ? AND message_id = ?").get(workspaceId, sessionId, messageId);
    return row !== undefined && row["cursor"] === cursor;
  }
}

function isStaleCursor(previous: string, next: string): boolean {
  if (previous === next) return false;
  const previousNumber = trailingNumber(previous);
  const nextNumber = trailingNumber(next);
  if (previousNumber !== undefined && nextNumber !== undefined) return nextNumber <= previousNumber;
  return previous === next;
}

function pageCursor(sequence: number): string {
  return `nexora:message-sequence:${sequence}`;
}

function sequenceFromPageCursor(value: string): number | undefined {
  const match = /^nexora:message-sequence:(\d+)$/.exec(value);
  if (match === null) return undefined;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function trailingNumber(value: string): number | undefined {
  const match = /:(\d+)$/.exec(value);
  if (match === null) return undefined;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function readSequence(value: unknown): number {
  const sequence = typeof value === "bigint" ? Number(value) : value;
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0) throw new PersistenceError("CONSTRAINT_VIOLATION", "Stored message sequence is invalid");
  return sequence;
}
