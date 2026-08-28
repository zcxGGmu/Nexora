import { randomUUID } from "node:crypto";
import { createRuntimeMessage, decodeRuntimeEnvelope, type RuntimeMessage } from "@nexora/runtime-adapters";
import { RuntimeAdapterError } from "@nexora/runtime-adapters";
import type { AttemptHandle, CapabilityDescriptor, CancelResult, HealthReport, RuntimeAdapter, RuntimeCommand, RuntimeEvent, RuntimePayload, StartInput } from "@nexora/runtime-adapters";
import { assertNeverCommand, assertNeverMessage, messageIdFor, parseStartInput, readBoolean, readEventType, readPayload, readString } from "@nexora/runtime-adapters";
import type { RemoteWorkerRequest, RemoteWorkerResponse } from "./server.js";

export interface RemoteWorkerTransport {
  exchange(request: RemoteWorkerRequest): Promise<RemoteWorkerResponse>;
}

export class RemoteWorkerTransportError extends Error {
  readonly name = "RemoteWorkerTransportError";

  constructor(readonly status: number, readonly code: "AUTH_EXPIRED" | "SCOPE_DENIED" | "POLICY_DENIED" | "SCHEMA_INVALID") {
    super(`Remote worker rejected the request with ${code}`);
  }
}

type RemoteSession = {
  readonly handle: AttemptHandle;
  readonly input: StartInput;
  sequence: number;
  cursor: string | null;
  readonly pending: RuntimeMessage[];
  readonly seen_response_ids: Set<string>;
  readonly response_fingerprints: Map<string, string>;
  last_response_sequence: number;
  duplicate_response: boolean;
  ended: boolean;
};

export type RemoteRuntimeAdapterOptions = {
  readonly transport: RemoteWorkerTransport;
  readonly token_provider: () => string;
  readonly now?: () => string;
};

export class RemoteRuntimeAdapter implements RuntimeAdapter {
  readonly id = "remote";
  private readonly transport: RemoteWorkerTransport;
  private readonly tokenProvider: () => string;
  private readonly now: () => string;
  private readonly sessions = new Map<string, RemoteSession>();

  constructor(options: RemoteRuntimeAdapterOptions) {
    this.transport = options.transport;
    this.tokenProvider = options.token_provider;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  capabilities(): Promise<CapabilityDescriptor> {
    return Promise.resolve({ adapter_id: this.id, protocol_version: 1, execution_location: "remote", supports_resume: true, supports_cancel: true, supports_streaming: true });
  }

  async start(input: StartInput): Promise<AttemptHandle> {
    const parsedInput = parseStartInput(input);
    const deadlineMs = Date.parse(parsedInput.deadline_at) - Date.parse(this.now());
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) throw new RuntimeAdapterError("CONNECTOR_TIMEOUT", "Runtime deadline has already elapsed");
    const handle: AttemptHandle = { adapter_id: this.id, session_id: `${this.id}:${randomUUID()}`, run_id: parsedInput.run_id, attempt_id: parsedInput.attempt_id, step_id: parsedInput.step_id, trace_id: parsedInput.trace_id, lease_id: parsedInput.lease_id, fencing_token: parsedInput.fencing_token, deadline_at: parsedInput.deadline_at, cursor: null };
    const session: RemoteSession = { handle, input: parsedInput, sequence: 0, cursor: null, pending: [], seen_response_ids: new Set<string>(), response_fingerprints: new Map<string, string>(), last_response_sequence: -1, duplicate_response: false, ended: false };
    this.sessions.set(handle.session_id, session);
    try {
      const hello = await this.exchange(session, "hello", { adapter_id: this.id, protocol_version: 1, capabilities: { resume: true, cancel: true, streaming: true } });
      if (hello.message_type !== "hello_ack" || readBoolean(hello.payload, "accepted") !== true || readString(hello.payload, "adapter_id") !== this.id) throw new RuntimeAdapterError("PROTOCOL_MISMATCH", "Remote runtime rejected the protocol handshake");
      await this.exchange(session, "start", { input: parsedInput.input });
      return handle;
    } catch (error) {
      this.sessions.delete(handle.session_id);
      throw error;
    }
  }

  async send(handle: AttemptHandle, command: RuntimeCommand): Promise<void> {
    const session = this.session(handle);
    switch (command.type) {
      case "heartbeat":
        this.saveResponse(session, await this.exchange(session, "heartbeat", { status: "running", cursor: session.cursor }));
        return;
      case "resume":
        session.cursor = command.cursor;
        this.saveResponse(session, await this.exchange(session, "resume", { cursor: command.cursor }));
        return;
      case "cancel":
        this.saveResponse(session, await this.exchange(session, "cancel", { reason: command.reason }));
        return;
      default:
        return assertNeverCommand(command);
    }
  }

