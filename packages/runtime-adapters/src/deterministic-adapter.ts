import { randomUUID } from "node:crypto";
import { createRuntimeMessage } from "./envelope-codec.js";
import { RuntimeAdapterError } from "./errors.js";
import type { AttemptHandle, CapabilityDescriptor, CancelResult, HealthReport, RuntimeAdapter, RuntimeCommand, RuntimeEvent, RuntimeEventType, RuntimePayload, StartInput } from "./runtime-adapter.js";
import { messageIdFor, parseStartInput } from "./runtime-message-utils.js";

export const DETERMINISTIC_SCENARIOS = ["success", "judge_fail", "timeout", "partial", "review_needed", "seo_draft_v1"] as const;
export type DeterministicScenario = (typeof DETERMINISTIC_SCENARIOS)[number];

export type DeterministicAdapterOptions = {
  readonly scenario?: DeterministicScenario;
  readonly adapter_id?: string;
  readonly now?: () => string;
  readonly cancel_mode?: "acknowledged" | "unknown";
  readonly max_sessions?: number;
};

type DeterministicSession = {
  readonly handle: AttemptHandle;
  readonly input: StartInput;
  readonly scenario: DeterministicScenario;
  cursor: string | null;
  resume_cursor: string | null;
  sequence: number;
  cancel_requested: boolean;
  events: readonly RuntimeEvent[] | null;
  terminal: RuntimeEvent | null;
};

export class DeterministicAdapter implements RuntimeAdapter {
  readonly id: string;
  private readonly scenario: DeterministicScenario;
  private readonly now: () => string;
  private readonly cancelMode: "acknowledged" | "unknown";
  private readonly maxSessions: number;
  private readonly sessions = new Map<string, DeterministicSession>();
  private readonly activeAttempts = new Set<string>();

  constructor(options: DeterministicAdapterOptions = {}) {
    this.id = options.adapter_id ?? "deterministic";
    this.scenario = options.scenario ?? "success";
    this.now = options.now ?? (() => new Date().toISOString());
    this.cancelMode = options.cancel_mode ?? "acknowledged";
    this.maxSessions = options.max_sessions ?? 128;
    if (!Number.isInteger(this.maxSessions) || this.maxSessions < 1 || this.maxSessions > 10_000) throw new RuntimeAdapterError("SCHEMA_INVALID", "max_sessions must be between 1 and 10000");
  }

  capabilities(): Promise<CapabilityDescriptor> {
    return Promise.resolve({ adapter_id: this.id, protocol_version: 1, execution_location: "local", supports_resume: true, supports_cancel: true, supports_streaming: true });
  }

