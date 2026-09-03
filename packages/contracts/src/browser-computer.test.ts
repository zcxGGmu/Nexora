import { describe, expect, it } from "vitest";
import {
  ActionIntentSchema,
  ActionReceiptSchema,
  BrowserComputerCommandSchema,
  BrowserSessionDescriptorSchema,
  ComputerUseSessionDescriptorSchema,
  HumanApprovalSchema,
  SandboxPolicySchema,
  ScreenshotReceiptSchema,
  TargetAllowlistEntrySchema,
  browserComputerActionPayloadHash,
  canExecuteActionIntent,
  canTransitionBrowserComputerSession,
} from "./browser-computer.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  gatewaySession: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  browserSession: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  computerSession: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  policy: "sandbox-c23-browser",
  allowlist: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  approval: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  intent: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  receipt: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
  screenshot: "01KRZ3NDEKTSV4RRFFQ69K5FAV",
  actor: "01LRZ3NDEKTSV4RRFFQ69L5FAV",
};

const TIME = "2026-09-02T04:00:00.000Z";
const LATER = "2026-09-02T04:05:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const meta = { workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME };

const sandboxPolicy = {
  id: IDS.policy,
  ...meta,
  revision: 1,
  name: "C23 browser sandbox",
  network_mode: "deny_by_default",
  filesystem_mode: "deny",
  clipboard_mode: "deny",
  credential_mode: "deny",
  automation_mode: "approval_required",
  allowed_target_kinds: ["browser_url", "computer_app"],
  descriptor_only: true,
};

const browserSession = {
  id: IDS.browserSession,
  ...meta,
  revision: 1,
  run_id: IDS.run,
  gateway_session_id: IDS.gatewaySession,
  sandbox_policy_id: IDS.policy,
  name: "Browser QA control session",
  kind: "browser",
  mode: "foreground",
  status: "active",
  current_target_ref: "browser://url/https/example.com/docs",
  last_screenshot_id: null,
  takeover_by: null,
  descriptor_only: true,
};

const computerSession = {
  id: IDS.computerSession,
  ...meta,
  revision: 1,
  run_id: IDS.run,
  gateway_session_id: IDS.gatewaySession,
  sandbox_policy_id: IDS.policy,
  name: "Computer use control session",
  kind: "computer",
  platform: "macos",
  mode: "foreground",
  status: "active",
  display_ref: "computer://display/local-main",
  active_app_ref: "computer://app/com.apple.Safari",
  last_screenshot_id: null,
  takeover_by: null,
  descriptor_only: true,
};

const allowlistEntry = {
  id: IDS.allowlist,
  ...meta,
  session_id: IDS.browserSession,
  target_kind: "browser_url",
  target_ref: "browser://domain/example.com",
  decision: "allow",
  reason: "Local QA target approved by owner.",
  expires_at: LATER,
  created_by: IDS.actor,
  descriptor_only: true,
};

const actionIntent = {
  id: IDS.intent,
  ...meta,
  revision: 1,
  session_id: IDS.browserSession,
  run_id: IDS.run,
  action_kind: "navigate",
  target_ref: "browser://url/https/example.com/docs",
  input_summary: "Open docs landing page for local QA.",
  risk_level: "R2",
  approval_id: IDS.approval,
  idempotency_key: "browser:action:c23",
  status: "pending_approval",
  descriptor_only: true,
};

const approval = {
  id: IDS.approval,
  ...meta,
  session_id: IDS.browserSession,
  action_intent_id: IDS.intent,
  action_payload_hash: browserComputerActionPayloadHash(ActionIntentSchema.parse(actionIntent)),
  decision: "approved",
  decided_by: IDS.actor,
  decided_at: TIME,
  reason: "Operator approved a descriptor-only navigation intent.",
  descriptor_only: true,
};

const actionReceipt = {
  id: IDS.receipt,
  ...meta,
  session_id: IDS.browserSession,
  action_intent_id: IDS.intent,
  status: "policy_denied",
  result_ref: null,
  screenshot_id: null,
  error_code: "ALLOWLIST_DENIED",
  error_message: "Target is not allowlisted.",
  external_effect: false,
  descriptor_only: true,
};

const screenshotReceipt = {
  id: IDS.screenshot,
  ...meta,
  session_id: IDS.browserSession,
  action_intent_id: IDS.intent,
  image_ref: "artifact://screenshots/c23/browser-qa.png",
  viewport_width: 1440,
  viewport_height: 900,
  image_hash: HASH,
  redacted: true,
  descriptor_only: true,
};

