import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  MemoryNoteSchema,
  MemorySourceRefSchema,
  MemoryVersionSchema,
  systemClock,
  type Clock,
  type MemoryNote,
  type MemoryProvenance,
  type MemorySourceRef,
  type MemoryVersion,
  type PolicyScope,
} from "@nexora/contracts";
import { withTransaction, type SqliteDatabase } from "@nexora/persistence";
import type { PolicyActor } from "@nexora/policy";
import { toMemoryConflict, type MemoryConflict } from "./conflicts.js";
import { MemoryVaultError } from "./errors.js";
import { resolveVaultPath } from "./path-resolver.js";
import { applyUnverifiedMarker, sha256MemoryContent, trustStateForSources } from "./provenance.js";
import { assertMemoryAccess, scopesEqual } from "./scope-filter.js";

export { MemoryVaultError, type MemoryVaultErrorCode } from "./errors.js";

const VAULT_DIRS = ["About", "Sites", "Agents", "Skills", "Tickets", "Reports", "Artifacts", "Runs", ".nexora/memory"] as const;

export type MemoryReadInput = {
  readonly actor: PolicyActor;
  readonly workspace_id: string;
  readonly requested_scope: PolicyScope;
  readonly path: string;
};

export type MemoryWriteInput = MemoryReadInput & {
  readonly base_version: number;
  readonly note_id: string;
  readonly content: string;
  readonly source_refs: readonly MemorySourceRef[];
  readonly provenance: MemoryProvenance;
  readonly conflict?: { readonly conflict_group_id: string; readonly review_id: string };
};

export type MemoryReadResult = {
  readonly note_id: string;
  readonly path: string;
  readonly content: string;
  readonly version: number;
  readonly source_refs: readonly MemorySourceRef[];
  readonly trust_state: MemoryVersion["trust_state"];
  readonly provenance: MemoryProvenance;
};

export type MemoryWriteResult = { readonly kind: "written"; readonly note: MemoryReadResult } | MemoryConflict;

export function initializeVaultLayout(root: string): void {
  for (const dir of VAULT_DIRS) mkdirSync(join(root, dir), { recursive: true });
}

export class MemoryVault {
  constructor(private readonly database: SqliteDatabase, private readonly root: string, private readonly clock: Clock = systemClock) {}

  read(input: MemoryReadInput): MemoryReadResult {
    this.assertAccess(input, "read");
    const safePath = resolveVaultPath(this.root, input.path);
    const note = this.getNote(input.workspace_id, safePath.relative_path);
    if (note === undefined) throw new MemoryVaultError("MEMORY_NOT_FOUND", "Memory note not found");
    if (!scopesEqual(note.scope, input.requested_scope)) throw new MemoryVaultError("SCOPE_DENIED", "Memory note scope denied");
    return this.versionToReadResult(this.requireVersion(input.workspace_id, note.id, note.current_version));
  }

  write(input: MemoryWriteInput): MemoryWriteResult {
    this.assertAccess(input, "write");
    const safePath = resolveVaultPath(this.root, input.path);
    const current = this.getNote(input.workspace_id, safePath.relative_path);
    if (current === undefined) {
      if (input.base_version !== 0) throw new MemoryVaultError("MEMORY_CONFLICT", "New memory notes require base version 0");
      return { kind: "written", note: this.writeActive(input, safePath.relative_path, input.note_id, 1) };
    }
    if (!scopesEqual(current.scope, input.requested_scope)) throw new MemoryVaultError("SCOPE_DENIED", "Memory note scope denied");
    if (current.current_version !== input.base_version) return this.writeConflict(input, safePath.relative_path, current);
    return { kind: "written", note: this.writeActive(input, safePath.relative_path, current.id, this.nextVersionForNote(input.workspace_id, current.id)) };
  }

  listConflicts(workspaceId: string): readonly MemoryVersion[] {
    const rows = this.database
      .prepare("SELECT payload_json FROM memory_versions WHERE workspace_id = ? AND status = 'candidate' ORDER BY updated_at ASC")
      .all(workspaceId);
    return rows.map((row) => MemoryVersionSchema.parse(JSON.parse(readText(row["payload_json"]))));
  }

  readVersionContent(version: MemoryVersion): string {
    return readFileSync(this.contentPath(version.note_id, version.note_version), "utf8");
  }

  getCurrentNote(workspaceId: string, path: string): MemoryNote | undefined {
    return this.getNote(workspaceId, resolveVaultPath(this.root, path).relative_path);
  }

  private assertAccess(input: MemoryReadInput, operation: "read" | "write"): void {
    const decision = assertMemoryAccess({ actor: input.actor, operation, requested_scope: input.requested_scope, enforcement_point: "api" });
    if (!decision.allowed) throw new MemoryVaultError("SCOPE_DENIED", decision.reason);
    if (input.actor.workspace_id !== input.workspace_id) throw new MemoryVaultError("SCOPE_DENIED", "Actor workspace does not match memory workspace");
  }

  private writeConflict(input: MemoryWriteInput, path: string, current: MemoryNote): MemoryConflict {
    if (input.conflict === undefined) throw new MemoryVaultError("MEMORY_CONFLICT", "Memory write needs conflict review metadata");
    const active = this.requireVersion(input.workspace_id, current.id, current.current_version);
    const candidate = this.createVersion(input, path, current.id, this.nextVersionForNote(input.workspace_id, current.id), "candidate", input.conflict);
    this.insertVersion(candidate);
    return toMemoryConflict(active, candidate);
  }

