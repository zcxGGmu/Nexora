import { describe, expect, it } from "vitest";
import { createLocalBearerToken } from "../plugins/auth.js";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, TIME, TOKEN_SECRET } from "./test-fixtures.js";

const GATEWAY_ID = "gateway-hermes";
const CHANNEL_ID = "channel-web";
const SESSION_ID = "01SRZ3NDEKTSV4RRFFQ69G5FAV";
const MESSAGE_ID = "01TRZ3NDEKTSV4RRFFQ69G5FAV";
const SECOND_MESSAGE_ID = "01URZ3NDEKTSV4RRFFQ69G5FAV";
const RECEIPT_ID = "01VRZ3NDEKTSV4RRFFQ69G5FAV";
const COMMAND_ID = "01XRZ3NDEKTSV4RRFFQ69G5FAV";
const DELIVERY_ID = "01ZRZ3NDEKTSV4RRFFQ69G5FAV";
const CLOSED_SESSION_ID = "01YRZ3NDEKTSV4RRFFQ69Y5FAV";
const ERROR_SESSION_ID = "01WRZ3NDEKTSV4RRFFQ69Y5FAV";
const MISSING_SESSION_ID = "012RZ3NDEKTSV4RRFFQ69Y5FAV";
const TRACE_ID = IDS.owner;

const gateway = {
  id: GATEWAY_ID,
  workspace_id: IDS.workspace,
  schema_version: 1,
  created_at: TIME,
  updated_at: TIME,
  name: "Hermes Gateway",
  kind: "hermes",
  version: "1.0.0",
  requested_version: "1.0.0",
  actual_version: null,
  protocol_version: 1,
  capabilities: ["messaging", "sessions"],
  health: "unknown",
  status: "connected",
  enabled: true,
  execution_location: "local",
  endpoint_ref: null,
  data_classification: "internal",
  last_heartbeat_at: null,
  revision: 1,
} as const;

const channel = {
  id: CHANNEL_ID,
  workspace_id: IDS.workspace,
  schema_version: 1,
  created_at: TIME,
  updated_at: TIME,
  gateway_id: GATEWAY_ID,
  name: "Web API",
  kind: "api",
  version: "1.0.0",
  status: "connected",
  enabled: true,
  capabilities: ["send", "receive"],
  credential_ref: null,
  endpoint_ref: null,
  allowlist_mode: "deny_by_default",
  data_classification: "internal",
  revision: 1,
} as const;

const session = {
  id: SESSION_ID,
  workspace_id: IDS.workspace,
  schema_version: 1,
  created_at: TIME,
  updated_at: TIME,
  gateway_id: GATEWAY_ID,
  channel_id: CHANNEL_ID,
  agent_id: IDS.agent,
  run_id: null,
  external_session_ref: null,
  mode: "foreground",
  status: "active",
  cursor: "cursor-0",
  last_message_id: null,
  last_event_at: null,
  revision: 1,
} as const;

function commandHeaders(key: string, version = "1") {
  return { authorization: ownerHeader(), "idempotency-key": key, "if-match": version, traceparent: TRACE_ID };
}

function viewerHeader(): string {
  return createLocalBearerToken({ workspace_id: IDS.workspace, actor_id: IDS.owner, role: "Viewer", tokenSecret: TOKEN_SECRET });
}

function firstSetCookie(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  const first = value?.[0];
  if (first === undefined) throw new Error("Expected local session Set-Cookie header");
  return first;
}

