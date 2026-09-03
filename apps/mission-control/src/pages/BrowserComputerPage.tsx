import { CircleAlert, CircleCheck, CircleDashed, Eye, Hand, MonitorCog, MousePointerClick, Pause, ShieldCheck, Square } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { JSX } from "react";

import {
  acknowledgeBrowserComputerReceipt,
  approveBrowserComputerAction,
  buildBrowserComputerControlView,
  fetchBrowserComputerProjection,
  resolveBrowserComputerWorkspace,
  sendBrowserComputerSessionCommand,
  shouldUseBrowserComputerFallback,
  type BrowserComputerCommandKind,
  type BrowserComputerControlView,
} from "../app/browser-computer-api.js";

export type { BrowserComputerControlView } from "../app/browser-computer-api.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const GATEWAY_SESSION_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const BROWSER_SESSION_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const ACTION_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const RECEIPT_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const SCREENSHOT_ID = "01GRZ3NDEKTSV4RRFFQ69G5FAV";

export const browserComputerFixture: BrowserComputerControlView = {
  workspaceId: WORKSPACE_ID,
  sessions: [
    {
      id: BROWSER_SESSION_ID,
      name: "Browser QA control session",
      kind: "browser",
      mode: "foreground",
      status: "active",
      revision: 1,
      runId: RUN_ID,
      gatewaySessionId: GATEWAY_SESSION_ID,
      targetRef: "browser://url/https/example.com/docs",
      sandboxPolicyId: "sandbox-c23-browser",
      lastScreenshotId: SCREENSHOT_ID,
      takeoverBy: null,
    },
  ],
  selected: {
    sessionId: BROWSER_SESSION_ID,
    intentId: ACTION_ID,
    receiptId: RECEIPT_ID,
    screenshotId: SCREENSHOT_ID,
  },
  sandbox: {
    policyId: "sandbox-c23-browser",
    name: "C23 browser sandbox",
    networkMode: "deny_by_default",
    filesystemMode: "deny",
    clipboardMode: "deny",
    credentialMode: "deny",
    automationMode: "approval_required",
    targetKinds: ["browser_url", "computer_app"],
  },
  allowlist: {
    total: 1,
    active: 1,
    defaultDeny: true,
    entries: [
      {
        id: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
        targetKind: "browser_url",
        targetRef: "browser://domain/example.com",
        decision: "allow",
        expiresAt: null,
        active: true,
      },
    ],
  },
  approvals: {
    total: 1,
    approved: 1,
    denied: 0,
    latestReason: "Operator approved descriptor-only browser intent.",
  },
  actions: {
    total: 1,
    pendingApproval: 1,
    approved: 0,
    policyDenied: 0,
    intents: [
      {
        id: ACTION_ID,
        actionKind: "navigate",
        targetRef: "browser://url/https/example.com/docs",
        riskLevel: "R2",
        status: "pending_approval",
        revision: 1,
        approvalId: null,
      },
    ],
  },
  receipts: {
    actionTotal: 1,
    screenshotTotal: 1,
    policyDenied: 0,
    completed: 1,
    acknowledged: 0,
    actionReceipts: [
      {
        id: RECEIPT_ID,
        actionIntentId: ACTION_ID,
        status: "completed",
        revision: 1,
        externalEffect: false,
        resultRef: "artifact://receipts/c23/action.json",
      },
    ],
    screenshotReceipts: [
      {
        id: SCREENSHOT_ID,
        actionIntentId: ACTION_ID,
        imageRef: "artifact://screenshots/c23/browser-qa.png",
        viewport: "1440x900",
        imageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        redacted: true,
      },
    ],
  },
};

const BROWSER_COMPUTER_UNAVAILABLE_FEEDBACK = "Browser/Computer control data unavailable; showing local planning fixture. No external connection was attempted.";

export function BrowserComputerPage(props: { readonly workspaceId?: string; readonly view?: BrowserComputerControlView }): JSX.Element {
  if (props.view !== undefined) return <BrowserComputerPageContent view={props.view} />;
  return <LiveBrowserComputerPage workspaceId={props.workspaceId ?? "ws-demo"} />;
}

