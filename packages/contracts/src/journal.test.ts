import { describe, expect, it } from "vitest";
import {
  GraphIndexSnapshotSchema,
  JournalEntryDescriptorSchema,
  JournalSourceSchema,
  MemoryCandidateSchema,
  VaultBridgeDescriptorSchema,
  WritebackDecisionSchema,
  WritebackRequestSchema,
  canApplyWriteback,
} from "./journal.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  vault: "vault-obsidian-demo",
  entry: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  source: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  graph: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  candidate: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  request: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  decision: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  goalLoop: "01JRZ3NDEKTSV4RRFFQ69H5FAV",
};

const TIME = "2026-09-02T04:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const GRAPH_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DIFF_HASH = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const meta = { workspace_id: IDS.workspace, schema_version: 1 as const, created_at: TIME, updated_at: TIME };
const DEFAULT_IGNORABLE_REFERENCE_CODE_POINTS = [0x034f, 0x180e, 0x200b, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064] as const;

const vault = {
  id: IDS.vault,
  ...meta,
  revision: 1,
  name: "Obsidian Demo Vault",
  kind: "obsidian",
  root_ref: "workspace://vaults/demo",
  access_mode: "read_only",
  sync_status: "indexed",
  graph_enabled: true,
  fts_enabled: true,
  allowed_source_kinds: ["manual", "omi", "obsidian", "memory", "artifact"],
  last_indexed_at: TIME,
  descriptor_only: true,
} as const;

const source = {
  id: IDS.source,
  ...meta,
  vault_id: IDS.vault,
  journal_entry_id: IDS.entry,
  source_kind: "omi",
  source_ref: "workspace://omi/transcripts/2026-09-02-standup.md",
  source_hash: HASH,
  captured_at: TIME,
  descriptor_only: true,
} as const;

const entry = {
  id: IDS.entry,
  ...meta,
  vault_id: IDS.vault,
  entry_date: "2026-09-02",
  title: "Daily operating journal",
  summary: "Captured operator decisions and reviewed memory candidates.",
  source_ids: [IDS.source],
  memory_candidate_ids: [IDS.candidate],
  run_id: IDS.run,
  goal_loop_id: IDS.goalLoop,
  tags: ["daily", "ops"],
  descriptor_only: true,
} as const;

const graph = {
  id: IDS.graph,
  ...meta,
  vault_id: IDS.vault,
  index_kind: "graph_fts",
  indexed_at: TIME,
  source_hash: HASH,
  graph_hash: GRAPH_HASH,
  fts_hash: HASH,
  node_count: 42,
  edge_count: 64,
  document_count: 8,
  stale: false,
  descriptor_only: true,
} as const;

const candidate = {
  id: IDS.candidate,
  ...meta,
  vault_id: IDS.vault,
  journal_entry_id: IDS.entry,
  source_ids: [IDS.source],
  candidate_kind: "lesson",
  proposed_path: "memory://Journal/2026-09-02.md",
  summary: "Record that C22 writeback must remain approval-only.",
  content_hash: HASH,
  risk_level: "R1",
  status: "needs_review",
  descriptor_only: true,
} as const;

const writebackRequest = {
  id: IDS.request,
  ...meta,
  revision: 1,
  vault_id: IDS.vault,
  candidate_id: IDS.candidate,
  target_ref: "workspace://vaults/demo/Journal/2026-09-02.md",
  diff_hash: DIFF_HASH,
  reason: "Operator approved a local memory candidate for later vault merge.",
  status: "pending_review",
  requested_by: "owner:linda",
  requested_at: TIME,
  expected_target_revision: 3,
  descriptor_only: true,
} as const;

const writebackDecision = {
  id: IDS.decision,
  ...meta,
  request_id: IDS.request,
  decision: "approve",
  decided_by: "owner:linda",
  decided_at: TIME,
  reason: "Diff, target, and scope reviewed by operator.",
  descriptor_only: true,
} as const;