describe("C19 Gateway, Channel, and Session API", () => {
  it("allows the local Mission Control origin to preflight control-plane requests", async () => {
    const fixture = createControlFixture();
    try {
      const response = await fixture.api.inject({
        method: "OPTIONS",
        url: "/v1/gateways",
        headers: {
          origin: "http://127.0.0.1:4311",
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization,content-type",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:4311");
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
      expect(response.headers["access-control-allow-methods"]).toContain("GET");
      expect(response.headers["access-control-allow-headers"]).toContain("Authorization");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("bootstraps local Mission Control auth with an HttpOnly cookie instead of a bundled bearer token", async () => {
    const fixture = createControlFixture([], { localSessionBootstrap: true });
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });

      const bootstrap = await fixture.api.inject({ method: "POST", url: "/v1/auth/local-session", headers: { origin: "http://127.0.0.1:4313", host: "127.0.0.1:4310" } });
      const cookie = firstSetCookie(bootstrap.headers["set-cookie"]);
      const read = await fixture.api.inject({ method: "GET", url: `/v1/gateways?workspace_id=${IDS.workspace}`, headers: { cookie } });

      expect(bootstrap.statusCode).toBe(204);
      expect(cookie).toContain("nexora_control_session=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
      expect(bootstrap.body).not.toContain("nexora-local-v1");
      expect(read.statusCode).toBe(200);
      expect(read.json().gateways).toHaveLength(1);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("rejects local session bootstrap when Origin is local but the request is not loopback", async () => {
    const fixture = createControlFixture([], { localSessionBootstrap: true });
    try {
      const remoteSocket = await fixture.api.inject({ method: "POST", url: "/v1/auth/local-session", remoteAddress: "203.0.113.10", headers: { origin: "http://127.0.0.1:4313", host: "127.0.0.1:4310" } });
      const remoteHost = await fixture.api.inject({ method: "POST", url: "/v1/auth/local-session", remoteAddress: "127.0.0.1", headers: { origin: "http://127.0.0.1:4313", host: "nexora.example" } });

      expect(remoteSocket.statusCode).toBe(403);
      expect(remoteSocket.headers["set-cookie"]).toBeUndefined();
      expect(remoteSocket.body).not.toContain("nexora-local-v1");
      expect(remoteHost.statusCode).toBe(403);
      expect(remoteHost.headers["set-cookie"]).toBeUndefined();
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("registers and reads workspace-scoped gateway and channel descriptors idempotently", async () => {
    const fixture = createControlFixture();
    try {
      const gatewayCreate = await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      const gatewayReplay = await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      const channelCreate = await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: channel });

      expect(gatewayCreate.statusCode).toBe(202);
      expect(gatewayReplay.statusCode).toBe(202);
      expect(gatewayReplay.json()).toEqual(gatewayCreate.json());
      expect(channelCreate.statusCode).toBe(202);

      const listed = await fixture.api.inject({ method: "GET", url: `/v1/gateways?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      const channelRead = await fixture.api.inject({ method: "GET", url: `/v1/channels/${CHANNEL_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().gateways).toEqual([gateway]);
      expect(channelRead.statusCode).toBe(200);
      expect(channelRead.json().channel).toEqual(channel);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("enforces workspace scope and owner-only descriptor writes", async () => {
    const fixture = createControlFixture();
    try {
      const crossWorkspace = await fixture.api.inject({ method: "GET", url: `/v1/gateways?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader(IDS.otherWorkspace) } });
      const forbidden = await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: { ...commandHeaders("gateway:forbidden"), authorization: `Bearer invalid` }, payload: gateway });
      expect(crossWorkspace.statusCode).toBe(403);
      expect(forbidden.statusCode).toBe(401);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("allows run readers to inspect gateway facts while keeping writes owner-only", async () => {
    const fixture = createControlFixture();
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });

      const read = await fixture.api.inject({ method: "GET", url: `/v1/gateways?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });
      const write = await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: { authorization: viewerHeader(), "idempotency-key": "channel:viewer" }, payload: channel });

      expect(read.statusCode).toBe(200);
      expect(read.json().gateways).toHaveLength(1);
      expect(write.statusCode).toBe(403);
      expect(write.json()).toMatchObject({ code: "SCOPE_DENIED" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("does not reveal cross-workspace session existence through write response codes", async () => {
    const fixture = createControlFixture();
    try {
      const otherGateway = { ...gateway, id: "gateway-other", workspace_id: IDS.otherWorkspace, name: "Other Gateway" };
      const otherChannel = { ...channel, id: "channel-other", workspace_id: IDS.otherWorkspace, gateway_id: otherGateway.id, name: "Other API" };
      const otherSession = { ...session, workspace_id: IDS.otherWorkspace, gateway_id: otherGateway.id, channel_id: otherChannel.id, agent_id: null };
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: { ...commandHeaders("other:gateway:create"), authorization: ownerHeader(IDS.otherWorkspace) }, payload: otherGateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: { ...commandHeaders("other:channel:create"), authorization: ownerHeader(IDS.otherWorkspace) }, payload: otherChannel });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: { ...commandHeaders("other:session:create"), authorization: ownerHeader(IDS.otherWorkspace) }, payload: otherSession });

      const messagePayload = { schema_version: 1, workspace_id: IDS.otherWorkspace, channel_id: otherChannel.id, direction: "outbound", status: "queued", idempotency_key: "other:message", sequence: 0, cursor: "cursor-0", occurred_at: TIME, trace_id: TRACE_ID, sender_ref: IDS.agent, recipient_ref: "user:allowed", content: "hello", content_type: "text", content_hash: "sha256:other" };
      const commandPayload = { schema_version: 1, command_id: COMMAND_ID, workspace_id: IDS.otherWorkspace, session_id: SESSION_ID, kind: "pause", idempotency_key: "other:pause", expected_revision: 1, cursor: "cursor-0", instruction: null, created_at: TIME };
      const missingCommandPayload = { ...commandPayload, session_id: MISSING_SESSION_ID, idempotency_key: "other:pause:missing" };

      const existingMessage = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("other:message"), payload: messagePayload });
      const missingMessage = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${MISSING_SESSION_ID}/messages`, headers: commandHeaders("other:message:missing"), payload: { ...messagePayload, idempotency_key: "other:message:missing" } });
      const existingCommand = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/pause`, headers: commandHeaders("other:pause"), payload: commandPayload });
      const missingCommand = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${MISSING_SESSION_ID}/pause`, headers: commandHeaders("other:pause:missing"), payload: missingCommandPayload });

      for (const response of [existingMessage, missingMessage, existingCommand, missingCommand]) {
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ code: "SCOPE_DENIED" });
      }
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("redacts invalid descriptor secrets from client-facing errors", async () => {
    const fixture = createControlFixture();
    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: "/v1/gateways",
        headers: commandHeaders("gateway:secret-leak"),
        payload: {
          ...gateway,
          endpoint_ref: "https://example.invalid/token/sk-live-secret",
          secret: "/Users/zq/.nexora/private-token",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "SCHEMA_INVALID", message: "Contract validation failed" });
      expect(response.body).not.toContain("sk-live-secret");
      expect(response.body).not.toContain("private-token");
      expect(response.body).not.toContain("/Users/zq");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("requires If-Match and advances descriptor revisions on updates", async () => {
    const fixture = createControlFixture();
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      const missingVersion = await fixture.api.inject({ method: "PUT", url: `/v1/gateways/${GATEWAY_ID}`, headers: { authorization: ownerHeader(), "idempotency-key": "gateway:update:missing" }, payload: { ...gateway, health: "healthy" } });
      const updated = await fixture.api.inject({ method: "PUT", url: `/v1/gateways/${GATEWAY_ID}`, headers: commandHeaders("gateway:update", "1"), payload: { ...gateway, health: "healthy" } });
      const stale = await fixture.api.inject({ method: "PUT", url: `/v1/gateways/${GATEWAY_ID}`, headers: commandHeaders("gateway:update:stale", "1"), payload: { ...gateway, health: "degraded" } });
      const read = await fixture.api.inject({ method: "GET", url: `/v1/gateways/${GATEWAY_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(missingVersion.statusCode).toBe(428);
      expect(updated.statusCode).toBe(202);
      expect(stale.statusCode).toBe(409);
      expect(read.json().gateway).toMatchObject({ health: "healthy", revision: 2 });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("denies outbound messages by default and exposes an append-only delivery receipt", async () => {
    const fixture = createControlFixture([MESSAGE_ID, RECEIPT_ID]);
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: channel });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:create"), payload: session });
      const denied = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:send"), payload: { schema_version: 1, workspace_id: IDS.workspace, channel_id: CHANNEL_ID, direction: "outbound", status: "queued", idempotency_key: "message:send", sequence: 0, cursor: "cursor-0", occurred_at: TIME, trace_id: TRACE_ID, sender_ref: IDS.agent, recipient_ref: "user:blocked", content: "hello", content_type: "text", content_hash: "sha256:test" } });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "POLICY_DENIED" });

      const receipts = await fixture.api.inject({ method: "GET", url: `/v1/deliveries?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(receipts.statusCode).toBe(200);
      expect(receipts.json()).toMatchObject({ schema_version: 1, deliveries: [] });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("supports cursor reads and message idempotent replay after allowlist approval", async () => {
    const fixture = createControlFixture([MESSAGE_ID, RECEIPT_ID]);
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: { ...channel, allowlist_mode: "allowlist_only" } });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:create"), payload: session });
      await fixture.api.inject({ method: "POST", url: "/v1/allowlist", headers: commandHeaders("allowlist:create"), payload: { id: "01YRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: CHANNEL_ID, subject_type: "user", subject_ref: "user:allowed", decision: "allow", reason: "fixture", expires_at: null, created_by: IDS.agent, revision: 1 } });
      const message = { schema_version: 1, workspace_id: IDS.workspace, channel_id: CHANNEL_ID, direction: "outbound", status: "queued", idempotency_key: "message:send", sequence: 0, cursor: "cursor-0", occurred_at: TIME, trace_id: TRACE_ID, sender_ref: IDS.agent, recipient_ref: "user:allowed", content: "hello", content_type: "text", content_hash: "sha256:test" };
      const first = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:send"), payload: message });
      const replay = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:send"), payload: message });
      const page = await fixture.api.inject({ method: "GET", url: `/v1/sessions/${SESSION_ID}/messages?workspace_id=${IDS.workspace}&after=cursor-0&limit=10`, headers: { authorization: ownerHeader() } });
      expect(first.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(replay.json()).toEqual(first.json());
      expect(page.statusCode).toBe(200);
      expect(page.json()).toMatchObject({ schema_version: 1, messages: [], next_cursor: null });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("rejects a changed outbound message payload for a reused idempotency key", async () => {
    const fixture = createControlFixture([MESSAGE_ID, RECEIPT_ID]);
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: { ...channel, allowlist_mode: "allowlist_only" } });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:create"), payload: session });
      await fixture.api.inject({ method: "POST", url: "/v1/allowlist", headers: commandHeaders("allowlist:create"), payload: { id: "01YRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: CHANNEL_ID, subject_type: "user", subject_ref: "user:allowed", decision: "allow", reason: "fixture", expires_at: null, created_by: IDS.agent, revision: 1 } });
      const message = { schema_version: 1, workspace_id: IDS.workspace, channel_id: CHANNEL_ID, direction: "outbound", status: "queued", idempotency_key: "message:send", sequence: 0, cursor: "cursor-0", occurred_at: TIME, trace_id: TRACE_ID, sender_ref: IDS.agent, recipient_ref: "user:allowed", content: "hello", content_type: "text", content_hash: "sha256:test" };

      const first = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:send"), payload: message });
      const conflict = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:send"), payload: { ...message, content: "changed", content_hash: "sha256:changed" } });

      expect(first.statusCode).toBe(202);
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("replays an accepted message after mutable session and allowlist state changes", async () => {
    const fixture = createControlFixture([MESSAGE_ID, RECEIPT_ID]);
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: { ...channel, allowlist_mode: "allowlist_only" } });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:create"), payload: session });
      await fixture.api.inject({ method: "POST", url: "/v1/allowlist", headers: commandHeaders("allowlist:create"), payload: { id: "01YRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: CHANNEL_ID, subject_type: "user", subject_ref: "user:allowed", decision: "allow", reason: "fixture", expires_at: null, created_by: IDS.agent, revision: 1 } });
      const message = { schema_version: 1, workspace_id: IDS.workspace, channel_id: CHANNEL_ID, direction: "outbound", status: "queued", idempotency_key: "message:send:mutable-replay", sequence: 0, cursor: "cursor-0", occurred_at: TIME, trace_id: TRACE_ID, sender_ref: IDS.agent, recipient_ref: "user:allowed", content: "hello", content_type: "text", content_hash: "sha256:mutable-replay" };
      const first = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:send:mutable-replay"), payload: message });

      fixture.database.prepare("UPDATE sessions SET status = 'paused', version = version + 1 WHERE workspace_id = ? AND id = ?").run(IDS.workspace, SESSION_ID);
      fixture.database.prepare("UPDATE channel_allowlist SET expires_at = ? WHERE workspace_id = ? AND channel_id = ? AND subject_ref = ?").run("2026-08-27T03:00:00.000Z", IDS.workspace, CHANNEL_ID, "user:allowed");
      const replay = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:send:mutable-replay"), payload: message });
      const conflict = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:send:mutable-replay"), payload: { ...message, content: "changed", content_hash: "sha256:mutable-replay-changed" } });

      expect(first.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(replay.json()).toEqual(first.json());
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("denies outbound sends when the matching allowlist entry has expired", async () => {
    const fixture = createControlFixture();
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: { ...channel, allowlist_mode: "allowlist_only" } });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:create"), payload: session });
      await fixture.api.inject({ method: "POST", url: "/v1/allowlist", headers: commandHeaders("allowlist:expired"), payload: { id: "01YRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: CHANNEL_ID, subject_type: "user", subject_ref: "user:expired", decision: "allow", reason: "fixture", expires_at: "2026-08-27T03:00:00.000Z", created_by: IDS.agent, revision: 1 } });

      const denied = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:expired"), payload: { schema_version: 1, workspace_id: IDS.workspace, channel_id: CHANNEL_ID, direction: "outbound", status: "queued", idempotency_key: "message:expired", sequence: 0, cursor: "cursor-0", occurred_at: TIME, trace_id: TRACE_ID, sender_ref: IDS.agent, recipient_ref: "user:expired", content: "hello", content_type: "text", content_hash: "sha256:test" } });

      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "POLICY_DENIED" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("appends and replays delivery receipts without duplicating the external fact", async () => {
    const fixture = createControlFixture([MESSAGE_ID, RECEIPT_ID]);
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: channel });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:create"), payload: session });
      await fixture.api.inject({ method: "POST", url: "/v1/allowlist", headers: commandHeaders("allowlist:create"), payload: { id: "01YRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: CHANNEL_ID, subject_type: "user", subject_ref: "user:allowed", decision: "allow", reason: "fixture", expires_at: null, created_by: IDS.agent, revision: 1 } });
      const sent = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:send"), payload: { schema_version: 1, workspace_id: IDS.workspace, channel_id: CHANNEL_ID, direction: "outbound", status: "queued", idempotency_key: "message:send", sequence: 0, cursor: "cursor-0", occurred_at: TIME, trace_id: TRACE_ID, sender_ref: IDS.agent, recipient_ref: "user:allowed", content: "hello", content_type: "text", content_hash: "sha256:test" } });
      const receipt = { schema_version: 1, receipt_id: DELIVERY_ID, workspace_id: IDS.workspace, session_id: SESSION_ID, message_id: sent.json().object_id, idempotency_key: "delivery:sent", status: "sent", provider_receipt_ref: "fixture:delivery-1", delivered_at: null, error_code: null, error_message: null, created_at: TIME, trace_id: TRACE_ID };
      const first = await fixture.api.inject({ method: "POST", url: "/v1/deliveries", headers: commandHeaders("delivery:sent"), payload: receipt });
      const replay = await fixture.api.inject({ method: "POST", url: "/v1/deliveries", headers: commandHeaders("delivery:sent"), payload: receipt });
      const read = await fixture.api.inject({ method: "GET", url: `/v1/deliveries/${DELIVERY_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      const listed = await fixture.api.inject({ method: "GET", url: `/v1/deliveries?workspace_id=${IDS.workspace}&session_id=${SESSION_ID}`, headers: { authorization: ownerHeader() } });

      expect(first.statusCode).toBe(202);
      expect(first.json().status_url).toBe(`/v1/deliveries/${DELIVERY_ID}?workspace_id=${IDS.workspace}`);
      expect(replay.json()).toEqual(first.json());
      expect(read.json().delivery).toEqual(receipt);
      expect(listed.json().deliveries).toHaveLength(2);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("rejects delivery receipts that point at a message from another session", async () => {
    const fixture = createControlFixture([MESSAGE_ID, RECEIPT_ID]);
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: channel });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:create"), payload: session });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:closed:create"), payload: { ...session, id: CLOSED_SESSION_ID, status: "active", cursor: null } });
      await fixture.api.inject({ method: "POST", url: "/v1/allowlist", headers: commandHeaders("allowlist:create"), payload: { id: "01YRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: CHANNEL_ID, subject_type: "user", subject_ref: "user:allowed", decision: "allow", reason: "fixture", expires_at: null, created_by: IDS.agent, revision: 1 } });
      const sent = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:send"), payload: { schema_version: 1, workspace_id: IDS.workspace, channel_id: CHANNEL_ID, direction: "outbound", status: "queued", idempotency_key: "message:send", sequence: 0, cursor: "cursor-0", occurred_at: TIME, trace_id: TRACE_ID, sender_ref: IDS.agent, recipient_ref: "user:allowed", content: "hello", content_type: "text", content_hash: "sha256:test" } });

      const response = await fixture.api.inject({ method: "POST", url: "/v1/deliveries", headers: commandHeaders("delivery:mismatch"), payload: { schema_version: 1, receipt_id: DELIVERY_ID, workspace_id: IDS.workspace, session_id: CLOSED_SESSION_ID, message_id: sent.json().object_id, idempotency_key: "delivery:mismatch", status: "sent", provider_receipt_ref: "fixture:delivery-1", delivered_at: null, error_code: null, error_message: null, created_at: TIME, trace_id: TRACE_ID } });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "SCOPE_DENIED" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("rejects message enqueue for non-active sessions without creating delivery facts", async () => {
    const fixture = createControlFixture([MESSAGE_ID, RECEIPT_ID, SECOND_MESSAGE_ID, DELIVERY_ID]);
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: { ...channel, allowlist_mode: "allowlist_only" } });
      await fixture.api.inject({ method: "POST", url: "/v1/allowlist", headers: commandHeaders("allowlist:create"), payload: { id: "01PRZ3NDEKTSV4RRFFQ69Y5FAV", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: CHANNEL_ID, subject_type: "user", subject_ref: "user:allowed", decision: "allow", reason: "fixture", expires_at: null, created_by: IDS.agent, revision: 1 } });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:closed:create"), payload: { ...session, id: CLOSED_SESSION_ID, status: "closed", cursor: null } });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:error:create"), payload: { ...session, id: ERROR_SESSION_ID, status: "error", cursor: null } });

      for (const target of [{ sessionId: CLOSED_SESSION_ID, idempotencyKey: "message:closed", sequence: 0 }, { sessionId: ERROR_SESSION_ID, idempotencyKey: "message:error", sequence: 1 }] as const) {
        const response = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${target.sessionId}/messages`, headers: commandHeaders(target.idempotencyKey), payload: { schema_version: 1, workspace_id: IDS.workspace, channel_id: CHANNEL_ID, direction: "outbound", status: "queued", idempotency_key: target.idempotencyKey, sequence: target.sequence, cursor: `cursor-${target.sequence}`, occurred_at: TIME, trace_id: TRACE_ID, sender_ref: IDS.agent, recipient_ref: "user:allowed", content: "hello", content_type: "text", content_hash: `sha256:${target.idempotencyKey}` } });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({ code: "INVALID_STATE_TRANSITION" });
      }
      const deliveries = await fixture.api.inject({ method: "GET", url: `/v1/deliveries?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      const closedMessages = await fixture.api.inject({ method: "GET", url: `/v1/sessions/${CLOSED_SESSION_ID}/messages?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      const errorMessages = await fixture.api.inject({ method: "GET", url: `/v1/sessions/${ERROR_SESSION_ID}/messages?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(deliveries.json().deliveries).toEqual([]);
      expect(closedMessages.json().messages).toEqual([]);
      expect(errorMessages.json().messages).toEqual([]);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("pauses, steers, and resumes a session using If-Match and idempotent commands", async () => {
    const fixture = createControlFixture([COMMAND_ID]);
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: channel });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:create"), payload: session });
      const paused = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/pause`, headers: commandHeaders("session:pause", "1"), payload: { schema_version: 1, command_id: COMMAND_ID, workspace_id: IDS.workspace, session_id: SESSION_ID, kind: "pause", idempotency_key: "session:pause", expected_revision: 1, cursor: "cursor-0", instruction: null, created_at: TIME } });
      const steered = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/steer`, headers: commandHeaders("session:steer", "2"), payload: { schema_version: 1, command_id: COMMAND_ID, workspace_id: IDS.workspace, session_id: SESSION_ID, kind: "steer", idempotency_key: "session:steer", expected_revision: 2, cursor: "cursor-0", instruction: "Continue", created_at: TIME } });
      const resumed = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/resume`, headers: commandHeaders("session:resume", "3"), payload: { schema_version: 1, command_id: COMMAND_ID, workspace_id: IDS.workspace, session_id: SESSION_ID, kind: "resume", idempotency_key: "session:resume", expected_revision: 3, cursor: "cursor-0", instruction: null, created_at: TIME } });
      const read = await fixture.api.inject({ method: "GET", url: `/v1/sessions/${SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(paused.statusCode).toBe(202);
      expect(steered.statusCode).toBe(202);
      expect(resumed.statusCode).toBe(202);
      expect(read.statusCode).toBe(200);
      expect(read.json().session).toMatchObject({ id: SESSION_ID, status: "active", revision: 4 });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("keeps the session snapshot aligned with the monotonic message checkpoint", async () => {
    const fixture = createControlFixture([MESSAGE_ID, RECEIPT_ID]);
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: channel });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:create"), payload: session });
      await fixture.api.inject({ method: "POST", url: "/v1/allowlist", headers: commandHeaders("allowlist:create"), payload: { id: "01PRZ3NDEKTSV4RRFFQ69Y5FAV", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: CHANNEL_ID, subject_type: "user", subject_ref: "user:allowed", decision: "allow", reason: "fixture", expires_at: null, created_by: IDS.agent, revision: 1 } });

      const sent = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:checkpoint"), payload: { schema_version: 1, workspace_id: IDS.workspace, channel_id: CHANNEL_ID, direction: "outbound", status: "queued", sequence: 1, cursor: "cursor-1", occurred_at: TIME, trace_id: TRACE_ID, sender_ref: IDS.agent, recipient_ref: "user:allowed", content: "checkpoint", content_type: "text", content_hash: "sha256:checkpoint" } });
      const read = await fixture.api.inject({ method: "GET", url: `/v1/sessions/${SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      const checkpoint = await fixture.api.inject({ method: "GET", url: `/v1/sessions/${SESSION_ID}/cursor?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(sent.statusCode).toBe(202);
      expect(read.json().session).toMatchObject({ cursor: "cursor-1", last_message_id: MESSAGE_ID, last_event_at: TIME, revision: 2 });
      expect(checkpoint.json().checkpoint).toMatchObject({ cursor: "cursor-1", message_id: MESSAGE_ID });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("rejects cursor regressions through session commands and descriptor updates", async () => {
    const fixture = createControlFixture();
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: channel });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:create"), payload: session });

      const command = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/pause`, headers: commandHeaders("session:pause:stale-cursor", "1"), payload: { schema_version: 1, command_id: COMMAND_ID, workspace_id: IDS.workspace, session_id: SESSION_ID, kind: "pause", expected_revision: 1, cursor: "cursor:-1", instruction: null, created_at: TIME } });
      const update = await fixture.api.inject({ method: "PUT", url: `/v1/sessions/${SESSION_ID}`, headers: commandHeaders("session:update:stale-cursor", "1"), payload: { ...session, cursor: "cursor:-1" } });
      const read = await fixture.api.inject({ method: "GET", url: `/v1/sessions/${SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(command.statusCode).toBe(409);
      expect(command.json()).toMatchObject({ code: "VERSION_CONFLICT" });
      expect(update.statusCode).toBe(409);
      expect(update.json()).toMatchObject({ code: "VERSION_CONFLICT" });
      expect(read.json().session).toMatchObject({ cursor: "cursor-0", status: "active", revision: 1 });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("keeps a session bound to its original gateway and channel after facts are appended", async () => {
    const fixture = createControlFixture([MESSAGE_ID, RECEIPT_ID]);
    try {
      const otherGateway = { ...gateway, id: "gateway-openclaw", name: "OpenClaw Gateway" };
      const otherChannel = { ...channel, id: "channel-openclaw", gateway_id: otherGateway.id, name: "OpenClaw API" };
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: channel });
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:other:create"), payload: otherGateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:other:create"), payload: otherChannel });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:create"), payload: session });
      await fixture.api.inject({ method: "POST", url: "/v1/allowlist", headers: commandHeaders("allowlist:create"), payload: { id: "01PRZ3NDEKTSV4RRFFQ69Y5FAV", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, channel_id: CHANNEL_ID, subject_type: "user", subject_ref: "user:allowed", decision: "allow", reason: "fixture", expires_at: null, created_by: IDS.agent, revision: 1 } });
      await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/messages`, headers: commandHeaders("message:binding"), payload: { schema_version: 1, workspace_id: IDS.workspace, channel_id: CHANNEL_ID, direction: "outbound", status: "queued", sequence: 1, cursor: "cursor-1", occurred_at: TIME, trace_id: TRACE_ID, sender_ref: IDS.agent, recipient_ref: "user:allowed", content: "binding", content_type: "text", content_hash: "sha256:binding" } });
      const before = await fixture.api.inject({ method: "GET", url: `/v1/sessions/${SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      const current = before.json().session;

      const update = await fixture.api.inject({ method: "PUT", url: `/v1/sessions/${SESSION_ID}`, headers: commandHeaders("session:update:rebind", String(current.revision)), payload: { ...current, gateway_id: otherGateway.id, channel_id: otherChannel.id } });
      const after = await fixture.api.inject({ method: "GET", url: `/v1/sessions/${SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(update.statusCode).toBe(409);
      expect(update.json()).toMatchObject({ code: "VERSION_CONFLICT" });
      expect(after.json().session).toMatchObject({ gateway_id: GATEWAY_ID, channel_id: CHANNEL_ID });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("rejects generic session updates that bypass the command state machine", async () => {
    const fixture = createControlFixture();
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: channel });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:closed:create"), payload: { ...session, id: CLOSED_SESSION_ID, status: "closed", cursor: null } });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:error:create"), payload: { ...session, id: ERROR_SESSION_ID, status: "error", cursor: null } });

      const response = await fixture.api.inject({ method: "PUT", url: `/v1/sessions/${CLOSED_SESSION_ID}`, headers: commandHeaders("session:update:closed-to-active", "1"), payload: { ...session, id: CLOSED_SESSION_ID, status: "active", cursor: null } });
      const read = await fixture.api.inject({ method: "GET", url: `/v1/sessions/${CLOSED_SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      const errorRecovery = await fixture.api.inject({ method: "PUT", url: `/v1/sessions/${ERROR_SESSION_ID}`, headers: commandHeaders("session:update:error-to-active", "1"), payload: { ...session, id: ERROR_SESSION_ID, status: "active", cursor: null } });
      const readErrorSession = await fixture.api.inject({ method: "GET", url: `/v1/sessions/${ERROR_SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "INVALID_STATE_TRANSITION" });
      expect(read.json().session).toMatchObject({ status: "closed", revision: 1 });
      expect(errorRecovery.statusCode).toBe(409);
      expect(errorRecovery.json()).toMatchObject({ code: "INVALID_STATE_TRANSITION" });
      expect(readErrorSession.json().session).toMatchObject({ status: "error", revision: 1 });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("rejects channel updates that rebind a descriptor to another gateway", async () => {
    const fixture = createControlFixture();
    try {
      const otherGateway = { ...gateway, id: "gateway-openclaw", name: "OpenClaw Gateway" };
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: channel });
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:other:create"), payload: otherGateway });

      const response = await fixture.api.inject({ method: "PUT", url: `/v1/channels/${CHANNEL_ID}`, headers: commandHeaders("channel:update:rebind", "1"), payload: { ...channel, gateway_id: otherGateway.id } });
      const read = await fixture.api.inject({ method: "GET", url: `/v1/channels/${CHANNEL_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "VERSION_CONFLICT" });
      expect(read.json().channel).toMatchObject({ gateway_id: GATEWAY_ID, revision: 1 });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("rejects session commands that do not match the current state", async () => {
    const fixture = createControlFixture();
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: channel });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:create"), payload: session });
      await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:closed:create"), payload: { ...session, id: CLOSED_SESSION_ID, status: "closed", cursor: null } });

      const activeResume = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${SESSION_ID}/resume`, headers: commandHeaders("session:resume:active", "1"), payload: { schema_version: 1, command_id: COMMAND_ID, workspace_id: IDS.workspace, session_id: SESSION_ID, kind: "resume", idempotency_key: "session:resume:active", expected_revision: 1, cursor: "cursor-0", instruction: null, created_at: TIME } });
      const closedSteer = await fixture.api.inject({ method: "POST", url: `/v1/sessions/${CLOSED_SESSION_ID}/steer`, headers: commandHeaders("session:steer:closed", "1"), payload: { schema_version: 1, command_id: COMMAND_ID, workspace_id: IDS.workspace, session_id: CLOSED_SESSION_ID, kind: "steer", idempotency_key: "session:steer:closed", expected_revision: 1, cursor: null, instruction: "Continue", created_at: TIME } });

      expect(activeResume.statusCode).toBe(409);
      expect(activeResume.json()).toMatchObject({ code: "INVALID_STATE_TRANSITION" });
      expect(closedSteer.statusCode).toBe(409);
      expect(closedSteer.json()).toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("rejects a session whose gateway and channel descriptors belong to different gateway branches", async () => {
    const fixture = createControlFixture();
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:create"), payload: gateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:create"), payload: channel });
      const otherGateway = { ...gateway, id: "gateway-openclaw", name: "OpenClaw Gateway" };
      const otherChannel = { ...channel, id: "channel-openclaw", gateway_id: otherGateway.id, name: "OpenClaw API" };
      await fixture.api.inject({ method: "POST", url: "/v1/gateways", headers: commandHeaders("gateway:other:create"), payload: otherGateway });
      await fixture.api.inject({ method: "POST", url: "/v1/channels", headers: commandHeaders("channel:other:create"), payload: otherChannel });

      const response = await fixture.api.inject({ method: "POST", url: "/v1/sessions", headers: commandHeaders("session:mismatched:create"), payload: { ...session, gateway_id: GATEWAY_ID, channel_id: otherChannel.id } });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "SCOPE_DENIED" });
    } finally {
      await closeControlFixture(fixture);
    }
  });
});
