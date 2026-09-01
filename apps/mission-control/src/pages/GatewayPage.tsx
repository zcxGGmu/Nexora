import { CircleAlert, CircleCheck, CircleDashed, Pause, Play, Radio, Send, SlidersHorizontal } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { JSX } from "react";

import {
  buildGatewayControlView,
  acknowledgeGatewayDelivery,
  fetchGatewayProjection,
  resolveGatewayWorkspace,
  sendGatewaySessionCommand,
  type GatewayCommandKind,
  type GatewayControlView,
} from "../app/gateway-api.js";

export type { GatewayControlView } from "../app/gateway-api.js";

export const gatewayControlFixture: GatewayControlView = {
  workspaceId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  gateway: { name: "Hermes Gateway", version: "0.20.6", status: "connected", location: "local", health: "healthy" },
  channels: [
    { id: "channel-web", name: "Web API", kind: "api", status: "connected", allowlist: "deny_by_default", queue: 0 },
    { id: "channel-telegram", name: "Telegram", kind: "telegram", status: "degraded", allowlist: "allowlist_only", queue: 2 },
  ],
  sessions: [{ id: "01SRZ3NDEKTSV4RRFFQ69G5FAV", channel: "Web API", mode: "foreground", cursor: "cursor:42", lastDelivery: "delivered", status: "active", revision: 1, acknowledgement: null }],
  delivery: { total: 1, delivered: 1, failed: 0 },
  allowlist: { total: 0, active: 0, defaultDeny: true },
};

export function GatewayPage(props: { readonly workspaceId?: string; readonly view?: GatewayControlView }): JSX.Element {
  if (props.view !== undefined) return <GatewayPageContent view={props.view} />;
  return <LiveGatewayPage workspaceId={props.workspaceId ?? "ws-demo"} />;
}

function LiveGatewayPage(props: { readonly workspaceId: string }): JSX.Element {
  const workspaceResolution = resolveGatewayWorkspace(props.workspaceId);
  const apiWorkspaceId = workspaceResolution.kind === "resolved" ? workspaceResolution.workspace_id : null;
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["gateway-control", apiWorkspaceId],
    queryFn: () => {
      if (apiWorkspaceId === null) throw new Error("Gateway workspace scope is invalid");
      return fetchGatewayProjection(apiWorkspaceId);
    },
    enabled: apiWorkspaceId !== null,
  });
  const command = useMutation({
    mutationFn: async (input: { readonly kind: GatewayCommandKind; readonly sessionId: string }) => {
      if (apiWorkspaceId === null) throw new Error("Gateway workspace scope is invalid");
      const session = query.data?.sessions.find((candidate) => candidate.id === input.sessionId);
      if (session === undefined) throw new Error("Session is unavailable");
      await sendGatewaySessionCommand(
        {
          workspace_id: apiWorkspaceId,
          session_id: session.id,
          kind: input.kind,
          expected_revision: session.revision,
          cursor: session.cursor,
          instruction: input.kind === "steer" ? "Continue from the last checkpoint." : null,
        },
        `${input.kind}:${session.id}:${crypto.randomUUID()}`,
      );
    },
    onSuccess: async (_data, input) => {
      setFeedback(`${input.kind} accepted; rereading session projection.`);
      await queryClient.invalidateQueries({ queryKey: ["gateway-control", apiWorkspaceId] });
    },
    onError: () => {
      setFeedback("Command was not accepted. Refresh the projection and check the session revision.");
    },
  });
  const acknowledgement = useMutation({
    mutationFn: async (input: { readonly sessionId: string; readonly messageId: string }) => {
      if (apiWorkspaceId === null) throw new Error("Gateway workspace scope is invalid");
      await acknowledgeGatewayDelivery({ workspace_id: apiWorkspaceId, session_id: input.sessionId, message_id: input.messageId }, `ack:${input.sessionId}:${input.messageId}:${crypto.randomUUID()}`);
    },
    onSuccess: async () => {
      setFeedback("Acknowledgement accepted; rereading delivery receipts.");
      await queryClient.invalidateQueries({ queryKey: ["gateway-control", apiWorkspaceId] });
    },
    onError: () => {
      setFeedback("Acknowledgement was not accepted. Refresh delivery receipts and retry.");
    },
  });

  if (apiWorkspaceId === null) return <GatewayState title="Invalid Gateway workspace scope" message="Gateway control data requires a canonical workspace ULID or the explicit local demo alias. No API request or external connection was attempted." alert />;
  if (query.isPending) return <GatewayState title="Loading Gateway control data" message="Reading workspace-scoped descriptors, cursor checkpoints, delivery receipts, and allowlist facts." />;
  if (query.isError) return <GatewayState title="Gateway control data unavailable" message="The local control API did not return a usable projection. No external connection was attempted." alert onRetry={() => void query.refetch()} />;
  const gateway = query.data.gateways.find((candidate) => candidate.workspace_id === apiWorkspaceId);
  if (gateway === undefined) return <GatewayState title="No Gateway descriptor registered" message="Register a workspace-scoped Gateway descriptor before opening channel and session controls." />;
  return (
    <>
      <GatewayPageContent
        view={buildGatewayControlView(query.data, apiWorkspaceId)}
        commandSessionId={command.isPending ? (command.variables?.sessionId ?? null) : acknowledgement.isPending ? (acknowledgement.variables?.sessionId ?? null) : null}
        feedback={feedback}
        onAcknowledge={(sessionId, messageId) => acknowledgement.mutate({ sessionId, messageId })}
        onSessionCommand={(sessionId, kind) => command.mutate({ sessionId, kind })}
      />
    </>
  );
}

