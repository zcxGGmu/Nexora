import {
  ActionIntentSchema,
  ActionReceiptSchema,
  BrowserSessionDescriptorSchema,
  ComputerUseSessionDescriptorSchema,
  HumanApprovalSchema,
  SandboxPolicySchema,
  ScreenshotReceiptSchema,
  TargetAllowlistEntrySchema,
  WorkspaceIdSchema,
  z,
  type ActionIntent,
  type ActionReceipt,
  type BrowserComputerSessionDescriptor,
  type BrowserComputerSessionStatus,
  type HumanApproval,
  type SandboxPolicy,
  type ScreenshotReceipt,
  type TargetAllowlistEntry,
} from "@nexora/contracts";

import { controlApi, readControlProjection } from "./query-client.js";

const LOCAL_WORKSPACE_ALIASES = {
  "ws-demo": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "ws-a": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "ws-b": "01BRZ3NDEKTSV4RRFFQ69G5FAV",
};

const BrowserComputerSessionSchema = z.discriminatedUnion("kind", [BrowserSessionDescriptorSchema, ComputerUseSessionDescriptorSchema]);

const BrowserComputerSessionListResponseSchema = z.object({
  schema_version: z.literal(1).optional(),
  sessions: z.array(BrowserComputerSessionSchema),
}).passthrough();

const BrowserComputerSessionDetailResponseSchema = z.object({
  schema_version: z.literal(1).optional(),
  session: BrowserComputerSessionSchema,
  sandbox_policy: SandboxPolicySchema.nullable(),
  allowlist: z.array(TargetAllowlistEntrySchema),
  approvals: z.array(HumanApprovalSchema),
  action_intents: z.array(ActionIntentSchema),
  action_receipts: z.array(ActionReceiptSchema),
  screenshot_receipts: z.array(ScreenshotReceiptSchema),
}).passthrough();

export type BrowserComputerSessionDetail = {
  readonly schema_version?: 1;
  readonly session: BrowserComputerSessionDescriptor;
  readonly sandbox_policy: SandboxPolicy | null;
  readonly allowlist: readonly TargetAllowlistEntry[];
  readonly approvals: readonly HumanApproval[];
  readonly action_intents: readonly ActionIntent[];
  readonly action_receipts: readonly ActionReceipt[];
  readonly screenshot_receipts: readonly ScreenshotReceipt[];
};

export type BrowserComputerProjection = {
  readonly sessions: readonly BrowserComputerSessionDescriptor[];
  readonly details: readonly BrowserComputerSessionDetail[];
};

export type BrowserComputerWorkspaceResolution =
  | { readonly kind: "resolved"; readonly workspace_id: string }
  | { readonly kind: "invalid"; readonly input: string };

export type BrowserComputerProjectionReader = (path: string, workspace: string) => Promise<unknown>;

export type BrowserComputerPostOptions = {
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
};

export type BrowserComputerCommandWriter = {
  readonly post: (path: string, options: BrowserComputerPostOptions) => Promise<unknown>;
};

export type BrowserComputerCommandKind = "pause" | "resume" | "stop" | "takeover";

export type BrowserComputerSessionCommandInput = {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly kind: BrowserComputerCommandKind;
  readonly expected_revision: number;
  readonly reason: string;
};

export type BrowserComputerApprovalInput = {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly action_intent_id: string;
  readonly expected_revision: number;
  readonly reason: string;
};

export type BrowserComputerReceiptAcknowledgementInput = {
  readonly workspace_id: string;
  readonly receipt_id: string;
  readonly expected_revision: number;
  readonly reason: string;
};

export type BrowserComputerSessionSummary = {
  readonly id: string;
  readonly name: string;
  readonly kind: BrowserComputerSessionDescriptor["kind"];
  readonly mode: BrowserComputerSessionDescriptor["mode"];
  readonly status: BrowserComputerSessionStatus;
  readonly revision: number;
  readonly runId: string;
  readonly gatewaySessionId: string;
  readonly targetRef: string;
  readonly sandboxPolicyId: string;
  readonly lastScreenshotId: string | null;
  readonly takeoverBy: string | null;
};

export type BrowserComputerAllowlistSummary = {
  readonly id: string;
  readonly targetKind: TargetAllowlistEntry["target_kind"];
  readonly targetRef: string;
  readonly decision: TargetAllowlistEntry["decision"];
  readonly expiresAt: string | null;
  readonly active: boolean;
};