describe("C23 Browser/Computer Use contracts", () => {
  it("Given browser and computer descriptors When parsed Then sessions are scoped descriptor-only records", () => {
    expect(SandboxPolicySchema.parse(sandboxPolicy)).toMatchObject({ network_mode: "deny_by_default", automation_mode: "approval_required", descriptor_only: true });
    expect(BrowserSessionDescriptorSchema.parse(browserSession)).toMatchObject({ id: IDS.browserSession, run_id: IDS.run, gateway_session_id: IDS.gatewaySession, descriptor_only: true });
    expect(ComputerUseSessionDescriptorSchema.parse(computerSession)).toMatchObject({ id: IDS.computerSession, platform: "macos", descriptor_only: true });
    expect(BrowserSessionDescriptorSchema.safeParse({ ...browserSession, id: "browser-readable-id" }).success).toBe(false);
    expect(BrowserSessionDescriptorSchema.safeParse({ ...browserSession, unknown: "field" }).success).toBe(false);
    expect(SandboxPolicySchema.safeParse({ ...sandboxPolicy, credential_mode: "allow" }).success).toBe(false);
  });

  it("Given unsafe targets When parsed Then SSRF credentials local files and path traversal are rejected", () => {
    expect(ActionIntentSchema.parse(actionIntent)).toMatchObject({ target_ref: actionIntent.target_ref, descriptor_only: true });
    expect(ActionIntentSchema.safeParse({ ...actionIntent, target_ref: "browser://url/http/169.254.169.254/latest/meta-data" }).success).toBe(false);
    expect(ActionIntentSchema.safeParse({ ...actionIntent, target_ref: "browser://url/https/10.0.0.1/admin" }).success).toBe(false);
    expect(ActionIntentSchema.safeParse({ ...actionIntent, target_ref: "browser://url/https/user:password@example.com" }).success).toBe(false);
    expect(ActionIntentSchema.safeParse({ ...actionIntent, target_ref: "file:///Users/zq/Desktop/private.txt" }).success).toBe(false);
    expect(ActionIntentSchema.safeParse({ ...actionIntent, target_ref: "browser://url/https/example.com/%2e%2e/private" }).success).toBe(false);
    expect(ActionIntentSchema.safeParse({ ...actionIntent, input_summary: "Use secret://browser/live-token" }).success).toBe(false);
    expect(TargetAllowlistEntrySchema.safeParse({ ...allowlistEntry, target_ref: "browser://domain/169.254.169.254" }).success).toBe(false);
  });

  it("Given no allowlist or approval When evaluating an action Then execution is denied by default", () => {
    const parsedAction = ActionIntentSchema.parse(actionIntent);
    const parsedAllowlist = TargetAllowlistEntrySchema.parse(allowlistEntry);
    const expiredAllowlist = TargetAllowlistEntrySchema.parse({ ...allowlistEntry, expires_at: "2026-09-02T03:59:00.000Z" });
    const parsedApproval = HumanApprovalSchema.parse(approval);

    expect(canExecuteActionIntent(parsedAction, [], null, TIME)).toEqual({ allowed: false, code: "POLICY_DENIED", required_action: "approve_browser_target" });
    expect(canExecuteActionIntent(parsedAction, [parsedAllowlist], null, TIME)).toEqual({ allowed: false, code: "APPROVAL_REQUIRED", required_action: "approve_action" });
    expect(canExecuteActionIntent(parsedAction, [expiredAllowlist], parsedApproval, TIME)).toEqual({ allowed: false, code: "POLICY_DENIED", required_action: "approve_browser_target" });
    expect(canExecuteActionIntent(parsedAction, [parsedAllowlist], parsedApproval, TIME)).toEqual({ allowed: true, code: "POLICY_ALLOWED", required_action: "record_descriptor_receipt" });
  });

  it("Given an action intent When hashing payload semantics Then the SHA-256 value is stable and canonical", () => {
    expect(browserComputerActionPayloadHash(ActionIntentSchema.parse(actionIntent))).toBe("sha256:ea8defc75b305fa79c7ff09c801b69bc6a0a4ee7b1be61baed87551889635cfe");
  });

  it("Given receipts and screenshots When parsed Then they remain append-only descriptor facts without external effects", () => {
    expect(ActionReceiptSchema.parse(actionReceipt)).toMatchObject({ status: "policy_denied", external_effect: false, descriptor_only: true });
    expect(ScreenshotReceiptSchema.parse(screenshotReceipt)).toMatchObject({ viewport_width: 1440, viewport_height: 900, redacted: true });
    expect(ActionReceiptSchema.safeParse({ ...actionReceipt, external_effect: true }).success).toBe(false);
    expect(ActionReceiptSchema.safeParse({ ...actionReceipt, result_ref: "file:///tmp/screenshot.png" }).success).toBe(false);
    expect(ScreenshotReceiptSchema.safeParse({ ...screenshotReceipt, image_ref: "secret://screenshots/raw-token" }).success).toBe(false);
    expect(HumanApprovalSchema.safeParse({ ...approval, reason: "Approve after reading token=abcd1234" }).success).toBe(false);
  });

  it("Given control commands When parsed Then pause resume stop and takeover require valid session state", () => {
    expect(BrowserComputerCommandSchema.parse({ schema_version: 1, command_id: IDS.receipt, workspace_id: IDS.workspace, session_id: IDS.browserSession, kind: "takeover", idempotency_key: "browser:takeover:c23", expected_revision: 1, reason: "Operator takes over local control.", descriptor_only: true, created_at: TIME })).toMatchObject({ kind: "takeover", descriptor_only: true });
    expect(canTransitionBrowserComputerSession("active", "paused")).toBe(true);
    expect(canTransitionBrowserComputerSession("paused", "active")).toBe(true);
    expect(canTransitionBrowserComputerSession("active", "stopped")).toBe(true);
    expect(canTransitionBrowserComputerSession("stopped", "active")).toBe(false);
    expect(canTransitionBrowserComputerSession("takeover_requested", "active")).toBe(false);
    expect(BrowserComputerCommandSchema.safeParse({ schema_version: 1, command_id: IDS.receipt, workspace_id: IDS.workspace, session_id: IDS.browserSession, kind: "resume", idempotency_key: "browser:resume:token=abcd1234", expected_revision: 1, reason: null, descriptor_only: true, created_at: TIME }).success).toBe(false);
  });
});
