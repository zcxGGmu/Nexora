import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLocalBearerToken } from "../plugins/auth.js";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, TIME, TOKEN_SECRET, seedRun, type ControlFixture } from "./test-fixtures.js";

const BROWSER_SESSION_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const ACTION_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const APPROVAL_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const DUPLICATE_ACK_ID = "01SRZ3NDEKTSV4RRFFQ69S5FAV";
const ACKNOWLEDGED_AGAIN_ID = "01TRZ3NDEKTSV4RRFFQ69T5FAV";

const AcceptedCommandSchema = z.object({ schema_version: z.literal(1), command_id: z.string(), status: z.literal("accepted"), object_type: z.string(), object_id: z.string(), status_url: z.string() }).passthrough();
const ErrorSchema = z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), required_action: z.string() }).passthrough();

describe("C23 Browser/Computer Use API", () => {
  it("Given browser session descriptor When owner posts it twice Then the API accepts idempotent descriptor-only setup", async () => {
    const fixture = createControlFixture();
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture);
      const first = await fixture.api.inject({ method: "POST", url: "/v1/browser-sessions", headers: commandHeaders("browser:session:c23"), payload: browserSession() });
      const replay = await fixture.api.inject({ method: "POST", url: "/v1/browser-sessions", headers: commandHeaders("browser:session:c23"), payload: browserSession() });
      const viewer = await fixture.api.inject({ method: "POST", url: "/v1/browser-sessions", headers: { authorization: viewerHeader(), "idempotency-key": "browser:session:viewer" }, payload: browserSession() });

      expect(first.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(replay.json())).toEqual(AcceptedCommandSchema.parse(first.json()));
      expect(viewer.statusCode).toBe(403);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given browser action targets are not allowlisted When posted Then the API denies without durable action side effects", async () => {
    const fixture = createControlFixture();
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture);
      await fixture.api.inject({ method: "POST", url: "/v1/browser-sessions", headers: commandHeaders("browser:session:seed"), payload: browserSession() });

      const denied = await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:action:deny"), payload: actionIntent("browser://url/https/example.com/docs") });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/browser-sessions/${BROWSER_SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });

      expect(denied.statusCode).toBe(403);
      expect(ErrorSchema.parse(denied.json())).toMatchObject({ code: "POLICY_DENIED", required_action: "approve_browser_target" });
      expect(JSON.stringify(denied.json())).not.toContain("example.com/docs?token");
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ action_receipts: [], screenshot_receipts: [] });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an approved action exists When the session is not active Then new idempotency execution is rejected", async () => {
    const fixture = createControlFixture([APPROVAL_ID]);
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture);
      await fixture.api.inject({ method: "POST", url: "/v1/browser-sessions", headers: commandHeaders("browser:inactive:session"), payload: browserSession() });
      await fixture.api.inject({ method: "POST", url: "/v1/browser-allowlist", headers: commandHeaders("browser:inactive:allowlist"), payload: allowlistEntry() });
      await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:inactive:action"), payload: actionIntent("browser://url/https/example.com/docs") });
      await fixture.api.inject({ method: "POST", url: `/v1/browser-actions/${ACTION_ID}/approve`, headers: commandHeaders("browser:inactive:approval", "1"), payload: approvalBody() });
      await fixture.api.inject({ method: "POST", url: `/v1/browser-sessions/${BROWSER_SESSION_ID}/stop`, headers: commandHeaders("browser:inactive:stop", "1"), payload: commandBody("stop") });

      const executeAfterStop = await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:inactive:execute"), payload: actionIntent("browser://url/https/example.com/docs") });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/browser-sessions/${BROWSER_SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });

      expect(executeAfterStop.statusCode).toBe(409);
      expect(ErrorSchema.parse(executeAfterStop.json())).toMatchObject({ code: "INVALID_STATE_TRANSITION" });
      expect(detail.json()).toMatchObject({ action_receipts: [] });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given client supplied approval id differs from server id When action is approved Then execution still resolves by action scope", async () => {
    const serverApprovalId = "01PRZ3NDEKTSV4RRFFQ69P5FAV";
    const fixture = createControlFixture([serverApprovalId]);
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture);
      await fixture.api.inject({ method: "POST", url: "/v1/browser-sessions", headers: commandHeaders("browser:approval-id:session"), payload: browserSession() });
      await fixture.api.inject({ method: "POST", url: "/v1/browser-allowlist", headers: commandHeaders("browser:approval-id:allowlist"), payload: allowlistEntry() });
      const pendingAction = await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:approval-id:action"), payload: actionIntent("browser://url/https/example.com/docs") });
      const approval = await fixture.api.inject({ method: "POST", url: `/v1/browser-actions/${ACTION_ID}/approve`, headers: commandHeaders("browser:approval-id:approval", "1"), payload: approvalBody() });
      const execute = await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:approval-id:execute"), payload: actionIntent("browser://url/https/example.com/docs") });

      expect(pendingAction.statusCode).toBe(403);
      expect(approval.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(approval.json()).object_id).toBe(serverApprovalId);
      expect(execute.statusCode).toBe(202);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given allowlist and approval-required intent exist When action is approved Then original idempotency replay stays pending", async () => {
    const fixture = createControlFixture([APPROVAL_ID]);
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture);
      await fixture.api.inject({ method: "POST", url: "/v1/browser-sessions", headers: commandHeaders("browser:session:approved"), payload: browserSession() });
      await fixture.api.inject({ method: "POST", url: "/v1/browser-allowlist", headers: commandHeaders("browser:allowlist:approved"), payload: allowlistEntry() });
      const pendingAction = await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:action:approved"), payload: actionIntent("browser://url/https/example.com/docs") });
      await fixture.api.inject({ method: "POST", url: `/v1/browser-actions/${ACTION_ID}/approve`, headers: commandHeaders("browser:approval:approved", "1"), payload: approvalBody() });

      const originalReplay = await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:action:approved"), payload: actionIntent("browser://url/https/example.com/docs") });
      const action = await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:action:approved:execute"), payload: actionIntent("browser://url/https/example.com/docs") });
      const staleStop = await fixture.api.inject({ method: "POST", url: `/v1/browser-sessions/${BROWSER_SESSION_ID}/stop`, headers: commandHeaders("browser:stop:stale", "2"), payload: commandBody("stop") });
      const takeover = await fixture.api.inject({ method: "POST", url: `/v1/browser-sessions/${BROWSER_SESSION_ID}/takeover`, headers: commandHeaders("browser:takeover:c23", "1"), payload: commandBody("takeover") });

      expect(pendingAction.statusCode).toBe(403);
      expect(ErrorSchema.parse(pendingAction.json())).toMatchObject({ code: "POLICY_REVIEW_REQUIRED", required_action: "approve_action" });
      expect(originalReplay.statusCode).toBe(403);
      expect(ErrorSchema.parse(originalReplay.json())).toMatchObject({ code: "POLICY_REVIEW_REQUIRED", required_action: "approve_action" });
      expect(action.statusCode).toBe(202);
      expect(staleStop.statusCode).toBe(409);
      expect(takeover.statusCode).toBe(202);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given accepted Browser/Computer commands When status URLs are fetched Then scoped live descriptors are returned", async () => {
    const fixture = createControlFixture([APPROVAL_ID]);
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture);
      const sessionAccepted = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: "/v1/browser-sessions", headers: commandHeaders("browser:status:session"), payload: browserSession() })).json());
      const allowlistAccepted = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: "/v1/browser-allowlist", headers: commandHeaders("browser:status:allowlist"), payload: allowlistEntry() })).json());
      await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:status:action"), payload: actionIntent("browser://url/https/example.com/docs") });
      const approvalAccepted = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: `/v1/browser-actions/${ACTION_ID}/approve`, headers: commandHeaders("browser:status:approval", "1"), payload: approvalBody() })).json());
      const actionAccepted = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:status:action:execute"), payload: actionIntent("browser://url/https/example.com/docs") })).json());

      const sessionStatus = await fixture.api.inject({ method: "GET", url: sessionAccepted.status_url, headers: { authorization: viewerHeader() } });
      const allowlistStatus = await fixture.api.inject({ method: "GET", url: allowlistAccepted.status_url, headers: { authorization: viewerHeader() } });
      const approvalStatus = await fixture.api.inject({ method: "GET", url: approvalAccepted.status_url, headers: { authorization: viewerHeader() } });
      const actionStatus = await fixture.api.inject({ method: "GET", url: actionAccepted.status_url, headers: { authorization: viewerHeader() } });
      const scopedMiss = await fixture.api.inject({ method: "GET", url: actionAccepted.status_url.replace(IDS.workspace, IDS.otherWorkspace), headers: { authorization: ownerHeader(IDS.otherWorkspace) } });

      expect(sessionStatus.statusCode).toBe(200);
      expect(allowlistStatus.json()).toMatchObject({ schema_version: 1, allowlist_entry: { id: IDS.event1, session_id: BROWSER_SESSION_ID } });
      expect(approvalStatus.json()).toMatchObject({ schema_version: 1, approval: { id: APPROVAL_ID, action_intent_id: ACTION_ID, session_id: BROWSER_SESSION_ID } });
      expect(actionStatus.json()).toMatchObject({ schema_version: 1, action_intent: { id: ACTION_ID, session_id: BROWSER_SESSION_ID, target_ref: "browser://url/https/example.com/docs" } });
      expect(scopedMiss.statusCode).toBe(404);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an action receipt When acknowledged Then a new append-only receipt fact is recorded", async () => {
    const fixture = createControlFixture([APPROVAL_ID, IDS.event2, DUPLICATE_ACK_ID, ACKNOWLEDGED_AGAIN_ID]);
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture);
      await fixture.api.inject({ method: "POST", url: "/v1/browser-sessions", headers: commandHeaders("browser:ack:session"), payload: browserSession() });
      await fixture.api.inject({ method: "POST", url: "/v1/browser-allowlist", headers: commandHeaders("browser:ack:allowlist"), payload: allowlistEntry() });
      await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:ack:action:execute"), payload: actionIntent("browser://url/https/example.com/docs") });
      await fixture.api.inject({ method: "POST", url: `/v1/browser-actions/${ACTION_ID}/approve`, headers: commandHeaders("browser:ack:approval", "1"), payload: approvalBody() });
      await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:ack:action"), payload: actionIntent("browser://url/https/example.com/docs") });

      const missingIfMatch = await fixture.api.inject({ method: "POST", url: `/v1/browser-action-receipts/${ACTION_ID}/acknowledge`, headers: commandHeaders("browser:ack:missing-if-match"), payload: acknowledgementBody() });
      const acknowledged = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: `/v1/browser-action-receipts/${ACTION_ID}/acknowledge`, headers: commandHeaders("browser:ack:receipt", "1"), payload: acknowledgementBody() })).json());
      const replay = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: `/v1/browser-action-receipts/${ACTION_ID}/acknowledge`, headers: commandHeaders("browser:ack:receipt", "1"), payload: acknowledgementBody() })).json());
      const staleAck = await fixture.api.inject({ method: "POST", url: `/v1/browser-action-receipts/${ACTION_ID}/acknowledge`, headers: commandHeaders("browser:ack:stale", "2"), payload: acknowledgementBody() });
      const duplicateAck = await fixture.api.inject({ method: "POST", url: `/v1/browser-action-receipts/${ACTION_ID}/acknowledge`, headers: commandHeaders("browser:ack:duplicate", "1"), payload: acknowledgementBody() });
      const acknowledgedAgain = await fixture.api.inject({ method: "POST", url: `/v1/browser-action-receipts/${IDS.event2}/acknowledge`, headers: commandHeaders("browser:ack:already-acknowledged", "1"), payload: acknowledgementBody() });
      const receiptStatus = await fixture.api.inject({ method: "GET", url: acknowledged.status_url, headers: { authorization: viewerHeader() } });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/browser-sessions/${BROWSER_SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });

      expect(missingIfMatch.statusCode).toBe(428);
      expect(replay).toEqual(acknowledged);
      expect(staleAck.statusCode).toBe(409);
      expect(duplicateAck.statusCode).toBe(409);
      expect(acknowledgedAgain.statusCode).toBe(409);
      expect(receiptStatus.statusCode).toBe(200);
      expect(receiptStatus.json()).toMatchObject({ schema_version: 1, action_receipt: { id: IDS.event2, revision: 1, action_intent_id: ACTION_ID, status: "acknowledged", external_effect: false } });
      expect(detail.json()).toMatchObject({ action_receipts: expect.arrayContaining([expect.objectContaining({ id: ACTION_ID, status: "completed" }), expect.objectContaining({ id: IDS.event2, status: "acknowledged" })]) });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given approval targets an unknown action When posted Then it is rejected before durable approval side effects", async () => {
    const fixture = createControlFixture();
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture);
      await fixture.api.inject({ method: "POST", url: "/v1/browser-sessions", headers: commandHeaders("browser:unknown-approval:session"), payload: browserSession() });

      const unknownApproval = await fixture.api.inject({ method: "POST", url: `/v1/browser-actions/${ACTION_ID}/approve`, headers: commandHeaders("browser:unknown-approval", "1"), payload: approvalBody() });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/browser-sessions/${BROWSER_SESSION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });

      expect(unknownApproval.statusCode).toBe(404);
      expect(ErrorSchema.parse(unknownApproval.json())).toMatchObject({ code: "SCOPE_DENIED" });
      expect(detail.json()).toMatchObject({ approvals: [] });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given unsafe browser targets or idempotency keys When posted Then errors are redacted", async () => {
    const fixture = createControlFixture();
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture);
      const unsafeTarget = await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: commandHeaders("browser:action:ssrf"), payload: actionIntent("browser://url/http/169.254.169.254/latest/meta-data?token=abcd1234") });
      const unsafeKey = await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: { authorization: ownerHeader(), "idempotency-key": "browser:action:token=abcd1234" }, payload: actionIntent("browser://url/https/example.com/docs") });

      expect(unsafeTarget.statusCode).toBe(400);
      expect(unsafeKey.statusCode).toBe(400);
      expect(JSON.stringify(unsafeTarget.json())).not.toContain("abcd1234");
      expect(JSON.stringify(unsafeTarget.json())).not.toContain("169.254.169.254");
      expect(JSON.stringify(unsafeKey.json())).not.toContain("abcd1234");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a non-admin posts unsafe Browser/Computer input When validation would fail Then authorization wins before schema details", async () => {
    const fixture = createControlFixture();
    try {
      seedRun(fixture.database, "running");
      seedGatewaySession(fixture);

      const denied = await fixture.api.inject({ method: "POST", url: "/v1/browser-actions", headers: { authorization: viewerHeader(), "idempotency-key": "browser:viewer:ssrf" }, payload: actionIntent("browser://url/http/169.254.169.254/latest/meta-data?token=abcd1234") });

      expect(denied.statusCode).toBe(403);
      expect(ErrorSchema.parse(denied.json())).toMatchObject({ code: "SCOPE_DENIED" });
      expect(JSON.stringify(denied.json())).not.toContain("169.254.169.254");
      expect(JSON.stringify(denied.json())).not.toContain("abcd1234");
    } finally {
      await closeControlFixture(fixture);
    }
  });
});

