import { accessSync, constants as fsConstants } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { isAbsolute } from "node:path";
import { createRuntimeMessage, decodeRuntimeEnvelope, encodeRuntimeEnvelope, type RuntimeMessage } from "./envelope-codec.js";
import { RuntimeAdapterError } from "./errors.js";
import { type AttemptHandle, type CapabilityDescriptor, type CancelResult, type HealthReport, type RuntimeAdapter, type RuntimeCommand, type RuntimeEvent, type RuntimePayload, type StartInput } from "./runtime-adapter.js";
import { assertNeverCommand, assertNeverMessage, messageIdFor, parseStartInput, readBoolean, readEventType, readPayload, readString } from "./runtime-message-utils.js";
import { expireSession, flushStderr, nextMessage, pushMessage, recordStderr, rejectWaiters, waitForMessage, type ProcessSession } from "./process-session.js";

export type LocalProcessAdapterOptions = {
  readonly executable: string;
  readonly allowed_executables: readonly string[];
  readonly cwd: string;
  readonly args?: readonly string[];
  readonly cancel_timeout_ms?: number;
  readonly stderr_redactions?: readonly string[];
  readonly max_output_bytes?: number;
  readonly max_stderr_bytes?: number;
  readonly environment?: Readonly<Record<string, string>>;
  readonly max_sessions?: number;
  readonly adapter_id?: string;
  readonly now?: () => string;
};

export class LocalProcessAdapter implements RuntimeAdapter {
  readonly id: string;
  private readonly executable: string;
  private readonly allowedExecutables: readonly string[];
  private readonly cwd: string;
  private readonly args: readonly string[];
  private readonly cancelTimeoutMs: number;
  private readonly stderrRedactions: readonly string[];
  private readonly maxOutputBytes: number;
  private readonly maxStderrBytes: number;
  private readonly environment: Readonly<Record<string, string>>;
  private readonly maxSessions: number;
  private readonly now: () => string;
  private readonly sessions = new Map<string, ProcessSession>();
  private readonly activeAttempts = new Set<string>();

  constructor(options: LocalProcessAdapterOptions) {
    if (!options.allowed_executables.includes(options.executable)) throw new RuntimeAdapterError("SCHEMA_INVALID", "Executable is not in the local adapter allowlist");
    if (!isAbsolute(options.executable)) throw new RuntimeAdapterError("SCHEMA_INVALID", "Local adapter executable must be an absolute path");
    if (!isAbsolute(options.cwd)) throw new RuntimeAdapterError("SCHEMA_INVALID", "Local adapter cwd must be absolute");
    if (options.args?.some((arg) => arg.includes("\u0000"))) throw new RuntimeAdapterError("SCHEMA_INVALID", "Process arguments cannot contain NUL bytes");
    if (options.cancel_timeout_ms !== undefined && (!Number.isInteger(options.cancel_timeout_ms) || options.cancel_timeout_ms < 1 || options.cancel_timeout_ms > 60_000)) throw new RuntimeAdapterError("SCHEMA_INVALID", "cancel_timeout_ms must be between 1 and 60000 milliseconds");
    if (options.max_output_bytes !== undefined && (!Number.isInteger(options.max_output_bytes) || options.max_output_bytes < 1_024 || options.max_output_bytes > 100_000_000)) throw new RuntimeAdapterError("SCHEMA_INVALID", "max_output_bytes must be between 1024 and 100000000");
    if (options.max_stderr_bytes !== undefined && (!Number.isInteger(options.max_stderr_bytes) || options.max_stderr_bytes < 1_024 || options.max_stderr_bytes > 100_000_000)) throw new RuntimeAdapterError("SCHEMA_INVALID", "max_stderr_bytes must be between 1024 and 100000000");
    this.id = options.adapter_id ?? "local-process";
    this.executable = options.executable;
    this.allowedExecutables = [...options.allowed_executables];
    this.cwd = options.cwd;
    this.args = [...(options.args ?? [])];
    this.cancelTimeoutMs = options.cancel_timeout_ms ?? 1_000;
    this.stderrRedactions = [...(options.stderr_redactions ?? [])];
    this.maxOutputBytes = options.max_output_bytes ?? 1_048_576;
    this.maxStderrBytes = options.max_stderr_bytes ?? 1_048_576;
    this.environment = { ...(options.environment ?? { PATH: "/usr/bin:/bin" }) };
    this.maxSessions = options.max_sessions ?? 128;
    if (!Number.isInteger(this.maxSessions) || this.maxSessions < 1 || this.maxSessions > 10_000) throw new RuntimeAdapterError("SCHEMA_INVALID", "max_sessions must be between 1 and 10000");
    this.now = options.now ?? (() => new Date().toISOString());
  }