export function GatewayPageContent(props: {
  readonly view: GatewayControlView;
  readonly commandSessionId?: string | null;
  readonly feedback?: string | null;
  readonly onAcknowledge?: (sessionId: string, messageId: string) => void;
  readonly onSessionCommand?: (sessionId: string, kind: GatewayCommandKind) => void;
}): JSX.Element {
  const gatewayTone = props.view.gateway.status === "connected" && props.view.gateway.health === "healthy" ? "success" : props.view.gateway.status === "offline" ? "danger" : "warning";
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Gateway Control</p>
        <h1 id="route-title">Gateway, Channels &amp; Sessions</h1>
        <p>Observe channel delivery and session recovery from one workspace-scoped control surface.</p>
      </header>
      <section className="state-plane state-plane--info" aria-label="Gateway boundary">
        <div className="state-plane__title"><Radio aria-hidden="true" size={18} /><span>Descriptor and control-plane state only</span><span className="status-badge status-badge--info">No external connection</span></div>
        <p>These values are local registry facts and command receipts. Nexora does not connect to Telegram, Discord, Slack, WhatsApp, Signal, or any provider from this page.</p>
      </section>
      <div className="workspace-grid">
        <section className="panel" aria-labelledby="gateway-health-title">
          <div className="panel-header"><h2 id="gateway-health-title">Gateway health</h2><StatusBadge tone={gatewayTone} label={`${props.view.gateway.status} · ${props.view.gateway.health}`} /></div>
          <div className="row-list"><article className="work-row"><div><h3>{props.view.gateway.name}</h3><div className="row-meta mono">{props.view.gateway.version} · {props.view.gateway.location}</div><p>Capabilities: messaging · sessions · cursor resume</p></div><CircleCheck aria-hidden="true" size={18} /></article></div>
        </section>
        <section className="panel" aria-labelledby="channel-status-title">
          <div className="panel-header"><h2 id="channel-status-title">Channels</h2><span className="mono meta">{props.view.channels.length}</span></div>
          <div className="row-list">{props.view.channels.length === 0 ? <div className="padded-row meta">No channel descriptors are registered for this Gateway.</div> : props.view.channels.map((channel) => <article className="work-row" key={channel.id}><div><h3>{channel.name}</h3><div className="row-meta mono">{channel.kind} · {channel.id}</div><p>{channel.queue} queued · {channel.allowlist}</p></div><StatusBadge tone={channel.status === "connected" ? "success" : channel.status === "degraded" ? "warning" : "danger"} label={`${channel.status} · declared`} /></article>)}</div>
        </section>
      </div>
      <section className="panel" aria-labelledby="session-queue-title">
        <div className="panel-header"><h2 id="session-queue-title">Session queue</h2><span className="mono meta">cursor recovery enabled</span></div>
        <div className="row-list">{props.view.sessions.length === 0 ? <div className="padded-row meta">No foreground or background sessions are registered for this Gateway.</div> : props.view.sessions.map((session) => <article className="work-row" key={session.id}><div><h3>{session.channel} <span className="row-meta">{session.mode}</span></h3><div className="row-meta mono">{session.id} · revision {session.revision} · last cursor {session.cursor ?? "none"}</div><p>Delivery: {session.lastDelivery} · {session.acknowledgement === null ? "no acknowledgement pending" : `acknowledge ${session.acknowledgement.message_id}`} · command receipts remain auditable.</p></div><div className="button-row"><StatusBadge tone={session.status === "active" ? "success" : session.status === "paused" ? "warning" : session.status === "error" ? "danger" : "info"} label={session.status} /><button className="row-action" type="button" disabled={props.commandSessionId === session.id || session.status !== "paused" && session.status !== "active"} onClick={() => props.onSessionCommand?.(session.id, session.status === "paused" ? "resume" : "pause")}><span aria-hidden="true">{session.status === "paused" ? <Play size={15} /> : <Pause size={15} />}</span>{session.status === "paused" ? "Resume" : "Pause"}</button><button className="row-action" type="button" disabled={props.commandSessionId === session.id || session.status === "closed" || session.status === "error"} onClick={() => props.onSessionCommand?.(session.id, "steer")}><SlidersHorizontal aria-hidden="true" size={15} />Steer</button><button className="row-action" type="button" disabled={props.onAcknowledge === undefined || session.acknowledgement === null || queryBusy(props.commandSessionId, session.id)} onClick={() => { if (session.acknowledgement !== null) props.onAcknowledge?.(session.id, session.acknowledgement.message_id); }}><Send aria-hidden="true" size={15} />Acknowledge</button></div></article>)}</div>
      </section>
      <div className="workspace-grid">
        <section className="panel" aria-labelledby="delivery-facts-title">
          <div className="panel-header"><h2 id="delivery-facts-title">Delivery receipts</h2><span className="mono meta">{props.view.delivery.total} total</span></div>
          <div className="padded-row"><p className="row-meta">Delivered: <strong>{props.view.delivery.delivered}</strong> · Failed: <strong>{props.view.delivery.failed}</strong> · append-only facts</p></div>
        </section>
        <section className="panel" aria-labelledby="allowlist-facts-title">
          <div className="panel-header"><h2 id="allowlist-facts-title">Allowlist</h2><span className="mono meta">{props.view.allowlist.active}/{props.view.allowlist.total} active</span></div>
          <div className="padded-row"><p className="row-meta">Default deny: <strong>{props.view.allowlist.defaultDeny ? "yes" : "no"}</strong> · workspace-scoped entries only</p></div>
        </section>
      </div>
      {props.feedback === undefined || props.feedback === null ? null : <p className="meta" role="status" aria-live="polite">{props.feedback}</p>}
      <section className="state-plane state-plane--warning" aria-label="Allowlist policy">
        <div className="state-plane__title"><CircleAlert aria-hidden="true" size={18} /><span>Outbound messages default to deny</span></div>
        <p>Only an active workspace-scoped allowlist entry can authorize a recipient. Denied sends create no delivery receipt and never call an external channel.</p>
      </section>
    </div>
  );
}

function GatewayState(props: { readonly title: string; readonly message: string; readonly alert?: boolean; readonly onRetry?: () => void }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Gateway Control</p>
        <h1 id="route-title">Gateway, Channels &amp; Sessions</h1>
      </header>
      <section className="state-plane state-plane--info" role={props.alert ? "alert" : undefined}>
        <div className="state-plane__title"><CircleDashed aria-hidden="true" size={18} /><span>{props.title}</span></div>
        <p>{props.message}</p>
        {props.onRetry === undefined ? null : <button className="row-action" type="button" onClick={props.onRetry}>Retry</button>}
      </section>
    </div>
  );
}

function queryBusy(commandSessionId: string | null | undefined, sessionId: string): boolean {
  return commandSessionId === sessionId;
}

function StatusBadge(props: { readonly tone: "success" | "warning" | "danger" | "info"; readonly label: string }): JSX.Element {
  const Icon = props.tone === "success" ? CircleCheck : props.tone === "warning" ? CircleAlert : props.tone === "danger" ? CircleAlert : CircleDashed;
  return <span className={`status-badge status-badge--${props.tone}`}><Icon aria-hidden="true" size={14} />{props.label}</span>;
}
