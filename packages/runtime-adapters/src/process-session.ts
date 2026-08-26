import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { StringDecoder } from "node:string_decoder";
import type { RuntimeMessage } from "./envelope-codec.js";
import { RuntimeAdapterError } from "./errors.js";
import type { AttemptHandle, StartInput } from "./runtime-adapter.js";

export type MessageWaiter = {
  readonly message_type: RuntimeMessage["message_type"] | null;
  readonly resolve: (message: RuntimeMessage) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
};

export type ProcessSession = {
  readonly handle: AttemptHandle;
  readonly input: StartInput;
  readonly process: ChildProcessWithoutNullStreams;
  readonly stderr_lines: string[];
  readonly queue: RuntimeMessage[];
  readonly waiters: MessageWaiter[];
  readonly seen_message_ids: Set<string>;
  readonly message_fingerprints: Map<string, string>;
  readonly attempt_key: string;
  line_buffer: string;
  sequence: number;
  cursor: string | null;
  ended: boolean;
  exit_code: number | null;
  process_error: Error | null;
  last_incoming_sequence: number;
  stdout_bytes: number;
  stderr_bytes: number;
  stderr_buffer: string;
  readonly stdout_decoder: StringDecoder;
  readonly stderr_decoder: StringDecoder;
  closed_by_envelope: boolean;
  deadline_timer: ReturnType<typeof setTimeout> | null;
  cancel_pending: boolean;
};

export function pushMessage(session: ProcessSession, message: RuntimeMessage, validate: () => void): void {
  validate();
  if (session.seen_message_ids.has(message.message_id)) {
    const fingerprint = JSON.stringify(message);
    if (session.message_fingerprints.get(message.message_id) !== fingerprint) throw new RuntimeAdapterError("SCHEMA_INVALID", "Runtime message_id was reused with different content");
    return;
  }
  if (message.sequence <= session.last_incoming_sequence) throw new RuntimeAdapterError("SCHEMA_INVALID", "Runtime envelope sequence moved backwards or was reused");
  session.seen_message_ids.add(message.message_id);
  session.message_fingerprints.set(message.message_id, JSON.stringify(message));
  session.last_incoming_sequence = message.sequence;
  const waiterIndex = session.waiters.findIndex((waiter) => waiter.message_type === null || waiter.message_type === message.message_type);
  const waiter = waiterIndex < 0 ? undefined : session.waiters.splice(waiterIndex, 1)[0];
  if (waiter === undefined) session.queue.push(message);
  else { clearTimeout(waiter.timer); waiter.resolve(message); }
}

export function waitForMessage(session: ProcessSession, messageType: RuntimeMessage["message_type"], timeoutMs: number): Promise<RuntimeMessage> {
  const queuedIndex = session.queue.findIndex((message) => message.message_type === messageType);
  if (queuedIndex >= 0) {
    const message = session.queue.splice(queuedIndex, 1)[0];
    if (message !== undefined) return Promise.resolve(message);
  }
  if (session.ended) return Promise.reject(new RuntimeAdapterError(messageType === "cancel_ack" ? "CANCEL_UNKNOWN" : "RUNTIME_CRASHED", "Local runtime ended before responding"));
  return new Promise<RuntimeMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      const index = session.waiters.findIndex((waiter) => waiter.timer === timer);
      if (index >= 0) session.waiters.splice(index, 1);
      reject(new RuntimeAdapterError(messageType === "cancel_ack" ? "CANCEL_UNKNOWN" : "RUNTIME_CRASHED", `Runtime did not respond with ${messageType}`));
    }, timeoutMs);
    session.waiters.push({ message_type: messageType, resolve, reject, timer });
  });
}

export function nextMessage(session: ProcessSession): Promise<RuntimeMessage> {
  if (session.process_error instanceof RuntimeAdapterError) return Promise.reject(session.process_error);
  const message = session.queue.shift();
  if (message !== undefined) return Promise.resolve(message);
  if (session.ended) {
    if (session.exit_code !== null && session.exit_code !== 0) return Promise.reject(new RuntimeAdapterError("RUNTIME_CRASHED", `Local runtime exited with code ${String(session.exit_code)}`));
    return Promise.reject(new RuntimeAdapterError("RUNTIME_CRASHED", "Local runtime closed without a close envelope"));
  }
  return new Promise<RuntimeMessage>((resolve, reject) => session.waiters.push({ message_type: null, resolve, reject, timer: setTimeout(() => undefined, 2_147_483_647) }));
}

export function rejectWaiters(session: ProcessSession, error: Error): void {
  for (const waiter of session.waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(error); }
}

export function recordStderr(session: ProcessSession, chunk: Buffer, maxBytes: number): void {
  session.stderr_bytes += chunk.byteLength;
  if (session.stderr_bytes > maxBytes) {
    const error = new RuntimeAdapterError("SCHEMA_INVALID", "Local runtime stderr exceeded max_stderr_bytes");
    session.process_error = error;
    rejectWaiters(session, error);
    if (!session.ended) session.process.kill();
    return;
  }
  session.stderr_buffer += session.stderr_decoder.write(chunk);
}

export function flushStderr(session: ProcessSession, redact: (value: string) => string): void {
  session.stderr_buffer += session.stderr_decoder.end();
  if (session.stderr_buffer.length === 0) return;
  session.stderr_lines.push(redact(session.stderr_buffer));
  session.stderr_buffer = "";
}

export function expireSession(session: ProcessSession): void {
  if (session.ended) return;
  const error = new RuntimeAdapterError("CONNECTOR_TIMEOUT", "Runtime deadline exceeded");
  session.process_error = error;
  rejectWaiters(session, error);
  session.process.kill();
}