  private writeActive(input: MemoryWriteInput, path: string, noteId: string, version: number): MemoryReadResult {
    const record = this.createVersion(input, path, noteId, version, "active", undefined);
    withTransaction(this.database, () => {
      if (version === 1) this.insertNote(this.versionToNote(input, record));
      this.insertVersion(record);
      if (version > 1) this.updateNote(this.versionToNote(input, record));
    });
    this.writeActiveFile(path, this.readVersionContent(record));
    return this.versionToReadResult(record);
  }

  private createVersion(input: MemoryWriteInput, path: string, noteId: string, version: number, status: "active" | "candidate", conflict: MemoryWriteInput["conflict"]): MemoryVersion {
    const sourceRefs = MemorySourceRefSchema.array().parse(input.source_refs);
    const content = applyUnverifiedMarker(input.content, sourceRefs);
    const contentHash = sha256MemoryContent(content);
    const contentPath = this.contentPath(noteId, version);
    mkdirSync(dirname(contentPath), { recursive: true });
    writeFileSync(contentPath, content, { encoding: "utf8", flag: "wx" });
    return MemoryVersionSchema.parse({
      id: noteId,
      workspace_id: input.workspace_id,
      schema_version: 1,
      created_at: this.clock.now(),
      updated_at: this.clock.now(),
      note_id: noteId,
      path,
      note_version: version,
      content_hash: contentHash,
      content_ref: `vault://.nexora/memory/${noteId}/v${version}.md`,
      source_refs: sourceRefs,
      trust_state: trustStateForSources(sourceRefs),
      provenance: input.provenance,
      status,
      conflict_group_id: conflict?.conflict_group_id ?? null,
      review_id: conflict?.review_id ?? null,
    });
  }

  private insertNote(note: MemoryNote): void {
    this.database
      .prepare("INSERT INTO memory_notes(id, workspace_id, path, scope_kind, scope_id, current_version, trust_state, source_refs_json, provenance_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(note.id, note.workspace_id, note.path, note.scope.kind, note.scope.id, note.current_version, note.trust_state, JSON.stringify(note.source_refs), JSON.stringify(note.provenance), JSON.stringify(note), note.schema_version, note.created_at, note.updated_at);
  }

  private updateNote(note: MemoryNote): void {
    this.database
      .prepare("UPDATE memory_notes SET current_version = ?, trust_state = ?, source_refs_json = ?, provenance_json = ?, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ?")
      .run(note.current_version, note.trust_state, JSON.stringify(note.source_refs), JSON.stringify(note.provenance), JSON.stringify(note), note.schema_version, note.updated_at, note.workspace_id, note.id);
  }

  private insertVersion(version: MemoryVersion): void {
    this.database
      .prepare("INSERT INTO memory_versions(id, workspace_id, note_id, path, note_version, content_hash, content_ref, source_refs_json, trust_state, provenance_json, status, conflict_group_id, review_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(version.id, version.workspace_id, version.note_id, version.path, version.note_version, version.content_hash, version.content_ref, JSON.stringify(version.source_refs), version.trust_state, JSON.stringify(version.provenance), version.status, version.conflict_group_id, version.review_id, JSON.stringify(version), version.schema_version, version.created_at, version.updated_at);
  }

  private versionToNote(input: MemoryWriteInput, version: MemoryVersion): MemoryNote {
    return MemoryNoteSchema.parse({ id: version.note_id, workspace_id: version.workspace_id, schema_version: 1, created_at: version.created_at, updated_at: version.updated_at, path: version.path, scope: input.requested_scope, current_version: version.note_version, trust_state: version.trust_state, source_refs: version.source_refs, provenance: version.provenance });
  }

  private versionToReadResult(version: MemoryVersion): MemoryReadResult {
    return { note_id: version.note_id, path: version.path, content: this.readVersionContent(version), version: version.note_version, source_refs: version.source_refs, trust_state: version.trust_state, provenance: version.provenance };
  }

  private getNote(workspaceId: string, path: string): MemoryNote | undefined {
    const row = this.database.prepare("SELECT payload_json FROM memory_notes WHERE workspace_id = ? AND path = ?").get(workspaceId, path);
    return row === undefined ? undefined : MemoryNoteSchema.parse(JSON.parse(readText(row["payload_json"])));
  }

  private requireVersion(workspaceId: string, noteId: string, version: number): MemoryVersion {
    const row = this.database.prepare("SELECT payload_json FROM memory_versions WHERE workspace_id = ? AND note_id = ? AND note_version = ?").get(workspaceId, noteId, version);
    if (row === undefined) throw new MemoryVaultError("MEMORY_NOT_FOUND", "Memory version not found");
    return MemoryVersionSchema.parse(JSON.parse(readText(row["payload_json"])));
  }

  private nextVersionForNote(workspaceId: string, noteId: string): number {
    const row = this.database.prepare("SELECT MAX(note_version) AS latest_version FROM memory_versions WHERE workspace_id = ? AND note_id = ?").get(workspaceId, noteId);
    return readNullableNumber(row?.["latest_version"]) + 1;
  }

  private writeActiveFile(path: string, content: string): void {
    const active = resolveVaultPath(this.root, path);
    const tempPath = `${active.absolute_path}.tmp-${process.pid}`;
    mkdirSync(dirname(active.absolute_path), { recursive: true });
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, active.absolute_path);
  }

  private contentPath(noteId: string, version: number): string {
    return join(this.root, ".nexora", "memory", noteId, `v${version}.md`);
  }

}

function readText(value: unknown): string {
  if (typeof value !== "string") throw new MemoryVaultError("VAULT_WRITE_FAILED", "Expected text column");
  return value;
}

function readNullableNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value !== "number") throw new MemoryVaultError("VAULT_WRITE_FAILED", "Expected numeric column");
  return value;
}
