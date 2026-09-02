import {
  GraphIndexSnapshotSchema,
  JournalEntryDescriptorSchema,
  JournalSourceSchema,
  MemoryCandidateSchema,
  VaultBridgeDescriptorSchema,
  WorkspaceIdSchema,
  WritebackDecisionSchema,
  WritebackRequestSchema,
  z,
  type GraphIndexSnapshot,
  type JournalEntryDescriptor,
  type JournalSource,
  type MemoryCandidate,
  type VaultBridgeDescriptor,
  type WritebackDecision,
  type WritebackRequest,
} from "@nexora/contracts";

import { controlApi, readControlProjection } from "./query-client.js";

const LOCAL_WORKSPACE_ALIASES = {
  "ws-demo": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "ws-a": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "ws-b": "01BRZ3NDEKTSV4RRFFQ69G5FAV",
} as const;

export type JournalVaultDetail = {
  readonly schema_version: 1;
  readonly vault: VaultBridgeDescriptor;
  readonly entries: readonly JournalEntryDescriptor[];
  readonly sources: readonly JournalSource[];
  readonly graph_indexes: readonly GraphIndexSnapshot[];
  readonly memory_candidates: readonly MemoryCandidate[];
  readonly writeback_requests: readonly WritebackRequest[];
  readonly writeback_decisions: readonly WritebackDecision[];
};

export type JournalProjection = {
  readonly vaults: readonly VaultBridgeDescriptor[];
  readonly details: readonly JournalVaultDetail[];
};

export type JournalVaultSummary = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly accessMode: string;
  readonly syncStatus: string;
  readonly sourceKinds: readonly string[];
  readonly descriptorOnly: boolean;
};

export type JournalWritebackSummary = {
  readonly id: string;
  readonly candidateId: string;
  readonly targetRef: string;
  readonly diffHash: string;
  readonly reason: string;
  readonly status: WritebackRequest["status"];
  readonly revision: number;
};

export type JournalSelectedSummary = JournalVaultSummary & {
  readonly latestEntryTitle: string;
  readonly latestEntryDate: string;
  readonly sourceCount: number;
  readonly graphStatus: string;
  readonly nodeCount: number;
  readonly documentCount: number;
  readonly memoryCandidates: number;
  readonly pendingWritebacks: number;
  readonly approvedWritebacks: number;
  readonly candidateId: string;
  readonly targetRef: string;
  readonly diffHash: string;
  readonly expectedTargetRevision: number;
};

export type JournalControlView = {
  readonly workspaceId: string;
  readonly vaults: readonly JournalVaultSummary[];
  readonly selected: JournalSelectedSummary;
  readonly writebackRequests: readonly JournalWritebackSummary[];
};

export type JournalProjectionReader = (path: string, workspace: string) => Promise<unknown>;

const VaultListResponseSchema = z.object({ schema_version: z.literal(1).optional(), vaults: z.array(VaultBridgeDescriptorSchema) }).passthrough();
const JournalDetailResponseSchema = z.object({
  schema_version: z.literal(1),
  vault: VaultBridgeDescriptorSchema,
  entries: z.array(JournalEntryDescriptorSchema),
  sources: z.array(JournalSourceSchema),
  graph_indexes: z.array(GraphIndexSnapshotSchema),
  memory_candidates: z.array(MemoryCandidateSchema),
  writeback_requests: z.array(WritebackRequestSchema),
  writeback_decisions: z.array(WritebackDecisionSchema),
}).passthrough();

export async function fetchJournalProjection(workspaceId: string, read: JournalProjectionReader = readControlProjection): Promise<JournalProjection> {
  const list = VaultListResponseSchema.parse(await read("/v1/vaults", workspaceId));
  const details = await Promise.all(list.vaults.map(async (vault) => JournalDetailResponseSchema.parse(await read(`/v1/vaults/${encodeURIComponent(vault.id)}`, workspaceId))));
  return { vaults: list.vaults, details };
}

export function buildJournalControlView(projection: JournalProjection, workspaceId: string): JournalControlView {
  const details = projection.details.filter((detail) => detail.vault.workspace_id === workspaceId);
  const vaults = details.map(vaultSummary);
  const firstDetail = details[0];
  const selected = firstDetail === undefined ? emptySelectedSummary(workspaceId) : selectedSummary(firstDetail);
  const writebackRequests = firstDetail === undefined ? [] : firstDetail.writeback_requests.map(writebackSummary);
  return { workspaceId, vaults, selected, writebackRequests };
}

export type JournalWritebackInput = {
  readonly workspace_id: string;
  readonly vault_id: string;
  readonly candidate_id: string;
  readonly target_ref: string;
  readonly diff_hash: string;
  readonly reason: string;
  readonly expected_target_revision: number;
};

export type JournalWritebackDecisionInput = {
  readonly workspace_id: string;
  readonly request_id: string;
  readonly decision: "approve" | "reject";
  readonly reason: string;
  readonly expected_revision: number;
};

export type JournalPostOptions = {
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
};

