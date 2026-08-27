import { EventStore, encodeEventCursor } from "@nexora/event-store";
import type { EventEnvelope } from "@nexora/contracts";
import type { SqliteDatabase } from "@nexora/persistence";
import { ApiHttpError } from "./errors.js";

type PublicRunEvent = Pick<EventEnvelope, "event_id" | "event_type" | "schema_version" | "occurred_at" | "workspace_id" | "run_id" | "attempt_id" | "step_id" | "sequence">;

export type EventStreamInput = {
  readonly workspace_id: string;
  readonly run_id: string;
  readonly after: string | null;
  readonly last_event_id: string | null;
  readonly limit: number;
  readonly step_id: string | null;
};

export class SseService {
  private readonly events: EventStore;

  constructor(private readonly database: SqliteDatabase) {
    this.events = new EventStore(database);
  }

  stream(input: EventStreamInput): string {
    const after = input.after ?? this.cursorForLastEventId(input.workspace_id, input.run_id, input.last_event_id);
    const page = this.events.listEvents({ workspaceId: input.workspace_id, runId: input.run_id, after, limit: input.limit, stepId: input.step_id });
    const events = page.events;
    return `${events.map(formatSseEvent).join("")}event: nexora.cursor\ndata: ${JSON.stringify({ next_cursor: page.next_cursor, last_event_id: events.at(-1)?.event_id ?? null })}\n\n`;
  }

  private cursorForLastEventId(workspaceId: string, runId: string, eventId: string | null): string | null {
    if (eventId === null) return null;
    const row = this.database.prepare("SELECT sequence FROM events WHERE workspace_id = ? AND run_id = ? AND event_id = ?").get(workspaceId, runId, eventId);
    if (row === undefined) throw new ApiHttpError({ status_code: 410, code: "EVENT_CURSOR_EXPIRED", message: "Last-Event-ID is not available for this run", retryable: false, required_action: "restart_event_stream" });
    return encodeEventCursor(runId, readInteger(row["sequence"]));
  }
}

function formatSseEvent(event: EventEnvelope): string {
  return `id: ${event.event_id}\nevent: ${event.event_type}\ndata: ${JSON.stringify(publicRunEvent(event))}\n\n`;
}

function publicRunEvent(event: EventEnvelope): PublicRunEvent {
  return {
    event_id: event.event_id,
    event_type: event.event_type,
    schema_version: event.schema_version,
    occurred_at: event.occurred_at,
    workspace_id: event.workspace_id,
    run_id: event.run_id,
    attempt_id: event.attempt_id,
    step_id: event.step_id,
    sequence: event.sequence,
  };
}

function readInteger(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint") return Number(value);
  throw new ApiHttpError({ status_code: 500, code: "SCHEMA_INVALID", message: "Stored integer column failed validation", retryable: false, required_action: "inspect_storage" });
}
