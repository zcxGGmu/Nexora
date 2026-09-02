import type { SQLInputValue } from "node:sqlite";
import {
  GraphIndexSnapshotSchema,
  JournalEntryDescriptorSchema,
  JournalSourceSchema,
  MemoryCandidateSchema,
  VaultBridgeDescriptorSchema,
  WritebackDecisionSchema,
  WritebackRequestSchema,
  type GraphIndexKind,
  type GraphIndexSnapshot,
  type JournalEntryDescriptor,
  type JournalSourceKind,
  type JournalSource,
  type MemoryCandidate,
  type VaultBridgeDescriptor,
  type WritebackDecision,
  type WritebackRequest,
} from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { PersistenceError, json, readJson, sqliteError, updateChanged } from "./utils.js";

export class VaultBridgeRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): VaultBridgeDescriptor {
    const parsed = VaultBridgeDescriptorSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO vault_bridges(id, workspace_id, name, kind, root_ref, access_mode, sync_status, graph_enabled, fts_enabled, allowed_source_kinds_json, last_indexed_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.name, parsed.kind, parsed.root_ref, parsed.access_mode, parsed.sync_status, bool(parsed.graph_enabled), bool(parsed.fts_enabled), json(parsed.allowed_source_kinds), parsed.last_indexed_at, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): VaultBridgeDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM vault_bridges WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : VaultBridgeDescriptorSchema.parse({ ...readJson(row["payload_json"], VaultBridgeDescriptorSchema), revision: readVersion(row["version"], "VaultBridge") });
  }

  list(workspaceId: string): readonly VaultBridgeDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM vault_bridges WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId);
    return rows.map((row) => VaultBridgeDescriptorSchema.parse({ ...readJson(row["payload_json"], VaultBridgeDescriptorSchema), revision: readVersion(row["version"], "VaultBridge") }));
  }
}

export class JournalEntryRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): JournalEntryDescriptor {
    const parsed = JournalEntryDescriptorSchema.parse(record);
    requireVault(this.database, parsed.workspace_id, parsed.vault_id);
    requireRunGoalScope(this.database, parsed.workspace_id, parsed.run_id, parsed.goal_loop_id);
    try {
      this.database.prepare("INSERT INTO journal_entries(id, workspace_id, vault_id, entry_date, title, summary, source_ids_json, memory_candidate_ids_json, run_id, goal_loop_id, tags_json, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.vault_id, parsed.entry_date, parsed.title, parsed.summary, json(parsed.source_ids), json(parsed.memory_candidate_ids), parsed.run_id, parsed.goal_loop_id, json(parsed.tags), json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listByVault(workspaceId: string, vaultId: string): readonly JournalEntryDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json FROM journal_entries WHERE workspace_id = ? AND vault_id = ? ORDER BY entry_date DESC, id ASC").all(workspaceId, vaultId);
    return rows.map((row) => readJson(row["payload_json"], JournalEntryDescriptorSchema));
  }

  get(workspaceId: string, id: string): JournalEntryDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json FROM journal_entries WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], JournalEntryDescriptorSchema);
  }
}

