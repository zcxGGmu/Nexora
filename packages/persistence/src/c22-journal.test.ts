import { describe, expect, it } from "vitest";
import { canApplyWriteback } from "@nexora/contracts";
import { CORE_TABLES, migrate, openDatabase, type SqliteDatabase } from "./index.js";
import {
  GraphIndexSnapshotRepository,
  GoalLoopRepository,
  JournalEntryRepository,
  JournalMemoryCandidateRepository,
  JournalSourceRepository,
  VaultBridgeRepository,
  WritebackDecisionRepository,
  WritebackRequestRepository,
} from "./repositories/index.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  otherWorkspace: "01BRZ3NDEKTSV4RRFFQ69H5FAV",
  agent: "01TRZ3NDEKTSV4RRFFQ69T5FAV",
  goal: "01VRZ3NDEKTSV4RRFFQ69V5FAV",
  ticket: "01WRZ3NDEKTSV4RRFFQ69W5FAV",
  vault: "vault-obsidian-demo",
  otherVault: "vault-other-demo",
  entry: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  source: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  graph: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  candidate: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  request: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  decision: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  run: "01JRZ3NDEKTSV4RRFFQ69H5FAV",
  goalLoop: "01KRZ3NDEKTSV4RRFFQ69H5FAV",
  otherRun: "01XRZ3NDEKTSV4RRFFQ69X5FAV",
  otherTicket: "01YRZ3NDEKTSV4RRFFQ69Y5FAV",
  otherSession: "01ZRZ3NDEKTSV4RRFFQ69Z5FAV",
  otherGoalLoop: "01MRZ3NDEKTSV4RRFFQ69M5FAV",
  gateway: "gateway-c22",
  channel: "channel-c22",
  session: "01NRZ3NDEKTSV4RRFFQ69N5FAV",
};

const TIME = "2026-09-02T04:00:00.000Z";
const LATER = "2026-09-02T04:05:00.000Z";
const MUCH_LATER = "2026-09-02T04:10:00.000Z";
const DEADLINE = "2026-09-02T05:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const GRAPH_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DIFF_HASH = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const DEFAULT_IGNORABLE_REFERENCE_CODE_POINTS = [0x00ad, 0x034f, 0x061c, 0x180e, 0x200b, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0xfe0f, 0xe0061] as const;

