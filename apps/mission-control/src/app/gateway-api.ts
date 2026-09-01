import { DeliveryReceiptSchema, WorkspaceIdSchema, type AllowlistEntry, type ChannelDescriptor, type DeliveryReceipt, type GatewayDescriptor, type Session } from "@nexora/contracts";

import { controlApi, readControlProjection } from "./query-client.js";

const LOCAL_WORKSPACE_ALIASES = {
  "ws-demo": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "ws-a": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "ws-b": "01BRZ3NDEKTSV4RRFFQ69G5FAV",
} as const;

export type GatewayCursorCheckpoint = {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly cursor: string;
  readonly message_id: string | null;
  readonly updated_at: string;
};

export type GatewayProjection = {
  readonly gateways: readonly GatewayDescriptor[];
  readonly channels: readonly ChannelDescriptor[];
  readonly sessions: readonly Session[];
  readonly deliveries: readonly DeliveryReceipt[];
  readonly allowlist: readonly Pick<AllowlistEntry, "id" | "workspace_id" | "channel_id" | "decision" | "expires_at">[];
  readonly cursors: Readonly<Record<string, GatewayCursorCheckpoint | null>>;
};

export type GatewayControlView = {
  readonly workspaceId: string;
  readonly gateway: { readonly name: string; readonly version: string; readonly status: GatewayDescriptor["status"]; readonly location: GatewayDescriptor["execution_location"]; readonly health: GatewayDescriptor["health"] };
  readonly channels: readonly { readonly id: string; readonly name: string; readonly kind: string; readonly status: ChannelDescriptor["status"]; readonly allowlist: ChannelDescriptor["allowlist_mode"]; readonly queue: number }[];
  readonly sessions: readonly { readonly id: string; readonly channel: string; readonly mode: Session["mode"]; readonly cursor: string | null; readonly lastDelivery: DeliveryReceipt["status"] | "none"; readonly status: Session["status"]; readonly revision: number; readonly acknowledgement: { readonly message_id: string } | null }[];
  readonly delivery: { readonly total: number; readonly delivered: number; readonly failed: number };
  readonly allowlist: { readonly total: number; readonly active: number; readonly defaultDeny: boolean };
};

export function buildGatewayControlView(projection: GatewayProjection, workspaceId: string, now = new Date().toISOString()): GatewayControlView {
  const gateway = projection.gateways.find((candidate) => candidate.workspace_id === workspaceId);
  if (gateway === undefined) throw new Error("Gateway projection has no gateway descriptor");
  const channels = projection.channels.filter((channel) => channel.workspace_id === workspaceId && channel.gateway_id === gateway.id);
  const sessions = projection.sessions.filter((session) => session.workspace_id === workspaceId && session.gateway_id === gateway.id);
  const deliveries = projection.deliveries.filter((delivery) => delivery.workspace_id === workspaceId);
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const latestDeliveryByMessage = latestMessageDeliveries(deliveries);
  const sessionIdsByChannel = new Map<string, Set<string>>();
  for (const session of sessions) {
    const sessionIds = sessionIdsByChannel.get(session.channel_id) ?? new Set<string>();
    sessionIds.add(session.id);
    sessionIdsByChannel.set(session.channel_id, sessionIds);
  }
  const allowlist = projection.allowlist.filter((entry) => entry.workspace_id === workspaceId && channelById.has(entry.channel_id));
  return {
    workspaceId,
    gateway: { name: gateway.name, version: gateway.version, status: gateway.status, location: gateway.execution_location, health: gateway.health },
    channels: channels.map((channel) => {
      const sessionIds = sessionIdsByChannel.get(channel.id) ?? new Set<string>();
      const queue = [...latestDeliveryByMessage.values()].filter((delivery) => sessionIds.has(delivery.session_id) && delivery.status === "queued").length;
      return { id: channel.id, name: channel.name, kind: channel.kind, status: channel.status, allowlist: channel.allowlist_mode, queue };
    }),
    sessions: sessions.map((session) => {
      const sessionDeliveries = sortedDeliveries([...latestDeliveryByMessage.values()].filter((delivery) => delivery.session_id === session.id));
      const latestSessionDelivery = sortedDeliveries(deliveries.filter((delivery) => delivery.session_id === session.id)).at(-1);
      const acknowledgementTarget = sessionDeliveries.findLast((delivery) => delivery.status === "queued");
      return {
        id: session.id,
        channel: channelById.get(session.channel_id)?.name ?? session.channel_id,
        mode: session.mode,
        cursor: projection.cursors[session.id]?.cursor ?? session.cursor,
        lastDelivery: latestSessionDelivery?.status ?? "none",
        status: session.status,
        revision: session.revision,
        acknowledgement: acknowledgementTarget === undefined ? null : { message_id: acknowledgementTarget.message_id },
      };
    }),
    delivery: { total: deliveries.length, delivered: deliveries.filter((delivery) => delivery.status === "delivered").length, failed: deliveries.filter((delivery) => delivery.status === "failed").length },
    allowlist: { total: allowlist.length, active: allowlist.filter((entry) => entry.decision === "allow" && (entry.expires_at === null || entry.expires_at > now)).length, defaultDeny: channels.every((channel) => channel.allowlist_mode === "deny_by_default" || channel.allowlist_mode === "allowlist_only") },
  };
}