export type BrowserComputerActionSummary = {
  readonly id: string;
  readonly actionKind: ActionIntent["action_kind"];
  readonly targetRef: string;
  readonly riskLevel: ActionIntent["risk_level"];
  readonly status: ActionIntent["status"];
  readonly revision: number;
  readonly approvalId: string | null;
};

export type BrowserComputerActionReceiptSummary = {
  readonly id: string;
  readonly actionIntentId: string;
  readonly status: ActionReceipt["status"];
  readonly revision: number;
  readonly externalEffect: false;
  readonly resultRef: string | null;
};

export type BrowserComputerScreenshotReceiptSummary = {
  readonly id: string;
  readonly actionIntentId: string;
  readonly imageRef: string;
  readonly viewport: string;
  readonly imageHash: string;
  readonly redacted: true;
};

export type BrowserComputerControlView = {
  readonly workspaceId: string;
  readonly sessions: readonly BrowserComputerSessionSummary[];
  readonly selected: {
    readonly sessionId: string;
    readonly intentId: string;
    readonly receiptId: string;
    readonly screenshotId: string | null;
  };
  readonly sandbox: {
    readonly policyId: string;
    readonly name: string;
    readonly networkMode: SandboxPolicy["network_mode"] | "missing";
    readonly filesystemMode: SandboxPolicy["filesystem_mode"] | "missing";
    readonly clipboardMode: SandboxPolicy["clipboard_mode"] | "missing";
    readonly credentialMode: SandboxPolicy["credential_mode"] | "missing";
    readonly automationMode: SandboxPolicy["automation_mode"] | "missing";
    readonly targetKinds: readonly string[];
  };
  readonly allowlist: {
    readonly total: number;
    readonly active: number;
    readonly defaultDeny: boolean;
    readonly entries: readonly BrowserComputerAllowlistSummary[];
  };
  readonly approvals: {
    readonly total: number;
    readonly approved: number;
    readonly denied: number;
    readonly latestReason: string;
  };
  readonly actions: {
    readonly total: number;
    readonly pendingApproval: number;
    readonly approved: number;
    readonly policyDenied: number;
    readonly intents: readonly BrowserComputerActionSummary[];
  };
  readonly receipts: {
    readonly actionTotal: number;
    readonly screenshotTotal: number;
    readonly policyDenied: number;
    readonly completed: number;
    readonly acknowledged: number;
    readonly actionReceipts: readonly BrowserComputerActionReceiptSummary[];
    readonly screenshotReceipts: readonly BrowserComputerScreenshotReceiptSummary[];
  };
};

export async function fetchBrowserComputerProjection(workspaceId: string, read: BrowserComputerProjectionReader = readControlProjection): Promise<BrowserComputerProjection> {
  const list = BrowserComputerSessionListResponseSchema.parse(await read("/v1/browser-sessions", workspaceId));
  const details = await Promise.all(list.sessions.map(async (session) => {
    const detail = BrowserComputerSessionDetailResponseSchema.parse(await read(`/v1/browser-sessions/${encodeURIComponent(session.id)}`, workspaceId));
    const normalized: BrowserComputerSessionDetail = { ...detail, schema_version: 1 };
    return normalized;
  }));
  return { sessions: list.sessions, details };
}

export function buildBrowserComputerControlView(projection: BrowserComputerProjection, workspaceId: string, now = new Date().toISOString()): BrowserComputerControlView {
  const details = projection.details.filter((detail) => detail.session.workspace_id === workspaceId);
  const selectedDetail = details[0];
  if (selectedDetail === undefined) return emptyBrowserComputerControlView(workspaceId);
  const actionIntents = selectedDetail.action_intents;
  const actionReceipts = selectedDetail.action_receipts;
  const screenshotReceipts = selectedDetail.screenshot_receipts;
  const selectedIntent = actionIntents[0];
  const selectedReceipt = actionReceipts[0];
  const selectedScreenshot = screenshotReceipts[0];
  return {
    workspaceId,
    sessions: details.map((detail) => sessionSummary(detail.session)),
    selected: {
      sessionId: selectedDetail.session.id,
      intentId: selectedIntent?.id ?? "missing-action-intent",
      receiptId: selectedReceipt?.id ?? "missing-action-receipt",
      screenshotId: selectedScreenshot?.id ?? null,
    },
    sandbox: sandboxSummary(selectedDetail.session.sandbox_policy_id, selectedDetail.sandbox_policy),
    allowlist: allowlistSummary(selectedDetail.allowlist, now),
    approvals: approvalSummary(selectedDetail.approvals),
    actions: {
      total: actionIntents.length,
      pendingApproval: actionIntents.filter((action) => action.status === "pending_approval").length,
      approved: actionIntents.filter((action) => action.status === "approved").length,
      policyDenied: actionIntents.filter((action) => action.status === "policy_denied").length,
      intents: actionIntents.map(actionSummary),
    },
    receipts: {
      actionTotal: actionReceipts.length,
      screenshotTotal: screenshotReceipts.length,
      policyDenied: actionReceipts.filter((receipt) => receipt.status === "policy_denied").length,
      completed: actionReceipts.filter((receipt) => receipt.status === "completed").length,
      acknowledged: actionReceipts.filter((receipt) => receipt.status === "acknowledged").length,
      actionReceipts: actionReceipts.map(actionReceiptSummary),
      screenshotReceipts: screenshotReceipts.map(screenshotReceiptSummary),
    },
  };
}

