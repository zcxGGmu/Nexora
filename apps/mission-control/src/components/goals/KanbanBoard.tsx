import type { JSX } from "react";

import { TicketCard, type TicketCardView, type TicketLaneStatus, laneStatuses } from "./TicketCard.js";

export type KanbanLane = {
  readonly status: TicketLaneStatus;
  readonly tickets: readonly TicketCardView[];
};

export function KanbanBoard(props: { readonly lanes: readonly KanbanLane[] }): JSX.Element {
  return (
    <section className="panel" aria-labelledby="kanban-title">
      <div className="panel-header">
        <h2 id="kanban-title">Kanban Board</h2>
        <span className="status-badge status-badge--info">Drag updates planning only</span>
      </div>
      <p className="interaction-note">Status changes do not start an Agent; Start Agent requires explicit command.</p>
      <div className="kanban-board">
        {normalizedLanes(props.lanes).map((lane) => (
          <section className="kanban-lane" key={lane.status} aria-label={`${lane.status} lane`}>
            <div className="panel-header lane-header">
              <h3>{lane.status}</h3>
              <span className="mono meta">{lane.tickets.length}</span>
            </div>
            {lane.tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
          </section>
        ))}
      </div>
    </section>
  );
}

function normalizedLanes(lanes: readonly KanbanLane[]): readonly KanbanLane[] {
  return laneStatuses.map((status) => lanes.find((lane) => lane.status === status) ?? { status, tickets: [] });
}