function LiveBrowserComputerPage(props: { readonly workspaceId: string }): JSX.Element {
  const workspaceResolution = resolveBrowserComputerWorkspace(props.workspaceId);
  const apiWorkspaceId = workspaceResolution.kind === "resolved" ? workspaceResolution.workspace_id : null;
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [acknowledgedReceiptIds, setAcknowledgedReceiptIds] = useState<ReadonlySet<string>>(new Set<string>());
  const query = useQuery({
    queryKey: ["browser-computer-control", apiWorkspaceId],
    queryFn: () => {
      if (apiWorkspaceId === null) throw new Error("Browser/Computer workspace scope is invalid");
      return fetchBrowserComputerProjection(apiWorkspaceId);
    },
    enabled: apiWorkspaceId !== null,
  });
  const command = useMutation({
    mutationFn: async (input: { readonly sessionId: string; readonly kind: BrowserComputerCommandKind; readonly view: BrowserComputerControlView }) => {
      if (apiWorkspaceId === null) throw new Error("Browser/Computer workspace scope is invalid");
      const session = input.view.sessions.find((candidate) => candidate.id === input.sessionId);
      if (session === undefined) throw new Error("Browser/Computer session is unavailable");
      await sendBrowserComputerSessionCommand(
        {
          workspace_id: apiWorkspaceId,
          session_id: session.id,
          kind: input.kind,
          expected_revision: session.revision,
          reason: reasonForSessionCommand(input.kind),
        },
        `browser-computer:${input.kind}:${session.id}:${crypto.randomUUID()}`,
      );
    },
    onSuccess: async (_data, input) => {
      setFeedback(`${input.kind} accepted; rereading Browser/Computer projection.`);
      await queryClient.invalidateQueries({ queryKey: ["browser-computer-control", apiWorkspaceId] });
    },
    onError: () => setFeedback("Browser/Computer command was not accepted. Refresh the projection and check revision."),
  });
  const approval = useMutation({
    mutationFn: async (input: { readonly intentId: string; readonly view: BrowserComputerControlView }) => {
      if (apiWorkspaceId === null) throw new Error("Browser/Computer workspace scope is invalid");
      const intent = input.view.actions.intents.find((candidate) => candidate.id === input.intentId);
      if (intent === undefined) throw new Error("Browser/Computer action intent is unavailable");
      await approveBrowserComputerAction(
        {
          workspace_id: apiWorkspaceId,
          session_id: input.view.selected.sessionId,
          action_intent_id: intent.id,
          expected_revision: intent.revision,
          reason: "Operator approved descriptor-only browser/computer intent.",
        },
        `browser-computer:approve:${intent.id}:${crypto.randomUUID()}`,
      );
    },
    onSuccess: async () => {
      setFeedback("Approval accepted; rereading action and approval facts.");
      await queryClient.invalidateQueries({ queryKey: ["browser-computer-control", apiWorkspaceId] });
    },
    onError: () => setFeedback("Approval was not accepted. Refresh action revision and retry."),
  });
  const acknowledgement = useMutation({
    mutationFn: async (input: { readonly receiptId: string; readonly revision: number }) => {
      if (apiWorkspaceId === null) throw new Error("Browser/Computer workspace scope is invalid");
      await acknowledgeBrowserComputerReceipt(
        {
          workspace_id: apiWorkspaceId,
          receipt_id: input.receiptId,
          expected_revision: input.revision,
          reason: "Operator acknowledged descriptor-only action receipt.",
        },
        `browser-computer:ack:${input.receiptId}:${crypto.randomUUID()}`,
      );
    },
    onSuccess: async (_data, input) => {
      setAcknowledgedReceiptIds((current) => new Set<string>([...current, input.receiptId]));
      setFeedback("Acknowledgement accepted; rereading action receipt facts.");
      await queryClient.invalidateQueries({ queryKey: ["browser-computer-control", apiWorkspaceId] });
    },
    onError: () => setFeedback("Acknowledgement was not accepted. Refresh receipt facts and retry."),
  });

  if (apiWorkspaceId === null) return <BrowserComputerState title="Invalid Browser/Computer workspace scope" message="Browser/Computer control data requires a canonical workspace ULID or the explicit local demo alias. No API request or external connection was attempted." alert />;
  if (query.isPending) return <BrowserComputerState title="Loading Browser/Computer control data" message="Reading workspace-scoped sandbox policies, sessions, allowlists, approvals, action receipts, and screenshot receipts." />;
  if (query.isError) {
    if (shouldUseBrowserComputerFallback(query.error)) return <BrowserComputerPageContent view={browserComputerFixture} feedback={BROWSER_COMPUTER_UNAVAILABLE_FEEDBACK} />;
    return <BrowserComputerState title="Browser/Computer control data denied" message="The control API rejected this workspace-scoped Browser/Computer projection. Local fixtures are not shown for authorization, scope, or revision errors." alert onRetry={() => void query.refetch()} />;
  }
  const view = buildBrowserComputerControlView(query.data, apiWorkspaceId);
  const commandPending = command.isPending || approval.isPending || acknowledgement.isPending;
  return (
    <BrowserComputerPageContent
      view={view}
      acknowledgedReceiptIds={acknowledgedReceiptIds}
      commandPending={commandPending}
      feedback={feedback}
      onAcknowledgeReceipt={(receiptId) => {
        const receipt = view.receipts.actionReceipts.find((candidate) => candidate.id === receiptId);
        if (receipt !== undefined) acknowledgement.mutate({ receiptId, revision: receipt.revision });
      }}
      onApproveAction={(intentId) => approval.mutate({ intentId, view })}
      onSessionCommand={(sessionId, kind) => command.mutate({ sessionId, kind, view })}
    />
  );
}