describe("C22 Obsidian/OMI/Journal contracts", () => {
  it("Given vault and journal descriptors When parsed Then readable IDs and local descriptor boundaries are explicit", () => {
    expect(VaultBridgeDescriptorSchema.parse(vault)).toMatchObject({ id: IDS.vault, access_mode: "read_only", descriptor_only: true });
    expect(JournalSourceSchema.parse(source)).toMatchObject({ source_kind: "omi", source_ref: source.source_ref, descriptor_only: true });
    expect(JournalEntryDescriptorSchema.parse(entry)).toMatchObject({ entry_date: "2026-09-02", source_ids: [IDS.source], descriptor_only: true });
    expect(GraphIndexSnapshotSchema.parse(graph)).toMatchObject({ index_kind: "graph_fts", node_count: 42, descriptor_only: true });
    expect(JournalSourceSchema.parse({ ...source, source_ref: "journal://daily/2026-09-02" })).toMatchObject({ source_ref: "journal://daily/2026-09-02" });
    expect(JournalEntryDescriptorSchema.parse({ ...entry, summary: "See journal://daily/2026-09-02 descriptor for the approved memory candidate." })).toMatchObject({ summary: "See journal://daily/2026-09-02 descriptor for the approved memory candidate." });
  });

  it("Given unsafe source refs When parsed Then external URLs credentials and local paths are rejected", () => {
    expect(VaultBridgeDescriptorSchema.safeParse({ ...vault, root_ref: "file:///Users/zq/Obsidian" }).success).toBe(false);
    expect(VaultBridgeDescriptorSchema.safeParse({ ...vault, root_ref: "/Users/zq/Obsidian" }).success).toBe(false);
    expect(VaultBridgeDescriptorSchema.safeParse({ ...vault, root_ref: "secret://vaults/obsidian-token" }).success).toBe(false);
    expect(VaultBridgeDescriptorSchema.safeParse({ ...vault, root_ref: "workspace://vaults/demo?token%3dabcd1234" }).success).toBe(false);
    expect(VaultBridgeDescriptorSchema.safeParse({ ...vault, name: "token=abcd1234" }).success).toBe(false);
    expect(VaultBridgeDescriptorSchema.safeParse({ ...vault, name: "token%3dabcd1234" }).success).toBe(false);
    expect(JournalSourceSchema.safeParse({ ...source, source_ref: "https://example.com/export.md" }).success).toBe(false);
    expect(JournalSourceSchema.safeParse({ ...source, source_ref: "workspace://../private/journal.md" }).success).toBe(false);
    expect(JournalSourceSchema.safeParse({ ...source, source_ref: "workspace://vaults/%2e%2e/private.md" }).success).toBe(false);
    expect(JournalSourceSchema.safeParse({ ...source, source_ref: "journal://daily/2026-09-02?client_secret%3alivevalue" }).success).toBe(false);
    expect(JournalSourceSchema.safeParse({ ...source, source_ref: String.raw`workspace://C:\private\journal.md` }).success).toBe(false);
    expect(JournalSourceSchema.safeParse({ ...source, unknown: "field" }).success).toBe(false);
  });

  it("Given journal text hides secret markers with invisible or encoded characters When parsed Then text is rejected", () => {
    expect(VaultBridgeDescriptorSchema.safeParse({ ...vault, name: "token\u200b=abcd1234" }).success).toBe(false);
    expect(JournalEntryDescriptorSchema.safeParse({ ...entry, summary: "Captured t%6fken=abcd1234 in standup notes" }).success).toBe(false);
    expect(JournalEntryDescriptorSchema.safeParse({ ...entry, summary: "Captured t%6\u200bfken=abcd1234 in standup notes" }).success).toBe(false);
    expect(JournalEntryDescriptorSchema.safeParse({ ...entry, summary: "Read /tmp/private-vault/Journal.md" }).success).toBe(false);
    expect(JournalEntryDescriptorSchema.safeParse({ ...entry, summary: "Import sftp://example.com/export.md" }).success).toBe(false);
    expect(MemoryCandidateSchema.safeParse({ ...candidate, summary: "Promote access\u200b_token=abcd1234" }).success).toBe(false);
    expect(WritebackRequestSchema.safeParse({ ...writebackRequest, reason: "Operator pasted client\u200b_secret=abcd1234" }).success).toBe(false);
    expect(WritebackDecisionSchema.safeParse({ ...writebackDecision, reason: "Reject because t%6fken=abcd1234 was present" }).success).toBe(false);
  });

  it("Given descriptor refs contain default-ignorable characters When parsed Then refs are rejected", () => {
    for (const codePoint of DEFAULT_IGNORABLE_REFERENCE_CODE_POINTS) {
      const marker = String.fromCodePoint(codePoint);
      expect(VaultBridgeDescriptorSchema.safeParse({ ...vault, root_ref: `workspace://vaults/de${marker}mo` }).success).toBe(false);
      expect(JournalSourceSchema.safeParse({ ...source, source_ref: `workspace://omi/transcripts/2026-09-02${marker}standup.md` }).success).toBe(false);
      expect(MemoryCandidateSchema.safeParse({ ...candidate, proposed_path: `memory://Journal/2026-09-02${marker}draft.md` }).success).toBe(false);
      expect(WritebackRequestSchema.safeParse({ ...writebackRequest, target_ref: `workspace://vaults/demo/Journal/2026-09-02${marker}draft.md` }).success).toBe(false);
    }
  });

  it("Given graph and memory candidates When parsed Then counts are bounded and writeback remains pending approval", () => {
    expect(MemoryCandidateSchema.parse(candidate)).toMatchObject({ status: "needs_review", descriptor_only: true });
    expect(WritebackRequestSchema.parse(writebackRequest)).toMatchObject({ status: "pending_review", descriptor_only: true });
    expect(WritebackDecisionSchema.parse(writebackDecision)).toMatchObject({ decision: "approve", descriptor_only: true });
    expect(canApplyWriteback(writebackRequest, writebackDecision)).toBe(true);
    expect(canApplyWriteback(writebackRequest, null)).toBe(false);
    expect(canApplyWriteback(WritebackRequestSchema.parse({ ...writebackRequest, status: "rejected" }), writebackDecision)).toBe(false);
    expect(GraphIndexSnapshotSchema.safeParse({ ...graph, node_count: -1 }).success).toBe(false);
    expect(MemoryCandidateSchema.safeParse({ ...candidate, proposed_path: "file:///Users/zq/Obsidian/Journal.md" }).success).toBe(false);
    expect(MemoryCandidateSchema.safeParse({ ...candidate, summary: "Copy secret://providers/openai into memory" }).success).toBe(false);
    expect(WritebackRequestSchema.safeParse({ ...writebackRequest, target_ref: "vault://providers/openai-api-key" }).success).toBe(false);
    expect(WritebackRequestSchema.safeParse({ ...writebackRequest, status: "applied" }).success).toBe(false);
    expect(WritebackDecisionSchema.safeParse({ ...writebackDecision, reason: "Write /Users/zq/private.md" }).success).toBe(false);
  });
});
