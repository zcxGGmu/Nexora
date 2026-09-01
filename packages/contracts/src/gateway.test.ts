import { describe, expect, it } from "vitest";
import {
  AllowlistEntrySchema,
  ChannelDescriptorSchema,
  DeliveryReceiptSchema,
  GatewayDescriptorSchema,
  MessageEnvelopeSchema,
  canTransitionSession,
  SessionCommandSchema,
  SessionSchema,
} from "./index.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SESSION_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const MESSAGE_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-30T04:00:00.000Z";

const gateway = {
  id: "gateway-hermes",
  workspace_id: WORKSPACE_ID,
  schema_version: 1,
  created_at: TIME,
  updated_at: TIME,
  name: "Hermes gateway",
  kind: "hermes",
  version: "1.0.0",
  requested_version: "1.0.0",
  actual_version: "1.0.0",
  protocol_version: 1,
  capabilities: ["sessions", "delivery"],
  health: "healthy",
  status: "connected",
  enabled: true,
  execution_location: "local",
  endpoint_ref: null,
  data_classification: "internal",
  last_heartbeat_at: TIME,
} as const;

describe("gateway/channel/session contracts", () => {
  it("accepts descriptor-only gateway/channel facts with readable IDs", () => {
    expect(GatewayDescriptorSchema.parse(gateway).id).toBe("gateway-hermes");
    expect(ChannelDescriptorSchema.parse({ id: "channel-telegram", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, gateway_id: gateway.id, name: "Telegram", kind: "telegram", version: "1.0.0", status: "connected", enabled: true, capabilities: ["messages"], credential_ref: "secret://channels/telegram", endpoint_ref: null, allowlist_mode: "deny_by_default", data_classification: "internal" })).toMatchObject({ gateway_id: "gateway-hermes", kind: "telegram" });
  });

  it("rejects unknown fields, invalid cursors, and non-supported channel states", () => {
    expect(GatewayDescriptorSchema.safeParse({ ...gateway, secret: "token" }).success).toBe(false);
    expect(GatewayDescriptorSchema.safeParse({ ...gateway, endpoint_ref: "https://example.invalid" }).success).toBe(false);
    expect(SessionSchema.safeParse({ id: SESSION_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, gateway_id: "gateway-hermes", channel_id: "channel-telegram", agent_id: null, run_id: null, external_session_ref: null, mode: "background", status: "active", cursor: "cursor with spaces", last_message_id: null, last_event_at: null }).success).toBe(false);
    expect(ChannelDescriptorSchema.safeParse({ id: "channel-telegram", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, gateway_id: gateway.id, name: "Telegram", kind: "telegram", version: "1.0.0", status: "paused", enabled: true, capabilities: ["messages"], credential_ref: null, endpoint_ref: null, allowlist_mode: "deny_by_default", data_classification: "internal" }).success).toBe(false);
  });

  it("requires steer instructions and validates delivery terminal fields", () => {
    expect(SessionCommandSchema.safeParse({ schema_version: 1, command_id: SESSION_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, kind: "steer", idempotency_key: "cmd-1", expected_revision: 1, cursor: null, instruction: null, created_at: TIME }).success).toBe(false);
    expect(DeliveryReceiptSchema.safeParse({ schema_version: 1, receipt_id: SESSION_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, message_id: MESSAGE_ID, idempotency_key: "msg-1", status: "delivered", provider_receipt_ref: "provider:1", delivered_at: null, error_code: null, error_message: null, created_at: TIME, trace_id: SESSION_ID }).success).toBe(false);
  });

  it("allows only recoverable session state transitions", () => {
    expect(canTransitionSession("active", "paused")).toBe(true);
    expect(canTransitionSession("paused", "active")).toBe(true);
    expect(canTransitionSession("closed", "active")).toBe(false);
    expect(canTransitionSession("error", "active")).toBe(false);
    expect(canTransitionSession("error", "closed")).toBe(true);
  });

  it("keeps message and allowlist payloads scoped and idempotent", () => {
    const message = MessageEnvelopeSchema.parse({ schema_version: 1, message_id: MESSAGE_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, channel_id: "channel-telegram", direction: "inbound", status: "accepted", idempotency_key: "telegram:update:1", sequence: 1, cursor: "telegram:1", occurred_at: TIME, trace_id: SESSION_ID, sender_ref: "user:1", recipient_ref: null, content: { text: "hello" }, content_type: "json", content_hash: "sha256:message" });
    expect(message.workspace_id).toBe(WORKSPACE_ID);
    expect(AllowlistEntrySchema.parse({ id: SESSION_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: "channel-telegram", subject_type: "user", subject_ref: "user:1", decision: "allow", reason: "paired", expires_at: null, created_by: null }).decision).toBe("allow");
  });
});
