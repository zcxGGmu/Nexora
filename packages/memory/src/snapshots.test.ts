import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PolicyScope } from "@nexora/contracts";
import type { PolicyActor } from "@nexora/policy";
import { migrate, openDatabase } from "@nexora/persistence";
import { MemorySnapshotStore } from "./snapshots.js";
import { MemoryVault, initializeVaultLayout } from "./vault.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const NOTE_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const SNAPSHOT_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const ROLLBACK_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const ACTOR_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-26T04:00:00.000Z";
const scope: PolicyScope = { kind: "workspace", id: WORKSPACE_ID };
const actor: PolicyActor = { id: ACTOR_ID, role: "Operator", workspace_id: WORKSPACE_ID, allowed_scopes: [scope] };

function seedWorkspace(database: ReturnType<typeof openDatabase>): void {
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Demo", TIME, TIME);
}

describe("MemorySnapshotStore", () => {
  it("Given a snapshot When a later note version is rolled back Then rollback creates a new version from the snapshot", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-snapshot-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedWorkspace(database);
    initializeVaultLayout(root);
    const vault = new MemoryVault(database, root, { now: () => TIME });
    const snapshots = new MemorySnapshotStore(database, vault, { now: () => TIME });

    vault.write({ actor, workspace_id: WORKSPACE_ID, requested_scope: scope, path: "About/business.md", base_version: 0, note_id: NOTE_ID, content: "Before", source_refs: [], provenance: { created_by: { type: "human", id: ACTOR_ID }, run_id: null, artifact_refs: [], receipt_refs: [] } });
    const snapshot = snapshots.create({ workspace_id: WORKSPACE_ID, snapshot_id: SNAPSHOT_ID });
    vault.write({ actor, workspace_id: WORKSPACE_ID, requested_scope: scope, path: "About/business.md", base_version: 1, note_id: NOTE_ID, content: "After", source_refs: [], provenance: { created_by: { type: "human", id: ACTOR_ID }, run_id: null, artifact_refs: [], receipt_refs: [] } });

    const rollback = snapshots.rollback({ actor, workspace_id: WORKSPACE_ID, requested_scope: scope, snapshot_id: SNAPSHOT_ID, rollback_id: ROLLBACK_ID });

    expect(snapshot.notes).toEqual([{ note_id: NOTE_ID, path: "About/business.md", version: 1, content_hash: expect.stringMatching(/^sha256:/) }]);
    expect(rollback.restored).toEqual([{ path: "About/business.md", version: 3 }]);
    expect(vault.read({ actor, workspace_id: WORKSPACE_ID, requested_scope: scope, path: "About/business.md" }).content).toBe("[unverified]\nBefore");

    database.close();
    rmSync(root, { recursive: true, force: true });
  });
});
