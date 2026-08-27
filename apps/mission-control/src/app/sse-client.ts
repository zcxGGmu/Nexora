export type RunStreamEvent = {
  readonly event_id: string;
  readonly event_type: string;
  readonly schema_version: 1;
  readonly occurred_at: string;
  readonly workspace_id: string;
  readonly run_id: string;
  readonly attempt_id: string | null;
  readonly step_id: string | null;
  readonly sequence: number;
};

export type EventStreamState = {
  readonly events: readonly RunStreamEvent[];
  readonly seenEventIds: ReadonlySet<string>;
  readonly lastEventId: string | null;
  readonly cursor: string | null;
};

export type RunEventsUrlInput = {
  readonly apiBaseUrl: string;
  readonly workspace: string;
  readonly runId: string;
  readonly after: string | null;
  readonly limit: number;
  readonly stepId: string | null;
};

export function createEventStreamState(): EventStreamState {
  return { events: [], seenEventIds: new Set<string>(), lastEventId: null, cursor: null };
}

export function reduceEventStreamState(state: EventStreamState, event: RunStreamEvent): EventStreamState {
  if (state.seenEventIds.has(event.event_id)) return state;
  const seenEventIds = new Set(state.seenEventIds);
  seenEventIds.add(event.event_id);
  return {
    events: [...state.events, event],
    seenEventIds,
    lastEventId: event.event_id,
    cursor: String(event.sequence),
  };
}

export function buildRunEventsUrl(input: RunEventsUrlInput): string {
  const base = input.apiBaseUrl.endsWith("/") ? input.apiBaseUrl.slice(0, -1) : input.apiBaseUrl;
  const url = new URL(`${base}/v1/runs/${encodeURIComponent(input.runId)}/events`);
  url.searchParams.set("workspace_id", input.workspace);
  if (input.after !== null) url.searchParams.set("after", input.after);
  url.searchParams.set("limit", String(input.limit));
  if (input.stepId !== null) url.searchParams.set("step_id", input.stepId);
  return url.toString();
}

export function createRunEventSource(input: RunEventsUrlInput): EventSource {
  return new EventSource(buildRunEventsUrl(input));
}
