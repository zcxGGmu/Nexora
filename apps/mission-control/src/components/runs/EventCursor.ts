export type EventCursorState = {
  readonly cursor: string;
  readonly lastEventId: string;
  readonly status: "live" | "paused" | "replay";
};

export function formatEventCursor(cursor: EventCursorState): string {
  return `${cursor.status} cursor ${cursor.cursor} after ${cursor.lastEventId}`;
}
