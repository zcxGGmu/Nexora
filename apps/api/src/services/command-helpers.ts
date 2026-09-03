import { createHash } from "node:crypto";
import type { EventEnvelope, PolicyScope, ReviewDecision } from "@nexora/contracts";
import type { SqliteDatabase } from "@nexora/persistence";
import type { AcceptedCommand } from "./command-service.js";
import { ApiHttpError } from "./errors.js";

export function accepted(input: { readonly command_id: string; readonly object_type: string; readonly object_id: string; readonly workspace_id: string }): AcceptedCommand {
  return { schema_version: 1, command_id: input.command_id, status: "accepted", object_type: input.object_type, object_id: input.object_id, status_url: `${resourcePath(input.object_type, input.object_id)}?workspace_id=${input.workspace_id}`, events_url: null };
}

export function acceptedRun(commandId: string, workspaceId: string, runId: string): AcceptedCommand {
  return { schema_version: 1, command_id: commandId, status: "accepted", object_type: "run", object_id: runId, run_id: runId, status_url: `/v1/runs/${runId}?workspace_id=${workspaceId}`, events_url: `/v1/runs/${runId}/events?workspace_id=${workspaceId}` };
}

export function requestHash(value: unknown): string { return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }

export function currentSequence(database: SqliteDatabase, workspaceId: string, runId: string): number {
  const row = database.prepare("SELECT MAX(sequence) AS sequence FROM events WHERE workspace_id = ? AND run_id = ?").get(workspaceId, runId);
  const value = row?.["sequence"];
  if (value === null || value === undefined) return -1;
  return readInteger(value);
}

export function runEventType(status: "paused" | "running" | "cancelled"): EventEnvelope["event_type"] {
  if (status === "paused") return "run.paused";
  if (status === "running") return "run.resumed";
  return "run.cancelled";
}

export function isReviewApproval(decision: ReviewDecision["human_decision"]): boolean {
  return decision === "approved" || decision === "approved_with_edits";
}

export function scopesEqual(left: PolicyScope, right: PolicyScope): boolean { return left.kind === right.kind && left.id === right.id; }

export function reviewStale(message: string): ApiHttpError {
  return new ApiHttpError({ status_code: 409, code: "REVIEW_STALE", message, retryable: false, required_action: "reload_review" });
}

export function notFound(): ApiHttpError { return new ApiHttpError({ status_code: 404, code: "SCOPE_DENIED", message: "Resource not found", retryable: false, required_action: "check_scope" }); }

export function readText(value: unknown): string {
  if (typeof value !== "string") throw new ApiHttpError({ status_code: 500, code: "SCHEMA_INVALID", message: "Stored text column failed validation", retryable: false, required_action: "inspect_storage" });
  return value;
}

export function readInteger(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint") return Number(value);
  throw new ApiHttpError({ status_code: 500, code: "SCHEMA_INVALID", message: "Stored integer column failed validation", retryable: false, required_action: "inspect_storage" });
}

function resourcePath(objectType: string, objectId: string): string {
  switch (objectType) {
    case "delivery":
      return `/v1/deliveries/${objectId}`;
    case "goal_loop":
      return `/v1/goal-loops/${objectId}`;
    case "journal_entry":
      return `/v1/journal/entries/${objectId}`;
    case "journal_graph_index":
      return `/v1/journal/graph-indexes/${objectId}`;
    case "journal_memory_candidate":
      return `/v1/journal/memory-candidates/${objectId}`;
    case "journal_source":
      return `/v1/journal/sources/${objectId}`;
    case "journal_writeback":
      return `/v1/journal/writebacks/${objectId}`;
    case "memory":
      return `/v1/memory/${objectId}`;
    case "vault":
      return `/v1/vaults/${objectId}`;
    case "runtime_descriptor":
      return `/v1/registry/runtimes/${objectId}`;
    case "provider_descriptor":
      return `/v1/registry/providers/${objectId}`;
    case "model_descriptor":
      return `/v1/registry/models/${objectId}`;
    case "backend_descriptor":
      return `/v1/registry/backends/${objectId}`;
    case "browser_action":
      return `/v1/browser-actions/${objectId}`;
    case "browser_allowlist":
      return `/v1/browser-allowlist/${objectId}`;
    case "browser_approval":
      return `/v1/browser-approvals/${objectId}`;
    case "browser_action_receipt":
      return `/v1/browser-action-receipts/${objectId}`;
    case "browser_session":
      return `/v1/browser-sessions/${objectId}`;
    case "voice_session":
      return `/v1/voice-sessions/${objectId}`;
    case "voice_transcript":
      return `/v1/voice-transcripts/${objectId}`;
    case "voice_command":
      return `/v1/voice-commands/${objectId}`;
    case "media_artifact":
      return `/v1/studio/media-artifacts/${objectId}`;
    case "render_job":
      return `/v1/studio/render-jobs/${objectId}`;
    case "notebook":
      return `/v1/studio/notebooks/${objectId}`;
    case "notebook_source":
      return `/v1/studio/notebook-sources/${objectId}`;
    case "notebook_generation":
      return `/v1/studio/notebook-generations/${objectId}`;
    case "avatar_profile":
      return `/v1/studio/avatar-profiles/${objectId}`;
    case "studio_share":
      return `/v1/studio/shares/${objectId}`;
    case "studio_command":
      return `/v1/studio/commands/${objectId}`;
    case "tool_descriptor":
      return `/v1/registry/tools/${objectId}`;
    default:
      return `/v1/${objectType}s/${objectId}`;
  }
}
