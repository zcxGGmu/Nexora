import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PolicyScope } from "@nexora/contracts";
import type { PolicyActor } from "@nexora/policy";
import { migrate, openDatabase } from "@nexora/persistence";
import { MemoryVault, MemoryVaultError, initializeVaultLayout } from "./vault.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const OTHER_WORKSPACE_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const NOTE_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const REVIEW_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const CONFLICT_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const SECOND_REVIEW_ID = "01JRZ3NDEKTSV4RRFFQ69G5FAV";
const SECOND_CONFLICT_ID = "01KRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-26T04:00:00.000Z";
const workspaceScope: PolicyScope = { kind: "workspace", id: WORKSPACE_ID };
const actor: PolicyActor = { id: "01GRZ3NDEKTSV4RRFFQ69G5FAV", role: "Agent", workspace_id: WORKSPACE_ID, allowed_scopes: [workspaceScope] };

function tempVault(): string {
  return mkdtempSync(join(tmpdir(), "nexora-memory-"));
}

function seedWorkspace(database: ReturnType<typeof openDatabase>): void {
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Demo", TIME, TIME);
}

describe("MemoryVault", () => {
  it("Given a scoped write without verified sources When reading the note Then it returns versioned unverified provenance", () => {
    const root = tempVault();
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedWorkspace(database);
    const vault = new MemoryVault(database, root, { now: () => TIME });
    initializeVaultLayout(root);

    const write = vault.write({
      actor,
      workspace_id: WORKSPACE_ID,
      requested_scope: workspaceScope,
      path: "Sites/site-a.md",
      base_version: 0,
      note_id: NOTE_ID,
      content: "Canonical facts for Site A.",
      source_refs: [],
      provenance: { created_by: { type: "agent", id: actor.id }, run_id: RUN_ID, artifact_refs: [], receipt_refs: [] },
    });

    expect(write.kind).toBe("written");
    const note = vault.read({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "Sites/site-a.md" });
    expect(note.version).toBe(1);
    expect(note.trust_state).toBe("unverified");
    expect(note.content.startsWith("[unverified]")).toBe(true);
    expect(note.provenance.run_id).toBe(RUN_ID);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given unsafe vault paths When resolving reads or writes Then traversal and escaping symlinks are rejected", () => {
    const root = tempVault();
    const outside = tempVault();
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedWorkspace(database);
    initializeVaultLayout(root);
    writeFileSync(join(outside, "leak.md"), "secret");
    symlinkSync(join(outside, "leak.md"), join(root, "About", "leak.md"));
    const vault = new MemoryVault(database, root, { now: () => TIME });

    expect(() => vault.read({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "../secret.md" })).toThrowError(MemoryVaultError);
    expect(() => vault.write({
      actor,
      workspace_id: WORKSPACE_ID,
      requested_scope: workspaceScope,
      path: join(root, "absolute.md"),
      base_version: 0,
      note_id: NOTE_ID,
      content: "bad",
      source_refs: [],
      provenance: { created_by: { type: "agent", id: actor.id }, run_id: null, artifact_refs: [], receipt_refs: [] },
    })).toThrowError(MemoryVaultError);
    expect(() => vault.read({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "About/leak.md" })).toThrowError(MemoryVaultError);

    database.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("Given two runs edit the same note When the second uses a stale version Then active content is not overwritten and conflict review metadata is returned", () => {
    const root = tempVault();
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedWorkspace(database);
    initializeVaultLayout(root);
    const vault = new MemoryVault(database, root, { now: () => TIME });
    const provenance = { created_by: { type: "agent" as const, id: actor.id }, run_id: RUN_ID, artifact_refs: [], receipt_refs: ["receipt://source"] };

    vault.write({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "Reports/seo/site-a.md", base_version: 0, note_id: NOTE_ID, content: "Version one", source_refs: [{ kind: "receipt", ref: "receipt://source", verified: true }], provenance });
    vault.write({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "Reports/seo/site-a.md", base_version: 1, note_id: NOTE_ID, content: "Version two", source_refs: [{ kind: "receipt", ref: "receipt://source", verified: true }], provenance });
    const conflict = vault.write({
      actor,
      workspace_id: WORKSPACE_ID,
      requested_scope: workspaceScope,
      path: "Reports/seo/site-a.md",
      base_version: 1,
      note_id: NOTE_ID,
      content: "Competing version two",
      source_refs: [{ kind: "receipt", ref: "receipt://source", verified: true }],
      provenance,
      conflict: { conflict_group_id: CONFLICT_ID, review_id: REVIEW_ID },
    });

    expect(conflict.kind).toBe("conflict");
    if (conflict.kind !== "conflict") throw new Error("expected memory conflict");
    expect(conflict.review_id).toBe(REVIEW_ID);
    expect(conflict.active.version).toBe(2);
    expect(conflict.candidate.version).toBe(3);
    expect(vault.read({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "Reports/seo/site-a.md" }).content).toBe("Version two");
    expect(vault.listConflicts(WORKSPACE_ID)).toHaveLength(1);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given unresolved conflict candidates When more writes arrive Then version numbers remain append-only", () => {
    const root = tempVault();
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedWorkspace(database);
    initializeVaultLayout(root);
    const vault = new MemoryVault(database, root, { now: () => TIME });
    const provenance = { created_by: { type: "agent" as const, id: actor.id }, run_id: RUN_ID, artifact_refs: [], receipt_refs: ["receipt://source"] };

    vault.write({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "Reports/seo/site-a.md", base_version: 0, note_id: NOTE_ID, content: "Version one", source_refs: [{ kind: "receipt", ref: "receipt://source", verified: true }], provenance });
    vault.write({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "Reports/seo/site-a.md", base_version: 1, note_id: NOTE_ID, content: "Version two", source_refs: [{ kind: "receipt", ref: "receipt://source", verified: true }], provenance });
    const firstConflict = vault.write({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "Reports/seo/site-a.md", base_version: 1, note_id: NOTE_ID, content: "Competing version two", source_refs: [{ kind: "receipt", ref: "receipt://source", verified: true }], provenance, conflict: { conflict_group_id: CONFLICT_ID, review_id: REVIEW_ID } });
    const secondConflict = vault.write({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "Reports/seo/site-a.md", base_version: 1, note_id: NOTE_ID, content: "Another competing version two", source_refs: [{ kind: "receipt", ref: "receipt://source", verified: true }], provenance, conflict: { conflict_group_id: SECOND_CONFLICT_ID, review_id: SECOND_REVIEW_ID } });
    const cleanWrite = vault.write({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "Reports/seo/site-a.md", base_version: 2, note_id: NOTE_ID, content: "Version three", source_refs: [{ kind: "receipt", ref: "receipt://source", verified: true }], provenance });

    expect(firstConflict.kind).toBe("conflict");
    expect(secondConflict.kind).toBe("conflict");
    if (firstConflict.kind !== "conflict" || secondConflict.kind !== "conflict" || cleanWrite.kind !== "written") throw new Error("expected append-only memory writes");
    expect(firstConflict.candidate.version).toBe(3);
    expect(secondConflict.candidate.version).toBe(4);
    expect(cleanWrite.note.version).toBe(5);
    expect(vault.listConflicts(WORKSPACE_ID)).toHaveLength(2);
    expect(vault.read({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "Reports/seo/site-a.md" }).content).toBe("Version three");

    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("Given an actor outside the note scope When reading memory Then the denial does not reveal note content", () => {
    const root = tempVault();
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedWorkspace(database);
    initializeVaultLayout(root);
    const vault = new MemoryVault(database, root, { now: () => TIME });
    vault.write({ actor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "Sites/site-a.md", base_version: 0, note_id: NOTE_ID, content: "Scoped content", source_refs: [], provenance: { created_by: { type: "agent", id: actor.id }, run_id: null, artifact_refs: [], receipt_refs: [] } });
    const otherActor: PolicyActor = { id: "01HRZ3NDEKTSV4RRFFQ69G5FAV", role: "Agent", workspace_id: OTHER_WORKSPACE_ID, allowed_scopes: [{ kind: "workspace", id: OTHER_WORKSPACE_ID }] };

    expect(() => vault.read({ actor: otherActor, workspace_id: WORKSPACE_ID, requested_scope: workspaceScope, path: "Sites/site-a.md" })).toThrowError(MemoryVaultError);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });
});
