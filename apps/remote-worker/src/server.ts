import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { EgressReceiptSchema, RemoteExecutionSnapshotSchema, RuntimeStartPayloadSchema, TimestampSchema, z } from "@nexora/contracts";
import { canonicalSnapshotHash, sha256MemoryContent } from "@nexora/memory";
import { createRuntimeMessage, decodeRuntimeEnvelope, messageIdFor, type RuntimeMessage } from "@nexora/runtime-adapters";

type RemoteTokenClaims = {
  readonly version: 1;
  readonly jti: string;
  readonly workspace_id: string;
  readonly run_id: string;
  readonly attempt_id: string;
  readonly step_id: string;
  readonly trace_id: string;
  readonly lease_id: string;
  readonly fencing_token: number;
  readonly snapshot_hash: string;
  readonly provider: string;
  readonly region: string;
  readonly lease_expires_at: string;
  readonly issued_at: string;
  readonly expires_at: string;
};

const RemoteTokenClaimsSchema = z.object({
  version: z.literal(1),
  jti: z.string().uuid(),
  workspace_id: z.string().min(1).max(128),
  run_id: z.string().min(1).max(128),
  attempt_id: z.string().min(1).max(128),
  step_id: z.string().min(1).max(128),
  trace_id: z.string().min(1).max(128),
  lease_id: z.string().min(1).max(128),
  fencing_token: z.number().int().positive(),
  snapshot_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  provider: z.string().min(1).max(128),
  region: z.string().min(1).max(128),
  lease_expires_at: TimestampSchema,
  issued_at: TimestampSchema,
  expires_at: TimestampSchema,
}).strict();

type RemoteTokenInput = Omit<RemoteTokenClaims, "version" | "jti">;

type RemoteWorkerServerOptions = {
  readonly token_secret: string;
  readonly now?: () => string;
  readonly provider: string;
  readonly region: string;
};

export type RemoteWorkerRequest = { readonly message: RuntimeMessage; readonly token: string };
export type RemoteWorkerResponse = RuntimeMessage;

type Session = {
  token: RemoteTokenClaims;
  snapshot_hash: string;
  readonly queue: RuntimeMessage[];
  sequence: number;
  started: boolean;
  start_fingerprint: string | null;
  events_emitted: boolean;
  closed: boolean;
};

export function createRemoteSessionToken(claims: RemoteTokenInput, secret: string): string {
  const issued = Date.parse(claims.issued_at);
  const expires = Date.parse(claims.expires_at);
  const leaseExpires = Date.parse(claims.lease_expires_at);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || !Number.isFinite(leaseExpires) || expires <= issued || expires > leaseExpires || expires - issued > 15 * 60 * 1000) throw new Error("Remote session token lifetime is invalid");
  const payload = encode(JSON.stringify({ version: 1, jti: randomUUID(), ...claims }));
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function createRemoteWorkerServer(options: RemoteWorkerServerOptions): FastifyInstance {
  const now = options.now ?? (() => new Date().toISOString());
  const sessions = new Map<string, Session>();
  const app = Fastify({ logger: false, bodyLimit: 1_048_576 });

  app.post("/v1/runtime/messages", async (request, reply) => {
    const auth = request.headers.authorization;
    const tokenResult = verifyToken(auth, options.token_secret, now());
    if (!tokenResult.ok) return reply.code(401).send({ code: tokenResult.code });
    let message: RuntimeMessage;
    try {
      message = decodeRuntimeEnvelope(JSON.stringify(request.body) ?? "");
    } catch (error) {
      if (error instanceof Error) return reply.code(400).send({ code: "SCHEMA_INVALID" });
      throw error;
    }
    const scopeResult = checkTokenScope(tokenResult.claims, message);
    if (!scopeResult.ok) return reply.code(403).send({ code: scopeResult.code });
    const sessionKey = `${tokenResult.claims.workspace_id}:${tokenResult.claims.run_id}:${tokenResult.claims.attempt_id}:${tokenResult.claims.step_id}`;
    let session = sessions.get(sessionKey);
    if (message.message_type === "hello") {
      if (session !== undefined) {
        if (!sameTokenScope(session.token, tokenResult.claims)) return reply.send(helloAck(session, message, false, "Session scope changed"));
        session.token = tokenResult.claims;
        return reply.send(helloAck(session, message, true, null));
      }
      session = { token: tokenResult.claims, snapshot_hash: tokenResult.claims.snapshot_hash, queue: [], sequence: 0, started: false, start_fingerprint: null, events_emitted: false, closed: false };
      sessions.set(sessionKey, session);
      return reply.send(helloAck(session, message, true, null));
    }
    if (session === undefined || session.closed) return reply.code(401).send({ code: "AUTH_EXPIRED" });
  if (message.message_type === "start") {
      try {
        return reply.send(startSession(session, message, options));
      } catch (error) {
        if (error instanceof Error && error.message.includes("policy")) return reply.code(403).send({ code: "POLICY_DENIED" });
        if (error instanceof Error) return reply.code(400).send({ code: "SCHEMA_INVALID" });
        throw error;
      }
    }
    if (message.message_type === "resume") {
      try {
        return reply.send(nextSessionMessage(session, message));
      } catch (error) {
        if (error instanceof Error) return reply.code(400).send({ code: "SCHEMA_INVALID" });
        throw error;
      }
    }
    if (message.message_type === "heartbeat") return reply.send(heartbeat(session, message));
    if (message.message_type === "cancel") {
      session.closed = true;
      return reply.send(cancelAck(session, message));
    }
    return reply.code(400).send({ code: "SCHEMA_INVALID" });
  });

  app.addHook("onClose", async () => { sessions.clear(); });
  return app;
}

