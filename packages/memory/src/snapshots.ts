import { MemorySnapshotSchema, MemoryVersionSchema, systemClock, type Clock, type MemorySnapshot, type MemoryVersion } from "@nexora/contracts";
import type { SqliteDatabase } from "@nexora/persistence";
import type { PolicyActor } from "@nexora/policy";
import type { PolicyScope } from "@nexora/contracts";
import { MemoryVault, MemoryVaultError } from "./vault.js";

export type CreateSnapshotInput = {
  readonly workspace_id: string;
  readonly snapshot_id: string;
};

export type RollbackSnapshotInput = CreateSnapshotInput & {
  readonly actor: PolicyActor;
  readonly requested_scope: PolicyScope;
  readonly rollback_id: string;
};

export type MemoryRollbackResult = {
  readonly snapshot_id: string;
  readonly restored: readonly { readonly path: string; readonly version: number }[];
};

export class MemorySnapshotStore {
  constructor(private readonly database: SqliteDatabase, private readonly vault: MemoryVault, private readonly clock: Clock = systemClock) {}

  create(input: CreateSnapshotInput): MemorySnapshot {
    const rows = this.database
      .prepare("SELECT v.payload_json FROM memory_notes n JOIN memory_versions v ON v.workspace_id = n.workspace_id AND v.note_id = n.id AND v.note_version = n.current_version WHERE n.workspace_id = ? ORDER BY n.path ASC")
      .all(input.workspace_id);
    const versions = rows.map((row) => {
      const version = MemoryVersionSchema.parse(JSON.parse(readText(row["payload_json"])));
      return { note_id: version.note_id, path: version.path, version: version.note_version, content_hash: version.content_hash };
    });
    const snapshot = MemorySnapshotSchema.parse({ id: input.snapshot_id, workspace_id: input.workspace_id, schema_version: 1, created_at: this.clock.now(), updated_at: this.clock.now(), snapshot_version: 1, notes: versions });
    this.database
      .prepare("INSERT INTO memory_snapshots(id, workspace_id, snapshot_version, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(snapshot.id, snapshot.workspace_id, snapshot.snapshot_version, JSON.stringify(snapshot), snapshot.schema_version, snapshot.created_at, snapshot.updated_at);
    return snapshot;
  }

  rollback(input: RollbackSnapshotInput): MemoryRollbackResult {
    const row = this.database.prepare("SELECT payload_json FROM memory_snapshots WHERE workspace_id = ? AND id = ?").get(input.workspace_id, input.snapshot_id);
    if (row === undefined) throw new MemoryVaultError("MEMORY_NOT_FOUND", "Memory snapshot not found");
    const snapshot = MemorySnapshotSchema.parse(JSON.parse(readText(row["payload_json"])));
    const restored = snapshot.notes.map((note) => {
      const current = this.vault.getCurrentNote(input.workspace_id, note.path);
      if (current === undefined) throw new MemoryVaultError("MEMORY_NOT_FOUND", "Snapshot note no longer exists");
      const content = this.vault.readVersionContent(this.readVersion(input.workspace_id, note.note_id, note.version));
      const result = this.vault.write({
        actor: input.actor,
        workspace_id: input.workspace_id,
        requested_scope: input.requested_scope,
        path: note.path,
        base_version: current.current_version,
        note_id: note.note_id,
        content,
        source_refs: [{ kind: "manual", ref: `snapshot://${input.rollback_id}`, verified: false }],
        provenance: { created_by: { type: "human", id: input.actor.id }, run_id: null, artifact_refs: [], receipt_refs: [] },
      });
      if (result.kind === "conflict") throw new MemoryVaultError("MEMORY_CONFLICT", "Snapshot rollback conflicted");
      return { path: note.path, version: result.note.version };
    });
    return { snapshot_id: input.snapshot_id, restored };
  }

  private readVersion(workspaceId: string, noteId: string, version: number): MemoryVersion {
    const row = this.database.prepare("SELECT payload_json FROM memory_versions WHERE workspace_id = ? AND note_id = ? AND note_version = ?").get(workspaceId, noteId, version);
    if (row === undefined) throw new MemoryVaultError("MEMORY_NOT_FOUND", "Memory version not found");
    return MemoryVersionSchema.parse(JSON.parse(readText(row["payload_json"])));
  }
}

function readText(value: unknown): string {
  if (typeof value !== "string") throw new MemoryVaultError("VAULT_WRITE_FAILED", "Expected text column");
  return value;
}
