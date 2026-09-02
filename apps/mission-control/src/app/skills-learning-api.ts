import {
  LearningCandidateSchema,
  EventIdSchema,
  RunIdSchema,
  SkillDescriptorSchema,
  SkillInstallationSchema,
  SkillInvocationFactSchema,
  SkillReviewSchema,
  SkillScanSchema,
  SkillSourceSchema,
  SkillVersionSchema,
  TimestampSchema,
  UlidSchema,
  WorkspaceIdSchema,
  z,
  type LearningCandidate,
  type SkillDescriptor,
  type SkillInstallation,
  type SkillInvocationFact,
  type SkillReview,
  type SkillScan,
  type SkillSource,
  type SkillVersion,
} from "@nexora/contracts";

import { controlApi, readControlProjection } from "./query-client.js";

const LOCAL_WORKSPACE_ALIASES = {
  "ws-demo": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "ws-a": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "ws-b": "01BRZ3NDEKTSV4RRFFQ69G5FAV",
} as const;

export type SkillDetail = {
  readonly schema_version: 1;
  readonly skill: SkillDescriptor;
  readonly versions: readonly SkillVersion[];
  readonly sources: readonly SkillSource[];
  readonly scans: readonly SkillScan[];
  readonly reviews: readonly SkillReview[];
  readonly installations: readonly SkillInstallation[];
  readonly invocation_facts: readonly SkillInvocationFact[];
  readonly candidates: readonly LearningCandidate[];
  readonly learning_contexts: readonly LearningSourceContext[];
};

export type LearningSourceContext = {
  readonly workspace_id: string;
  readonly run_id: string;
  readonly goal_loop_id: string;
  readonly source_event_id: string;
  readonly event_type: "learning.source";
  readonly occurred_at: string;
};

export type SkillsLearningProjection = {
  readonly skills: readonly SkillDescriptor[];
  readonly details: readonly SkillDetail[];
};

export type SkillsLearningWorkspaceResolution =
  | { readonly kind: "resolved"; readonly workspace_id: string }
  | { readonly kind: "invalid"; readonly input: string };

export type SkillsLearningProjectionReader = (path: string, workspace: string) => Promise<unknown>;

const SkillListResponseSchema = z.object({ schema_version: z.literal(1).optional(), skills: z.array(SkillDescriptorSchema) }).passthrough();
const SkillDetailResponseSchema = z.object({
  schema_version: z.literal(1),
  skill: SkillDescriptorSchema,
  versions: z.array(SkillVersionSchema),
  sources: z.array(SkillSourceSchema),
  scans: z.array(SkillScanSchema),
  reviews: z.array(SkillReviewSchema),
  installations: z.array(SkillInstallationSchema),
  invocation_facts: z.array(SkillInvocationFactSchema),
  candidates: z.array(LearningCandidateSchema).optional(),
  learning_contexts: z.array(z.object({
    workspace_id: WorkspaceIdSchema,
    run_id: RunIdSchema,
    goal_loop_id: UlidSchema,
    source_event_id: EventIdSchema,
    event_type: z.literal("learning.source"),
    occurred_at: TimestampSchema,
  }).strict()).optional(),
}).passthrough();

export async function fetchSkillsLearningProjection(workspaceId: string, read: SkillsLearningProjectionReader = readControlProjection): Promise<SkillsLearningProjection> {
  const list = SkillListResponseSchema.parse(await read("/v1/skills", workspaceId));
  const details = await Promise.all(list.skills.map(async (skill) => {
    const detail = SkillDetailResponseSchema.parse(await read(`/v1/skills/${encodeURIComponent(skill.id)}`, workspaceId));
    return { ...detail, candidates: detail.candidates ?? [], learning_contexts: detail.learning_contexts ?? [] };
  }));
  return { skills: list.skills, details };
}

export type SkillLifecycleAction = "approve" | "install" | "revoke" | "quarantine" | "rollback";

export type SkillLifecycleInput = {
  readonly workspace_id: string;
  readonly skill_id: string;
  readonly action: SkillLifecycleAction;
  readonly version_id: string;
  readonly rollback_to_version_id?: string;
  readonly reason: string;
  readonly expected_revision: number;
  readonly installation_revision?: number;
};

export type LearningCandidateInput = {
  readonly workspace_id: string;
  readonly run_id: string;
  readonly goal_loop_id: string;
  readonly source_event_id: string;
  readonly proposed_skill_id: string;
  readonly lesson: string;
  readonly proposed_diff_summary: string;
  readonly evidence_refs: readonly string[];
};

export type SkillPostOptions = {
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
};

export type SkillLifecycleWriter = {
  readonly post: (path: string, options: SkillPostOptions) => Promise<unknown>;
};

export async function sendSkillLifecycleControl(input: SkillLifecycleInput, idempotencyKey: string, writer: SkillLifecycleWriter = controlApi): Promise<void> {
  await writer.post(`/v1/skills/${encodeURIComponent(input.skill_id)}/${input.action}`, {
    headers: { "Idempotency-Key": idempotencyKey, "If-Match": String(input.expected_revision) },
    json: lifecyclePayload(input),
  });
}

export async function createLearningCandidate(input: LearningCandidateInput, idempotencyKey: string, writer: SkillLifecycleWriter = controlApi): Promise<void> {
  await writer.post("/v1/learning/candidates", {
    headers: { "Idempotency-Key": idempotencyKey },
    json: { ...input, schema_version: 1, descriptor_only: true },
  });
}

export function workspaceIdForSkillsLearningApi(workspaceId: string): string {
  const resolution = resolveSkillsLearningWorkspace(workspaceId);
  switch (resolution.kind) {
    case "resolved":
      return resolution.workspace_id;
    case "invalid":
      throw new Error("Skills/Learning workspace must be a workspace ULID or known local demo alias");
    default:
      return assertNever(resolution);
  }
}

export function resolveSkillsLearningWorkspace(workspaceId: string): SkillsLearningWorkspaceResolution {
  const alias = demoWorkspaceAlias(workspaceId);
  const parsed = WorkspaceIdSchema.safeParse(alias ?? workspaceId);
  if (!parsed.success) return { kind: "invalid", input: workspaceId };
  return { kind: "resolved", workspace_id: parsed.data };
}

export function shouldUseSkillsLearningFallback(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (hasHttpStatus(error)) return error.response.status >= 500;
  return false;
}

function lifecyclePayload(input: SkillLifecycleInput): Record<string, unknown> {
  const base = input.installation_revision === undefined
    ? { schema_version: 1, workspace_id: input.workspace_id, version_id: input.version_id, reason: input.reason }
    : { schema_version: 1, workspace_id: input.workspace_id, version_id: input.version_id, reason: input.reason, installation_revision: input.installation_revision };
  if (input.action !== "rollback") return base;
  return { ...base, rollback_to_version_id: input.rollback_to_version_id };
}

function hasHttpStatus(error: unknown): error is { readonly response: { readonly status: number } } {
  return typeof error === "object"
    && error !== null
    && "response" in error
    && typeof error.response === "object"
    && error.response !== null
    && "status" in error.response
    && typeof error.response.status === "number";
}

function demoWorkspaceAlias(workspaceId: string): string | undefined {
  switch (workspaceId) {
    case "ws-demo":
    case "ws-a":
    case "ws-b":
      return LOCAL_WORKSPACE_ALIASES[workspaceId];
    default:
      return undefined;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Skills/Learning workspace resolution ${String(value)}`);
}