function commandHeaders(idempotencyKey: string, ifMatch?: string): Record<string, string> {
  return ifMatch === undefined
    ? { authorization: ownerHeader(), "idempotency-key": idempotencyKey, traceparent: IDS.owner }
    : { authorization: ownerHeader(), "idempotency-key": idempotencyKey, "if-match": ifMatch, traceparent: IDS.owner };
}

function viewerHeader(): string {
  return createLocalBearerToken({ workspace_id: IDS.workspace, actor_id: IDS.owner, role: "Viewer", tokenSecret: TOKEN_SECRET });
}

function browserSession(): object {
  return { id: BROWSER_SESSION_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, run_id: IDS.run, gateway_session_id: IDS.event0, sandbox_policy_id: "sandbox-c23-browser", name: "Browser QA control session", kind: "browser", mode: "foreground", status: "active", current_target_ref: "browser://url/https/example.com/docs", last_screenshot_id: null, takeover_by: null, descriptor_only: true };
}

function actionIntent(targetRef: string): object {
  return { id: ACTION_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, session_id: BROWSER_SESSION_ID, run_id: IDS.run, action_kind: "navigate", target_ref: targetRef, input_summary: "Open approved docs target.", risk_level: "R2", approval_id: APPROVAL_ID, idempotency_key: "browser:action:c23", status: "pending_approval", descriptor_only: true };
}

