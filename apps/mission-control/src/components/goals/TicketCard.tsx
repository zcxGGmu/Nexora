import { useState } from "react";
import type { ChangeEvent, JSX } from "react";

import { statusClassForTone, type StatusTone } from "../../design/status.js";

export type TicketLaneStatus = "Backlog" | "Ready" | "Running" | "Review" | "Done" | "Blocked" | "Paused" | "Failed";

export type TicketCardView = {
  readonly id: string;
  readonly title: string;
  readonly status: TicketLaneStatus;
  readonly runId: string;
  readonly owner: string;
  readonly tone: StatusTone;
};

export function TicketCard(props: { readonly ticket: TicketCardView }): JSX.Element {
  const [plannedStatus, setPlannedStatus] = useState<TicketLaneStatus>(props.ticket.status);
  const changeStatus = (event: ChangeEvent<HTMLSelectElement>): void => {
    setPlannedStatus(statusFromValue(event.currentTarget.value, plannedStatus));
  };
  return (
    <article className="ticket-card" draggable="true" aria-describedby={`${props.ticket.id}-drag-note`}>
      <h3>Ticket {props.ticket.id}</h3>
      <p>{props.ticket.title}</p>
      <div className="row-meta">Owner {props.ticket.owner} | Run {props.ticket.runId}</div>
      <span className={statusClassForTone(props.ticket.tone)}>{plannedStatus}</span>
      <label className="field-label" htmlFor={`${props.ticket.id}-status`}>Keyboard status menu</label>
      <select id={`${props.ticket.id}-status`} aria-label="Change ticket status" onChange={changeStatus} value={plannedStatus}>
        {laneStatuses.map((status) => <option key={status}>{status}</option>)}
      </select>
      <p className="state-plane__action">Planned status {plannedStatus}</p>
      <p className="meta">Status change queued as planning update only; no Agent started.</p>
      <p className="meta" id={`${props.ticket.id}-drag-note`}>Drag updates planning only and does not start an Agent.</p>
    </article>
  );
}

export const laneStatuses = ["Backlog", "Ready", "Running", "Review", "Done", "Blocked", "Paused", "Failed"] as const;

function statusFromValue(value: string, fallback: TicketLaneStatus): TicketLaneStatus {
  switch (value) {
    case "Backlog":
    case "Ready":
    case "Running":
    case "Review":
    case "Done":
    case "Blocked":
    case "Paused":
    case "Failed":
      return value;
    default:
      return fallback;
  }
}