function latestMessageDeliveries(deliveries: readonly DeliveryReceipt[]): ReadonlyMap<string, DeliveryReceipt> {
  const latest = new Map<string, DeliveryReceipt>();
  for (const delivery of sortedDeliveries(deliveries)) latest.set(delivery.message_id, delivery);
  return latest;
}

function sortedDeliveries(deliveries: readonly DeliveryReceipt[]): readonly DeliveryReceipt[] {
  return [...deliveries].sort((left, right) => {
    const byCreatedAt = left.created_at.localeCompare(right.created_at);
    if (byCreatedAt !== 0) return byCreatedAt;
    return left.receipt_id.localeCompare(right.receipt_id);
  });
}

export type GatewayProjectionReader = <T>(path: string, workspace: string) => Promise<T>;

type GatewayListResponse = { readonly gateways: readonly GatewayDescriptor[] };
type ChannelListResponse = { readonly channels: readonly ChannelDescriptor[] };
type SessionListResponse = { readonly sessions: readonly Session[] };
type DeliveryListResponse = { readonly deliveries: readonly DeliveryReceipt[] };
type AllowlistListResponse = { readonly allowlist: readonly AllowlistEntry[] };

export async function fetchGatewayProjection(workspaceId: string, read: GatewayProjectionReader = readControlProjection): Promise<GatewayProjection> {
  const [gatewaysResponse, channelsResponse, sessionsResponse, deliveriesResponse, allowlistResponse] = await Promise.all([
    read<GatewayListResponse>("/v1/gateways", workspaceId),
    read<ChannelListResponse>("/v1/channels", workspaceId),
    read<SessionListResponse>("/v1/sessions", workspaceId),
    read<DeliveryListResponse>("/v1/deliveries", workspaceId),
    read<AllowlistListResponse>("/v1/allowlist", workspaceId),
  ]);
  const cursorEntries = await Promise.all(
    sessionsResponse.sessions.map(async (session) => {
      const cursorResponse = await read<{ readonly checkpoint: GatewayCursorCheckpoint | null }>(`/v1/sessions/${encodeURIComponent(session.id)}/cursor`, workspaceId);
      return [session.id, cursorResponse.checkpoint] as const;
    }),
  );
  return {
    gateways: gatewaysResponse.gateways,
    channels: channelsResponse.channels,
    sessions: sessionsResponse.sessions,
    deliveries: deliveriesResponse.deliveries,
    allowlist: allowlistResponse.allowlist,
    cursors: Object.fromEntries(cursorEntries),
  };
}

export type GatewayCommandKind = "pause" | "steer" | "resume";

export type GatewayCommandInput = {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly kind: GatewayCommandKind;
  readonly expected_revision: number;
  readonly cursor: string | null;
  readonly instruction: string | null;
};

