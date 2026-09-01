import { CircleDashed } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { JSX } from "react";

import {
  createGoalModeSubgoal,
  fetchGoalModeProjection,
  resolveGoalModeWorkspace,
  sendGoalModeControl,
  shouldUseGoalModePlanningFallback,
  type GoalModeControlAction,
  type GoalModeLoopDetail,
  type GoalModeProjection,
} from "../app/goal-mode-api.js";
import { GoalTree, type GoalTreeView } from "../components/goals/GoalTree.js";
import { KanbanBoard, type KanbanLane } from "../components/goals/KanbanBoard.js";
import type { TicketLaneStatus } from "../components/goals/TicketCard.js";

export type GoalWorkspaceView = {
  readonly goal: GoalTreeView;
  readonly lanes: readonly KanbanLane[];
  readonly goalMode: {
    readonly loopId: string;
    readonly status: string;
    readonly cursor: string;
    readonly runScope: string;
    readonly sessionScope: string;
    readonly maxTurns: string;
    readonly deadline: string;
    readonly budget: string;
    readonly judgeReason: string;
    readonly orphanRecovery: string;
  };
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
  goalMode: {
    budget: "20k tokens / $2.00",
    cursor: "turn-2",
    deadline: "2026-09-01T05:00:00.000Z",
    judgeReason: "Need one more verification turn.",
    loopId: "goal-loop-c20",
    maxTurns: "2 of 5",
    orphanRecovery: "Restart recovery records a descriptor-only continuation before resuming work.",
    runScope: "run-active",
    sessionScope: "session-background-c20",
    status: "running",
  },
};

type GoalModeUiCommand = GoalModeControlAction | "resume-command" | "subgoal";

const GOAL_MODE_UNAVAILABLE_FEEDBACK = "Goal Mode control data unavailable; showing local planning fixture. No external connection was attempted.";

export function GoalPage(props: { readonly workspaceId?: string; readonly view?: GoalWorkspaceView }): JSX.Element {
  if (props.view !== undefined) return <GoalPageContent view={props.view} />;
  return <LiveGoalPage workspaceId={props.workspaceId ?? "ws-demo"} />;
}

function LiveGoalPage(props: { readonly workspaceId: string }): JSX.Element {
  const workspaceResolution = resolveGoalModeWorkspace(props.workspaceId);
  const apiWorkspaceId = workspaceResolution.kind === "resolved" ? workspaceResolution.workspace_id : null;
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["goal-mode", apiWorkspaceId],
    queryFn: () => {
      if (apiWorkspaceId === null) throw new Error("Goal Mode workspace scope is invalid");
      return fetchGoalModeProjection(apiWorkspaceId);
    },
    enabled: apiWorkspaceId !== null,
  });
  const command = useMutation({
    mutationFn: async (input: { readonly kind: GoalModeUiCommand; readonly detail: GoalModeLoopDetail }) => {
      if (apiWorkspaceId === null) throw new Error("Goal Mode workspace scope is invalid");
      const loop = input.detail.goal_loop;
      const idempotencyKey = `goal:${input.kind}:${loop.id}:${crypto.randomUUID()}`;
      if (input.kind === "subgoal") {
        await createGoalModeSubgoal({
          workspace_id: apiWorkspaceId,
          parent_loop_id: loop.id,
          objective: "Investigate the next blocked verification item.",
          max_turns: Math.min(loop.max_turns, 2),
          deadline_at: loop.deadline_at,
          budget: loop.budget,
          expected_revision: input.detail.version,
        }, idempotencyKey);
        return;
      }
      const action = input.kind === "resume-command" ? "resume" : input.kind;
      if (action === "resume") {
        const cursorInput = loop.continuation_cursor === null ? {} : { cursor: loop.continuation_cursor };
        await sendGoalModeControl({ workspace_id: apiWorkspaceId, goal_loop_id: loop.id, action, expected_revision: input.detail.version, ...cursorInput }, idempotencyKey);
        return;
      }
      if (action === "steer") {
        await sendGoalModeControl({ workspace_id: apiWorkspaceId, goal_loop_id: loop.id, action, expected_revision: input.detail.version, instruction: "Continue from the last verified checkpoint." }, idempotencyKey);
        return;
      }
      if (action === "judge") {
        await sendGoalModeControl({ workspace_id: apiWorkspaceId, goal_loop_id: loop.id, action, expected_revision: input.detail.version, judge: { done: false, reason: "Mission Control reviewer requested another verified loop turn." } }, idempotencyKey);
        return;
      }
      await sendGoalModeControl({ workspace_id: apiWorkspaceId, goal_loop_id: loop.id, action, expected_revision: input.detail.version }, idempotencyKey);
    },
    onSuccess: async (_data, input) => {
      setFeedback(`${input.kind} accepted; rereading Goal Mode projection.`);
      await queryClient.invalidateQueries({ queryKey: ["goal-mode", apiWorkspaceId] });
    },
    onError: () => {
      setFeedback("Goal Mode command was not accepted. Refresh the projection and check the loop revision.");
    },
  });

  if (apiWorkspaceId === null) return <GoalModeState title="Invalid Goal Mode workspace scope" message="Goal Mode control data requires a canonical workspace ULID or the explicit local demo alias. No API request or external connection was attempted." alert />;
  if (query.isPending) return <GoalModeState title="Loading Goal Mode control data" message="Reading workspace-scoped loop descriptors, continuation checkpoints, Judge facts, and revision state." />;
  if (query.isError) {
    if (shouldUseGoalModePlanningFallback(query.error)) return <GoalModeUnavailableFallback onRetry={() => void query.refetch()} />;
    return <GoalModeState title="Goal Mode control data denied" message="The control API rejected this workspace-scoped Goal Mode projection. Refresh authentication or select an allowed workspace; local fixture data is not shown for authorization, scope, or revision errors." alert onRetry={() => void query.refetch()} />;
  }
  const selected = firstGoalLoopDetail(query.data);
  if (selected === undefined) return <GoalModeState title="No Goal Loop descriptor registered" message="Create a workspace-scoped Goal Loop descriptor before using pause, steer, resume, or subgoal controls." />;
  return <GoalPageContent view={buildGoalWorkspaceView(query.data, selected)} commandPending={command.isPending} feedback={feedback} onGoalModeCommand={(kind) => command.mutate({ kind, detail: selected })} />;
}

