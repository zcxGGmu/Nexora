import type { EventEnvelope } from "@nexora/contracts";

const CURSOR_PREFIX = "run";

export function encodeEventCursor(runId: string, sequence: number): string {
  return `${CURSOR_PREFIX}:${runId}:${sequence}`;
}

export function decodeEventCursor(cursor: string): { readonly runId: string; readonly sequence: number } | undefined {
  const [prefix, runId, sequenceText, extra] = cursor.split(":");
  if (prefix !== CURSOR_PREFIX || runId === undefined || sequenceText === undefined || extra !== undefined) return undefined;
  if (!/^\d+$/.test(sequenceText)) return undefined;
  const sequence = Number(sequenceText);
  if (!Number.isInteger(sequence) || sequence < 0) return undefined;
  return { runId, sequence };
}

export function dedupeEvents(seenEventIds: readonly string[], events: readonly EventEnvelope[]): EventEnvelope[] {
  const seen = new Set(seenEventIds);
  const unique: EventEnvelope[] = [];
  for (const event of events) {
    if (seen.has(event.event_id)) continue;
    seen.add(event.event_id);
    unique.push(event);
  }
  return unique;
}