export function BrowserComputerPageContent(props: {
  readonly view: BrowserComputerControlView;
  readonly acknowledgedReceiptIds?: ReadonlySet<string>;
  readonly commandPending?: boolean;
  readonly feedback?: string | null;
  readonly onSessionCommand?: (sessionId: string, command: BrowserComputerCommandKind) => void;
  readonly onApproveAction?: (intentId: string) => void;
  readonly onAcknowledgeReceipt?: (receiptId: string) => void;
  readonly onRetry?: () => void;
}): JSX.Element {
  const selectedSession = props.view.sessions.find((session) => session.id === props.view.selected.sessionId) ?? props.view.sessions[0];
  const selectedIntent = props.view.actions.intents.find((intent) => intent.id === props.view.selected.intentId) ?? props.view.actions.intents[0];
  const selectedReceipt = props.view.receipts.actionReceipts.find((receipt) => receipt.id === props.view.selected.receiptId) ?? props.view.receipts.actionReceipts[0];
  const selectedScreenshot = props.view.receipts.screenshotReceipts.find((receipt) => receipt.id === props.view.selected.screenshotId) ?? props.view.receipts.screenshotReceipts[0];
  const acknowledged = selectedReceipt === undefined ? false : props.acknowledgedReceiptIds?.has(selectedReceipt.id) === true;
  return (
    <div className="page-stack browser-computer-page">
      <header className="page-header">
        <p className="section-kicker">Browser Control</p>
        <h1 id="route-title">Browser / Computer Use</h1>
        <p>Coordinate sandboxed browser and desktop-use descriptors, approvals, and receipts without executing real automation.</p>
      </header>
      <section className="state-plane state-plane--info" aria-label="Browser Computer boundary">
        <div className="state-plane__title"><MonitorCog aria-hidden="true" size={18} /><span>Descriptor-only control</span><span className="status-badge status-badge--info">No external connection</span></div>
        <p>No real browser or desktop action is executed. This page records local sandbox policy, allowlist, approval, action receipt, and screenshot receipt facts only.</p>
      </section>
      <section className="workspace-grid workspace-grid--wide">
        <section className="panel" aria-labelledby="browser-session-title">
          <div className="panel-header"><h2 id="browser-session-title">Sessions</h2><span className="mono meta">{props.view.sessions.length}</span></div>
          <div className="row-list">
            {props.view.sessions.length === 0 ? <div className="padded-row meta">No browser or computer sessions are registered for this workspace.</div> : props.view.sessions.map((session) => (
              <article className="work-row browser-computer-session-row" key={session.id}>
                <div>
                  <h3>{session.name} <span className="row-meta">{session.kind} | {session.mode}</span></h3>
                  <div className="row-meta mono">{session.id} | revision {session.revision} | run {session.runId}</div>
                  <p>Cursor session {session.gatewaySessionId} | target {shortRef(session.targetRef)} | screenshot {session.lastScreenshotId ?? "none"}</p>
                </div>
                <div className="button-row">
                  <StatusBadge tone={toneForSession(session.status)} label={session.status} />
                  {session.status === "paused" ? <button className="row-action" data-control-kind="resume" type="button" disabled={props.commandPending === true || props.onSessionCommand === undefined} onClick={() => props.onSessionCommand?.(session.id, "resume")}><CircleCheck aria-hidden="true" size={15} />Resume</button> : <button className="row-action" data-control-kind="pause" type="button" disabled={props.commandPending === true || props.onSessionCommand === undefined || session.status !== "active"} onClick={() => props.onSessionCommand?.(session.id, "pause")}><Pause aria-hidden="true" size={15} />Pause</button>}
                  <button className="row-action" data-control-kind="stop" type="button" disabled={props.commandPending === true || props.onSessionCommand === undefined || session.status === "stopped"} onClick={() => props.onSessionCommand?.(session.id, "stop")}><Square aria-hidden="true" size={15} />Stop</button>
                  <button className="row-action" data-control-kind="takeover" type="button" disabled={props.commandPending === true || props.onSessionCommand === undefined || session.status === "stopped" || session.status === "takeover_requested"} onClick={() => props.onSessionCommand?.(session.id, "takeover")}><Hand aria-hidden="true" size={15} />Takeover</button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="panel" aria-labelledby="browser-sandbox-title">
          <div className="panel-header"><h2 id="browser-sandbox-title">Sandbox policy</h2><ShieldCheck aria-hidden="true" size={18} /></div>
          <dl className="fact-grid">
            <div><dt>Policy</dt><dd>{props.view.sandbox.name} | {props.view.sandbox.policyId}</dd></div>
            <div><dt>Network</dt><dd>{props.view.sandbox.networkMode}</dd></div>
            <div><dt>Filesystem</dt><dd>{props.view.sandbox.filesystemMode}</dd></div>
            <div><dt>Clipboard</dt><dd>{props.view.sandbox.clipboardMode}</dd></div>
            <div><dt>Credentials</dt><dd>{props.view.sandbox.credentialMode}</dd></div>
            <div><dt>Automation</dt><dd>{props.view.sandbox.automationMode}</dd></div>
            <div><dt>Targets</dt><dd>{props.view.sandbox.targetKinds.length === 0 ? "none" : props.view.sandbox.targetKinds.join(", ")}</dd></div>
          </dl>
        </section>
      </section>
      <section className="workspace-grid">
        <section className="panel" aria-labelledby="browser-allowlist-title">
          <div className="panel-header"><h2 id="browser-allowlist-title">Allowlist</h2><span className="mono meta">{props.view.allowlist.active}/{props.view.allowlist.total} active</span></div>
          <div className="row-list">
            {props.view.allowlist.entries.length === 0 ? <div className="padded-row meta">Default deny is active and no targets are allowlisted.</div> : props.view.allowlist.entries.map((entry) => (
              <article className="work-row" key={entry.id}>
                <div><h3>{entry.targetKind}</h3><div className="row-meta mono">{entry.id}</div><p>{shortRef(entry.targetRef)} | expires {entry.expiresAt ?? "never"}</p></div>
                <StatusBadge tone={entry.active ? "success" : "warning"} label={entry.active ? "active" : "expired"} />
              </article>
            ))}
          </div>
          <div className="padded-row"><p className="row-meta">Default deny: <strong>{props.view.allowlist.defaultDeny ? "yes" : "no"}</strong>. Unsafe outbound targets remain blocked before action execution.</p></div>
        </section>
        <section className="panel" aria-labelledby="browser-approval-title">
          <div className="panel-header"><h2 id="browser-approval-title">Human approval</h2><span className="mono meta">{props.view.approvals.approved}/{props.view.approvals.total} approved</span></div>
          <dl className="fact-grid">
            <div><dt>Pending actions</dt><dd>{props.view.actions.pendingApproval}</dd></div>
            <div><dt>Denied approvals</dt><dd>{props.view.approvals.denied}</dd></div>
            <div><dt>Latest reason</dt><dd>{props.view.approvals.latestReason}</dd></div>
            <div><dt>Selected intent</dt><dd>{selectedIntent?.id ?? "missing-action-intent"}</dd></div>
          </dl>
          <div className="button-row padded-row" aria-label="Browser Computer approval controls">
            <button className="row-action" data-control-kind="approve" type="button" disabled={props.commandPending === true || props.onApproveAction === undefined || selectedIntent === undefined} onClick={() => { if (selectedIntent !== undefined) props.onApproveAction?.(selectedIntent.id); }}><CircleCheck aria-hidden="true" size={15} />Approve</button>
          </div>
        </section>
      </section>
      <section className="workspace-grid workspace-grid--wide">
        <section className="panel" aria-labelledby="browser-actions-title">
          <div className="panel-header"><h2 id="browser-actions-title">Action receipts</h2><span className="mono meta">{props.view.receipts.actionTotal} facts</span></div>
          <div className="row-list">
            {props.view.receipts.actionReceipts.length === 0 ? <div className="padded-row meta">No action receipts are recorded yet.</div> : props.view.receipts.actionReceipts.map((receipt) => (
              <article className="work-row" key={receipt.id}>
                <div><h3>{receipt.status}</h3><div className="row-meta mono">{receipt.id} | action {receipt.actionIntentId}</div><p>External effect: {String(receipt.externalEffect)} | result {receipt.resultRef ?? "none"}</p></div>
                <StatusBadge tone={receipt.status === "policy_denied" ? "danger" : receipt.status === "failed" ? "danger" : "success"} label={receipt.status} />
              </article>
            ))}
          </div>
          <div className="button-row padded-row" aria-label="Browser Computer receipt controls">
            <button className="row-action" data-control-kind="acknowledge" type="button" disabled={props.commandPending === true || props.onAcknowledgeReceipt === undefined || selectedReceipt === undefined || acknowledged} onClick={() => { if (selectedReceipt !== undefined) props.onAcknowledgeReceipt?.(selectedReceipt.id); }}><MousePointerClick aria-hidden="true" size={15} />Acknowledge</button>
          </div>
        </section>
        <section className="panel" aria-labelledby="browser-screenshot-title">
          <div className="panel-header"><h2 id="browser-screenshot-title">Screenshot receipts</h2><span className="mono meta">{props.view.receipts.screenshotTotal} redacted</span></div>
          {selectedScreenshot === undefined ? <div className="padded-row meta">No screenshot receipts are recorded yet.</div> : <dl className="fact-grid">
            <div><dt>Image ref</dt><dd>{selectedScreenshot.imageRef}</dd></div>
            <div><dt>Viewport</dt><dd>{selectedScreenshot.viewport}</dd></div>
            <div><dt>Hash</dt><dd>{selectedScreenshot.imageHash}</dd></div>
            <div><dt>Redacted</dt><dd>{String(selectedScreenshot.redacted)}</dd></div>
          </dl>}
          <div className="padded-row"><p className="row-meta"><Eye aria-hidden="true" size={14} /> Screenshots are redacted artifact refs, not live browser pixels.</p></div>
        </section>
      </section>
      <section className="panel" aria-labelledby="browser-action-intents-title">
        <div className="panel-header"><h2 id="browser-action-intents-title">Action intents</h2><span className="mono meta">{props.view.actions.total}</span></div>
        <div className="row-list">
          {props.view.actions.intents.length === 0 ? <div className="padded-row meta">No action intents are queued for approval.</div> : props.view.actions.intents.map((intent) => (
            <article className="work-row" key={intent.id}>
              <div><h3>{intent.actionKind} | {intent.riskLevel}</h3><div className="row-meta mono">{intent.id} | revision {intent.revision}</div><p>{shortRef(intent.targetRef)} | approval {intent.approvalId ?? "pending"}</p></div>
              <StatusBadge tone={intent.status === "policy_denied" ? "danger" : intent.status === "pending_approval" ? "warning" : "success"} label={intent.status} />
            </article>
          ))}
        </div>
      </section>
      {selectedSession === undefined ? null : <p className="meta">Selected session {selectedSession.id} stays workspace-scoped to {props.view.workspaceId}.</p>}
      {props.feedback === undefined || props.feedback === null ? null : <p className="meta" role="status" aria-live="polite">{props.feedback}</p>}
      {props.onRetry === undefined ? null : <button className="row-action" type="button" onClick={props.onRetry}>Retry Browser/Computer API</button>}
      <section className="state-plane state-plane--warning" aria-label="Browser Computer policy">
        <div className="state-plane__title"><CircleAlert aria-hidden="true" size={18} /><span>Approval and allowlist required</span></div>
        <p>Allowlist denial, approval requirements, and receipt acknowledgements are local control-plane facts. Real website navigation, clicks, desktop takeover, file access, and credential reads remain disabled.</p>
      </section>
    </div>
  );
}

function BrowserComputerState(props: { readonly title: string; readonly message: string; readonly alert?: boolean; readonly onRetry?: () => void }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Browser Control</p>
        <h1 id="route-title">Browser / Computer Use</h1>
      </header>
      <section className="state-plane state-plane--info" role={props.alert ? "alert" : undefined}>
        <div className="state-plane__title"><CircleDashed aria-hidden="true" size={18} /><span>{props.title}</span><span className="status-badge status-badge--info">No external connection</span></div>
        <p>{props.message}</p>
        {props.onRetry === undefined ? null : <button className="row-action" type="button" onClick={props.onRetry}>Retry</button>}
      </section>
    </div>
  );
}

function reasonForSessionCommand(kind: BrowserComputerCommandKind): string {
  switch (kind) {
    case "pause":
      return "Operator paused descriptor-only browser/computer session.";
    case "resume":
      return "Operator resumed descriptor-only browser/computer session.";
    case "stop":
      return "Operator stopped descriptor-only browser/computer session.";
    case "takeover":
      return "Operator requested descriptor-only manual takeover.";
    default:
      return assertNever(kind);
  }
}

function toneForSession(status: BrowserComputerControlView["sessions"][number]["status"]): "success" | "warning" | "danger" | "info" {
  if (status === "active") return "success";
  if (status === "paused" || status === "takeover_requested") return "warning";
  if (status === "error") return "danger";
  return "info";
}

function StatusBadge(props: { readonly tone: "success" | "warning" | "danger" | "info"; readonly label: string }): JSX.Element {
  const Icon = props.tone === "success" ? CircleCheck : props.tone === "warning" ? CircleAlert : props.tone === "danger" ? CircleAlert : CircleDashed;
  return <span className={`status-badge status-badge--${props.tone}`}><Icon aria-hidden="true" size={14} />{props.label}</span>;
}

function shortRef(value: string): string {
  return value.length <= 72 ? value : `${value.slice(0, 34)}...${value.slice(-30)}`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Browser/Computer value ${String(value)}`);
}