export type JournalCommandWriter = {
  readonly post: (path: string, options: JournalPostOptions) => Promise<unknown>;
};

export type JournalWorkspaceResolution =
  | { readonly kind: "resolved"; readonly workspace_id: string }
  | { readonly kind: "invalid"; readonly input: string };

export async function requestJournalWriteback(input: JournalWritebackInput, idempotencyKey: string, writer: JournalCommandWriter = controlApi): Promise<void> {
  await writer.post("/v1/journal/writebacks", {
    headers: { "Idempotency-Key": idempotencyKey },
    json: { ...input, schema_version: 1, status: "pending_review", descriptor_only: true },
  });
}

export async function sendWritebackDecision(input: JournalWritebackDecisionInput, idempotencyKey: string, writer: JournalCommandWriter = controlApi): Promise<void> {
  await writer.post(`/v1/journal/writebacks/${encodeURIComponent(input.request_id)}/${input.decision}`, {
    headers: { "Idempotency-Key": idempotencyKey, "If-Match": String(input.expected_revision) },
    json: { schema_version: 1, workspace_id: input.workspace_id, reason: input.reason, descriptor_only: true },
  });
}

export function workspaceIdForJournalApi(workspaceId: string): string {
  const resolution = resolveJournalWorkspace(workspaceId);
  switch (resolution.kind) {
    case "resolved":
      return resolution.workspace_id;
    case "invalid":
      throw new Error("Journal workspace must be a workspace ULID or known local demo alias");
    default:
      return assertNever(resolution);
  }
}

export function resolveJournalWorkspace(workspaceId: string): JournalWorkspaceResolution {
  const alias = demoWorkspaceAlias(workspaceId);
  const parsed = WorkspaceIdSchema.safeParse(alias ?? workspaceId);
  if (!parsed.success) return { kind: "invalid", input: workspaceId };
  return { kind: "resolved", workspace_id: parsed.data };
}

export function shouldUseJournalFallback(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (hasHttpStatus(error)) return error.response.status >= 500;
  return false;
}

function selectedSummary(detail: JournalVaultDetail): JournalSelectedSummary {
  const latestEntry = detail.entries[0];
  const latestGraph = detail.graph_indexes[0];
  const candidate = detail.memory_candidates[0];
  const pending = detail.writeback_requests.filter((request) => request.status === "pending_review");
  const latestRequest = pending[0] ?? detail.writeback_requests[0];
  return {
    ...vaultSummary(detail),
    latestEntryTitle: latestEntry?.title ?? "No daily journal entry",
    latestEntryDate: latestEntry?.entry_date ?? "n/a",
    sourceCount: detail.sources.length,
    graphStatus: latestGraph?.index_kind ?? "not_indexed",
    nodeCount: latestGraph?.node_count ?? 0,
    documentCount: latestGraph?.document_count ?? 0,
    memoryCandidates: detail.memory_candidates.length,
    pendingWritebacks: pending.length,
    approvedWritebacks: detail.writeback_requests.filter((request) => request.status === "approved").length,
    candidateId: candidate?.id ?? "missing-candidate",
    targetRef: latestRequest?.target_ref ?? candidate?.proposed_path ?? "workspace://journal/missing-target",
    diffHash: latestRequest?.diff_hash ?? candidate?.content_hash ?? "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    expectedTargetRevision: latestRequest?.expected_target_revision ?? 1,
  };
}

function vaultSummary(detail: JournalVaultDetail): JournalVaultSummary;
function vaultSummary(vault: VaultBridgeDescriptor): JournalVaultSummary;
function vaultSummary(value: JournalVaultDetail | VaultBridgeDescriptor): JournalVaultSummary {
  const vault = "vault" in value ? value.vault : value;
  return {
    id: vault.id,
    name: vault.name,
    kind: vault.kind,
    accessMode: vault.access_mode,
    syncStatus: vault.sync_status,
    sourceKinds: vault.allowed_source_kinds,
    descriptorOnly: vault.descriptor_only,
  };
}

function writebackSummary(request: WritebackRequest): JournalWritebackSummary {
  return { id: request.id, candidateId: request.candidate_id, targetRef: request.target_ref, diffHash: request.diff_hash, reason: request.reason, status: request.status, revision: request.revision };
}

function emptySelectedSummary(workspaceId: string): JournalSelectedSummary {
  return {
    id: "vault-empty",
    name: `No vaults for ${workspaceId}`,
    kind: "manual",
    accessMode: "read_only",
    syncStatus: "not_indexed",
    sourceKinds: [],
    descriptorOnly: true,
    latestEntryTitle: "No daily journal entry",
    latestEntryDate: "n/a",
    sourceCount: 0,
    graphStatus: "not_indexed",
    nodeCount: 0,
    documentCount: 0,
    memoryCandidates: 0,
    pendingWritebacks: 0,
    approvedWritebacks: 0,
    candidateId: "missing-candidate",
    targetRef: "workspace://journal/missing-target",
    diffHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    expectedTargetRevision: 1,
  };
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
  throw new Error(`Unhandled Journal workspace resolution ${String(value)}`);
}