function startSession(session: Session, message: RuntimeMessage, options: RemoteWorkerServerOptions): RuntimeMessage {
  const parsed = RuntimeStartPayloadSchema.parse(message.payload);
  const fingerprint = JSON.stringify(parsed.input);
  if (session.started) {
    if (session.start_fingerprint !== fingerprint) throw new Error("Remote start payload changed after session start");
    return heartbeat(session, message);
  }
  if (parsed.input["snapshot"] === undefined) throw new Error("Remote start requires a minimal snapshot");
  const snapshot = RemoteExecutionSnapshotSchema.parse(parsed.input["snapshot"]);
  const { snapshot_hash: suppliedHash, ...snapshotBody } = snapshot;
  if (canonicalSnapshotHash(RemoteExecutionSnapshotSchema.omit({ snapshot_hash: true }).parse(snapshotBody)) !== suppliedHash) throw new Error("Remote snapshot hash mismatch");
  if (snapshot.policy_snapshot.provider !== options.provider || snapshot.policy_snapshot.region !== options.region || !snapshot.policy_snapshot.decision.allowed) throw new Error("Remote egress policy denied");
  if (snapshot.workspace_id !== session.token.workspace_id || snapshot.run_id !== session.token.run_id || snapshot.attempt_id !== session.token.attempt_id || snapshot.step_id !== session.token.step_id) throw new Error("Remote snapshot is outside the token scope");
  if (snapshot.policy_snapshot.scope.kind === "workspace" && snapshot.policy_snapshot.scope.id !== snapshot.workspace_id) throw new Error("Remote snapshot policy scope denied");
  if (snapshot.policy_snapshot.scope.kind === "run" && snapshot.policy_snapshot.scope.id !== snapshot.run_id) throw new Error("Remote snapshot policy scope denied");
  if (session.token.provider !== undefined && session.token.provider !== snapshot.policy_snapshot.provider) throw new Error("Remote provider is outside the token scope");
  if (session.token.region !== undefined && session.token.region !== snapshot.policy_snapshot.region) throw new Error("Remote region is outside the token scope");
  if (session.token.snapshot_hash !== undefined && session.token.snapshot_hash !== snapshot.snapshot_hash) throw new Error("Remote snapshot is outside the token scope");
  if (snapshot.memory_refs.some((ref) => ref.transmitted_hash !== undefined && ref.transmitted_hash !== sha256MemoryContent(ref.content))) throw new Error("Remote memory content hash mismatch");
  const rawReceipt = parsed.input["egress_receipt"];
  if (rawReceipt === undefined) throw new Error("Remote egress receipt is missing or does not match the snapshot");
  const receipt = EgressReceiptSchema.parse(rawReceipt);
  if (receipt.execution_location !== "remote" || receipt.provider !== snapshot.policy_snapshot.provider || receipt.region !== snapshot.policy_snapshot.region || receipt.data_classification !== snapshot.policy_snapshot.data_classification || receipt.redaction_count !== snapshot.redaction_count || receipt.snapshot_hash !== snapshot.snapshot_hash || !receipt.policy_decision.allowed) throw new Error("Remote egress receipt is missing or does not match the snapshot");
  if (hasForbiddenInputKey(parsed.input)) throw new Error("Remote start contains forbidden sensitive input");
  session.started = true;
  session.start_fingerprint = fingerprint;
  session.snapshot_hash = snapshot.snapshot_hash;
  return heartbeat(session, message);
}

function nextSessionMessage(session: Session, request: RuntimeMessage): RuntimeMessage {
  if (!session.events_emitted) {
    session.events_emitted = true;
    session.queue.push(event(request, session, "started", { execution_location: "remote", snapshot_hash: session.snapshot_hash }));
    session.queue.push(event(request, session, "completed", { execution_location: "remote", snapshot_hash: session.snapshot_hash }));
  }
  const requestedCursor = request.cursor === null ? -1 : Number(request.cursor);
  if (!Number.isSafeInteger(requestedCursor) || requestedCursor < -1 || requestedCursor > session.sequence) throw new Error("Remote resume cursor is invalid");
  const next = session.queue.find((candidate) => candidate.cursor !== null && Number(candidate.cursor) > requestedCursor);
  if (next !== undefined) return next;
  session.closed = true;
  const sequence = session.sequence;
  session.sequence += 1;
  return createRuntimeMessage({ ...request, message_id: messageIdFor(`remote:${session.token.run_id}`, sequence), message_type: "close", sequence, payload: { reason: "completed" } });
}