describe("C22 journal and vault persistence", () => {
  it("Given migrations run When schema is validated Then C22 tables and current migration exist", () => {
    const database = openDatabase(":memory:");
    try {
      migrate(database, { now: () => TIME });
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row["name"]);
      const triggers = database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all().map((row) => row["name"]);

      expect(database.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row["version"])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      expect(CORE_TABLES).toEqual(expect.arrayContaining(["vault_bridges", "journal_entries", "journal_sources", "journal_graph_indexes", "journal_memory_candidates", "journal_writeback_requests", "journal_writeback_decisions"]));
      expect(tables).toEqual(expect.arrayContaining(["vault_bridges", "journal_entries", "journal_sources", "journal_graph_indexes", "journal_memory_candidates", "journal_writeback_requests", "journal_writeback_decisions"]));
      expect(triggers).toEqual(expect.arrayContaining([
        "c22_vault_bridges_payload_columns_match_insert",
        "vault_bridges_no_update",
        "vault_bridges_no_delete",
        "c22_journal_entries_payload_columns_match_insert",
        "journal_entries_no_update",
        "journal_entries_no_delete",
        "c22_journal_entries_goal_run_scope_insert",
        "c22_vault_bridges_allowed_source_kinds_insert",
        "c22_journal_sources_entry_listing_insert",
        "c22_journal_sources_allowed_kind_insert",
        "c22_journal_graph_indexes_enabled_insert",
        "c22_journal_candidates_entry_listing_insert",
        "c22_journal_candidates_pending_insert",
        "c22_vault_bridges_ref_shape_insert",
        "c22_journal_sources_ref_shape_insert",
        "c22_journal_candidates_ref_shape_insert",
        "c22_writeback_requests_ref_shape_insert",
        "c22_writeback_requests_payload_columns_match_update",
        "c22_writeback_requests_pending_insert",
        "c22_writeback_requests_candidate_scope_insert",
        "c22_writeback_requests_target_root_insert",
        "c22_writeback_requests_safe_update",
        "journal_writeback_requests_terminal_no_update",
        "journal_writeback_requests_no_delete",
        "journal_sources_no_update",
        "journal_sources_no_delete",
        "journal_graph_indexes_no_update",
        "journal_memory_candidates_no_update",
        "journal_memory_candidates_no_delete",
        "journal_writeback_decisions_no_update",
      ]));
    } finally {
      database.close();
    }
  });

  it("Given raw SQL inserts drifted journal payloads Then database constraints reject columns that do not match payload_json", () => {
    const database = createDatabase();
    try {
      expect(() => insertRawVault(database, { ...vault(), workspace_id: IDS.otherWorkspace })).toThrow(/payload|columns|abort/i);

      new VaultBridgeRepository(database).create(vault());
      expect(() => insertRawEntry(database, { ...entry(), workspace_id: IDS.otherWorkspace })).toThrow(/payload|columns|abort/i);

      new JournalEntryRepository(database).create(entry());
      expect(() => insertRawSource(database, { ...source(), journal_entry_id: IDS.decision })).toThrow(/payload|columns|abort/i);
      expect(() => insertRawGraph(database, { ...graph(), graph_hash: DIFF_HASH })).toThrow(/payload|columns|abort/i);

      new JournalSourceRepository(database).record(source());
      expect(() => insertRawCandidate(database, { ...candidate(), proposed_path: "memory://Journal/drifted.md" }, { proposed_path: "memory://Journal/2026-09-02.md" })).toThrow(/payload|columns|abort/i);

      new JournalMemoryCandidateRepository(database).create(candidate());
      expect(() => insertRawWritebackRequest(database, { ...writebackRequest(), target_ref: "memory://Journal/drifted.md" }, { target_ref: "workspace://vaults/demo/Journal/2026-09-02.md" })).toThrow(/payload|columns|abort/i);

      new WritebackRequestRepository(database).create(writebackRequest());
      expect(() => insertRawWritebackDecision(database, { ...writebackDecision(), decision: "reject" })).toThrow(/payload|columns|abort/i);
    } finally {
      database.close();
    }
  });

  it("Given raw SQL inserts invalid vault allowed source policies Then database constraints reject them", () => {
    expect(() => withDatabase((database) => {
      const payload = { ...vault(), name: "Raw Vault", root_ref: "workspace://vaults/raw", allowed_source_kinds: ["evil"] };
      insertRawVault(database, payload, { allowedSourceKindsJson: JSON.stringify(["evil"]) });
    })).toThrow(/allowed|source|kind|vault|abort|constraint/i);

    expect(() => withDatabase((database) => {
      const payload = { ...vault(), name: "Raw Vault", root_ref: "workspace://vaults/raw", allowed_source_kinds: "manual" };
      insertRawVault(database, payload, { allowedSourceKindsJson: JSON.stringify("manual") });
    })).toThrow(/allowed|source|kind|vault|abort|constraint/i);

    expect(() => withDatabase((database) => {
      const payload = { ...vault(), name: "Raw Vault", root_ref: "workspace://vaults/raw", allowed_source_kinds: [] };
      insertRawVault(database, payload, { allowedSourceKindsJson: JSON.stringify([]) });
    })).toThrow(/allowed|source|kind|vault|abort|constraint/i);

    expect(() => withDatabase((database) => {
      const oversizedKinds = Array.from({ length: 17 }, () => "manual");
      const payload = { ...vault(), name: "Raw Vault", root_ref: "workspace://vaults/raw", allowed_source_kinds: oversizedKinds };
      insertRawVault(database, payload, { allowedSourceKindsJson: JSON.stringify(oversizedKinds) });
    })).toThrow(/allowed|source|kind|vault|abort|constraint/i);
  });

  it("Given raw SQL inserts descriptor refs with invalid casing or unsafe paths Then database constraints reject them", () => {
    expect(() => {
      const database = createDatabase();
      try {
        insertRawVault(database, { ...vault(), name: "Raw Vault", allowed_source_kinds: ["manual"], root_ref: "WORKSPACE://vaults/raw" });
      } finally {
        database.close();
      }
    }).toThrow(/descriptor|reference|abort|constraint/i);

    expect(() => {
      const database = createDatabase();
      try {
        insertRawVault(database, { ...vault(), name: "Raw Vault", allowed_source_kinds: ["manual"], root_ref: "workspace://vaults/demo:note" });
      } finally {
        database.close();
      }
    }).toThrow(/descriptor|reference|abort|constraint/i);

    expect(() => {
      const database = createDatabase();
      try {
        new VaultBridgeRepository(database).create(vault());
        new JournalEntryRepository(database).create(entry());
        insertRawSource(database, { ...source(), source_ref: "WORKSPACE://omi/transcripts/2026-09-02-standup.md" });
      } finally {
        database.close();
      }
    }).toThrow(/descriptor|reference|abort|constraint/i);

    expect(() => {
      const database = createDatabase();
      try {
        new VaultBridgeRepository(database).create(vault());
        new JournalEntryRepository(database).create(entry());
        new JournalSourceRepository(database).record(source());
        insertRawCandidate(database, { ...candidate(), proposed_path: "MEMORY://Journal/2026-09-02.md" });
      } finally {
        database.close();
      }
    }).toThrow(/descriptor|reference|abort|constraint/i);

    expect(() => {
      const database = createDatabase();
      try {
        new VaultBridgeRepository(database).create(vault());
        new JournalEntryRepository(database).create(entry());
        new JournalSourceRepository(database).record(source());
        new JournalMemoryCandidateRepository(database).create(candidate());
        insertRawWritebackRequest(database, { ...writebackRequest(), target_ref: "WORKSPACE://vaults/demo/Journal/2026-09-02.md" });
      } finally {
        database.close();
      }
    }).toThrow(/descriptor|reference|abort|constraint/i);

    expect(() => {
      const database = createDatabase();
      try {
        new VaultBridgeRepository(database).create(vault());
        new JournalEntryRepository(database).create(entry());
        insertRawSource(database, { ...source(), source_ref: "workspace://omi/transcripts/2026-09-02 standup.md" });
      } finally {
        database.close();
      }
    }).toThrow(/descriptor|reference|abort|constraint/i);

    expect(() => {
      const database = createDatabase();
      try {
        insertRawVault(database, { ...vault(), name: "Raw Vault", allowed_source_kinds: ["manual"], root_ref: "workspace://vaults/demo\u00a0note.md" });
      } finally {
        database.close();
      }
    }).toThrow(/descriptor|reference|abort|constraint/i);

    expect(() => {
      const database = createDatabase();
      try {
        new VaultBridgeRepository(database).create(vault());
        new JournalEntryRepository(database).create(entry());
        insertRawSource(database, { ...source(), source_ref: "workspace://omi/transcripts/2026-09-02\u00a0standup.md" });
      } finally {
        database.close();
      }
    }).toThrow(/descriptor|reference|abort|constraint/i);

    expect(() => {
      const database = createDatabase();
      try {
        new VaultBridgeRepository(database).create(vault());
        new JournalEntryRepository(database).create(entry());
        new JournalSourceRepository(database).record(source());
        insertRawCandidate(database, { ...candidate(), proposed_path: "memory://Journal/2026-09-02\u00a0draft.md" });
      } finally {
        database.close();
      }
    }).toThrow(/descriptor|reference|abort|constraint/i);

    expect(() => {
      const database = createDatabase();
      try {
        new VaultBridgeRepository(database).create(vault());
        new JournalEntryRepository(database).create(entry());
        new JournalSourceRepository(database).record(source());
        new JournalMemoryCandidateRepository(database).create(candidate());
        insertRawWritebackRequest(database, { ...writebackRequest(), target_ref: "workspace://vaults/demo/Journal/2026-09-02\u00a0draft.md" });
      } finally {
        database.close();
      }
    }).toThrow(/descriptor|reference|abort|constraint/i);
  });

  it("Given raw SQL inserts descriptor refs with default-ignorable characters Then database constraints reject them", () => {
    for (const codePoint of DEFAULT_IGNORABLE_REFERENCE_CODE_POINTS) {
      const marker = String.fromCodePoint(codePoint);
      expect(() => withDatabase((database) => {
        insertRawVault(database, { ...vault(), name: "Raw Vault", allowed_source_kinds: ["manual"], root_ref: `workspace://vaults/de${marker}mo` });
      })).toThrow(/descriptor|reference|abort|constraint/i);

      expect(() => withSeededEntry((database) => {
        insertRawSource(database, { ...source(), source_ref: `workspace://omi/transcripts/2026-09-02${marker}standup.md` });
      })).toThrow(/descriptor|reference|abort|constraint/i);

      expect(() => withSeededSource((database) => {
        insertRawCandidate(database, { ...candidate(), proposed_path: `memory://Journal/2026-09-02${marker}draft.md` });
      })).toThrow(/descriptor|reference|abort|constraint/i);

      expect(() => withSeededCandidate((database) => {
        insertRawWritebackRequest(database, { ...writebackRequest(), target_ref: `workspace://vaults/demo/Journal/2026-09-02${marker}draft.md` });
      })).toThrow(/descriptor|reference|abort|constraint/i);
    }
  });

  it("Given raw SQL inserts journal payloads with unknown top-level fields Then database constraints reject them", () => {
    expect(() => withDatabase((database) => {
      insertRawVault(database, { ...vault(), name: "Raw Vault", allowed_source_kinds: ["manual"], root_ref: "workspace://vaults/raw", external_write_executed: true });
    })).toThrow(/payload|unknown|abort|constraint/i);

    expect(() => withSeededVault((database) => {
      insertRawEntry(database, { ...entry(), external_write_executed: true });
    })).toThrow(/payload|unknown|abort|constraint/i);

    expect(() => withSeededEntry((database) => {
      insertRawSource(database, { ...source(), external_write_executed: true });
    })).toThrow(/payload|unknown|abort|constraint/i);

    expect(() => withSeededEntry((database) => {
      insertRawGraph(database, { ...graph(), external_write_executed: true });
    })).toThrow(/payload|unknown|abort|constraint/i);

    expect(() => withSeededSource((database) => {
      insertRawCandidate(database, { ...candidate(), external_write_executed: true });
    })).toThrow(/payload|unknown|abort|constraint/i);

    expect(() => withSeededCandidate((database) => {
      insertRawWritebackRequest(database, { ...writebackRequest(), external_write_executed: true });
    })).toThrow(/payload|unknown|abort|constraint/i);

    expect(() => withSeededWritebackRequest((database) => {
      insertRawWritebackDecision(database, { ...writebackDecision(), external_write_executed: true });
    })).toThrow(/payload|unknown|abort|constraint/i);
  });

  it("Given raw SQL writes journal payloads with duplicate top-level keys Then database constraints reject them", () => {
    expect(() => withDatabase((database) => {
      const payload = { ...vault(), name: "Raw Vault", allowed_source_kinds: ["manual"], root_ref: "workspace://vaults/raw" };
      insertRawVault(database, payload, { payloadJson: payloadJsonWithDuplicateString(payload, "workspace_id", IDS.otherWorkspace) });
    })).toThrow(/payload|duplicate|unknown|abort|constraint/i);

    expect(() => withSeededVault((database) => {
      const payload = entry();
      insertRawEntry(database, payload, { runId: IDS.run, goalLoopId: IDS.goalLoop, payloadJson: payloadJsonWithDuplicateString(payload, "workspace_id", IDS.otherWorkspace) });
    })).toThrow(/payload|duplicate|unknown|abort|constraint/i);

    expect(() => withSeededEntry((database) => {
      const payload = source();
      insertRawSource(database, payload, { payloadJson: payloadJsonWithDuplicateString(payload, "workspace_id", IDS.otherWorkspace) });
    })).toThrow(/payload|duplicate|unknown|abort|constraint/i);

    expect(() => withSeededVault((database) => {
      const payload = graph();
      insertRawGraph(database, payload, { payloadJson: payloadJsonWithDuplicateString(payload, "workspace_id", IDS.otherWorkspace) });
    })).toThrow(/payload|duplicate|unknown|abort|constraint/i);

    expect(() => withSeededSource((database) => {
      const payload = candidate();
      insertRawCandidate(database, payload, { payloadJson: payloadJsonWithDuplicateString(payload, "workspace_id", IDS.otherWorkspace) });
    })).toThrow(/payload|duplicate|unknown|abort|constraint/i);

    expect(() => withSeededCandidate((database) => {
      const payload = writebackRequest();
      insertRawWritebackRequest(database, payload, { payloadJson: payloadJsonWithDuplicateString(payload, "workspace_id", IDS.otherWorkspace) });
    })).toThrow(/payload|duplicate|unknown|abort|constraint/i);

    expect(() => withSeededWritebackRequest((database) => {
      const payload = writebackDecision();
      insertRawWritebackDecision(database, payload, { payloadJson: payloadJsonWithDuplicateString(payload, "workspace_id", IDS.otherWorkspace) });
    })).toThrow(/payload|duplicate|unknown|abort|constraint/i);

    expect(() => withSeededWritebackRequest((database) => {
      const requests = new WritebackRequestRepository(database);
      new WritebackDecisionRepository(database).record(writebackDecision());
      const pending = requests.get(IDS.workspace, IDS.request);
      const approvedPayload = { ...pending, status: "approved", updated_at: LATER, revision: 2 };
      database.prepare("UPDATE journal_writeback_requests SET status = 'approved', payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = 1").run(payloadJsonWithDuplicateString(approvedPayload, "workspace_id", IDS.otherWorkspace), LATER, IDS.workspace, IDS.request);
    })).toThrow(/payload|duplicate|unknown|abort|constraint/i);
  });

  it("Given journal entries reference run and goal context Then repository and SQL enforce same-workspace topology", () => {
    const database = createDatabase();
    try {
      new VaultBridgeRepository(database).create(vault());
      seedOtherGoalLoop(database);

      expect(() => new JournalEntryRepository(database).create({ ...entry(), id: IDS.decision, run_id: IDS.otherRun, goal_loop_id: IDS.goalLoop })).toThrow(/run|goal|scope|constraint/i);
      expect(() => new JournalEntryRepository(database).create({ ...entry(), id: IDS.graph, run_id: IDS.run, goal_loop_id: IDS.otherGoalLoop })).toThrow(/run|goal|scope|constraint/i);
      expect(() => insertRawEntry(database, { ...entry(), id: IDS.graph }, { runId: IDS.run, goalLoopId: IDS.otherGoalLoop })).toThrow(/run|goal|scope|abort/i);
      expect(() => insertRawEntry(database, { ...entry(), id: IDS.decision, run_id: null, goal_loop_id: IDS.goalLoop }, { runId: null, goalLoopId: IDS.goalLoop })).toThrow(/run|goal|scope|abort/i);
    } finally {
      database.close();
    }
  });

  it("Given journal sources and candidates are forward-listed by entry Then unlisted raw facts are rejected", () => {
    const database = createDatabase();
    try {
      new VaultBridgeRepository(database).create(vault());
      new JournalEntryRepository(database).create(entry());

      expect(() => new JournalSourceRepository(database).record({ ...source(), id: IDS.decision })).toThrow(/listed|entry|scope|constraint/i);
      expect(() => insertRawSource(database, { ...source(), id: IDS.decision })).toThrow(/listed|entry|scope|abort/i);

      new JournalSourceRepository(database).record(source());
      expect(() => new JournalMemoryCandidateRepository(database).create({ ...candidate(), id: IDS.decision })).toThrow(/listed|entry|scope|constraint/i);
      expect(() => insertRawCandidate(database, { ...candidate(), id: IDS.decision })).toThrow(/listed|entry|scope|abort/i);
    } finally {
      database.close();
    }
  });

  it("Given vault source and index policies When source or graph facts are recorded Then repository and raw SQL enforce the vault allowlist", () => {
    const database = createDatabase();
    try {
      const manualOnlyVault = { ...vault(), allowed_source_kinds: ["manual"] };
      new VaultBridgeRepository(database).create(manualOnlyVault);
      new JournalEntryRepository(database).create(entry());

      expect(() => new JournalSourceRepository(database).record(source())).toThrow(/source|kind|allow|vault|constraint/i);
      expect(() => insertRawSource(database, source())).toThrow(/source|kind|allow|vault|abort|constraint/i);
    } finally {
      database.close();
    }

    for (const indexKind of ["graph", "fts", "graph_fts"] as const) {
      const disabledDatabase = createDatabase();
      try {
        const disabledVault = { ...vault(), graph_enabled: false, fts_enabled: false };
        const graphSnapshot = { ...graph(), index_kind: indexKind };
        new VaultBridgeRepository(disabledDatabase).create(disabledVault);

        expect(() => new GraphIndexSnapshotRepository(disabledDatabase).record(graphSnapshot)).toThrow(/graph|fts|vault|enabled|constraint/i);
        expect(() => insertRawGraph(disabledDatabase, graphSnapshot, { indexKind })).toThrow(/graph|fts|vault|enabled|abort|constraint/i);
      } finally {
        disabledDatabase.close();
      }
    }
  });

  it("Given a writeback request references a candidate from another vault Then raw SQL is rejected", () => {
    const database = createDatabase();
    try {
      const vaults = new VaultBridgeRepository(database);
      const entries = new JournalEntryRepository(database);
      const sources = new JournalSourceRepository(database);
      const candidates = new JournalMemoryCandidateRepository(database);
      const otherVault = { ...vault(), id: IDS.otherVault, name: "Other Demo Vault", root_ref: "workspace://vaults/other" };
      const otherEntry = { ...entry(), id: IDS.decision, vault_id: IDS.otherVault, entry_date: "2026-09-03", source_ids: [IDS.graph], memory_candidate_ids: [IDS.otherRun] };
      const otherSource = { ...source(), id: IDS.graph, vault_id: IDS.otherVault, journal_entry_id: IDS.decision, source_ref: "workspace://omi/transcripts/2026-09-03-standup.md" };
      const otherCandidate = { ...candidate(), id: IDS.otherRun, vault_id: IDS.otherVault, journal_entry_id: IDS.decision, source_ids: [IDS.graph], proposed_path: "memory://Journal/2026-09-03.md" };

      vaults.create(vault());
      vaults.create(otherVault);
      entries.create(otherEntry);
      sources.record(otherSource);
      candidates.create(otherCandidate);

      expect(() => insertRawWritebackRequest(database, { ...writebackRequest(), vault_id: IDS.vault, candidate_id: IDS.otherRun })).toThrow(/candidate|vault|scope|mismatch|abort/i);
      expect(() => new WritebackRequestRepository(database).create({ ...writebackRequest(), candidate_id: IDS.otherRun })).toThrow(/candidate|vault|scope|constraint/i);
    } finally {
      database.close();
    }
  });

  it("Given a writeback target points outside the selected vault root Then repository and raw SQL reject it", () => {
    const outsideRootRequest = { ...writebackRequest(), target_ref: "workspace://vaults/other/Journal/2026-09-02.md" };

    expect(() => withSeededCandidate((database) => {
      new VaultBridgeRepository(database).create({ ...vault(), id: IDS.otherVault, name: "Other Demo Vault", root_ref: "workspace://vaults/other" });
      insertRawWritebackRequest(database, outsideRootRequest);
    })).toThrow(/target|root|vault|scope|abort|constraint/i);

    expect(() => withSeededCandidate((database) => {
      new VaultBridgeRepository(database).create({ ...vault(), id: IDS.otherVault, name: "Other Demo Vault", root_ref: "workspace://vaults/other" });
      new WritebackRequestRepository(database).create(outsideRootRequest);
    })).toThrow(/target|root|vault|scope|constraint/i);
  });

  it("Given journal text contains secret or path-shaped content Then SQL rejects it before payload reads", () => {
    const database = createDatabase();
    try {
      new VaultBridgeRepository(database).create(vault());

      expect(() => insertRawEntry(database, { ...entry(), summary: "Operator pasted /Users/zq/private-vault/Journal.md" })).toThrow(/secret|path|content|abort/i);
      expect(() => insertRawEntry(database, { ...entry(), summary: "Credential reference secret://obsidian/token" })).toThrow(/secret|path|content|abort/i);
      expect(() => insertRawEntry(database, { ...entry(), summary: "Encoded traversal workspace://vaults/demo/%2e%2e/private.md" })).toThrow(/secret|path|content|abort/i);
      expect(() => insertRawEntry(database, { ...entry(), summary: "Do not leak token=abcd1234 in journal facts" })).toThrow(/secret|path|content|abort/i);
      expect(() => insertRawEntry(database, { ...entry(), summary: "Do not leak token%3dabcd1234 in journal facts" })).toThrow(/secret|path|content|abort/i);
      expect(() => insertRawEntry(database, { ...entry(), title: "token\u200b=abcd1234", summary: "Captured operator decisions." })).toThrow(/secret|path|content|abort/i);
      expect(() => insertRawEntry(database, { ...entry(), summary: "Do not leak t%6fken=abcd1234 in journal facts" })).toThrow(/secret|path|content|abort/i);
      expect(() => insertRawEntry(database, { ...entry(), summary: "Do not leak t%6\u200bfken=abcd1234 in journal facts" })).toThrow(/secret|path|content|abort/i);
      expect(() => insertRawEntry(database, { ...entry(), summary: "Read /tmp/private-vault/Journal.md" })).toThrow(/secret|path|content|abort/i);
      expect(() => insertRawEntry(database, { ...entry(), summary: "Import sftp://example.com/export.md" })).toThrow(/secret|path|content|abort/i);
    } finally {
      database.close();
    }
  });

  it("Given raw SQL inserts percent-encoded secret markers Then database constraints reject them", () => {
    expect(() => withDatabase((database) => {
      insertRawVault(database, { ...vault(), name: "Raw Vault", allowed_source_kinds: ["manual"], root_ref: "workspace://vaults/raw?token%3dabcd1234" });
    })).toThrow(/secret|path|content|abort|constraint/i);

    expect(() => withDatabase((database) => {
      insertRawVault(database, { ...vault(), name: "t%6fken=abcd1234", allowed_source_kinds: ["manual"], root_ref: "workspace://vaults/raw" });
    })).toThrow(/secret|path|content|abort|constraint/i);

    expect(() => withSeededEntry((database) => {
      insertRawSource(database, { ...source(), source_ref: "journal://daily/2026-09-02?client_secret%3alivevalue" });
    })).toThrow(/secret|path|content|abort|constraint/i);

    expect(() => withSeededSource((database) => {
      insertRawCandidate(database, { ...candidate(), proposed_path: "memory://Journal/2026-09-02.md?access_token%3dlivevalue" });
    })).toThrow(/secret|path|content|abort|constraint/i);

    expect(() => withSeededCandidate((database) => {
      insertRawWritebackRequest(database, { ...writebackRequest(), target_ref: "workspace://vaults/demo/Journal/2026-09-02.md?password%3dlivevalue" });
    })).toThrow(/secret|path|content|abort|constraint/i);

    expect(() => withSeededWritebackRequest((database) => {
      insertRawWritebackDecision(database, { ...writebackDecision(), reason: "Reject because t%6fken=abcd1234 was present" });
    })).toThrow(/secret|path|content|abort|constraint/i);
  });

  it("Given journal repositories When storing facts Then scope and append-only boundaries are enforced", () => {
    const database = createDatabase();
    try {
      new VaultBridgeRepository(database).create(vault());
      new JournalEntryRepository(database).create(entry());
      new JournalSourceRepository(database).record(source());
      new GraphIndexSnapshotRepository(database).record(graph());
      expect(() => new JournalMemoryCandidateRepository(database).create({ ...candidate(), status: "applied" })).toThrow(/needs_review|status|sqlite/i);
      new JournalMemoryCandidateRepository(database).create(candidate());

      expect(new VaultBridgeRepository(database).list(IDS.workspace)).toEqual([expect.objectContaining({ id: IDS.vault, access_mode: "read_only" })]);
      expect(new JournalEntryRepository(database).listByVault(IDS.workspace, IDS.vault)).toEqual([expect.objectContaining({ id: IDS.entry, source_ids: [IDS.source] })]);
      expect(new JournalSourceRepository(database).listByEntry(IDS.workspace, IDS.entry)).toHaveLength(1);
      expect(new JournalMemoryCandidateRepository(database).listByEntry(IDS.workspace, IDS.entry)).toEqual([expect.objectContaining({ id: IDS.candidate, status: "needs_review" })]);
      expect(new VaultBridgeRepository(database).list(IDS.otherWorkspace)).toEqual([]);

      expect(() => new JournalSourceRepository(database).record({ ...source(), id: IDS.decision, source_ref: "https://example.com/export.md" })).toThrow(/source|ref|descriptor|path/i);
      expect(() => new JournalMemoryCandidateRepository(database).create({ ...candidate(), id: IDS.decision, vault_id: IDS.otherVault })).toThrow(/vault|scope|constraint/i);
      expect(() => database.prepare("UPDATE journal_sources SET source_hash = ? WHERE workspace_id = ? AND id = ?").run(DIFF_HASH, IDS.workspace, IDS.source)).toThrow(/append-only|abort/i);
      expect(() => database.prepare("DELETE FROM journal_graph_indexes WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.graph)).toThrow(/append-only|abort/i);
      expect(() => database.prepare("UPDATE journal_memory_candidates SET status = 'applied' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.candidate)).toThrow(/append-only|abort/i);
      expect(() => database.prepare("DELETE FROM journal_memory_candidates WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.candidate)).toThrow(/append-only|abort/i);
    } finally {
      database.close();
    }
  });

  it("Given root and terminal journal facts When raw SQL attempts mutation or delete Then append-only coverage blocks it", () => {
    const database = createDatabase();
    try {
      const vaults = new VaultBridgeRepository(database);
      const entries = new JournalEntryRepository(database);
      const requests = new WritebackRequestRepository(database);
      const decisions = new WritebackDecisionRepository(database);
      const isolatedVault = { ...vault(), id: IDS.otherVault, name: "Isolated Demo Vault", root_ref: "workspace://vaults/isolated" };
      const isolatedEntry = { ...entry(), id: IDS.decision, entry_date: "2026-09-03", source_ids: [IDS.graph], memory_candidate_ids: [] };

      vaults.create(vault());
      vaults.create(isolatedVault);
      entries.create(entry());
      entries.create(isolatedEntry);
      new JournalSourceRepository(database).record(source());
      new GraphIndexSnapshotRepository(database).record(graph());
      new JournalMemoryCandidateRepository(database).create(candidate());
      const pending = requests.create(writebackRequest());
      decisions.record(writebackDecision());
      const approved = requests.update({ ...pending, status: "approved", updated_at: LATER }, 1);

      const mutatedVault = { ...isolatedVault, name: "Mutated Demo Vault", updated_at: LATER, revision: 2 };
      expect(() => database.prepare("UPDATE vault_bridges SET name = ?, payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ?").run("Mutated Demo Vault", JSON.stringify(mutatedVault), LATER, IDS.workspace, IDS.otherVault)).toThrow(/append-only|abort/i);
      expect(() => database.prepare("DELETE FROM vault_bridges WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.otherVault)).toThrow(/append-only|abort/i);

      const mutatedEntry = { ...isolatedEntry, title: "Mutated journal entry", updated_at: LATER };
      expect(() => database.prepare("UPDATE journal_entries SET title = ?, payload_json = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run("Mutated journal entry", JSON.stringify(mutatedEntry), LATER, IDS.workspace, IDS.decision)).toThrow(/append-only|abort/i);
      expect(() => database.prepare("DELETE FROM journal_entries WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.decision)).toThrow(/append-only|abort/i);

      const mutatedApproved = { ...approved, reason: "Tampered after approval.", updated_at: MUCH_LATER, revision: 3 };
      expect(() => requests.update({ ...approved, reason: "Tampered after approval.", updated_at: MUCH_LATER }, 2)).toThrow(/terminal|append-only|state/i);
      expect(() => database.prepare("UPDATE journal_writeback_requests SET reason = ?, payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = 2").run("Tampered after approval.", JSON.stringify(mutatedApproved), MUCH_LATER, IDS.workspace, IDS.request)).toThrow(/terminal|append-only|abort/i);
      expect(() => database.prepare("DELETE FROM journal_writeback_requests WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.request)).toThrow(/append-only|abort/i);
    } finally {
      database.close();
    }
  });

  it("Given writeback requests When approval is absent or stale Then no writeback can proceed", () => {
    const database = createDatabase();
    try {
      new VaultBridgeRepository(database).create(vault());
      new JournalEntryRepository(database).create(entry());
      new JournalSourceRepository(database).record(source());
      new JournalMemoryCandidateRepository(database).create(candidate());
      const requests = new WritebackRequestRepository(database);
      const decisions = new WritebackDecisionRepository(database);
      const pending = requests.create(writebackRequest());

      expect(canApplyWriteback(pending, null)).toBe(false);
      expect(() => requests.create({ ...writebackRequest(), id: IDS.source, target_ref: "file:///Users/zq/Obsidian/Journal.md" })).toThrow(/target|ref|path|descriptor/i);
      expect(() => requests.create({ ...writebackRequest(), id: IDS.source, status: "approved" })).toThrow(/pending_review|status|sqlite/i);
      expect(() => database.prepare("UPDATE journal_writeback_requests SET status = 'approved' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.request)).toThrow(/approval|immutable|abort/i);
      expect(() => database.prepare("UPDATE journal_writeback_requests SET target_ref = 'workspace://vaults/demo/Other.md' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.request)).toThrow(/immutable|abort/i);
      expect(() => decisions.record({ ...writebackDecision(), workspace_id: IDS.otherWorkspace })).toThrow(/request|scope|constraint/i);
      const approved = decisions.record(writebackDecision());

      expect(canApplyWriteback(pending, approved)).toBe(true);
      expect(() => database.prepare("UPDATE journal_writeback_decisions SET reason = 'mutated' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.decision)).toThrow(/append-only|abort/i);
      expect(() => requests.update({ ...pending, status: "approved", updated_at: LATER }, 2)).toThrow(/version|concurrency/i);
      const versionJumpPayload = { ...pending, status: "approved", updated_at: LATER, revision: 99 };
      expect(() => database.prepare("UPDATE journal_writeback_requests SET status = 'approved', payload_json = ?, updated_at = ?, version = 99 WHERE workspace_id = ? AND id = ? AND version = 1").run(JSON.stringify(versionJumpPayload), LATER, IDS.workspace, IDS.request)).toThrow(/version|concurrency|approval|abort/i);
      expect(requests.update({ ...pending, status: "approved", updated_at: LATER }, 1)).toMatchObject({ status: "approved", revision: 2 });
    } finally {
      database.close();
    }
  });
});

function createDatabase(): SqliteDatabase {
  const database = openDatabase(":memory:");
  migrate(database, { now: () => TIME });
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'Demo', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'Other', 1, ?, ?)").run(IDS.otherWorkspace, TIME, TIME);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, '{}', 1, ?, ?)").run(IDS.agent, IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'Goal', 'Objective', '[\"done\"]', '{}', 1, ?, ?)").run(IDS.goal, IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'ready', 'ticket:c22', '{}', 1, ?, ?)").run(IDS.ticket, IDS.workspace, IDS.goal, TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.ticket, JSON.stringify(runPayload(IDS.run, IDS.ticket)), TIME, TIME);
  database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'Gateway C22', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(IDS.gateway, IDS.workspace, TIME, TIME, TIME);
  database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'Channel C22', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(IDS.channel, IDS.workspace, IDS.gateway, TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'background', 'active', 'turn-1', NULL, ?, '{}', 1, ?, ?)").run(IDS.session, IDS.workspace, IDS.gateway, IDS.channel, IDS.agent, IDS.run, TIME, TIME, TIME);
  new GoalLoopRepository(database).create(goalLoop(IDS.goalLoop, IDS.run, IDS.session));
  return database;
}

function withDatabase(work: (database: SqliteDatabase) => void): void {
  const database = createDatabase();
  try {
    work(database);
  } finally {
    database.close();
  }
}

function withSeededVault(work: (database: SqliteDatabase) => void): void {
  withDatabase((database) => {
    new VaultBridgeRepository(database).create(vault());
    work(database);
  });
}

function withSeededEntry(work: (database: SqliteDatabase) => void): void {
  withSeededVault((database) => {
    new JournalEntryRepository(database).create(entry());
    work(database);
  });
}

function withSeededSource(work: (database: SqliteDatabase) => void): void {
  withSeededEntry((database) => {
    new JournalSourceRepository(database).record(source());
    work(database);
  });
}

function withSeededCandidate(work: (database: SqliteDatabase) => void): void {
  withSeededSource((database) => {
    new JournalMemoryCandidateRepository(database).create(candidate());
    work(database);
  });
}

function withSeededWritebackRequest(work: (database: SqliteDatabase) => void): void {
  withSeededCandidate((database) => {
    new WritebackRequestRepository(database).create(writebackRequest());
    work(database);
  });
}

function runPayload(runId: string, ticketId: string): Record<string, unknown> {
  return { id: runId, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, ticket_id: ticketId, execution_location: "local", status: "running", budget: { max_tokens: 10_000, max_cost_usd: 1 }, memory_snapshot: { snapshot_id: IDS.workspace, version: 1 }, connector_versions: { deterministic: "1.0.0" } };
}

function goalLoop(goalLoopId: string, runId: string, sessionId: string): Record<string, unknown> {
  return { id: goalLoopId, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, run_id: runId, session_id: sessionId, parent_loop_id: null, root_loop_id: goalLoopId, status: "running", objective: "Review journal memory candidates.", definition_of_done: ["Journal candidates are reviewed."], max_turns: 5, turn_count: 1, budget: { max_tokens: 10_000, max_cost_usd: 1 }, deadline_at: DEADLINE, continuation_cursor: "turn-1", judge: { done: false, reason: "Continue." }, descriptor_only: true };
}

function seedOtherGoalLoop(database: SqliteDatabase): void {
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'ready', 'ticket:c22:other', '{}', 1, ?, ?)").run(IDS.otherTicket, IDS.workspace, IDS.goal, TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.otherRun, IDS.workspace, IDS.otherTicket, JSON.stringify(runPayload(IDS.otherRun, IDS.otherTicket)), TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'background', 'active', 'turn-1', NULL, ?, '{}', 1, ?, ?)").run(IDS.otherSession, IDS.workspace, IDS.gateway, IDS.channel, IDS.agent, IDS.otherRun, TIME, TIME, TIME);
  new GoalLoopRepository(database).create(goalLoop(IDS.otherGoalLoop, IDS.otherRun, IDS.otherSession));
}

function vault(): Record<string, unknown> {
  return { id: IDS.vault, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, name: "Obsidian Demo Vault", kind: "obsidian", root_ref: "workspace://vaults/demo", access_mode: "read_only", sync_status: "indexed", graph_enabled: true, fts_enabled: true, allowed_source_kinds: ["manual", "omi", "obsidian", "memory", "artifact"], last_indexed_at: TIME, descriptor_only: true };
}

function entry(): Record<string, unknown> {
  return { id: IDS.entry, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, vault_id: IDS.vault, entry_date: "2026-09-02", title: "Daily operating journal", summary: "Captured operator decisions and reviewed memory candidates.", source_ids: [IDS.source], memory_candidate_ids: [IDS.candidate], run_id: IDS.run, goal_loop_id: IDS.goalLoop, tags: ["daily", "ops"], descriptor_only: true };
}

function source(): Record<string, unknown> {
  return { id: IDS.source, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, vault_id: IDS.vault, journal_entry_id: IDS.entry, source_kind: "omi", source_ref: "workspace://omi/transcripts/2026-09-02-standup.md", source_hash: HASH, captured_at: TIME, descriptor_only: true };
}

function graph(): Record<string, unknown> {
  return { id: IDS.graph, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, vault_id: IDS.vault, index_kind: "graph_fts", indexed_at: TIME, source_hash: HASH, graph_hash: GRAPH_HASH, fts_hash: HASH, node_count: 42, edge_count: 64, document_count: 8, stale: false, descriptor_only: true };
}

function candidate(): Record<string, unknown> {
  return { id: IDS.candidate, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, vault_id: IDS.vault, journal_entry_id: IDS.entry, source_ids: [IDS.source], candidate_kind: "lesson", proposed_path: "memory://Journal/2026-09-02.md", summary: "Record that C22 writeback must remain approval-only.", content_hash: HASH, risk_level: "R1", status: "needs_review", descriptor_only: true };
}

function writebackRequest(): Record<string, unknown> {
  return { id: IDS.request, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, vault_id: IDS.vault, candidate_id: IDS.candidate, target_ref: "workspace://vaults/demo/Journal/2026-09-02.md", diff_hash: DIFF_HASH, reason: "Operator approved a local memory candidate for later vault merge.", status: "pending_review", requested_by: "owner:linda", requested_at: TIME, expected_target_revision: 3, descriptor_only: true };
}

function writebackDecision(): Record<string, unknown> {
  return { id: IDS.decision, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, request_id: IDS.request, decision: "approve", decided_by: "owner:linda", decided_at: TIME, reason: "Diff, target, and scope reviewed by operator.", descriptor_only: true };
}

function insertRawVault(database: SqliteDatabase, payload: Record<string, unknown>, options: { readonly payloadJson?: string; readonly allowedSourceKindsJson?: string } = {}): void {
  database.prepare("INSERT INTO vault_bridges(id, workspace_id, name, kind, root_ref, access_mode, sync_status, graph_enabled, fts_enabled, allowed_source_kinds_json, last_indexed_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'obsidian', ?, 'read_only', 'indexed', 1, 1, ?, ?, 1, ?, 1, ?, ?)").run(IDS.vault, IDS.workspace, recordString(payload, "name", "Raw Vault"), recordString(payload, "root_ref", "workspace://vaults/raw"), options.allowedSourceKindsJson ?? JSON.stringify(["manual"]), TIME, options.payloadJson ?? JSON.stringify(payload), TIME, TIME);
}

function insertRawEntry(database: SqliteDatabase, payload: Record<string, unknown>, options: { readonly runId: string | null; readonly goalLoopId: string | null; readonly payloadJson?: string } = { runId: IDS.run, goalLoopId: IDS.goalLoop }): void {
  database.prepare("INSERT INTO journal_entries(id, workspace_id, vault_id, entry_date, title, summary, source_ids_json, memory_candidate_ids_json, run_id, goal_loop_id, tags_json, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, '2026-09-02', ?, ?, ?, ?, ?, ?, '[\"daily\",\"ops\"]', 1, ?, 1, ?, ?)").run(recordString(payload, "id", IDS.entry), IDS.workspace, IDS.vault, recordString(payload, "title", "Daily operating journal"), recordString(payload, "summary", "Captured operator decisions and reviewed memory candidates."), JSON.stringify([IDS.source]), JSON.stringify([IDS.candidate]), options.runId, options.goalLoopId, options.payloadJson ?? JSON.stringify(payload), TIME, TIME);
}

function insertRawSource(database: SqliteDatabase, payload: Record<string, unknown>, options: { readonly payloadJson?: string } = {}): void {
  database.prepare("INSERT INTO journal_sources(id, workspace_id, vault_id, journal_entry_id, source_kind, source_ref, source_hash, captured_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'omi', ?, ?, ?, 1, ?, 1, ?, ?)").run(recordString(payload, "id", IDS.source), IDS.workspace, IDS.vault, IDS.entry, recordString(payload, "source_ref", "workspace://omi/transcripts/2026-09-02-standup.md"), HASH, TIME, options.payloadJson ?? JSON.stringify(payload), TIME, TIME);
}

function insertRawGraph(database: SqliteDatabase, payload: Record<string, unknown>, options: { readonly payloadJson?: string; readonly indexKind?: string } = {}): void {
  database.prepare("INSERT INTO journal_graph_indexes(id, workspace_id, vault_id, index_kind, indexed_at, source_hash, graph_hash, fts_hash, node_count, edge_count, document_count, stale, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 42, 64, 8, 0, 1, ?, 1, ?, ?)").run(IDS.graph, IDS.workspace, IDS.vault, options.indexKind ?? "graph_fts", TIME, HASH, GRAPH_HASH, HASH, options.payloadJson ?? JSON.stringify(payload), TIME, TIME);
}

function insertRawCandidate(database: SqliteDatabase, payload: Record<string, unknown>, overrides: { readonly proposed_path?: string; readonly payloadJson?: string } = {}): void {
  database.prepare("INSERT INTO journal_memory_candidates(id, workspace_id, vault_id, journal_entry_id, source_ids_json, candidate_kind, proposed_path, summary, content_hash, risk_level, status, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'lesson', ?, ?, ?, 'R1', 'needs_review', 1, ?, 1, ?, ?)").run(recordString(payload, "id", IDS.candidate), IDS.workspace, IDS.vault, IDS.entry, JSON.stringify([IDS.source]), overrides.proposed_path ?? recordString(payload, "proposed_path", "memory://Journal/2026-09-02.md"), recordString(payload, "summary", "Record that C22 writeback must remain approval-only."), HASH, overrides.payloadJson ?? JSON.stringify(payload), TIME, TIME);
}

function insertRawWritebackRequest(database: SqliteDatabase, payload: Record<string, unknown>, overrides: { readonly vault_id?: string; readonly candidate_id?: string; readonly target_ref?: string; readonly diff_hash?: string; readonly requested_at?: string; readonly expected_target_revision?: number; readonly payloadJson?: string } = {}): void {
  database.prepare("INSERT INTO journal_writeback_requests(id, workspace_id, vault_id, candidate_id, target_ref, diff_hash, reason, status, requested_by, requested_at, expected_target_revision, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_review', 'owner:linda', ?, 3, 1, ?, 1, ?, ?)").run(IDS.request, IDS.workspace, overrides.vault_id ?? recordString(payload, "vault_id", IDS.vault), overrides.candidate_id ?? recordString(payload, "candidate_id", IDS.candidate), overrides.target_ref ?? recordString(payload, "target_ref", "workspace://vaults/demo/Journal/2026-09-02.md"), overrides.diff_hash ?? DIFF_HASH, recordString(payload, "reason", "Operator approved a local memory candidate for later vault merge."), overrides.requested_at ?? TIME, overrides.payloadJson ?? JSON.stringify(payload), TIME, TIME);
}

function insertRawWritebackDecision(database: SqliteDatabase, payload: Record<string, unknown>, options: { readonly payloadJson?: string } = {}): void {
  database.prepare("INSERT INTO journal_writeback_decisions(id, workspace_id, request_id, decision, decided_by, decided_at, reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'approve', 'owner:linda', ?, ?, 1, ?, 1, ?, ?)").run(IDS.decision, IDS.workspace, IDS.request, TIME, recordString(payload, "reason", "Diff, target, and scope reviewed by operator."), options.payloadJson ?? JSON.stringify(payload), TIME, TIME);
}

function payloadJsonWithDuplicateString(payload: Record<string, unknown>, key: string, value: string): string {
  const json = JSON.stringify(payload);
  const finalBraceIndex = json.length - 1;
  return `${json.slice(0, finalBraceIndex)},${JSON.stringify(key)}:${JSON.stringify(value)}}`;
}

function recordString(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : fallback;
}