  capabilities(): Promise<CapabilityDescriptor> {
    return Promise.resolve({ adapter_id: this.id, protocol_version: 1, execution_location: "local", supports_resume: true, supports_cancel: true, supports_streaming: true });
  }

  async start(input: StartInput): Promise<AttemptHandle> {
    const parsedInput = parseStartInput(input);
    const deadlineMs = Date.parse(parsedInput.deadline_at) - Date.parse(this.now());
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) throw new RuntimeAdapterError("CONNECTOR_TIMEOUT", "Runtime deadline has already elapsed");
    const attemptKey = `${parsedInput.run_id}:${parsedInput.attempt_id}`;
    if (this.activeAttempts.has(attemptKey)) throw new RuntimeAdapterError("STALE_LEASE", "An active runtime session already exists for this attempt");
    this.activeAttempts.add(attemptKey);
    const process = spawn(this.executable, this.args, { cwd: this.cwd, env: this.environment, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const handle: AttemptHandle = { adapter_id: this.id, session_id: `${this.id}:${randomUUID()}`, run_id: parsedInput.run_id, attempt_id: parsedInput.attempt_id, step_id: parsedInput.step_id, trace_id: parsedInput.trace_id, lease_id: parsedInput.lease_id, fencing_token: parsedInput.fencing_token, deadline_at: parsedInput.deadline_at, cursor: null };
    const session: ProcessSession = { handle, input: parsedInput, process, attempt_key: attemptKey, stderr_lines: [], queue: [], waiters: [], line_buffer: "", sequence: 0, cursor: null, ended: false, exit_code: null, process_error: null, seen_message_ids: new Set<string>(), message_fingerprints: new Map<string, string>(), last_incoming_sequence: -1, stdout_bytes: 0, stderr_bytes: 0, stderr_buffer: "", stdout_decoder: new StringDecoder("utf8"), stderr_decoder: new StringDecoder("utf8"), closed_by_envelope: false, deadline_timer: null, cancel_pending: false };
    this.sessions.set(handle.session_id, session);
    this.evictFinishedSessions();
    process.stdout.on("data", (chunk: Buffer) => this.ingest(session, chunk));
    process.stderr.on("data", (chunk: Buffer) => recordStderr(session, chunk, this.maxStderrBytes));
    process.stdin.once("error", () => { const processError = new RuntimeAdapterError("RUNTIME_CRASHED", "Local runtime stdin failed"); session.process_error = processError; rejectWaiters(session, processError); if (!session.ended) session.process.kill(); });
    process.once("error", () => { const processError = new RuntimeAdapterError("RUNTIME_CRASHED", "Local runtime process failed"); session.process_error = processError; rejectWaiters(session, processError); });
    process.once("close", (code) => { session.ended = true; session.exit_code = code; flushStderr(session, (value) => this.redact(value)); if (session.deadline_timer !== null) clearTimeout(session.deadline_timer); this.activeAttempts.delete(session.attempt_key); if (!session.closed_by_envelope || code !== 0) rejectWaiters(session, code === 0 ? new RuntimeAdapterError("RUNTIME_CRASHED", "Local runtime closed without a close envelope") : new RuntimeAdapterError("RUNTIME_CRASHED", `Local runtime exited with code ${String(code)}`)); this.evictFinishedSessions(); });
    this.armDeadline(session, deadlineMs);
    try {
      this.write(session, "hello", { adapter_id: this.id, protocol_version: 1, capabilities: { resume: true, cancel: true, streaming: true } });
      const hello = await waitForMessage(session, "hello_ack", Math.min(1_000, deadlineMs));
      const accepted = readBoolean(hello.payload, "accepted");
      const peerAdapterId = readString(hello.payload, "adapter_id");
      if (accepted !== true || peerAdapterId !== this.id) throw new RuntimeAdapterError("PROTOCOL_MISMATCH", "Local runtime rejected the protocol handshake");
      this.write(session, "start", { input: parsedInput });
    } catch (error) {
      if (!session.ended) process.kill();
      throw error;
    }
    return handle;
  }

  async send(handle: AttemptHandle, command: RuntimeCommand): Promise<void> {
    const session = this.session(handle);
    switch (command.type) {
      case "heartbeat":
        this.write(session, "heartbeat", { status: "running", cursor: session.cursor });
        return;
      case "resume":
        session.cursor = command.cursor;
        this.write(session, "resume", { cursor: command.cursor });
        return;
      case "cancel":
        this.write(session, "cancel", { reason: command.reason });
        return;
      default:
        return assertNeverCommand(command);
    }
  }

  async cancel(handle: AttemptHandle): Promise<CancelResult> {
    const session = this.session(handle);
    if (session.ended) return { state: "cancel_unknown", reason: "Runtime session has already ended" };
    if (session.cancel_pending) return { state: "cancel_unknown", reason: "Cancellation is already pending" };
    session.cancel_pending = true;
    try {
      await this.send(handle, { type: "cancel", reason: "operator_requested" });
      const message = await waitForMessage(session, "cancel_ack", this.cancelTimeoutMs);
      const acknowledged = readBoolean(message.payload, "acknowledged");
      const unknown = readBoolean(message.payload, "unknown");
      if (unknown === true || acknowledged !== true) return { state: "cancel_unknown", reason: "Runtime did not acknowledge cancellation" };
      return { state: "cancelled", reason: "Runtime acknowledged cancellation" };
    } catch (error) {
      if (error instanceof RuntimeAdapterError && error.code === "CANCEL_UNKNOWN") {
        if (!session.ended) session.process.kill();
        return { state: "cancel_unknown", reason: "Runtime did not acknowledge cancellation" };
      }
      throw error;
    } finally {
      session.cancel_pending = false;
    }
  }

  health(): Promise<HealthReport> {
    try {
      accessSync(this.executable, fsConstants.X_OK);
      accessSync(this.cwd, fsConstants.R_OK | fsConstants.W_OK);
      return Promise.resolve({ status: "healthy", checked_at: this.now(), details: { executable: this.executable, cwd: this.cwd, allowlisted: String(this.allowedExecutables.includes(this.executable)) } });
    } catch (error) {
      if (error instanceof Error) return Promise.resolve({ status: "unavailable", checked_at: this.now(), details: { reason: "executable_or_cwd_unavailable" } });
      throw error;
    }
  }

  async *collect(handle: AttemptHandle): AsyncIterable<RuntimeEvent> {
    const session = this.session(handle);
    while (true) {
      let message: RuntimeMessage;
      try {
        message = await nextMessage(session);
      } catch (error) {
        if (error instanceof RuntimeAdapterError && error.code === "RUNTIME_CRASHED") throw error;
        throw error;
      }
      switch (message.message_type) {
        case "event": {
          const eventType = readEventType(message.payload);
          const data = readPayload(message.payload, "data");
          session.cursor = message.cursor;
          yield { type: eventType, envelope: message, data };
          break;
        }
        case "heartbeat":
          yield { type: "heartbeat", envelope: message, data: { status: readString(message.payload, "status") ?? "running", cursor: message.cursor } };
          break;
        case "close":
          session.closed_by_envelope = true;
          session.process.stdin.end();
          if (!session.ended) session.process.kill();
          return;
        case "hello_ack":
        case "cancel_ack":
          break;
        case "hello":
        case "start":
        case "resume":
        case "cancel":
          break;
        default:
          return assertNeverMessage(message.message_type);
      }
    }
  }

  stderr(_handle: AttemptHandle): readonly string[] {
    const session = this.session(_handle);
    return [...session.stderr_lines];
  }

  private write(session: ProcessSession, messageType: RuntimeMessage["message_type"], payload: RuntimePayload): void {
    if (session.process_error instanceof RuntimeAdapterError) throw session.process_error;
    if (session.ended || session.process.stdin.destroyed) throw new RuntimeAdapterError("RUNTIME_CRASHED", "Local runtime stdin is closed");
    const sequence = session.sequence;
    session.sequence += 1;
    const message = createRuntimeMessage({ schema_version: 1, protocol_version: 1, message_id: messageIdFor(session.handle.session_id, sequence), message_type: messageType, run_id: session.input.run_id, attempt_id: session.input.attempt_id, step_id: session.input.step_id, trace_id: session.input.trace_id, sequence, cursor: session.cursor, deadline_at: session.input.deadline_at, lease_id: session.input.lease_id, fencing_token: session.input.fencing_token, payload });
    session.process.stdin.write(encodeRuntimeEnvelope(message));
  }

  private ingest(session: ProcessSession, chunk: Buffer): void {
    session.stdout_bytes += chunk.byteLength;
    if (session.stdout_bytes > this.maxOutputBytes) {
      const error = new RuntimeAdapterError("SCHEMA_INVALID", "Local runtime output exceeded max_output_bytes");
      session.process_error = error;
      rejectWaiters(session, error);
      if (!session.ended) session.process.kill();
      return;
    }
    session.line_buffer += session.stdout_decoder.write(chunk);
    const lines = session.line_buffer.split("\n");
    session.line_buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      try {
        const message = decodeRuntimeEnvelope(line);
        pushMessage(session, message, () => this.validateIncoming(session, message));
      } catch (error) {
        const protocolError = error instanceof RuntimeAdapterError ? error : new RuntimeAdapterError("SCHEMA_INVALID", "Local runtime emitted an invalid envelope");
        session.process_error = protocolError;
        rejectWaiters(session, protocolError);
        if (!session.ended) session.process.kill();
      }
    }
  }

