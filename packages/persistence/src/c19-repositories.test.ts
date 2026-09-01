import { describe, expect, it } from "vitest";
import {
  AllowlistRepository,
  ChannelRepository,
  DeliveryReceiptRepository,
  GatewayRepository,
  MessageRepository,
  SessionCursorRepository,
  SessionRepository,
  WorkspaceRepository,
  migrate,
  openDatabase,
  type SqliteDatabase,
} from "./index.js";
import { AllowlistEntrySchema, ChannelDescriptorSchema, DeliveryReceiptSchema, GatewayDescriptorSchema, MessageEnvelopeSchema, SessionSchema, type MessageEnvelope, type Session } from "@nexora/contracts";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const OTHER_WORKSPACE_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const SESSION_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const OTHER_SESSION_ID = "01HRZ3NDEKTSV4RRFFQ69G5FAV";
const MESSAGE_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const SECOND_MESSAGE_ID = "01GRZ3NDEKTSV4RRFFQ69G5FAV";
const RECEIPT_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const ALLOWLIST_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-30T04:00:00.000Z";
const OTHER_GATEWAY_ID = "gateway-openclaw";
const OTHER_CHANNEL_ID = "channel-openclaw";

function setup() {
  const database = openDatabase(":memory:");
  migrate(database);
  const workspaces = new WorkspaceRepository(database);
  workspaces.create({ id: WORKSPACE_ID, name: "Demo", schema_version: 1, created_at: TIME, updated_at: TIME });
  workspaces.create({ id: OTHER_WORKSPACE_ID, name: "Other", schema_version: 1, created_at: TIME, updated_at: TIME });
  const gateway = GatewayDescriptorSchema.parse({ id: "gateway-hermes", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, name: "Hermes", kind: "hermes", version: "1.0.0", protocol_version: 1, capabilities: ["sessions"], health: "healthy", status: "connected", enabled: true, execution_location: "local", endpoint_ref: null, data_classification: "internal", last_heartbeat_at: TIME });
  const channel = ChannelDescriptorSchema.parse({ id: "channel-web", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, gateway_id: gateway.id, name: "Web", kind: "web", version: "1.0.0", status: "connected", enabled: true, capabilities: ["messages"], credential_ref: null, endpoint_ref: null, allowlist_mode: "deny_by_default", data_classification: "internal" });
  const session = SessionSchema.parse({ id: SESSION_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, gateway_id: gateway.id, channel_id: channel.id, agent_id: null, run_id: null, external_session_ref: null, mode: "foreground", status: "active", cursor: null, last_message_id: null, last_event_at: null });
  new GatewayRepository(database).create(gateway);
  new ChannelRepository(database).create(channel);
  new SessionRepository(database).create(session);
  return { database, gateway, channel, session };
}