export class JournalSourceRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): JournalSource {
    const parsed = JournalSourceSchema.parse(record);
    requireEntry(this.database, parsed.workspace_id, parsed.vault_id, parsed.journal_entry_id);
    requireSourceListed(this.database, parsed.workspace_id, parsed.vault_id, parsed.journal_entry_id, parsed.id);
    requireSourceKindAllowed(this.database, parsed.workspace_id, parsed.vault_id, parsed.source_kind);
    try {
      this.database.prepare("INSERT INTO journal_sources(id, workspace_id, vault_id, journal_entry_id, source_kind, source_ref, source_hash, captured_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.vault_id, parsed.journal_entry_id, parsed.source_kind, parsed.source_ref, parsed.source_hash, parsed.captured_at, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listByEntry(workspaceId: string, entryId: string): readonly JournalSource[] {
    const rows = this.database.prepare("SELECT payload_json FROM journal_sources WHERE workspace_id = ? AND journal_entry_id = ? ORDER BY captured_at ASC, id ASC").all(workspaceId, entryId);
    return rows.map((row) => readJson(row["payload_json"], JournalSourceSchema));
  }

  listByVault(workspaceId: string, vaultId: string): readonly JournalSource[] {
    const rows = this.database.prepare("SELECT payload_json FROM journal_sources WHERE workspace_id = ? AND vault_id = ? ORDER BY captured_at ASC, id ASC").all(workspaceId, vaultId);
    return rows.map((row) => readJson(row["payload_json"], JournalSourceSchema));
  }

  get(workspaceId: string, id: string): JournalSource | undefined {
    const row = this.database.prepare("SELECT payload_json FROM journal_sources WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], JournalSourceSchema);
  }
}

export class GraphIndexSnapshotRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): GraphIndexSnapshot {
    const parsed = GraphIndexSnapshotSchema.parse(record);
    requireVault(this.database, parsed.workspace_id, parsed.vault_id);
    requireGraphIndexAllowed(this.database, parsed.workspace_id, parsed.vault_id, parsed.index_kind);
    try {
      this.database.prepare("INSERT INTO journal_graph_indexes(id, workspace_id, vault_id, index_kind, indexed_at, source_hash, graph_hash, fts_hash, node_count, edge_count, document_count, stale, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.vault_id, parsed.index_kind, parsed.indexed_at, parsed.source_hash, parsed.graph_hash, parsed.fts_hash, parsed.node_count, parsed.edge_count, parsed.document_count, bool(parsed.stale), json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listByVault(workspaceId: string, vaultId: string): readonly GraphIndexSnapshot[] {
    const rows = this.database.prepare("SELECT payload_json FROM journal_graph_indexes WHERE workspace_id = ? AND vault_id = ? ORDER BY indexed_at DESC, id ASC").all(workspaceId, vaultId);
    return rows.map((row) => readJson(row["payload_json"], GraphIndexSnapshotSchema));
  }

  get(workspaceId: string, id: string): GraphIndexSnapshot | undefined {
    const row = this.database.prepare("SELECT payload_json FROM journal_graph_indexes WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], GraphIndexSnapshotSchema);
  }
}

export class JournalMemoryCandidateRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): MemoryCandidate {
    const parsed = MemoryCandidateSchema.parse(record);
    requireEntry(this.database, parsed.workspace_id, parsed.vault_id, parsed.journal_entry_id);
    requireCandidateListed(this.database, parsed.workspace_id, parsed.vault_id, parsed.journal_entry_id, parsed.id);
    requireSources(this.database, parsed);
    try {
      this.database.prepare("INSERT INTO journal_memory_candidates(id, workspace_id, vault_id, journal_entry_id, source_ids_json, candidate_kind, proposed_path, summary, content_hash, risk_level, status, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.vault_id, parsed.journal_entry_id, json(parsed.source_ids), parsed.candidate_kind, parsed.proposed_path, parsed.summary, parsed.content_hash, parsed.risk_level, parsed.status, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listByEntry(workspaceId: string, entryId: string): readonly MemoryCandidate[] {
    const rows = this.database.prepare("SELECT payload_json FROM journal_memory_candidates WHERE workspace_id = ? AND journal_entry_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, entryId);
    return rows.map((row) => readJson(row["payload_json"], MemoryCandidateSchema));
  }

  get(workspaceId: string, id: string): MemoryCandidate | undefined {
    const row = this.database.prepare("SELECT payload_json FROM journal_memory_candidates WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], MemoryCandidateSchema);
  }

  listByVault(workspaceId: string, vaultId: string): readonly MemoryCandidate[] {
    const rows = this.database.prepare("SELECT payload_json FROM journal_memory_candidates WHERE workspace_id = ? AND vault_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, vaultId);
    return rows.map((row) => readJson(row["payload_json"], MemoryCandidateSchema));
  }
}

export class WritebackRequestRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): WritebackRequest {
    const parsed = WritebackRequestSchema.parse(record);
    requireVault(this.database, parsed.workspace_id, parsed.vault_id);
    requireCandidate(this.database, parsed.workspace_id, parsed.vault_id, parsed.candidate_id);
    requireWritebackTargetInsideVault(this.database, parsed.workspace_id, parsed.vault_id, parsed.target_ref);
    try {
      this.database.prepare("INSERT INTO journal_writeback_requests(id, workspace_id, vault_id, candidate_id, target_ref, diff_hash, reason, status, requested_by, requested_at, expected_target_revision, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.vault_id, parsed.candidate_id, parsed.target_ref, parsed.diff_hash, parsed.reason, parsed.status, parsed.requested_by, parsed.requested_at, parsed.expected_target_revision, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): WritebackRequest | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM journal_writeback_requests WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readWritebackRequest(row);
  }

  update(record: unknown, expectedVersion: number): WritebackRequest {
    const parsed = WritebackRequestSchema.parse(record);
    const current = this.get(parsed.workspace_id, parsed.id);
    if (current === undefined) throw new PersistenceError("NOT_FOUND", "Journal writeback request not found");
    if (current.status !== "pending_review") throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal writeback terminal requests are append-only");
    if (parsed.status !== "approved" && parsed.status !== "rejected") throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal writeback requests can only resolve through approval decisions");
    if (current.vault_id !== parsed.vault_id || current.candidate_id !== parsed.candidate_id || current.target_ref !== parsed.target_ref) {
      throw new PersistenceError("VERSION_CONFLICT", "Journal writeback request scope is immutable");
    }
    if (current.reason !== parsed.reason || current.diff_hash !== parsed.diff_hash || current.requested_by !== parsed.requested_by || current.requested_at !== parsed.requested_at || current.expected_target_revision !== parsed.expected_target_revision) {
      throw new PersistenceError("VERSION_CONFLICT", "Journal writeback request facts are immutable");
    }
    const updated = WritebackRequestSchema.parse({ ...parsed, revision: expectedVersion + 1 });
    const result = this.database.prepare("UPDATE journal_writeback_requests SET status = ?, reason = ?, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?").run(updated.status, updated.reason, json(updated), updated.schema_version, updated.updated_at, updated.workspace_id, updated.id, expectedVersion);
    updateChanged(result, "JournalWritebackRequest");
    return updated;
  }

  listByVault(workspaceId: string, vaultId: string): readonly WritebackRequest[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM journal_writeback_requests WHERE workspace_id = ? AND vault_id = ? ORDER BY requested_at DESC, id ASC").all(workspaceId, vaultId);
    return rows.map(readWritebackRequest);
  }
}

export class WritebackDecisionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): WritebackDecision {
    const parsed = WritebackDecisionSchema.parse(record);
    if (!writebackRequestExists(this.database, parsed.workspace_id, parsed.request_id)) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal writeback request scope constraint failed");
    }
    try {
      this.database.prepare("INSERT INTO journal_writeback_decisions(id, workspace_id, request_id, decision, decided_by, decided_at, reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.request_id, parsed.decision, parsed.decided_by, parsed.decided_at, parsed.reason, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listByRequest(workspaceId: string, requestId: string): readonly WritebackDecision[] {
    const rows = this.database.prepare("SELECT payload_json FROM journal_writeback_decisions WHERE workspace_id = ? AND request_id = ? ORDER BY decided_at ASC, id ASC").all(workspaceId, requestId);
    return rows.map((row) => readJson(row["payload_json"], WritebackDecisionSchema));
  }

  listByVault(workspaceId: string, vaultId: string): readonly WritebackDecision[] {
    const rows = this.database.prepare(`SELECT decision.payload_json FROM journal_writeback_decisions decision
      JOIN journal_writeback_requests request ON request.workspace_id = decision.workspace_id AND request.id = decision.request_id
      WHERE decision.workspace_id = ? AND request.vault_id = ?
      ORDER BY decision.decided_at ASC, decision.id ASC`).all(workspaceId, vaultId);
    return rows.map((row) => readJson(row["payload_json"], WritebackDecisionSchema));
  }
}

function readWritebackRequest(row: Record<string, unknown>): WritebackRequest {
  return WritebackRequestSchema.parse({ ...readJson(row["payload_json"], WritebackRequestSchema), revision: readVersion(row["version"], "JournalWritebackRequest") });
}

function readVersion(value: unknown, entity: string): number {
  if (typeof value !== "number") throw new PersistenceError("CONSTRAINT_VIOLATION", `${entity} version column is invalid`);
  return value;
}

function bool(value: boolean): SQLInputValue {
  return value ? 1 : 0;
}

function requireVault(database: SqliteDatabase, workspaceId: string, vaultId: string): void {
  const row = database.prepare("SELECT id FROM vault_bridges WHERE workspace_id = ? AND id = ?").get(workspaceId, vaultId);
  if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal vault scope constraint failed");
}

function requireSourceKindAllowed(database: SqliteDatabase, workspaceId: string, vaultId: string, sourceKind: JournalSourceKind): void {
  const row = database.prepare(`SELECT id FROM vault_bridges
    WHERE workspace_id = ? AND id = ?
      AND EXISTS (SELECT 1 FROM json_each(allowed_source_kinds_json) WHERE value = ?)`).get(workspaceId, vaultId, sourceKind);
  if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal source kind is not allowed by vault policy");
}

function requireGraphIndexAllowed(database: SqliteDatabase, workspaceId: string, vaultId: string, indexKind: GraphIndexKind): void {
  const row = database.prepare(`SELECT id FROM vault_bridges
    WHERE workspace_id = ? AND id = ?
      AND (
        (? = 'graph' AND graph_enabled = 1)
        OR (? = 'fts' AND fts_enabled = 1)
        OR (? = 'graph_fts' AND graph_enabled = 1 AND fts_enabled = 1)
      )`).get(workspaceId, vaultId, indexKind, indexKind, indexKind);
  if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal graph/FTS index kind is not enabled by vault policy");
}

function requireEntry(database: SqliteDatabase, workspaceId: string, vaultId: string, entryId: string): void {
  const row = database.prepare("SELECT id FROM journal_entries WHERE workspace_id = ? AND vault_id = ? AND id = ?").get(workspaceId, vaultId, entryId);
  if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal entry vault scope constraint failed");
}

function requireRunGoalScope(database: SqliteDatabase, workspaceId: string, runId: string | null, goalLoopId: string | null): void {
  if (runId !== null) {
    const run = database.prepare("SELECT id FROM runs WHERE workspace_id = ? AND id = ?").get(workspaceId, runId);
    if (run === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal entry run scope constraint failed");
  }
  if (goalLoopId === null) return;
  if (runId === null) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal entry goal loop requires run scope");
  const goalLoop = database.prepare("SELECT id FROM goal_loops WHERE workspace_id = ? AND id = ? AND run_id = ?").get(workspaceId, goalLoopId, runId);
  if (goalLoop === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal entry run/goal scope constraint failed");
}

function requireSourceListed(database: SqliteDatabase, workspaceId: string, vaultId: string, entryId: string, sourceId: string): void {
  const row = database.prepare(`SELECT id FROM journal_entries
    WHERE workspace_id = ? AND vault_id = ? AND id = ?
      AND EXISTS (SELECT 1 FROM json_each(source_ids_json) WHERE value = ?)`).get(workspaceId, vaultId, entryId, sourceId);
  if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal source must be listed by entry");
}

function requireCandidateListed(database: SqliteDatabase, workspaceId: string, vaultId: string, entryId: string, candidateId: string): void {
  const row = database.prepare(`SELECT id FROM journal_entries
    WHERE workspace_id = ? AND vault_id = ? AND id = ?
      AND EXISTS (SELECT 1 FROM json_each(memory_candidate_ids_json) WHERE value = ?)`).get(workspaceId, vaultId, entryId, candidateId);
  if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal memory candidate must be listed by entry");
}

function requireSources(database: SqliteDatabase, candidate: MemoryCandidate): void {
  const placeholders = candidate.source_ids.map(() => "?").join(",");
  const rows = database.prepare(`SELECT id FROM journal_sources WHERE workspace_id = ? AND vault_id = ? AND journal_entry_id = ? AND id IN (${placeholders})`).all(candidate.workspace_id, candidate.vault_id, candidate.journal_entry_id, ...candidate.source_ids);
  if (rows.length !== candidate.source_ids.length) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal memory candidate source scope constraint failed");
}

function requireCandidate(database: SqliteDatabase, workspaceId: string, vaultId: string, candidateId: string): void {
  const row = database.prepare("SELECT id FROM journal_memory_candidates WHERE workspace_id = ? AND vault_id = ? AND id = ?").get(workspaceId, vaultId, candidateId);
  if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal memory candidate vault scope constraint failed");
}

function requireWritebackTargetInsideVault(database: SqliteDatabase, workspaceId: string, vaultId: string, targetRef: string): void {
  const row = database.prepare("SELECT root_ref FROM vault_bridges WHERE workspace_id = ? AND id = ?").get(workspaceId, vaultId);
  if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal vault scope constraint failed");
  const rootRef = row["root_ref"];
  if (typeof rootRef !== "string") throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal vault root reference is invalid");
  if (targetRef !== rootRef && !targetRef.startsWith(`${rootRef}/`)) throw new PersistenceError("CONSTRAINT_VIOLATION", "Journal writeback target must stay inside vault root");
}

function writebackRequestExists(database: SqliteDatabase, workspaceId: string, requestId: string): boolean {
  return database.prepare("SELECT id FROM journal_writeback_requests WHERE workspace_id = ? AND id = ?").get(workspaceId, requestId) !== undefined;
}