export async function sendBrowserComputerSessionCommand(input: BrowserComputerSessionCommandInput, idempotencyKey: string, writer: BrowserComputerCommandWriter = controlApi): Promise<void> {
  await writer.post(`/v1/browser-sessions/${encodeURIComponent(input.session_id)}/${input.kind}`, {
    headers: { "Idempotency-Key": idempotencyKey, "If-Match": String(input.expected_revision) },
    json: { schema_version: 1, workspace_id: input.workspace_id, kind: input.kind, reason: input.reason, descriptor_only: true },
  });
}

export async function approveBrowserComputerAction(input: BrowserComputerApprovalInput, idempotencyKey: string, writer: BrowserComputerCommandWriter = controlApi): Promise<void> {
  await writer.post(`/v1/browser-actions/${encodeURIComponent(input.action_intent_id)}/approve`, {
    headers: { "Idempotency-Key": idempotencyKey, "If-Match": String(input.expected_revision) },
    json: { schema_version: 1, workspace_id: input.workspace_id, session_id: input.session_id, reason: input.reason, descriptor_only: true },
  });
}

export async function acknowledgeBrowserComputerReceipt(input: BrowserComputerReceiptAcknowledgementInput, idempotencyKey: string, writer: BrowserComputerCommandWriter = controlApi): Promise<void> {
  await writer.post(`/v1/browser-action-receipts/${encodeURIComponent(input.receipt_id)}/acknowledge`, {
    headers: { "Idempotency-Key": idempotencyKey, "If-Match": String(input.expected_revision) },
    json: { schema_version: 1, workspace_id: input.workspace_id, reason: input.reason, descriptor_only: true },
  });
}

export function resolveBrowserComputerWorkspace(workspaceId: string): BrowserComputerWorkspaceResolution {
  const alias = demoWorkspaceAlias(workspaceId);
  const parsed = WorkspaceIdSchema.safeParse(alias ?? workspaceId);
  if (!parsed.success) return { kind: "invalid", input: workspaceId };
  return { kind: "resolved", workspace_id: parsed.data };
}

export function workspaceIdForBrowserComputerApi(workspaceId: string): string {
  const resolution = resolveBrowserComputerWorkspace(workspaceId);
  switch (resolution.kind) {
    case "resolved":
      return resolution.workspace_id;
    case "invalid":
      throw new Error("Browser/Computer workspace must be a workspace ULID or known local demo alias");
    default:
      return assertNever(resolution);
  }
}

export function shouldUseBrowserComputerFallback(error: unknown): boolean {
  if (hasHttpStatus(error)) return false;
  return error instanceof TypeError && import.meta.env["VITE_NEXORA_BROWSER_COMPUTER_OFFLINE_FIXTURE"] === "1";
}

function sessionSummary(session: BrowserComputerSessionDescriptor): BrowserComputerSessionSummary {
  return {
    id: session.id,
    name: session.name,
    kind: session.kind,
    mode: session.mode,
    status: session.status,
    revision: session.revision,
    runId: session.run_id,
    gatewaySessionId: session.gateway_session_id,
    targetRef: session.kind === "browser" ? session.current_target_ref ?? "browser://url/not-set" : session.active_app_ref ?? session.display_ref,
    sandboxPolicyId: session.sandbox_policy_id,
    lastScreenshotId: session.last_screenshot_id,
    takeoverBy: session.takeover_by,
  };
}