describe("C19 persistence repositories", () => {
  it("persists workspace-scoped descriptors and session state with optimistic revisions", () => {
    const state = setup();
    expect(state.database.prepare("SELECT version FROM schema_migrations WHERE version = 9").get()).toBeDefined();
    expect(state.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('gateways', 'channels', 'sessions', 'session_messages', 'delivery_receipts', 'channel_allowlist', 'session_cursor_checkpoints')").all()).toHaveLength(7);
    const sessions = new SessionRepository(state.database);
    const updated = sessions.update({ ...state.session, status: "paused", updated_at: "2026-08-30T04:01:00.000Z" }, 1);
    expect(updated.status).toBe("paused");
    expect(sessions.get(WORKSPACE_ID, SESSION_ID)?.revision).toBe(2);
    expect(sessions.get(OTHER_WORKSPACE_ID, SESSION_ID)).toBeUndefined();
    expect(() => sessions.update({ ...updated, status: "active" }, 1)).toThrow(/version conflict/i);
    state.database.close();
  });

  it("deduplicates messages by workspace/session idempotency key without cross-workspace leakage", () => {
    const state = setup();
    const repository = new MessageRepository(state.database);
    const message = MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: state.channel.id, direction: "inbound", status: "accepted", idempotency_key: "web:message:1", sequence: 1, cursor: "cursor:1", occurred_at: TIME, trace_id: SESSION_ID, sender_ref: "user:1", recipient_ref: null, content: { text: "hello" }, content_type: "json", content_hash: "sha256:message" });
    expect(repository.create(message).kind).toBe("created");
    expect(repository.create(message).kind).toBe("duplicate");
    const second = MessageEnvelopeSchema.parse({ ...message, message_id: SECOND_MESSAGE_ID, idempotency_key: "web:message:2", sequence: 2, cursor: "cursor:2", content_hash: "sha256:message-2" });
    repository.create(second);
    expect(repository.getByIdempotencyKey(WORKSPACE_ID, SESSION_ID, message.idempotency_key)).toEqual(message);
    expect(repository.listBySession(WORKSPACE_ID, SESSION_ID)).toEqual([message, second]);
    expect(repository.listAfter(WORKSPACE_ID, SESSION_ID, null, 1)).toEqual({ messages: [message], next_cursor: "nexora:message-sequence:1" });
    expect(repository.listAfter(WORKSPACE_ID, SESSION_ID, "nexora:message-sequence:1", 1)).toEqual({ messages: [second], next_cursor: null });
    state.database.close();
  });

  it("returns a replayable page cursor when the page boundary message has no provider cursor", () => {
    const state = setup();
    const repository = new MessageRepository(state.database);
    const first = MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: state.channel.id, direction: "inbound", status: "accepted", idempotency_key: "web:message:null-cursor:1", sequence: 1, cursor: null, occurred_at: TIME, trace_id: SESSION_ID, sender_ref: "user:1", recipient_ref: null, content: { text: "first" }, content_type: "json", content_hash: "sha256:null-cursor-1" });
    const second = MessageEnvelopeSchema.parse({ ...first, message_id: SECOND_MESSAGE_ID, idempotency_key: "web:message:null-cursor:2", sequence: 2, content: { text: "second" }, content_hash: "sha256:null-cursor-2" });

    repository.create(first);
    repository.create(second);

    const firstPage = repository.listAfter(WORKSPACE_ID, SESSION_ID, null, 1);
    expect(firstPage.messages).toEqual([first]);
    if (firstPage.next_cursor === null) throw new Error("Expected an internal page cursor while additional messages remain");
    expect(repository.listAfter(WORKSPACE_ID, SESSION_ID, firstPage.next_cursor, 1)).toEqual({ messages: [second], next_cursor: null });
    state.database.close();
  });

  it("uses internal sequence page cursors and rejects ambiguous provider cursors", () => {
    const state = setup();
    const repository = new MessageRepository(state.database);
    const first = MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: state.channel.id, direction: "inbound", status: "accepted", idempotency_key: "web:message:shared-cursor:1", sequence: 1, cursor: "provider:shared", occurred_at: TIME, trace_id: SESSION_ID, sender_ref: "user:1", recipient_ref: null, content: { text: "first" }, content_type: "json", content_hash: "sha256:shared-cursor-1" });
    const second = MessageEnvelopeSchema.parse({ ...first, message_id: SECOND_MESSAGE_ID, idempotency_key: "web:message:shared-cursor:2", sequence: 2, content: { text: "second" }, content_hash: "sha256:shared-cursor-2" });

    repository.create(first);
    repository.create(second);

    const firstPage = repository.listAfter(WORKSPACE_ID, SESSION_ID, null, 1);
    expect(firstPage.next_cursor).toBe("nexora:message-sequence:1");
    expect(repository.listAfter(WORKSPACE_ID, SESSION_ID, "nexora:message-sequence:1", 1)).toEqual({ messages: [second], next_cursor: null });
    expect(() => repository.listAfter(WORKSPACE_ID, SESSION_ID, "provider:shared", 1)).toThrow(/ambiguous/i);
    state.database.close();
  });

  it("keeps delivery receipts append-only and checkpoints cursors monotonically", () => {
    const state = setup();
    const messages = new MessageRepository(state.database);
    allowRecipient(state.database, state.channel.id, "user:1");
    const firstMessage = MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: state.channel.id, direction: "outbound", status: "queued", idempotency_key: "web:message:1", sequence: 1, cursor: "cursor:1", occurred_at: TIME, trace_id: SESSION_ID, sender_ref: null, recipient_ref: "user:1", content: "hello", content_type: "text", content_hash: "sha256:message-1" });
    const message = MessageEnvelopeSchema.parse({ ...firstMessage, message_id: SECOND_MESSAGE_ID, idempotency_key: "web:message:2", sequence: 2, cursor: "cursor:2", content_hash: "sha256:message-2" });
    messages.create(firstMessage);
    messages.create(message);
    const receipt = DeliveryReceiptSchema.parse({ schema_version: 1, receipt_id: RECEIPT_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, message_id: SECOND_MESSAGE_ID, idempotency_key: message.idempotency_key, status: "sent", provider_receipt_ref: null, delivered_at: null, error_code: null, error_message: null, created_at: TIME, trace_id: SESSION_ID });
    const receipts = new DeliveryReceiptRepository(state.database);
    expect(receipts.create(receipt)).toEqual(receipt);
    expect(receipts.create(receipt)).toEqual(receipt);
    expect(() => receipts.create({ ...receipt, status: "delivered", delivered_at: TIME })).toThrow(/idempotency/i);
    const cursors = new SessionCursorRepository(state.database);
    expect(cursors.checkpoint({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, cursor: "cursor:2", message_id: SECOND_MESSAGE_ID, updated_at: TIME })).toMatchObject({ cursor: "cursor:2" });
    expect(cursors.checkpoint({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, cursor: "cursor:2", message_id: SECOND_MESSAGE_ID, updated_at: TIME })).toMatchObject({ cursor: "cursor:2" });
    expect(() => cursors.checkpoint({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, cursor: "cursor:1", message_id: MESSAGE_ID, updated_at: TIME })).toThrow(/stale|monotonic/i);
    state.database.close();
  });

  it("rejects cursor checkpoints that point at a message from another session", () => {
    const state = setup();
    const sessions = new SessionRepository(state.database);
    sessions.create(SessionSchema.parse({ ...state.session, id: OTHER_SESSION_ID, cursor: null, last_message_id: null }));
    const messages = new MessageRepository(state.database);
    messages.create(MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: state.channel.id, direction: "inbound", status: "accepted", idempotency_key: "web:message:cursor-boundary", sequence: 1, cursor: "cursor:1", occurred_at: TIME, trace_id: SESSION_ID, sender_ref: "user:1", recipient_ref: null, content: { text: "hello" }, content_type: "json", content_hash: "sha256:cursor-boundary" }));
    const cursors = new SessionCursorRepository(state.database);

    expect(() => cursors.checkpoint({ workspace_id: WORKSPACE_ID, session_id: OTHER_SESSION_ID, cursor: "cursor:1", message_id: MESSAGE_ID, updated_at: TIME })).toThrow(/message\/session scope/i);
    state.database.close();
  });

  it("rejects cursor checkpoints whose message has a different provider cursor", () => {
    const state = setup();
    const messages = new MessageRepository(state.database);
    messages.create(MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: state.channel.id, direction: "inbound", status: "accepted", idempotency_key: "web:message:cursor-match", sequence: 1, cursor: "cursor:1", occurred_at: TIME, trace_id: SESSION_ID, sender_ref: "user:1", recipient_ref: null, content: { text: "hello" }, content_type: "json", content_hash: "sha256:cursor-match" }));
    const cursors = new SessionCursorRepository(state.database);

    expect(() => cursors.checkpoint({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, cursor: "cursor:2", message_id: MESSAGE_ID, updated_at: TIME })).toThrow(/cursor/i);
    state.database.close();
  });

  it("treats only fully identical cursor checkpoints as idempotent replays", () => {
    const state = setup();
    const messages = new MessageRepository(state.database);
    const first = MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: state.channel.id, direction: "inbound", status: "accepted", idempotency_key: "web:message:cursor-replay:1", sequence: 1, cursor: "cursor:shared", occurred_at: TIME, trace_id: SESSION_ID, sender_ref: "user:1", recipient_ref: null, content: { text: "first" }, content_type: "json", content_hash: "sha256:cursor-replay-1" });
    const second = MessageEnvelopeSchema.parse({ ...first, message_id: SECOND_MESSAGE_ID, idempotency_key: "web:message:cursor-replay:2", sequence: 2, content: { text: "second" }, content_hash: "sha256:cursor-replay-2" });
    messages.create(first);
    messages.create(second);
    const cursors = new SessionCursorRepository(state.database);

    const checkpoint = cursors.checkpoint({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, cursor: "cursor:shared", message_id: MESSAGE_ID, updated_at: TIME });
    expect(cursors.checkpoint({ ...checkpoint, updated_at: "2026-08-30T04:02:00.000Z" })).toEqual(checkpoint);
    expect(() => cursors.checkpoint({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, cursor: "cursor:shared", message_id: SECOND_MESSAGE_ID, updated_at: "2026-08-30T04:03:00.000Z" })).toThrow(/replay|version conflict/i);
    expect(cursors.get(WORKSPACE_ID, SESSION_ID)).toEqual(checkpoint);
    state.database.close();
  });

  it("rejects delivery receipts whose message belongs to a different session", () => {
    const state = setup();
    const sessions = new SessionRepository(state.database);
    sessions.create(SessionSchema.parse({ ...state.session, id: OTHER_SESSION_ID, cursor: null, last_message_id: null }));
    const messages = new MessageRepository(state.database);
    allowRecipient(state.database, state.channel.id, "user:1");
    messages.create(MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: state.channel.id, direction: "outbound", status: "queued", idempotency_key: "web:message:session-boundary", sequence: 2, cursor: "cursor:2", occurred_at: TIME, trace_id: SESSION_ID, sender_ref: null, recipient_ref: "user:1", content: "hello", content_type: "text", content_hash: "sha256:message-session-boundary" }));
    const receipts = new DeliveryReceiptRepository(state.database);
    const mismatched = DeliveryReceiptSchema.parse({ schema_version: 1, receipt_id: RECEIPT_ID, workspace_id: WORKSPACE_ID, session_id: OTHER_SESSION_ID, message_id: MESSAGE_ID, idempotency_key: "delivery:session-boundary", status: "sent", provider_receipt_ref: null, delivered_at: null, error_code: null, error_message: null, created_at: TIME, trace_id: SESSION_ID });

    expect(() => receipts.create(mismatched)).toThrow(/message\/session scope/i);
    state.database.close();
  });

  it("rejects a changed opaque cursor when no message sequence can prove it is newer", () => {
    const state = setup();
    const cursors = new SessionCursorRepository(state.database);
    expect(cursors.checkpoint({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, cursor: "opaque-a", message_id: null, updated_at: TIME })).toMatchObject({ cursor: "opaque-a" });
    expect(() => cursors.checkpoint({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, cursor: "opaque-b", message_id: null, updated_at: "2026-08-30T04:01:00.000Z" })).toThrow(/stale|monotonic/i);
    state.database.close();
  });

  it("defaults allowlist decisions to deny and only allows active workspace entries", () => {
    const state = setup();
    const repository = new AllowlistRepository(state.database);
    expect(repository.isAllowed(WORKSPACE_ID, state.channel.id, "user", "user:1", TIME)).toBe(false);
    const entry = AllowlistEntrySchema.parse({ id: ALLOWLIST_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: state.channel.id, subject_type: "user", subject_ref: "user:1", decision: "allow", reason: "paired", expires_at: null, created_by: null });
    repository.create(entry);
    expect(repository.isAllowed(WORKSPACE_ID, state.channel.id, "user", "user:1", TIME)).toBe(true);
    expect(repository.isAllowed(OTHER_WORKSPACE_ID, state.channel.id, "user", "user:1", TIME)).toBe(false);
    state.database.close();
  });

  it("denies direct outbound message writes unless the recipient is actively allowlisted", () => {
    const state = setup();
    const repository = new MessageRepository(state.database);
    const message = MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: state.channel.id, direction: "outbound", status: "queued", idempotency_key: "web:message:persistence-deny", sequence: 1, cursor: "cursor:1", occurred_at: TIME, trace_id: SESSION_ID, sender_ref: null, recipient_ref: "user:persistence-deny", content: "blocked", content_type: "text", content_hash: "sha256:persistence-deny" });

    expect(() => repository.create(message)).toThrow(/allowlisted/i);
    expect(() => insertMessage(state.database, message)).toThrow(/allowlisted/i);

    new AllowlistRepository(state.database).create(AllowlistEntrySchema.parse({ id: ALLOWLIST_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: state.channel.id, subject_type: "user", subject_ref: "user:persistence-deny", decision: "allow", reason: "paired", expires_at: null, created_by: null }));

    expect(repository.create(message).kind).toBe("created");
    state.database.close();
  });

  it("denies expired allowlist entries using current persistence time, not backdated message time", () => {
    const state = setup();
    const repository = new MessageRepository(state.database);
    new AllowlistRepository(state.database).create(AllowlistEntrySchema.parse({ id: ALLOWLIST_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: state.channel.id, subject_type: "user", subject_ref: "user:expired-backdated", decision: "allow", reason: "expired", expires_at: "2000-01-01T00:00:00.000Z", created_by: null }));
    const repositoryMessage = MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: state.channel.id, direction: "outbound", status: "queued", idempotency_key: "web:message:expired-backdated:repo", sequence: 1, cursor: "cursor:1", occurred_at: "1999-12-31T23:59:59.000Z", trace_id: SESSION_ID, sender_ref: null, recipient_ref: "user:expired-backdated", content: "blocked", content_type: "text", content_hash: "sha256:expired-backdated-repo" });
    const directMessage = MessageEnvelopeSchema.parse({ ...repositoryMessage, message_id: SECOND_MESSAGE_ID, idempotency_key: "web:message:expired-backdated:direct", sequence: 2, cursor: "cursor:2", content_hash: "sha256:expired-backdated-direct" });

    expect(() => repository.create(repositoryMessage)).toThrow(/allowlisted/i);
    expect(() => insertMessage(state.database, directMessage)).toThrow(/allowlisted/i);
    state.database.close();
  });

  it("enforces C19 append-only facts at the database boundary", () => {
    const state = setup();
    const messages = new MessageRepository(state.database);
    allowRecipient(state.database, state.channel.id, "user:1");
    const message = MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: state.channel.id, direction: "outbound", status: "queued", idempotency_key: "web:message:append-only", sequence: 1, cursor: "cursor:1", occurred_at: TIME, trace_id: SESSION_ID, sender_ref: null, recipient_ref: "user:1", content: "hello", content_type: "text", content_hash: "sha256:append-only" });
    messages.create(message);
    const receipt = DeliveryReceiptSchema.parse({ schema_version: 1, receipt_id: RECEIPT_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, message_id: MESSAGE_ID, idempotency_key: "delivery:append-only", status: "sent", provider_receipt_ref: null, delivered_at: null, error_code: null, error_message: null, created_at: TIME, trace_id: SESSION_ID });
    new DeliveryReceiptRepository(state.database).create(receipt);

    expect(() => state.database.prepare("UPDATE session_messages SET status = 'delivered' WHERE workspace_id = ? AND message_id = ?").run(WORKSPACE_ID, MESSAGE_ID)).toThrow(/append-only/i);
    expect(() => state.database.prepare("DELETE FROM session_messages WHERE workspace_id = ? AND message_id = ?").run(WORKSPACE_ID, MESSAGE_ID)).toThrow(/append-only/i);
    expect(() => state.database.prepare("UPDATE delivery_receipts SET status = 'delivered' WHERE workspace_id = ? AND receipt_id = ?").run(WORKSPACE_ID, RECEIPT_ID)).toThrow(/append-only/i);
    expect(() => state.database.prepare("DELETE FROM delivery_receipts WHERE workspace_id = ? AND receipt_id = ?").run(WORKSPACE_ID, RECEIPT_ID)).toThrow(/append-only/i);
    state.database.close();
  });

  it("enforces gateway/channel/session/message topology at the database boundary", () => {
    const state = setup();
    const gateways = new GatewayRepository(state.database);
    const channels = new ChannelRepository(state.database);
    const otherGateway = GatewayDescriptorSchema.parse({ ...state.gateway, id: OTHER_GATEWAY_ID, name: "OpenClaw" });
    const otherChannel = ChannelDescriptorSchema.parse({ ...state.channel, id: OTHER_CHANNEL_ID, gateway_id: OTHER_GATEWAY_ID, name: "OpenClaw API" });
    gateways.create(otherGateway);
    channels.create(otherChannel);

    expect(() => state.database.prepare("UPDATE channels SET gateway_id = ? WHERE workspace_id = ? AND id = ?").run(OTHER_GATEWAY_ID, WORKSPACE_ID, state.channel.id)).toThrow(/gateway binding/i);
    expect(() => insertSession(state.database, SessionSchema.parse({ ...state.session, id: OTHER_SESSION_ID, gateway_id: state.gateway.id, channel_id: OTHER_CHANNEL_ID }))).toThrow(/gateway\/channel topology/i);
    expect(() => insertMessage(state.database, MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: OTHER_CHANNEL_ID, direction: "inbound", status: "accepted", idempotency_key: "web:message:wrong-channel", sequence: 1, cursor: "cursor:1", occurred_at: TIME, trace_id: SESSION_ID, sender_ref: "user:1", recipient_ref: null, content: { text: "wrong" }, content_type: "json", content_hash: "sha256:wrong-channel" }))).toThrow(/session\/channel topology/i);
    messagesForLastMessageCheck(state.database, state.channel.id);
    expect(() => state.database.prepare("UPDATE sessions SET last_message_id = ? WHERE workspace_id = ? AND id = ?").run(MESSAGE_ID, WORKSPACE_ID, OTHER_SESSION_ID)).toThrow(/last message/i);
    state.database.close();
  });
});