  start(input: StartInput): Promise<AttemptHandle> {
    let parsedInput: StartInput;
    try {
      parsedInput = parseStartInput(input);
    } catch (error) {
      return Promise.reject(error);
    }
    const deadlineMs = Date.parse(parsedInput.deadline_at) - Date.parse(this.now());
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) return Promise.reject(new RuntimeAdapterError("CONNECTOR_TIMEOUT", "Runtime deadline has already elapsed"));
    const attemptKey = `${parsedInput.run_id}:${parsedInput.attempt_id}`;
    this.clearExpiredAttempts();
    if (this.activeAttempts.has(attemptKey)) return Promise.reject(new RuntimeAdapterError("STALE_LEASE", "An active runtime session already exists for this attempt"));
    this.activeAttempts.add(attemptKey);
    const handle: AttemptHandle = { adapter_id: this.id, session_id: `${this.id}:${randomUUID()}`, run_id: parsedInput.run_id, attempt_id: parsedInput.attempt_id, step_id: parsedInput.step_id, trace_id: parsedInput.trace_id, lease_id: parsedInput.lease_id, fencing_token: parsedInput.fencing_token, deadline_at: parsedInput.deadline_at, cursor: null };
    this.sessions.set(handle.session_id, { handle, input: parsedInput, scenario: this.scenario, cursor: null, resume_cursor: null, sequence: 0, cancel_requested: false, events: null, terminal: null });
    return Promise.resolve(handle);
  }

  async send(handle: AttemptHandle, command: RuntimeCommand): Promise<void> {
    const session = this.session(handle);
    switch (command.type) {
      case "heartbeat":
        return;
      case "resume":
        session.resume_cursor = command.cursor;
        session.cursor = command.cursor;
        return;
      case "cancel":
        session.cancel_requested = true;
        return;
      default:
        return assertNeverCommand(command);
    }
  }

  cancel(handle: AttemptHandle): Promise<CancelResult> {
    const session = this.session(handle);
    if (session.terminal !== null) return Promise.resolve({ state: "cancel_unknown", reason: "Runtime session is already terminal" });
    session.cancel_requested = true;
    if (this.cancelMode === "unknown") return Promise.resolve({ state: "cancel_unknown", reason: "Runtime did not acknowledge cancellation" });
    return Promise.resolve({ state: "cancelled", reason: "Runtime acknowledged cancellation" });
  }

  health(): Promise<HealthReport> {
    return Promise.resolve({ status: "healthy", checked_at: this.now(), details: { adapter: this.id, mode: "fixture" } });
  }

  async *collect(handle: AttemptHandle): AsyncIterable<RuntimeEvent> {
    const session = this.session(handle);
    if (session.events !== null) {
      yield* this.collectEvents(session, session.events);
      return;
    }
    if (Date.parse(this.now()) >= Date.parse(session.input.deadline_at)) {
      const timeout = this.event(session, "timeout", { error_code: "CONNECTOR_TIMEOUT" });
      session.events = [timeout];
      session.terminal = timeout;
      yield timeout;
      this.activeAttempts.delete(`${session.input.run_id}:${session.input.attempt_id}`);
      return;
    }
    try {
      const events = this.eventsFor(session);
      yield* this.collectEvents(session, events);
    } finally {
      if (session.terminal !== null) this.activeAttempts.delete(`${session.input.run_id}:${session.input.attempt_id}`);
      this.evictFinishedSessions();
    }
  }

  private async *collectEvents(session: DeterministicSession, events: readonly RuntimeEvent[]): AsyncIterable<RuntimeEvent> {
    if (session.resume_cursor !== null && !/^\d+$/.test(session.resume_cursor)) throw new RuntimeAdapterError("SCHEMA_INVALID", "Runtime resume cursor must be a decimal sequence");
    const cursor = session.resume_cursor === null ? 0 : Number(session.resume_cursor);
    const startIndex = Number.isInteger(cursor) && cursor > 0 ? cursor : 0;
    for (const [index, event] of events.entries()) {
      if (index < startIndex) continue;
      session.sequence = event.envelope.sequence;
      session.cursor = event.envelope.cursor;
      yield event;
    }
  }

  private session(handle: AttemptHandle): DeterministicSession {
    const session = this.sessions.get(handle.session_id);
    if (session === undefined) throw new RuntimeAdapterError("RUNTIME_CRASHED", "Deterministic runtime session is not current");
    if (session.handle.adapter_id !== handle.adapter_id || session.handle.run_id !== handle.run_id || session.handle.attempt_id !== handle.attempt_id || session.handle.step_id !== handle.step_id || session.handle.trace_id !== handle.trace_id || session.handle.lease_id !== handle.lease_id || session.handle.fencing_token !== handle.fencing_token) throw new RuntimeAdapterError("STALE_LEASE", "Deterministic runtime session context or fencing token is stale");
    return session;
  }

  private clearExpiredAttempts(): void {
    const now = Date.parse(this.now());
    for (const [sessionId, session] of this.sessions.entries()) {
      if (Date.parse(session.input.deadline_at) <= now) {
        this.sessions.delete(sessionId);
        this.activeAttempts.delete(`${session.input.run_id}:${session.input.attempt_id}`);
      }
    }
  }

  private evictFinishedSessions(): void {
    if (this.sessions.size <= this.maxSessions) return;
    for (const [sessionId, session] of this.sessions) {
      if (session.terminal === null) continue;
      this.sessions.delete(sessionId);
      if (this.sessions.size <= this.maxSessions) return;
    }
  }

  private eventsFor(session: DeterministicSession): readonly RuntimeEvent[] {
    if (session.events !== null) return session.events;
    if (session.cancel_requested && this.cancelMode === "acknowledged") {
      const cancelled = this.event(session, "cancelled", { reason: "Runtime acknowledged cancellation" });
      session.events = [cancelled];
      session.terminal = cancelled;
      return session.events;
    }
    const events: RuntimeEvent[] = [
      this.event(session, "started", { phase: "run" }),
      this.event(session, "tool_called", { tool: "fixture", status: "succeeded" }),
      this.event(session, "artifact_created", { artifact_ref: "artifact://fixture/output" }),
    ];
    switch (session.scenario) {
      case "success": events.push(this.event(session, "completed", { runtime_status: "completed" })); break;
      case "judge_fail": events.push(this.event(session, "judge_failed", { reason: "Fixture judge rejected output" })); break;
      case "timeout": events.push(this.event(session, "timeout", { error_code: "CONNECTOR_TIMEOUT" })); break;
      case "partial": events.push(this.event(session, "partial", { completed: 1, remaining: 1 })); break;
      case "review_needed": events.push(this.event(session, "review_needed", { risk_level: "R3", required_action: "human_review" })); break;
      case "seo_draft_v1":
        events.push(
          this.event(session, "judge_completed", { workflow_id: "seo_draft_v1", judge_status: "pass", quality_gates: 5 }),
          this.event(session, "review_needed", { workflow_id: "seo_draft_v1", publish_disabled: true, run_status: "waiting_review", risk_level: "R2", required_action: "human_review" }),
        );
        break;
      default: return assertNeverScenario(session.scenario);
    }
    session.events = events;
    session.terminal = events[events.length - 1] ?? null;
    return events;
  }

  private event(session: DeterministicSession, type: RuntimeEventType, data: RuntimePayload): RuntimeEvent {
    const sequence = session.sequence + 1;
    const cursor = String(sequence);
    const envelope = createRuntimeMessage({ schema_version: 1, protocol_version: 1, message_id: messageIdFor(session.handle.session_id, sequence), message_type: "event", run_id: session.input.run_id, attempt_id: session.input.attempt_id, step_id: session.input.step_id, trace_id: session.input.trace_id, sequence, cursor, deadline_at: session.input.deadline_at, lease_id: session.input.lease_id, fencing_token: session.input.fencing_token, payload: { event_type: type, data } });
    session.sequence = sequence;
    return { type, envelope, data };
  }
}

function assertNeverCommand(command: never): never {
  throw new RuntimeAdapterError("SCHEMA_INVALID", `Unsupported runtime command ${String(command)}`);
}

function assertNeverScenario(scenario: never): never {
  throw new RuntimeAdapterError("SCHEMA_INVALID", `Unsupported deterministic scenario ${String(scenario)}`);
}