function allowlistEntry(): object {
  return { id: IDS.event1, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, session_id: BROWSER_SESSION_ID, target_kind: "browser_url", target_ref: "browser://domain/example.com", decision: "allow", reason: "Owner approved docs domain.", expires_at: null, created_by: IDS.owner, descriptor_only: true };
}

function approvalBody(): object {
  return { schema_version: 1, workspace_id: IDS.workspace, session_id: BROWSER_SESSION_ID, reason: "Operator approved descriptor-only browser intent.", descriptor_only: true };
}

function commandBody(kind: "stop" | "takeover"): object {
  return { schema_version: 1, workspace_id: IDS.workspace, kind, reason: "Operator control command.", descriptor_only: true };
}

function acknowledgementBody(): object {
  return { schema_version: 1, workspace_id: IDS.workspace, reason: "Operator acknowledged descriptor-only action receipt.", descriptor_only: true };
}

function seedGatewaySession(fixture: ControlFixture): void {
  fixture.database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES ('gateway-c23-browser', ?, 'Gateway C23 Browser', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME, TIME);
  fixture.database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES ('channel-c23-browser', ?, 'gateway-c23-browser', 'Channel C23 Browser', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  fixture.database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'gateway-c23-browser', 'channel-c23-browser', NULL, ?, NULL, 'foreground', 'active', 'turn-1', NULL, ?, '{}', 1, ?, ?)").run(IDS.event0, IDS.workspace, IDS.run, TIME, TIME, TIME);
}
