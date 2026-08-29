import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase, validateMigration } from "../packages/persistence/src/index.js";
import { QueryService } from "../apps/api/src/services/query-service.js";
import { MemoryVault } from "../packages/memory/src/index.js";
import { ArtifactStore } from "../packages/artifacts/src/index.js";
import { DEFAULT_SEED_IDS, seedWorkspace } from "./fixtures/seed-workspace.js";
import { FaultInjector, FAULT_SCENARIOS } from "./fixtures/fault-injection.js";

const ROOT = join(import.meta.dirname, "..");

describe("C16 release hardening", () => {
  it("declares reproducible service images, health checks, and a persistent data volume", () => {
    const compose = readFileSync(join(ROOT, "docker-compose.yml"), "utf8");
    expect(compose).toContain("api:");
    expect(compose).toContain("worker:");
    expect(compose).toContain("web:");
    expect(compose).toContain("healthcheck:");
    expect(compose).toContain("nexora-data:");
    expect(existsSync(join(ROOT, "Dockerfile.api"))).toBe(true);
    expect(existsSync(join(ROOT, "Dockerfile.worker"))).toBe(true);
    expect(existsSync(join(ROOT, "Dockerfile.web"))).toBe(true);
    expect(readFileSync(join(ROOT, "package.json"), "utf8")).toContain('"lint": "node scripts/lint.mjs"');
    expect(existsSync(join(ROOT, "scripts/lint.mjs"))).toBe(true);
  });

  it("seeds the same workspace graph idempotently into a fresh data directory", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "nexora-c16-seed-"));
    try {
      const first = seedWorkspace({ data_dir: dataDir });
      const second = seedWorkspace({ data_dir: dataDir });
      expect(first.workspace_id).toBe(DEFAULT_SEED_IDS.workspace);
      expect(second).toEqual(first);

      const database = openDatabase(first.db_path);
      try {
        validateMigration(database);
        expect(database.prepare("SELECT COUNT(*) AS count FROM workspaces WHERE id = ?").get(DEFAULT_SEED_IDS.workspace)?.["count"]).toBe(1);
        expect(database.prepare("SELECT COUNT(*) AS count FROM agents WHERE workspace_id = ?").get(DEFAULT_SEED_IDS.workspace)?.["count"]).toBe(1);
        expect(database.prepare("SELECT COUNT(*) AS count FROM goals WHERE workspace_id = ?").get(DEFAULT_SEED_IDS.workspace)?.["count"]).toBe(1);
        expect(database.prepare("SELECT COUNT(*) AS count FROM tickets WHERE workspace_id = ?").get(DEFAULT_SEED_IDS.workspace)?.["count"]).toBe(1);
        expect(database.prepare("SELECT COUNT(*) AS count FROM memory_notes WHERE workspace_id = ?").get(DEFAULT_SEED_IDS.workspace)?.["count"]).toBe(1);
        expect(database.prepare("SELECT COUNT(*) AS count FROM artifact_versions WHERE workspace_id = ?").get(DEFAULT_SEED_IDS.workspace)?.["count"]).toBe(1);

        const queries = new QueryService(database);
        expect(queries.listArtifacts(DEFAULT_SEED_IDS.workspace)).toHaveLength(1);
        expect(queries.listReceipts(DEFAULT_SEED_IDS.workspace)).toHaveLength(1);
        expect(queries.listMemory(DEFAULT_SEED_IDS.workspace)).toHaveLength(1);

        const vault = new MemoryVault(database, first.vault_path);
        expect(readFileSync(join(first.vault_path, "release-qa.md"), "utf8")).toContain("Trusted seed fixture context.");
        const memory = vault.read({
          actor: { id: DEFAULT_SEED_IDS.agent, role: "Agent", workspace_id: DEFAULT_SEED_IDS.workspace, allowed_scopes: [{ kind: "workspace", id: DEFAULT_SEED_IDS.workspace }] },
          workspace_id: DEFAULT_SEED_IDS.workspace,
          requested_scope: { kind: "workspace", id: DEFAULT_SEED_IDS.workspace },
          path: "release-qa.md",
        });
        expect(memory.content).toContain("Trusted seed fixture context.");

        const artifact = new ArtifactStore(database, join(first.vault_path));
        expect(artifact.read({ workspace_id: DEFAULT_SEED_IDS.workspace, artifact_id: DEFAULT_SEED_IDS.artifact, version: 1 }).content).toContain("Seed SEO draft");
      } finally {
        database.close();
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("keeps fault injection explicit, one-shot, and retry-aware", () => {
    const injector = new FaultInjector({ scenarios: FAULT_SCENARIOS });
    expect(injector.inject("timeout")).toMatchObject({ error_code: "RUNTIME_TIMEOUT", retryable: true });
    expect(injector.inject("timeout")).toBeUndefined();
    expect(injector.inject("crash")).toMatchObject({ error_code: "RUNTIME_CRASHED", retryable: true });
    expect(injector.inject("stale_lease")).toMatchObject({ error_code: "STALE_LEASE", retryable: true });
    expect(injector.inject("projection_failure")).toMatchObject({ error_code: "PROJECTION_DEGRADED", retryable: false });
    expect(injector.inject("connector_outage")).toMatchObject({ error_code: "CONNECTOR_UNAVAILABLE", retryable: true });
  });

  it("rejects a symlinked seed data directory", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "nexora-c16-seed-target-"));
    const linkDir = join(tmpdir(), `nexora-c16-seed-link-${process.pid}-${Date.now()}`);
    symlinkSync(targetDir, linkDir, "dir");
    try {
      expect(() => seedWorkspace({ data_dir: linkDir })).toThrow("must not be a symlink");
    } finally {
      rmSync(linkDir, { force: true });
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked memory file before writing outside the data directory", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "nexora-c16-memory-link-"));
    const outsideDir = mkdtempSync(join(tmpdir(), "nexora-c16-memory-target-"));
    const outsidePath = join(outsideDir, "memory.md");
    const memoryDirectory = join(dataDir, "vault", ".nexora", "memory", DEFAULT_SEED_IDS.memory);
    const memoryPath = join(memoryDirectory, "v1.md");
    try {
      mkdirSync(memoryDirectory, { recursive: true });
      writeFileSync(outsidePath, "untouched", "utf8");
      symlinkSync(outsidePath, memoryPath, "file");
      expect(() => seedWorkspace({ data_dir: dataDir })).toThrow("must not traverse a symlink");
      expect(readFileSync(outsidePath, "utf8")).toBe("untouched");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked artifact file before writing outside the data directory", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "nexora-c16-artifact-link-"));
    const outsideDir = mkdtempSync(join(tmpdir(), "nexora-c16-artifact-target-"));
    const outsidePath = join(outsideDir, "artifact.txt");
    try {
      const seeded = seedWorkspace({ data_dir: dataDir });
      const artifactHash = createHash("sha256").update("# Seed SEO draft\n\nEvidence-backed draft fixture for release QA.\n").digest("hex");
      const artifactPath = join(seeded.vault_path, "Artifacts", DEFAULT_SEED_IDS.artifact, "v1", `${artifactHash}.txt`);
      unlinkSync(artifactPath);
      writeFileSync(outsidePath, "untouched", "utf8");
      symlinkSync(outsidePath, artifactPath, "file");
      expect(() => seedWorkspace({ data_dir: dataDir })).toThrow("must not traverse a symlink");
      expect(readFileSync(outsidePath, "utf8")).toBe("untouched");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
