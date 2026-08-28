import type { JSX } from "react";

import { GoalTree, type GoalTreeView } from "../components/goals/GoalTree.js";
import { KanbanBoard, type KanbanLane } from "../components/goals/KanbanBoard.js";

export type GoalWorkspaceView = {
  readonly goal: GoalTreeView;
  readonly lanes: readonly KanbanLane[];
};

export const goalWorkspaceFixture: GoalWorkspaceView = {
  goal: {
    milestones: [
      {
        tickets: [
          { id: "SEO-147", runs: [{ href: "/runs/run-active?workspace=ws-demo&tab=events", id: "run-active", status: "Waiting for R2 review" }], title: "Publish source-backed update summary" },
        ],
        title: "Source-backed launch draft",
      },
    ],
    title: "Ship verified SEO workflow",
  },
  lanes: [
    { status: "Running", tickets: [{ id: "SEO-147", owner: "Operator", runId: "run-active", status: "Running", title: "Publish source-backed update summary", tone: "info" }] },
    { status: "Blocked", tickets: [{ id: "SEO-188", owner: "Reviewer", runId: "run-blocked", status: "Blocked", title: "Refresh connector auth receipt", tone: "warning" }] },
  ],
};

export function GoalPage(props: { readonly view: GoalWorkspaceView }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Goal Portfolio</p>
        <h1 id="route-title">Goal Portfolio</h1>
        <p>Planning hierarchy and Kanban status are separate from explicit Agent execution commands.</p>
      </header>
      <section className="list-detail">
        <GoalTree goal={props.view.goal} />
        <KanbanBoard lanes={props.view.lanes} />
      </section>
    </div>
  );
}