export type GatewayDeliveryAcknowledgementInput = {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly message_id: string;
  readonly receipt_id: string;
  readonly idempotency_key: string;
  readonly created_at: string;
  readonly trace_id: string;
};

export type GatewayPostOptions = {
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
};

export type GatewayCommandWriter = {
  readonly post: (path: string, options: GatewayPostOptions) => Promise<unknown>;
};

export type GatewayWorkspaceResolution =
  | { readonly kind: "resolved"; readonly workspace_id: string }
  | { readonly kind: "invalid"; readonly input: string };

export async function sendGatewaySessionCommand(input: GatewayCommandInput, idempotencyKey: string, writer: GatewayCommandWriter = controlApi): Promise<void> {
  await writer.post(`/v1/sessions/${encodeURIComponent(input.session_id)}/${input.kind}`, {
    headers: {
      "Idempotency-Key": idempotencyKey,
      "If-Match": String(input.expected_revision),
    },
    json: {
      schema_version: 1,
      command_id: createClientCommandId(),
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      kind: input.kind,
      idempotency_key: idempotencyKey,
      expected_revision: input.expected_revision,
      cursor: input.cursor,
      instruction: input.instruction,
      created_at: new Date().toISOString(),
    },
  });
}

export async function acknowledgeGatewayDelivery(input: Omit<GatewayDeliveryAcknowledgementInput, "receipt_id" | "idempotency_key" | "created_at" | "trace_id">, idempotencyKey: string, writer: GatewayCommandWriter = controlApi): Promise<void> {
  const now = new Date().toISOString();
  const receiptId = createClientCommandId();
  await writer.post("/v1/deliveries", {
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
    json: createGatewayDeliveryAcknowledgement({ ...input, receipt_id: receiptId, idempotency_key: idempotencyKey, created_at: now, trace_id: receiptId }),
  });
}

export function createGatewayDeliveryAcknowledgement(input: GatewayDeliveryAcknowledgementInput): DeliveryReceipt {
  return DeliveryReceiptSchema.parse({
    schema_version: 1,
    receipt_id: input.receipt_id,
    workspace_id: input.workspace_id,
    session_id: input.session_id,
    message_id: input.message_id,
    idempotency_key: input.idempotency_key,
    status: "delivered",
    provider_receipt_ref: "mission-control:acknowledged",
    delivered_at: input.created_at,
    error_code: null,
    error_message: null,
    created_at: input.created_at,
    trace_id: input.trace_id,
  });
}

export function workspaceIdForGatewayApi(workspaceId: string): string {
  const resolution = resolveGatewayWorkspace(workspaceId);
  switch (resolution.kind) {
    case "resolved":
      return resolution.workspace_id;
    case "invalid":
      throw new Error("Gateway workspace must be a workspace ULID or known local demo alias");
    default:
      return assertNever(resolution);
  }
}

export function resolveGatewayWorkspace(workspaceId: string): GatewayWorkspaceResolution {
  const alias = demoWorkspaceAlias(workspaceId);
  const parsed = WorkspaceIdSchema.safeParse(alias ?? workspaceId);
  if (!parsed.success) return { kind: "invalid", input: workspaceId };
  return { kind: "resolved", workspace_id: parsed.data };
}

function createClientCommandId(): string {
  return `${encodeTimestamp(Date.now())}${cryptoRandomSuffix()}`;
}

function encodeTimestamp(timestamp: number): string {
  let value = timestamp;
  let output = "";
  for (let index = 0; index < 10; index += 1) {
    output = `${"0123456789ABCDEFGHJKMNPQRSTVWXYZ"[value % 32] ?? "0"}${output}`;
    value = Math.floor(value / 32);
  }
  return output;
}

function cryptoRandomSuffix(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const values = new Uint8Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % 32] ?? "0").join("");
}

function demoWorkspaceAlias(workspaceId: string): string | undefined {
  switch (workspaceId) {
    case "ws-demo":
    case "ws-a":
    case "ws-b":
      return LOCAL_WORKSPACE_ALIASES[workspaceId];
    default:
      return undefined;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Gateway workspace resolution ${String(value)}`);
}
