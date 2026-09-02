import { describe, expect, it, vi } from "vitest";
import { parseJournalCommand } from "./journal.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  entry: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  source: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  graph: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  candidate: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  request: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  loop: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
};
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const GRAPH_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DIFF_HASH = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

describe("C22 Journal CLI control semantics", () => {
  it("Given /journal vault When parsed Then it creates a read-only descriptor request", () => {
    const parsed = parseJournalCommand(`/journal vault --workspace ${IDS.workspace} --vault vault-obsidian-demo --name "Obsidian Demo Vault" --kind obsidian --root-ref workspace://vaults/demo --idempotency-key journal:vault:c22`);

    expect(parsed).toEqual({
      method: "POST",
      path: "/v1/vaults",
      headers: { "idempotency-key": "journal:vault:c22" },
      body: expect.objectContaining({ workspace_id: IDS.workspace, id: "vault-obsidian-demo", access_mode: "read_only", descriptor_only: true }),
      descriptor_only: true,
    });
  });

  it("Given /journal entry source graph and memory commands When parsed Then they stay in descriptor namespaces", () => {
    expect(parseJournalCommand(`/journal entry --workspace ${IDS.workspace} --entry ${IDS.entry} --vault vault-obsidian-demo --date 2026-09-02 --title "Daily journal" --summary "Reviewed local facts" --source ${IDS.source} --candidate ${IDS.candidate} --run ${IDS.run} --goal-loop ${IDS.loop} --tag daily --idempotency-key journal:entry:c22`)).toMatchObject({ path: "/v1/journal/entries", body: { source_ids: [IDS.source], memory_candidate_ids: [IDS.candidate], tags: ["daily"] } });
    expect(parseJournalCommand(`/journal source --workspace ${IDS.workspace} --source ${IDS.source} --vault vault-obsidian-demo --entry ${IDS.entry} --kind omi --ref workspace://omi/transcripts/2026-09-02.md --hash ${HASH} --idempotency-key journal:source:c22`)).toMatchObject({ path: "/v1/journal/sources", body: { source_ref: "workspace://omi/transcripts/2026-09-02.md", descriptor_only: true } });
    expect(parseJournalCommand(`/journal graph --workspace ${IDS.workspace} --graph ${IDS.graph} --vault vault-obsidian-demo --kind graph_fts --source-hash ${HASH} --graph-hash ${GRAPH_HASH} --fts-hash ${HASH} --nodes 42 --edges 64 --documents 8 --idempotency-key journal:graph:c22`)).toMatchObject({ path: "/v1/journal/graph-indexes", body: { node_count: 42, edge_count: 64, document_count: 8 } });
    expect(parseJournalCommand(`/journal memory --workspace ${IDS.workspace} --candidate ${IDS.candidate} --vault vault-obsidian-demo --entry ${IDS.entry} --source ${IDS.source} --kind lesson --path memory://Journal/2026-09-02.md --summary "Keep writeback approval-only" --hash ${HASH} --risk R1 --idempotency-key journal:memory:c22`)).toMatchObject({ path: "/v1/journal/memory-candidates", body: { status: "needs_review", descriptor_only: true } });
  });

  it("Given an identical /journal descriptor command is retried When parsed at different wall times Then the request body stays stable", () => {
    const command = `/journal source --workspace ${IDS.workspace} --source ${IDS.source} --vault vault-obsidian-demo --entry ${IDS.entry} --kind omi --ref workspace://omi/transcripts/2026-09-02.md --hash ${HASH} --idempotency-key journal:source:retry`;
    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-02T04:00:00.000Z"));
      const first = parseJournalCommand(command);
      vi.setSystemTime(new Date("2026-09-02T04:00:03.000Z"));
      const replay = parseJournalCommand(command);

      expect(replay).toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Given /journal writeback commands When parsed Then approval carries If-Match and no external write intent", () => {
    const request = parseJournalCommand(`/journal writeback request --workspace ${IDS.workspace} --request ${IDS.request} --vault vault-obsidian-demo --candidate ${IDS.candidate} --target workspace://vaults/demo/Journal/2026-09-02.md --diff-hash ${DIFF_HASH} --reason "Stage reviewed diff" --target-revision 3 --idempotency-key journal:writeback:request`);
    const approve = parseJournalCommand(`/journal writeback approve ${IDS.request} --workspace ${IDS.workspace} --reason "Approve reviewed diff" --if-match 1 --idempotency-key journal:writeback:approve`);

    expect(request).toMatchObject({ method: "POST", path: "/v1/journal/writebacks", headers: { "idempotency-key": "journal:writeback:request" }, body: { status: "pending_review", descriptor_only: true } });
    expect(approve).toEqual({ method: "POST", path: `/v1/journal/writebacks/${IDS.request}/approve`, headers: { "idempotency-key": "journal:writeback:approve", "if-match": "1" }, body: { schema_version: 1, workspace_id: IDS.workspace, reason: "Approve reviewed diff", descriptor_only: true }, descriptor_only: true });
  });

  it("Given external Obsidian OMI MCP or path flags When parsed Then descriptor-only CLI rejects them", () => {
    expect(() => parseJournalCommand(`/journal vault --workspace ${IDS.workspace} --vault vault-obsidian-demo --name "Live" --kind obsidian --root-ref file:///Users/zq/Obsidian --idempotency-key journal:vault:path`)).toThrow(/path|external|descriptor-only/i);
    expect(() => parseJournalCommand(`/journal source --workspace ${IDS.workspace} --source ${IDS.source} --vault vault-obsidian-demo --entry ${IDS.entry} --kind omi --ref https://example.com/export.md --hash ${HASH} --idempotency-key journal:source:http`)).toThrow(/external|descriptor-only/i);
    expect(() => parseJournalCommand(`/journal memory --workspace ${IDS.workspace} --candidate ${IDS.candidate} --vault vault-obsidian-demo --entry ${IDS.entry} --source ${IDS.source} --kind lesson --path memory://Journal.md --summary "token=abcd1234" --hash ${HASH} --risk R1 --idempotency-key journal:memory:secret`)).toThrow(/secret|credential/i);
    expect(() => parseJournalCommand(`/journal writeback approve ${IDS.request} --workspace ${IDS.workspace} --reason "Write /Users/zq/Obsidian/private.md" --if-match 1 --idempotency-key journal:writeback:path`)).toThrow(/path|external|descriptor-only/i);
    expect(() => parseJournalCommand(`/journal vault --workspace ${IDS.workspace} --mcp obsidian-live --vault vault-obsidian-demo --name "Live" --kind obsidian --root-ref workspace://vaults/demo --idempotency-key journal:vault:mcp`)).toThrow(/external|descriptor-only/i);
    expect(() => parseJournalCommand(`/journal writeback request --workspace ${IDS.workspace} --request ${IDS.request} --vault vault-obsidian-demo --candidate ${IDS.candidate} --target workspace://vaults/demo/Journal/2026-09-02.md --diff-hash ${DIFF_HASH} --reason "Stage reviewed diff" --target-revision 3 --idempotency-key journal:writeback:token=abcd1234`)).toThrow(/idempotency|secret|credential/i);
  });
});