  private validateIncoming(session: ProcessSession, message: RuntimeMessage): void {
    if (message.run_id !== session.input.run_id || message.attempt_id !== session.input.attempt_id || message.step_id !== session.input.step_id || message.trace_id !== session.input.trace_id || message.lease_id !== session.input.lease_id || message.fencing_token !== session.input.fencing_token) throw new RuntimeAdapterError("STALE_LEASE", "Runtime envelope scope or fencing token does not match the active session");
  }

  private armDeadline(session: ProcessSession, remainingMs: number): void {
    if (session.ended) return;
    const maxDelayMs = 2_147_483_647;
    session.deadline_timer = setTimeout(() => remainingMs > maxDelayMs ? this.armDeadline(session, remainingMs - maxDelayMs) : expireSession(session), Math.min(remainingMs, maxDelayMs));
  }

  private session(handle: AttemptHandle): ProcessSession {
    const session = this.sessions.get(handle.session_id);
    if (session === undefined) throw new RuntimeAdapterError("RUNTIME_CRASHED", "Local runtime session is not current");
    if (session.handle.adapter_id !== handle.adapter_id || session.handle.run_id !== handle.run_id || session.handle.attempt_id !== handle.attempt_id || session.handle.step_id !== handle.step_id || session.handle.trace_id !== handle.trace_id || session.handle.lease_id !== handle.lease_id || session.handle.fencing_token !== handle.fencing_token) throw new RuntimeAdapterError("STALE_LEASE", "Local runtime session context or fencing token is stale");
    return session;
  }

  private redact(value: string): string {
    return this.stderrRedactions.reduce((output, secret) => secret.length === 0 ? output : output.split(secret).join("[REDACTED]"), value);
  }

  private evictFinishedSessions(): void {
    if (this.sessions.size <= this.maxSessions) return;
    for (const [sessionId, session] of this.sessions) {
      if (!session.ended) continue;
      this.sessions.delete(sessionId);
      if (this.sessions.size <= this.maxSessions) return;
    }
  }
}
