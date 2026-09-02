import { describe, expect, it } from "vitest";
import {
  GraphIndexSnapshotSchema,
  JournalEntryDescriptorSchema,
  JournalSourceSchema,
  MemoryCandidateSchema,
  VaultBridgeDescriptorSchema,
  WorkspaceIdSchema,
  WritebackDecisionSchema,
  WritebackRequestSchema,
} from "@nexora/contracts";
import { buildJournalControlView, fetchJournalProjection, requestJournalWriteback, resolveJournalWorkspace, sendWritebackDecision, shouldUseJournalFallback, workspaceIdForJournalApi, type JournalCommandWriter, type JournalPostOptions, type JournalVaultDetail } from "./journal-api.js";

const WORKSPACE_ID = WorkspaceIdSchema.parse("01ARZ3NDEKTSV4RRFFQ69G5FAV");
const VAULT_ID = "vault-obsidian-demo";
const ENTRY_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const GRAPH_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const CANDIDATE_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const REQUEST_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const DECISION_ID = "01GRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-09-02T04:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const GRAPH_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DIFF_HASH = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

describe("Mission Control Journal API", () => {
  it("fetches live vault detail from the control API", async () => {
    const calls: string[] = [];
    const projection = await fetchJournalProjection(WORKSPACE_ID, (path, workspace) => {
      calls.push(`${path}?workspace_id=${workspace}`);
      if (path === `/v1/vaults/${VAULT_ID}`) return Promise.resolve(journalDetail());
      return Promise.resolve({ schema_version: 1, vaults: [vault()] });
    });

    expect(calls).toEqual([`/v1/vaults?workspace_id=${WORKSPACE_ID}`, `/v1/vaults/${VAULT_ID}?workspace_id=${WORKSPACE_ID}`]);
    expect(projection.vaults).toHaveLength(1);
    expect(projection.details[0]).toMatchObject({ vault: expect.objectContaining({ id: VAULT_ID }), memory_candidates: [expect.objectContaining({ id: CANDIDATE_ID })] });
  });

  it("maps journal projection into graph memory writeback and descriptor-only UI facts", () => {
    const view = buildJournalControlView({ vaults: [vault()], details: [journalDetail()] }, WORKSPACE_ID);

    expect(view.workspaceId).toBe(WORKSPACE_ID);
    expect(view.vaults[0]).toMatchObject({ id: VAULT_ID, accessMode: "read_only", syncStatus: "indexed" });
    expect(view.selected).toMatchObject({ latestEntryTitle: "Daily operating journal", graphStatus: "graph_fts", memoryCandidates: 1, pendingWritebacks: 1, descriptorOnly: true });
    expect(view.writebackRequests[0]).toMatchObject({ id: REQUEST_ID, status: "pending_review", revision: 1 });
  });

  it("posts writeback request and decision commands with Idempotency-Key and If-Match", async () => {
    const calls: PostCall[] = [];
    const writer = createWriter(calls);

    await requestJournalWriteback({ workspace_id: WORKSPACE_ID, vault_id: VAULT_ID, candidate_id: CANDIDATE_ID, target_ref: "workspace://vaults/demo/Journal/2026-09-02.md", diff_hash: DIFF_HASH, reason: "Stage reviewed diff", expected_target_revision: 3 }, "journal:writeback:request", writer);
    await sendWritebackDecision({ workspace_id: WORKSPACE_ID, request_id: REQUEST_ID, decision: "approve", reason: "Approve reviewed diff", expected_revision: 1 }, "journal:writeback:approve", writer);

    expect(calls).toEqual([
      { path: "/v1/journal/writebacks", headers: { "Idempotency-Key": "journal:writeback:request" }, json: { schema_version: 1, workspace_id: WORKSPACE_ID, vault_id: VAULT_ID, candidate_id: CANDIDATE_ID, target_ref: "workspace://vaults/demo/Journal/2026-09-02.md", diff_hash: DIFF_HASH, reason: "Stage reviewed diff", status: "pending_review", expected_target_revision: 3, descriptor_only: true } },
      { path: `/v1/journal/writebacks/${REQUEST_ID}/approve`, headers: { "Idempotency-Key": "journal:writeback:approve", "If-Match": "1" }, json: { schema_version: 1, workspace_id: WORKSPACE_ID, reason: "Approve reviewed diff", descriptor_only: true } },
    ]);
  });

  it("resolves known local aliases and does not fall back for authorization failures", () => {
    expect(workspaceIdForJournalApi("ws-demo")).toBe(WORKSPACE_ID);
    expect(resolveJournalWorkspace(WORKSPACE_ID)).toEqual({ kind: "resolved", workspace_id: WORKSPACE_ID });
    expect(resolveJournalWorkspace("ws-unknown")).toEqual({ kind: "invalid", input: "ws-unknown" });
    expect(shouldUseJournalFallback({ response: { status: 403 } })).toBe(false);
    expect(shouldUseJournalFallback({ response: { status: 409 } })).toBe(false);
    expect(shouldUseJournalFallback({ response: { status: 503 } })).toBe(true);
    expect(shouldUseJournalFallback(new TypeError("Failed to fetch"))).toBe(true);
  });
});

