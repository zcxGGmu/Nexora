import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBackup, restoreBackup, verifyBackupManifest } from "../../packages/observability/src/index.js";
import { migrate, openDatabase, validateMigration } from "../../packages/persistence/src/index.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-29T04:00:00.000Z";

describe("C15 backup and restore integration", () => {
  it("Given a SQLite store and auxiliary files When a backup is restored Then hashes are verified and data is readable", () => {
    const root = join(tmpdir(), `nexora-backup-${process.pid}-${Date.now()}`);
    const sourceDir = join(root, "source");
    const backupDir = join(root, "backup");
    const restoreDir = join(root, "restore");
    mkdirSync(sourceDir, { recursive: true });
    const dbPath = join(sourceDir, "nexora.sqlite");
    const vaultDir = join(sourceDir, "vault", ".nexora", "memory", WORKSPACE_ID);
    const artifactDir = join(sourceDir, "vault", "Artifacts", WORKSPACE_ID, "v1");
    mkdirSync(vaultDir, { recursive: true });
    mkdirSync(artifactDir, { recursive: true });
    const memoryPath = join(vaultDir, "note.txt");
    const artifactPath = join(artifactDir, "artifact.txt");
    const database = openDatabase(dbPath);
    migrate(database, { now: () => TIME });
    database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Backup Fixture", TIME, TIME);
    database.close();
    writeFileSync(memoryPath, "scoped memory fixture", "utf8");
    writeFileSync(artifactPath, "artifact fixture", "utf8");

    try {
      const manifest = createBackup({ db_path: dbPath, include_paths: [join(sourceDir, "vault")], output_dir: backupDir, created_at: TIME });
      const restored = restoreBackup({ manifest_path: manifest.manifest_path, restore_dir: restoreDir });
      const restoredDatabase = openDatabase(restored.db_path);
      const restoredMemory = readFileSync(join(restoreDir, "vault", ".nexora", "memory", WORKSPACE_ID, "note.txt"), "utf8");
      const restoredArtifact = readFileSync(join(restoreDir, "vault", "Artifacts", WORKSPACE_ID, "v1", "artifact.txt"), "utf8");

      try {
        expect(verifyBackupManifest(manifest.manifest_path)).toEqual({ valid: true, failures: [] });
        expect(() => validateMigration(restoredDatabase)).not.toThrow();
        expect(restoredDatabase.prepare("SELECT name FROM workspaces WHERE id = ?").get(WORKSPACE_ID)?.["name"]).toBe("Backup Fixture");
        expect(restoredMemory).toBe("scoped memory fixture");
        expect(restoredArtifact).toBe("artifact fixture");
        const persistedManifest = { schema_version: manifest.schema_version, created_at: manifest.created_at, db_restore_relative_path: manifest.db_restore_relative_path, entries: manifest.entries, manifest_hash: manifest.manifest_hash };
        writeFileSync(manifest.manifest_path, JSON.stringify({ ...persistedManifest, entries: manifest.entries.map((entry) => entry.kind === "database" ? { ...entry, sha256: "sha256:" + "0".repeat(64) } : entry) }, null, 2), "utf8");
        expect(verifyBackupManifest(manifest.manifest_path).valid).toBe(false);
      } finally {
        restoredDatabase.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
