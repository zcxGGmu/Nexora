import type { JSX } from "react";

export type GoalTreeRun = { readonly id: string; readonly status: string; readonly href: string };
export type GoalTreeTicket = { readonly id: string; readonly title: string; readonly runs: readonly GoalTreeRun[] };
export type GoalTreeMilestone = { readonly title: string; readonly tickets: readonly GoalTreeTicket[] };
export type GoalTreeView = { readonly title: string; readonly milestones: readonly GoalTreeMilestone[] };

export function GoalTree(props: { readonly goal: GoalTreeView }): JSX.Element {
  return (
    <section className="panel" aria-labelledby="goal-tree-title">
      <div className="panel-header"><h2 id="goal-tree-title">Goal Tree</h2></div>
      <div className="tree-list" role="tree">
        <div role="treeitem" aria-expanded="true">Goal: {props.goal.title}</div>
        {props.goal.milestones.map((milestone) => (
          <section className="tree-branch" key={milestone.title}>
            <div role="treeitem" aria-expanded="true">Milestone: {milestone.title}</div>
            {milestone.tickets.map((ticket) => (
              <article className="tree-leaf" key={ticket.id}>
                <div role="treeitem" aria-expanded="true">Ticket {ticket.id}</div>
                <p>{ticket.title}</p>
                {ticket.runs.map((run) => <a className="row-action" href={run.href} key={run.id}>Run {run.id} | {run.status}</a>)}
              </article>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