type PostCall = {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
};

function createWriter(calls: PostCall[]): JournalCommandWriter {
  return {
    post: (path: string, options: JournalPostOptions): Promise<unknown> => {
      calls.push({ path, headers: options.headers, json: options.json });
      return Promise.resolve({ ok: true });
    },
  };
}

function vault(): ReturnType<typeof VaultBridgeDescriptorSchema.parse> {
  return VaultBridgeDescriptorSchema.parse({ id: VAULT_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, name: "Obsidian Demo Vault", kind: "obsidian", root_ref: "workspace://vaults/demo", access_mode: "read_only", sync_status: "indexed", graph_enabled: true, fts_enabled: true, allowed_source_kinds: ["manual", "omi", "obsidian"], last_indexed_at: TIME, descriptor_only: true });
}

function journalDetail(): JournalVaultDetail {
  return {
    schema_version: 1,
    vault: vault(),
    entries: [JournalEntryDescriptorSchema.parse({ id: ENTRY_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, vault_id: VAULT_ID, entry_date: "2026-09-02", title: "Daily operating journal", summary: "Captured local operator facts.", source_ids: [SOURCE_ID], memory_candidate_ids: [CANDIDATE_ID], run_id: null, goal_loop_id: null, tags: ["daily"], descriptor_only: true })],
    sources: [JournalSourceSchema.parse({ id: SOURCE_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, vault_id: VAULT_ID, journal_entry_id: ENTRY_ID, source_kind: "omi", source_ref: "workspace://omi/transcripts/2026-09-02.md", source_hash: HASH, captured_at: TIME, descriptor_only: true })],
    graph_indexes: [GraphIndexSnapshotSchema.parse({ id: GRAPH_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, vault_id: VAULT_ID, index_kind: "graph_fts", indexed_at: TIME, source_hash: HASH, graph_hash: GRAPH_HASH, fts_hash: HASH, node_count: 42, edge_count: 64, document_count: 8, stale: false, descriptor_only: true })],
    memory_candidates: [MemoryCandidateSchema.parse({ id: CANDIDATE_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, vault_id: VAULT_ID, journal_entry_id: ENTRY_ID, source_ids: [SOURCE_ID], candidate_kind: "lesson", proposed_path: "memory://Journal/2026-09-02.md", summary: "Keep writeback approval-only.", content_hash: HASH, risk_level: "R1", status: "needs_review", descriptor_only: true })],
    writeback_requests: [WritebackRequestSchema.parse({ id: REQUEST_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, vault_id: VAULT_ID, candidate_id: CANDIDATE_ID, target_ref: "workspace://vaults/demo/Journal/2026-09-02.md", diff_hash: DIFF_HASH, reason: "Stage reviewed diff", status: "pending_review", requested_by: "owner:linda", requested_at: TIME, expected_target_revision: 3, descriptor_only: true })],
    writeback_decisions: [WritebackDecisionSchema.parse({ id: DECISION_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, request_id: REQUEST_ID, decision: "approve", decided_by: "owner:linda", decided_at: TIME, reason: "Approve reviewed diff", descriptor_only: true })],
  };
}
