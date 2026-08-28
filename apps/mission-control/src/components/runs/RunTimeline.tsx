import type { JSX } from "react";

import { formatEventCursor, type EventCursorState } from "./EventCursor.js";

export type RunTimelineEvent = {
  readonly id: string;
  readonly time: string;
  readonly title: string;
  readonly impact: string;
  readonly evidenceHref: string;
};

export function RunTimeline(props: { readonly events: readonly RunTimelineEvent[]; readonly cursor: EventCursorState }): JSX.Element {
  return (
    <section className="panel" aria-labelledby="run-timeline-title">
      <div className="panel-header">
        <h2 id="run-timeline-title">Timeline</h2>
        <span className="mono meta">{formatEventCursor(props.cursor)}</span>
      </div>
      <ol className="timeline-list">
        {props.events.map((event) => (
          <li className="timeline-event" key={event.id}>
            <span className="mono meta">{event.time}</span>
            <div>
              <h3>{event.title}</h3>
              <p>{event.impact}</p>
              <a className="row-action" href={event.evidenceHref}>Open event evidence</a>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
