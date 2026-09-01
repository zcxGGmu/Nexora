import { describe, expect, it } from "vitest";
import { ChannelDescriptorSchema, DeliveryReceiptSchema, GatewayDescriptorSchema, SessionCommandSchema, SessionSchema, WorkspaceIdSchema } from "@nexora/contracts";

import { acknowledgeGatewayDelivery, buildGatewayControlView, createGatewayDeliveryAcknowledgement, resolveGatewayWorkspace, sendGatewaySessionCommand, workspaceIdForGatewayApi, type GatewayCommandWriter, type GatewayPostOptions, type GatewayProjection } from "./gateway-api.js";

const WORKSPACE_ID = WorkspaceIdSchema.parse("01ARZ3NDEKTSV4RRFFQ69G5FAV");
const SESSION_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const MESSAGE_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const RECEIPT_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-30T04:00:00.000Z";
const OTHER_WORKSPACE_ID = WorkspaceIdSchema.parse("01ERZ3NDEKTSV4RRFFQ69G5FAV");

const gateway = GatewayDescriptorSchema.parse({ id: "gateway-hermes", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, name: "Hermes", kind: "hermes", version: "1.0.0", requested_version: "1.0.0", actual_version: "1.0.0", protocol_version: 1, capabilities: ["sessions"], health: "healthy", status: "connected", enabled: true, execution_location: "local", endpoint_ref: null, data_classification: "internal", last_heartbeat_at: TIME, revision: 1 });
const channel = ChannelDescriptorSchema.parse({ id: "channel-web", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, gateway_id: "gateway-hermes", name: "Web API", kind: "api", version: "1.0.0", status: "connected", enabled: true, capabilities: ["messages"], credential_ref: null, endpoint_ref: null, allowlist_mode: "deny_by_default", data_classification: "internal", revision: 1 });
const session = SessionSchema.parse({ id: SESSION_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, gateway_id: "gateway-hermes", channel_id: "channel-web", agent_id: null, run_id: null, external_session_ref: null, mode: "background", status: "active", cursor: "cursor:4", last_message_id: MESSAGE_ID, last_event_at: TIME, revision: 1 });
const delivery = DeliveryReceiptSchema.parse({ schema_version: 1, receipt_id: RECEIPT_ID, workspace_id: WORKSPACE_ID, session_id: SESSION_ID, message_id: MESSAGE_ID, idempotency_key: "message:1", status: "delivered", provider_receipt_ref: null, delivered_at: TIME, error_code: null, error_message: null, created_at: TIME, trace_id: RECEIPT_ID });

const projection: GatewayProjection = {
  gateways: [gateway],
  channels: [channel],
  sessions: [session],
  deliveries: [delivery],
  allowlist: [],
  cursors: { [SESSION_ID]: { workspace_id: WORKSPACE_ID, session_id: SESSION_ID, cursor: "cursor:4", message_id: MESSAGE_ID, updated_at: TIME } },
};