function insertSession(database: SqliteDatabase, session: Session): void {
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(session.id, session.workspace_id, session.gateway_id, session.channel_id, session.agent_id, session.run_id, session.external_session_ref, session.mode, session.status, session.cursor, session.last_message_id, session.last_event_at, JSON.stringify(session), session.schema_version, session.created_at, session.updated_at);
}

function insertMessage(database: SqliteDatabase, message: MessageEnvelope): void {
  database.prepare("INSERT INTO session_messages(message_id, workspace_id, session_id, channel_id, direction, status, idempotency_key, sequence, cursor, occurred_at, trace_id, sender_ref, recipient_ref, content_json, content_type, content_hash, payload_json, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(message.message_id, message.workspace_id, message.session_id, message.channel_id, message.direction, message.status, message.idempotency_key, message.sequence, message.cursor, message.occurred_at, message.trace_id, message.sender_ref, message.recipient_ref, JSON.stringify(message.content), message.content_type, message.content_hash, JSON.stringify(message), message.schema_version);
}

function allowRecipient(database: SqliteDatabase, channelId: string, subjectRef: string): void {
  new AllowlistRepository(database).create(AllowlistEntrySchema.parse({ id: ALLOWLIST_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: channelId, subject_type: "user", subject_ref: subjectRef, decision: "allow", reason: "paired", expires_at: null, created_by: null }));
}

function messagesForLastMessageCheck(database: SqliteDatabase, channelId: string): void {
  const sessions = new SessionRepository(database);
  sessions.create(SessionSchema.parse({ id: OTHER_SESSION_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, gateway_id: "gateway-hermes", channel_id: channelId, agent_id: null, run_id: null, external_session_ref: null, mode: "background", status: "active", cursor: null, last_message_id: null, last_event_at: null }));
  new MessageRepository(database).create(MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: channelId, direction: "inbound", status: "accepted", idempotency_key: "web:message:last-message", sequence: 1, cursor: "cursor:1", occurred_at: TIME, trace_id: SESSION_ID, sender_ref: "user:1", recipient_ref: null, content: { text: "last" }, content_type: "json", content_hash: "sha256:last-message" }));
}