export function GoalModeUnavailableFallback(props: { readonly onRetry?: () => void }): JSX.Element {
  if (props.onRetry === undefined) return <GoalPageContent view={goalWorkspaceFixture} feedback={GOAL_MODE_UNAVAILABLE_FEEDBACK} />;
  return <GoalPageContent view={goalWorkspaceFixture} feedback={GOAL_MODE_UNAVAILABLE_FEEDBACK} onRetry={props.onRetry} />;
}

function GoalPageContent(props: { readonly view: GoalWorkspaceView; readonly commandPending?: boolean; readonly feedback?: string | null; readonly onGoalModeCommand?: (kind: GoalModeUiCommand) => void; readonly onRetry?: () => void }): JSX.Element {
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
      <section className="panel" aria-labelledby="goal-mode-title">
        <div className="panel-header">
          <h2 id="goal-mode-title">Goal Mode</h2>
          <span className="status-badge status-badge--info">Descriptor-only loop</span>
        </div>
        <p>No external connection is opened; controls update Goal Loop descriptors and audit facts only.</p>
        <dl className="fact-grid">
          <div><dt>Loop</dt><dd>{props.view.goalMode.loopId} | {props.view.goalMode.status}</dd></div>
          <div><dt>Judge</dt><dd>Judge JSON {"{ done, reason }"} | {props.view.goalMode.judgeReason}</dd></div>
          <div><dt>Max turns</dt><dd>Max turns {props.view.goalMode.maxTurns}</dd></div>
          <div><dt>Deadline</dt><dd>Deadline {props.view.goalMode.deadline}</dd></div>
          <div><dt>Budget</dt><dd>Budget {props.view.goalMode.budget}</dd></div>
          <div><dt>Continuation cursor</dt><dd>Continuation cursor {props.view.goalMode.cursor}</dd></div>
          <div><dt>Run scope</dt><dd>Run scope {props.view.goalMode.runScope}</dd></div>
          <div><dt>Session scope</dt><dd>Session scope {props.view.goalMode.sessionScope}</dd></div>
          <div><dt>Recovery</dt><dd>Orphan recovery | {props.view.goalMode.orphanRecovery}</dd></div>
          <div><dt>Safety</dt><dd>Judge failure cannot claim success</dd></div>
        </dl>
        <div className="button-row" aria-label="Goal Mode controls">
          <button className="row-action" data-control-kind="pause" type="button" disabled={props.commandPending === true} onClick={() => props.onGoalModeCommand?.("pause")}>Pause</button>
          <button className="row-action" data-control-kind="resume" type="button" disabled={props.commandPending === true} onClick={() => props.onGoalModeCommand?.("resume")}>Resume</button>
          <button className="row-action" data-control-kind="steer" type="button" disabled={props.commandPending === true} onClick={() => props.onGoalModeCommand?.("steer")}>Steer</button>
          <button className="row-action" data-control-kind="judge" type="button" disabled={props.commandPending === true} onClick={() => props.onGoalModeCommand?.("judge")}>Judge</button>
          <button className="row-action" data-control-kind="resume-command" type="button" disabled={props.commandPending === true} onClick={() => props.onGoalModeCommand?.("resume-command")}>/goal resume</button>
          <button className="row-action" data-control-kind="subgoal" type="button" disabled={props.commandPending === true} onClick={() => props.onGoalModeCommand?.("subgoal")}>/subgoal</button>
        </div>
        {props.feedback === undefined || props.feedback === null ? null : <p className="meta" role="status" aria-live="polite">{props.feedback}</p>}
        {props.onRetry === undefined ? null : <button className="row-action" type="button" onClick={props.onRetry}>Retry Goal Mode API</button>}
      </section>
    </div>
  );
}