describe("Gateway API projection", () => {
  it("maps live API facts into the Gateway surface, including queue, cursor, delivery, and allowlist state", () => {
    const view = buildGatewayControlView(projection, WORKSPACE_ID);

    expect(view.workspaceId).toBe(WORKSPACE_ID);
    expect(view.gateway.name).toBe("Hermes");
    expect(view.channels[0]).toMatchObject({ id: "channel-web", queue: 0, allowlist: "deny_by_default" });
    expect(view.sessions[0]).toMatchObject({ id: SESSION_ID, mode: "background", cursor: "cursor:4", lastDelivery: "delivered" });
    expect(view.delivery.total).toBe(1);
    expect(view.allowlist).toMatchObject({ total: 0, active: 0, defaultDeny: true });
  });

  it("selects the requested workspace and evaluates allowlist activity against the supplied clock", () => {
    const view = buildGatewayControlView(
      {
        ...projection,
        gateways: [
          { ...gateway, id: "gateway-other", workspace_id: OTHER_WORKSPACE_ID, name: "Other Gateway" },
          gateway,
        ],
        allowlist: [{ id: "allow-1", workspace_id: WORKSPACE_ID, channel_id: "channel-web", decision: "allow", expires_at: "2026-08-30T05:00:00.000Z" }],
      },
      WORKSPACE_ID,
      TIME,
    );

    expect(view.gateway.name).toBe("Hermes");
    expect(view.allowlist).toMatchObject({ total: 1, active: 1 });
  });

  it("does not count an expired allowlist entry as active", () => {
    const view = buildGatewayControlView(
      {
        ...projection,
        allowlist: [{ id: "allow-1", workspace_id: WORKSPACE_ID, channel_id: "channel-web", decision: "allow", expires_at: "2026-08-30T05:00:00.000Z" }],
      },
      WORKSPACE_ID,
      "2026-08-30T06:00:00.000Z",
    );

    expect(view.allowlist).toMatchObject({ total: 1, active: 0 });
  });

  it("exposes acknowledgement targets only for latest queued delivery facts", () => {
    const queued = DeliveryReceiptSchema.parse({ ...delivery, receipt_id: "01FRZ3NDEKTSV4RRFFQ69G5FAV", idempotency_key: "message:queued", status: "queued", delivered_at: null, created_at: "2026-08-30T04:01:00.000Z" });
    const delivered = DeliveryReceiptSchema.parse({ ...delivery, receipt_id: "01GRZ3NDEKTSV4RRFFQ69G5FAV", idempotency_key: "message:delivered", status: "delivered", delivered_at: "2026-08-30T04:02:00.000Z", created_at: "2026-08-30T04:02:00.000Z" });

    const queuedView = buildGatewayControlView({ ...projection, deliveries: [delivery, queued] }, WORKSPACE_ID, TIME);
    const acknowledgedView = buildGatewayControlView({ ...projection, deliveries: [delivery, queued, delivered] }, WORKSPACE_ID, TIME);

    expect(queuedView.channels[0]).toMatchObject({ queue: 1 });
    expect(queuedView.sessions[0]?.acknowledgement).toEqual({ message_id: MESSAGE_ID });
    expect(acknowledgedView.channels[0]).toMatchObject({ queue: 0 });
    expect(acknowledgedView.sessions[0]?.acknowledgement).toBeNull();
  });

  it("builds append-only delivered acknowledgement receipts for the control API", () => {
    const receipt = createGatewayDeliveryAcknowledgement({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, message_id: MESSAGE_ID, receipt_id: RECEIPT_ID, idempotency_key: "ack:1", created_at: TIME, trace_id: RECEIPT_ID });

    expect(receipt).toMatchObject({
      schema_version: 1,
      workspace_id: WORKSPACE_ID,
      session_id: SESSION_ID,
      message_id: MESSAGE_ID,
      idempotency_key: "ack:1",
      status: "delivered",
      provider_receipt_ref: "mission-control:acknowledged",
      delivered_at: TIME,
      created_at: TIME,
      trace_id: RECEIPT_ID,
    });
  });

  it("resolves canonical workspace ids and known Mission Control aliases without accepting arbitrary scopes", () => {
    expect(workspaceIdForGatewayApi("ws-demo")).toBe(WORKSPACE_ID);
    expect(workspaceIdForGatewayApi("ws-a")).toBe(WORKSPACE_ID);
    expect(workspaceIdForGatewayApi("ws-b")).toBe("01BRZ3NDEKTSV4RRFFQ69G5FAV");
    expect(resolveGatewayWorkspace(WORKSPACE_ID)).toEqual({ kind: "resolved", workspace_id: WORKSPACE_ID });
    expect(resolveGatewayWorkspace("ws-unknown")).toEqual({ kind: "invalid", input: "ws-unknown" });
    expect(() => workspaceIdForGatewayApi("ws-unknown")).toThrow("workspace ULID");
  });

  it("posts session commands with Idempotency-Key and If-Match headers", async () => {
    const calls: PostCall[] = [];
    const writer = createWriter(calls);

    await sendGatewaySessionCommand({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, kind: "steer", expected_revision: 3, cursor: "cursor:4", instruction: "Continue from checkpoint" }, "command:key", writer);

    const call = singlePost(calls);
    const command = SessionCommandSchema.parse(call.json);
    expect(call.path).toBe(`/v1/sessions/${SESSION_ID}/steer`);
    expect(call.headers).toMatchObject({ "Idempotency-Key": "command:key", "If-Match": "3" });
    expect(command).toMatchObject({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, kind: "steer", idempotency_key: "command:key", expected_revision: 3, cursor: "cursor:4", instruction: "Continue from checkpoint" });
  });

  it("posts delivery acknowledgements as durable append-only receipt facts", async () => {
    const calls: PostCall[] = [];
    const writer = createWriter(calls);

    await acknowledgeGatewayDelivery({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, message_id: MESSAGE_ID }, "ack:key", writer);

    const call = singlePost(calls);
    const receipt = DeliveryReceiptSchema.parse(call.json);
    expect(call.path).toBe("/v1/deliveries");
    expect(call.headers).toMatchObject({ "Idempotency-Key": "ack:key" });
    expect(receipt).toMatchObject({ workspace_id: WORKSPACE_ID, session_id: SESSION_ID, message_id: MESSAGE_ID, idempotency_key: "ack:key", status: "delivered", provider_receipt_ref: "mission-control:acknowledged" });
  });
});

type PostCall = {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
};

function createWriter(calls: PostCall[]): GatewayCommandWriter {
  return {
    post: (path: string, options: GatewayPostOptions): Promise<unknown> => {
      calls.push({ path, headers: options.headers, json: options.json });
      return Promise.resolve({ ok: true });
    },
  };
}

function singlePost(calls: readonly PostCall[]): PostCall {
  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (call === undefined) throw new Error("Expected one Gateway API post call");
  return call;
}
