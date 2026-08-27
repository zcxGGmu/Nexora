import { EventEnvelopeSchema, systemClock, type Clock, type EventEnvelope } from "@nexora/contracts";
import { withTransaction, type SqliteDatabase } from "@nexora/persistence";
import { decodeEventCursor, encodeEventCursor } from "./cursor.js";

export const EVENT_CURSOR_EXPIRED = "EVENT_CURSOR_EXPIRED";

export type EventStoreErrorCode = "EVENT_CURSOR_EXPIRED" | "EVENT_DUPLICATE" | "EVENT_LIMIT_INVALID" | "EVENT_SCOPE_MISMATCH" | "EVENT_SEQUENCE_CONFLICT" | "EVENT_STALE_LEASE";

export type EventLeaseToken = {
  readonly workspace_id: string;
  readonly job_id: string;
  readonly run_id: string;
  readonly step_id: string;
  readonly lease_id: string;
  readonly fencing_token: number;
};

export class EventStoreError extends Error {
  readonly code: EventStoreErrorCode;

  constructor(code: EventStoreErrorCode, message: string) {
    super(message);
    this.name = "EventStoreError";
    this.code = code;
  }
}

export type EventPage = {
  readonly events: readonly EventEnvelope[];
  readonly next_cursor: string | null;
  readonly last_event_id: string | null;
};

export type ListEventsInput = {
  readonly workspaceId: string;
  readonly runId: string;
  readonly after: string | null;
  readonly limit: number;
  readonly stepId?: string | null;
};

export class EventStore {
  constructor(private readonly database: SqliteDatabase, private readonly clock: Clock = systemClock) {}

  append(event: EventEnvelope, expectedSequence: number): EventEnvelope {
    const parsed = EventEnvelopeSchema.parse(event);
    if (parsed.scope.kind !== "run" || parsed.scope.id !== parsed.run_id) {
      throw new EventStoreError("EVENT_SCOPE_MISMATCH", "Event scope must match its run");
    }

    return withTransaction(this.database, () => this.appendParsed(parsed, expectedSequence));
  }

  appendFenced(event: EventEnvelope, expectedSequence: number, lease: EventLeaseToken): EventEnvelope {
    const parsed = EventEnvelopeSchema.parse(event);
    if (parsed.workspace_id !== lease.workspace_id || parsed.run_id !== lease.run_id || parsed.step_id !== lease.step_id) throw new EventStoreError("EVENT_STALE_LEASE", "Event does not match the leased step");
    return withTransaction(this.database, () => {
      const leaseRow = this.database.prepare("SELECT job_id, run_id, step_id, fencing_token, status, expires_at FROM leases WHERE workspace_id = ? AND lease_id = ?").get(lease.workspace_id, lease.lease_id);
      if (leaseRow === undefined || readText(leaseRow["job_id"]) !== lease.job_id || readText(leaseRow["run_id"]) !== lease.run_id || readText(leaseRow["step_id"]) !== lease.step_id || readInteger(leaseRow["fencing_token"]) !== lease.fencing_token || readText(leaseRow["status"]) !== "active" || readText(leaseRow["expires_at"]) <= this.clock.now()) throw new EventStoreError("EVENT_STALE_LEASE", "Event write was rejected by fencing");
      return this.appendParsed(parsed, expectedSequence);
    });
  }

  listEvents(input: ListEventsInput): EventPage {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 1000) {
      throw new EventStoreError("EVENT_LIMIT_INVALID", "Event page limit must be between 1 and 1000");
    }
    const afterSequence = this.afterSequence(input);
    const rows = input.stepId === undefined || input.stepId === null
      ? this.database.prepare("SELECT payload_json, sequence, event_id FROM events WHERE workspace_id = ? AND run_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT ?").all(input.workspaceId, input.runId, afterSequence, input.limit + 1)
      : this.database.prepare("SELECT payload_json, sequence, event_id FROM events WHERE workspace_id = ? AND run_id = ? AND step_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT ?").all(input.workspaceId, input.runId, input.stepId, afterSequence, input.limit + 1);
    const pageRows = rows.slice(0, input.limit);
    const events = pageRows.map((row) => EventEnvelopeSchema.parse(JSON.parse(readText(row["payload_json"]))));
    const lastEvent = events.at(-1);
    const hasNextPage = rows.length > input.limit;
    return {
      events,
      next_cursor: hasNextPage && lastEvent !== undefined ? encodeEventCursor(input.runId, lastEvent.sequence) : null,
      last_event_id: lastEvent?.event_id ?? null,
    };
  }

  private currentSequence(workspaceId: string, runId: string): number {
    const row = this.database.prepare("SELECT MAX(sequence) AS sequence FROM events WHERE workspace_id = ? AND run_id = ?").get(workspaceId, runId);
    const value = row?.["sequence"];
    if (value === null || value === undefined) return -1;
    return readInteger(value);
  }

  private appendParsed(parsed: EventEnvelope, expectedSequence: number): EventEnvelope {
    const currentSequence = this.currentSequence(parsed.workspace_id, parsed.run_id);
    if (currentSequence !== expectedSequence || parsed.sequence !== currentSequence + 1) throw new EventStoreError("EVENT_SEQUENCE_CONFLICT", "Event sequence must be the next run sequence");
    try {
      this.database.prepare("INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(parsed.event_id, parsed.workspace_id, parsed.run_id, parsed.sequence, parsed.event_type, parsed.occurred_at, this.clock.now(), parsed.trace_id, parsed.attempt_id, parsed.step_id, JSON.stringify(parsed), parsed.schema_version);
    } catch (error) {
      throw eventStoreSqliteError(error);
    }
    return parsed;
  }

  private afterSequence(input: ListEventsInput): number {
    if (input.after === null) return -1;
    const cursor = decodeEventCursor(input.after);
    if (cursor === undefined || cursor.runId !== input.runId) throw new EventStoreError("EVENT_CURSOR_EXPIRED", EVENT_CURSOR_EXPIRED);
    const row = this.database.prepare("SELECT event_id FROM events WHERE workspace_id = ? AND run_id = ? AND sequence = ?").get(input.workspaceId, input.runId, cursor.sequence);
    if (row === undefined) throw new EventStoreError("EVENT_CURSOR_EXPIRED", EVENT_CURSOR_EXPIRED);
    return cursor.sequence;
  }
}

function eventStoreSqliteError(error: unknown): EventStoreError {
  const message = error instanceof Error ? error.message : "SQLite event append failed";
  if (/UNIQUE constraint failed: .*events/i.test(message)) return new EventStoreError("EVENT_DUPLICATE", "Event already exists or sequence is already used");
  if (/FOREIGN KEY constraint failed/i.test(message)) return new EventStoreError("EVENT_SCOPE_MISMATCH", "Event references a missing scoped run");
  return new EventStoreError("EVENT_SEQUENCE_CONFLICT", "Event append failed");
}

function readText(value: unknown): string {
  if (typeof value !== "string") throw new EventStoreError("EVENT_SEQUENCE_CONFLICT", "Expected text column");
  return value;
}

function readInteger(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint") return Number(value);
  throw new EventStoreError("EVENT_SEQUENCE_CONFLICT", "Expected integer column");
}