function GoalModeState(props: { readonly title: string; readonly message: string; readonly alert?: boolean; readonly onRetry?: () => void }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Goal Portfolio</p>
        <h1 id="route-title">Goal Portfolio</h1>
      </header>
      <section className="state-plane state-plane--info" role={props.alert ? "alert" : undefined}>
        <div className="state-plane__title"><CircleDashed aria-hidden="true" size={18} /><span>{props.title}</span><span className="status-badge status-badge--info">No external connection</span></div>
        <p>{props.message}</p>
        {props.onRetry === undefined ? null : <button className="row-action" type="button" onClick={props.onRetry}>Retry</button>}
      </section>
    </div>
  );
}

function buildGoalWorkspaceView(projection: GoalModeProjection, selected: GoalModeLoopDetail): GoalWorkspaceView {
  const loop = selected.goal_loop;
  const continuations = selected.continuations;
  const latestRecovery = [...continuations].reverse().find((continuation) => continuation.recovery_kind === "orphan_recovery");
  return {
    goal: {
      title: loop.objective,
      milestones: [{ tickets: [{ id: loop.goal_id, runs: [{ href: `/runs/${encodeURIComponent(loop.run_id)}?workspace=${encodeURIComponent(loop.workspace_id)}&tab=events`, id: loop.run_id, status: loop.status }], title: loop.definition_of_done.join(" | ") }], title: "Goal Loop Control" }],
    },
    lanes: buildLanes(projection.details),
    goalMode: {
      budget: `${String(loop.budget.max_tokens)} tokens / $${loop.budget.max_cost_usd.toFixed(2)}`,
      cursor: loop.continuation_cursor ?? "none",
      deadline: loop.deadline_at,
      judgeReason: loop.judge?.reason ?? "Judge has not recorded a decision.",
      loopId: loop.id,
      maxTurns: `${String(loop.turn_count)} of ${String(loop.max_turns)}`,
      orphanRecovery: latestRecovery === undefined ? "No orphan recovery continuation recorded." : `${latestRecovery.cursor} recorded at ${latestRecovery.created_at}`,
      runScope: loop.run_id,
      sessionScope: loop.session_id,
      status: loop.status,
    },
  };
}

function buildLanes(details: readonly GoalModeLoopDetail[]): readonly KanbanLane[] {
  return [
    { status: "Running", tickets: details.filter((detail) => detail.goal_loop.status === "running").map(ticketForLoop) },
    { status: "Review", tickets: details.filter((detail) => detail.goal_loop.status === "waiting_judge").map(ticketForLoop) },
    { status: "Paused", tickets: details.filter((detail) => detail.goal_loop.status === "paused").map(ticketForLoop) },
    { status: "Done", tickets: details.filter((detail) => detail.goal_loop.status === "succeeded").map(ticketForLoop) },
    { status: "Failed", tickets: details.filter((detail) => detail.goal_loop.status === "failed" || detail.goal_loop.status === "cancelled").map(ticketForLoop) },
  ];
}

function ticketForLoop(detail: GoalModeLoopDetail): KanbanLane["tickets"][number] {
  const loop = detail.goal_loop;
  return { id: loop.id, owner: "Operator", runId: loop.run_id, status: ticketStatusForLoop(loop.status), title: loop.objective, tone: loop.status === "failed" || loop.status === "cancelled" ? "danger" : loop.status === "paused" ? "warning" : "info" };
}

function ticketStatusForLoop(status: GoalModeLoopDetail["goal_loop"]["status"]): TicketLaneStatus {
  switch (status) {
    case "running":
      return "Running";
    case "waiting_judge":
      return "Review";
    case "paused":
      return "Paused";
    case "succeeded":
      return "Done";
    case "failed":
    case "cancelled":
      return "Failed";
    default:
      return assertNever(status);
  }
}

function firstGoalLoopDetail(projection: GoalModeProjection): GoalModeLoopDetail | undefined {
  return projection.details.find((detail) => detail.goal_loop.parent_loop_id === null) ?? projection.details[0];
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Goal Mode value ${String(value)}`);
}
