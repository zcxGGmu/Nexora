import type { JSX } from "react";

import { EmptyState } from "../components/states/EmptyState.js";
import { ArtifactPage, artifactFixture } from "../pages/ArtifactPage.js";
import { DesignSystemPage } from "../pages/DesignSystemPage.js";
import { GoalPage, goalWorkspaceFixture } from "../pages/GoalPage.js";
import { InboxPage, inboxFixture } from "../pages/InboxPage.js";
import { MemoryPage, memoryFixture } from "../pages/MemoryPage.js";
import { MissionControlPage, MissionControlRail, missionControlFixture } from "../pages/MissionControlPage.js";
import { MissingDetailPage } from "../pages/MissingDetailPage.js";
import { PlaceholderPage } from "../pages/PlaceholderPage.js";
import { ReviewPage, reviewFixture, staleReviewFixture } from "../pages/ReviewPage.js";
import { RegistryPage, registryFixture } from "../pages/RegistryPage.js";
import { blockedRunDetailFixture, RunDetailPage, runDetailFixture } from "../pages/RunDetailPage.js";
import { TicketPage, ticketFixture } from "../pages/TicketPage.js";
import { WorkflowPage, WorkflowRunPage, seoWorkflowRunFixture, seoWorkflowTemplateFixture } from "../pages/WorkflowPage.js";
import type { ParsedRoute } from "./router.js";

export function pageForRoute(route: ParsedRoute): JSX.Element {
  switch (route.key) {
    case "artifacts": {
      const id = detailId(route);
      if (id !== artifactFixture.artifact.id) return <MissingDetailPage view={{ id, kind: "Artifact" }} />;
      return <ArtifactPage selectedTab={route.urlState.tab} view={artifactFixture} />;
    }
    case "cowork":
      return <PlaceholderPage title="Quick Cowork" scope={route.urlState.workspace ?? "current workspace"} nextStage="C10 entry" />;
    case "design-system":
      return <DesignSystemPage />;
    case "goals":
      return <GoalPage view={goalWorkspaceFixture} />;
    case "inbox":
      return <InboxPage selectedTab={route.urlState.tab} view={inboxFixture} />;
    case "memory":
      return <MemoryPage view={memoryFixture} />;
    case "mission-control":
      return <MissionControlPage view={missionControlFixture} />;
    case "review":
      return reviewPageForId(detailId(route));
    case "registry":
      return <RegistryPage view={registryFixture} />;
    case "runs":
      return runPageForId(detailId(route));
    case "settings":
      return <PlaceholderPage title="Settings" scope={route.urlState.workspace ?? "current workspace"} nextStage="C10 shell" />;
    case "tickets":
      return <TicketPage view={ticketFixture} />;
    case "workflows":
      return workflowPageForRoute(route);
    default:
      return assertNever(route.key);
  }
}

export function railForRoute(route: ParsedRoute): JSX.Element {
  if (route.key === "mission-control") return <MissionControlRail health={missionControlFixture.health} />;
  return <EmptyState title="Evidence rail" impact="Select a Run, Review, Artifact, or Memory item to inspect provenance." nextAction="Open Mission Control." />;
}

function reviewPageForId(id: string): JSX.Element {
  switch (id) {
    case "rev-r2":
      return <ReviewPage view={reviewFixture} />;
    case "rev-r3":
      return <ReviewPage view={{ ...reviewFixture, review: { ...reviewFixture.review, id, risk: "R3" } }} />;
    case "rev-stale":
      return <ReviewPage view={staleReviewFixture} />;
    default:
      return <MissingDetailPage view={{ id, kind: "Review" }} />;
  }
}

function runPageForId(id: string): JSX.Element {
  switch (id) {
    case "run-active":
      return <RunDetailPage view={runDetailFixture} />;
    case "run-blocked":
      return <RunDetailPage view={blockedRunDetailFixture} />;
    default:
      return <MissingDetailPage view={{ id, kind: "Run" }} />;
  }
}

function workflowPageForRoute(route: ParsedRoute): JSX.Element {
  const workflowId = route.params["workflowId"] ?? "seo_draft_v1";
  if (workflowId !== seoWorkflowTemplateFixture.id) return <MissingDetailPage view={{ id: workflowId, kind: "Workflow" }} />;
  const runId = route.params["runId"];
  if (runId !== undefined) return runId === seoWorkflowRunFixture.id ? <WorkflowRunPage view={seoWorkflowRunFixture} /> : <MissingDetailPage view={{ id: runId, kind: "Run" }} />;
  return <WorkflowPage view={seoWorkflowTemplateFixture} />;
}

function detailId(route: ParsedRoute): string {
  return route.params["id"] ?? "unknown";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled page route ${String(value)}`);
}