function event(source: RuntimeMessage, session: Session, eventType: string, data: Record<string, string>): RuntimeMessage {
  const sequence = session.sequence;
  session.sequence += 1;
  return createRuntimeMessage({ ...source, message_id: messageIdFor(`remote:${session.token.run_id}`, sequence), message_type: "event", sequence, cursor: String(sequence), payload: { event_type: eventType, data } });
}

function heartbeat(session: Session, source: RuntimeMessage): RuntimeMessage {
  const sequence = session.sequence;
  session.sequence += 1;
  return createRuntimeMessage({ ...source, message_id: messageIdFor(`remote:${session.token.run_id}`, sequence), message_type: "heartbeat", sequence, payload: { status: "running", cursor: source.cursor } });
}

function helloAck(session: Session, source: RuntimeMessage, accepted: boolean, reason: string | null): RuntimeMessage {
  const sequence = session.sequence;
  session.sequence += 1;
  return createRuntimeMessage({ ...source, message_id: messageIdFor(`remote:${session.token.run_id}`, sequence), message_type: "hello_ack", sequence, payload: { accepted, adapter_id: "remote", protocol_version: 1, reason } });
}

function cancelAck(session: Session, source: RuntimeMessage): RuntimeMessage {
  const sequence = session.sequence;
  session.sequence += 1;
  return createRuntimeMessage({ ...source, message_id: messageIdFor(`remote:${session.token.run_id}`, sequence), message_type: "cancel_ack", sequence, payload: { acknowledged: true, unknown: false, reason: "Runtime acknowledged cancellation" } });
}

function checkTokenScope(claims: RemoteTokenClaims, message: RuntimeMessage): { readonly ok: true } | { readonly ok: false; readonly code: "SCOPE_DENIED" } {
  if (claims.run_id !== message.run_id || claims.attempt_id !== message.attempt_id || claims.step_id !== message.step_id) return { ok: false, code: "SCOPE_DENIED" };
  if (claims.trace_id !== message.trace_id || claims.lease_id !== message.lease_id || claims.fencing_token !== message.fencing_token) return { ok: false, code: "SCOPE_DENIED" };
  if (Date.parse(claims.expires_at) > Date.parse(message.deadline_at)) return { ok: false, code: "SCOPE_DENIED" };
  return { ok: true };
}

function sameTokenScope(left: RemoteTokenClaims, right: RemoteTokenClaims): boolean {
  return left.workspace_id === right.workspace_id && left.run_id === right.run_id && left.attempt_id === right.attempt_id && left.step_id === right.step_id && left.trace_id === right.trace_id && left.lease_id === right.lease_id && left.fencing_token === right.fencing_token && left.snapshot_hash === right.snapshot_hash && left.provider === right.provider && left.region === right.region;
}

function verifyToken(header: string | undefined, secret: string, now: string): { readonly ok: true; readonly claims: RemoteTokenClaims } | { readonly ok: false; readonly code: "AUTH_INVALID" | "AUTH_EXPIRED" } {
  if (header === undefined || !header.startsWith("Bearer ")) return { ok: false, code: "AUTH_INVALID" };
  const parts = header.slice(7).split(".");
  if (parts.length !== 2) return { ok: false, code: "AUTH_INVALID" };
  const payload = parts[0];
  const signature = parts[1];
  if (payload === undefined || signature === undefined || !safeEqual(sign(payload, secret), signature)) return { ok: false, code: "AUTH_INVALID" };
  try {
    const parsed = RemoteTokenClaimsSchema.safeParse(JSON.parse(decode(payload)));
    if (!parsed.success) return { ok: false, code: "AUTH_INVALID" };
    const claims = parsed.data;
    const issued = Date.parse(claims.issued_at);
    const expires = Date.parse(claims.expires_at);
    const leaseExpires = Date.parse(claims.lease_expires_at);
    const current = Date.parse(now);
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || !Number.isFinite(leaseExpires) || !Number.isFinite(current) || expires <= issued || expires > leaseExpires || expires - issued > 15 * 60 * 1000 || issued > current || expires <= current) return { ok: false, code: expires <= current ? "AUTH_EXPIRED" : "AUTH_INVALID" };
    return { ok: true, claims };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return { ok: false, code: "AUTH_INVALID" };
    throw error;
  }
}

function encode(value: string): string { return Buffer.from(value, "utf8").toString("base64url"); }
function decode(value: string): string { return Buffer.from(value, "base64url").toString("utf8"); }
function sign(value: string, secret: string): string { return createHmac("sha256", secret).update(value).digest("base64url"); }
function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hasForbiddenInputKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => hasForbiddenInputKey(item));
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(([key, child]) => /^(?:secret|secret_refs|vault|chat_history|authorization|token|api_key|private_key)/i.test(key) || hasForbiddenInputKey(child));
}