  async cancel(handle: AttemptHandle): Promise<CancelResult> {
    const session = this.session(handle);
    if (session.ended) return { state: "cancel_unknown", reason: "Remote runtime session has already ended" };
    const response = await this.exchange(session, "cancel", { reason: "operator_requested" });
    if (response.message_type !== "cancel_ack") return { state: "cancel_unknown", reason: "Remote runtime returned an invalid cancellation response" };
    const acknowledged = readBoolean(response.payload, "acknowledged");
    const unknown = readBoolean(response.payload, "unknown");
    if (unknown || !acknowledged) return { state: "cancel_unknown", reason: "Remote runtime did not acknowledge cancellation" };
    session.ended = true;
    return { state: "cancelled", reason: "Remote runtime acknowledged cancellation" };
  }

  health(): Promise<HealthReport> {
    return Promise.resolve({ status: "healthy", checked_at: this.now(), details: { execution_location: "remote", transport: "configured" } });
  }

  async *collect(handle: AttemptHandle): AsyncIterable<RuntimeEvent> {
    const session = this.session(handle);
    while (!session.ended) {
      const response = session.pending.shift() ?? await this.exchange(session, "resume", { cursor: session.cursor });
      if (session.duplicate_response) {
        session.duplicate_response = false;
        continue;
      }
      switch (response.message_type) {
        case "event": {
          const eventType = readEventType(response.payload);
          const data = readPayload(response.payload, "data");
          session.cursor = response.cursor;
          yield { type: eventType, envelope: response, data };
          break;
        }
        case "heartbeat":
          yield { type: "heartbeat", envelope: response, data: { status: readString(response.payload, "status") ?? "running", cursor: response.cursor } };
          break;
        case "close":
          session.ended = true;
          return;
        case "hello_ack":
        case "cancel_ack":
        case "hello":
        case "start":
        case "resume":
        case "cancel":
          break;
        default:
          return assertNeverMessage(response.message_type);
      }
    }
  }

  private async exchange(session: RemoteSession, messageType: RuntimeMessage["message_type"], payload: RuntimePayload): Promise<RuntimeMessage> {
    const sequence = session.sequence;
    session.sequence += 1;
    const message = createRuntimeMessage({ schema_version: 1, protocol_version: 1, message_id: messageIdFor(session.handle.session_id, sequence), message_type: messageType, run_id: session.input.run_id, attempt_id: session.input.attempt_id, step_id: session.input.step_id, trace_id: session.input.trace_id, sequence, cursor: session.cursor, deadline_at: session.input.deadline_at, lease_id: session.input.lease_id, fencing_token: session.input.fencing_token, payload });
    try {
      const response = await this.transport.exchange({ message, token: this.tokenProvider() });
      const parsed = decodeRuntimeEnvelope(JSON.stringify(response) ?? "");
      this.validateResponse(session, parsed);
      return parsed;
    } catch (error) {
      if (error instanceof RuntimeAdapterError) throw error;
      if (error instanceof RemoteWorkerTransportError) throw new RuntimeAdapterError(error.code, error.message);
      if (error instanceof Error) throw new RuntimeAdapterError("CONNECTOR_UNAVAILABLE", error.message);
      throw error;
    }
  }

  private validateResponse(session: RemoteSession, response: RuntimeMessage): void {
    if (response.run_id !== session.input.run_id || response.attempt_id !== session.input.attempt_id || response.step_id !== session.input.step_id || response.trace_id !== session.input.trace_id || response.lease_id !== session.input.lease_id || response.fencing_token !== session.input.fencing_token) throw new RuntimeAdapterError("STALE_LEASE", "Remote runtime response scope or fencing token does not match the active session");
    const fingerprint = JSON.stringify(response);
    const prior = session.response_fingerprints.get(response.message_id);
    if (prior !== undefined) {
      if (prior !== fingerprint) throw new RuntimeAdapterError("SCHEMA_INVALID", "Remote runtime response message_id was reused with different content");
      session.duplicate_response = true;
      return;
    }
    if (response.sequence <= session.last_response_sequence) throw new RuntimeAdapterError("SCHEMA_INVALID", "Remote runtime response sequence moved backwards or was reused");
    session.seen_response_ids.add(response.message_id);
    session.response_fingerprints.set(response.message_id, fingerprint);
    session.last_response_sequence = response.sequence;
    session.duplicate_response = false;
  }

  private saveResponse(session: RemoteSession, response: RuntimeMessage): void {
    if (!session.duplicate_response && response.message_type !== "heartbeat") session.pending.push(response);
    session.duplicate_response = false;
  }

  private session(handle: AttemptHandle): RemoteSession {
    const session = this.sessions.get(handle.session_id);
    if (session === undefined) throw new RuntimeAdapterError("RUNTIME_CRASHED", "Remote runtime session is not current");
    if (session.handle.adapter_id !== handle.adapter_id || session.handle.run_id !== handle.run_id || session.handle.attempt_id !== handle.attempt_id || session.handle.step_id !== handle.step_id || session.handle.trace_id !== handle.trace_id || session.handle.lease_id !== handle.lease_id || session.handle.fencing_token !== handle.fencing_token) throw new RuntimeAdapterError("STALE_LEASE", "Remote runtime session context or fencing token is stale");
    return session;
  }
}