function sandboxSummary(policyId: string, policy: SandboxPolicy | null): BrowserComputerControlView["sandbox"] {
  if (policy === null) {
    return {
      policyId,
      name: "Missing sandbox policy",
      networkMode: "missing",
      filesystemMode: "missing",
      clipboardMode: "missing",
      credentialMode: "missing",
      automationMode: "missing",
      targetKinds: [],
    };
  }
  return {
    policyId: policy.id,
    name: policy.name,
    networkMode: policy.network_mode,
    filesystemMode: policy.filesystem_mode,
    clipboardMode: policy.clipboard_mode,
    credentialMode: policy.credential_mode,
    automationMode: policy.automation_mode,
    targetKinds: policy.allowed_target_kinds,
  };
}

function allowlistSummary(entries: readonly TargetAllowlistEntry[], now: string): BrowserComputerControlView["allowlist"] {
  const summaries = entries.map((entry) => ({
    id: entry.id,
    targetKind: entry.target_kind,
    targetRef: entry.target_ref,
    decision: entry.decision,
    expiresAt: entry.expires_at,
    active: entry.decision === "allow" && (entry.expires_at === null || entry.expires_at > now),
  }));
  return {
    total: entries.length,
    active: summaries.filter((entry) => entry.active).length,
    defaultDeny: true,
    entries: summaries,
  };
}

function approvalSummary(approvals: readonly HumanApproval[]): BrowserComputerControlView["approvals"] {
  const latest = [...approvals].sort((left, right) => right.decided_at.localeCompare(left.decided_at))[0];
  return {
    total: approvals.length,
    approved: approvals.filter((approval) => approval.decision === "approved").length,
    denied: approvals.filter((approval) => approval.decision === "denied").length,
    latestReason: latest?.reason ?? "No approval fact recorded",
  };
}

function actionSummary(action: ActionIntent): BrowserComputerActionSummary {
  return {
    id: action.id,
    actionKind: action.action_kind,
    targetRef: action.target_ref,
    riskLevel: action.risk_level,
    status: action.status,
    revision: action.revision,
    approvalId: action.approval_id,
  };
}

function actionReceiptSummary(receipt: ActionReceipt): BrowserComputerActionReceiptSummary {
  return {
    id: receipt.id,
    actionIntentId: receipt.action_intent_id,
    status: receipt.status,
    revision: receipt.revision,
    externalEffect: receipt.external_effect,
    resultRef: receipt.result_ref,
  };
}

function screenshotReceiptSummary(receipt: ScreenshotReceipt): BrowserComputerScreenshotReceiptSummary {
  return {
    id: receipt.id,
    actionIntentId: receipt.action_intent_id,
    imageRef: receipt.image_ref,
    viewport: `${receipt.viewport_width}x${receipt.viewport_height}`,
    imageHash: receipt.image_hash,
    redacted: receipt.redacted,
  };
}

function emptyBrowserComputerControlView(workspaceId: string): BrowserComputerControlView {
  return {
    workspaceId,
    sessions: [],
    selected: { sessionId: "missing-session", intentId: "missing-action-intent", receiptId: "missing-action-receipt", screenshotId: null },
    sandbox: { policyId: "missing-policy", name: "No sandbox policy", networkMode: "missing", filesystemMode: "missing", clipboardMode: "missing", credentialMode: "missing", automationMode: "missing", targetKinds: [] },
    allowlist: { total: 0, active: 0, defaultDeny: true, entries: [] },
    approvals: { total: 0, approved: 0, denied: 0, latestReason: "No approval fact recorded" },
    actions: { total: 0, pendingApproval: 0, approved: 0, policyDenied: 0, intents: [] },
    receipts: { actionTotal: 0, screenshotTotal: 0, policyDenied: 0, completed: 0, acknowledged: 0, actionReceipts: [], screenshotReceipts: [] },
  };
}

function hasHttpStatus(error: unknown): error is { readonly response: { readonly status: number } } {
  return typeof error === "object"
    && error !== null
    && "response" in error
    && typeof error.response === "object"
    && error.response !== null
    && "status" in error.response
    && typeof error.response.status === "number";
}

function demoWorkspaceAlias(workspaceId: string): string | undefined {
  switch (workspaceId) {
    case "ws-demo":
      return LOCAL_WORKSPACE_ALIASES["ws-demo"];
    case "ws-a":
      return LOCAL_WORKSPACE_ALIASES["ws-a"];
    case "ws-b":
      return LOCAL_WORKSPACE_ALIASES["ws-b"];
    default:
      return undefined;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Browser/Computer workspace resolution ${String(value)}`);
}
