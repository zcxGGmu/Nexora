import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { z } from "@nexora/contracts";
import { openDatabase } from "@nexora/persistence";

const BackupEntryKindSchema = z.enum(["database", "sqlite_sidecar", "include"]);
const RelativePathSchema = z.string().min(1).refine((value) => isSafeRelativePath(value), "backup paths must be relative");
const BackupManifestEntrySchema = z.object({
  kind: BackupEntryKindSchema,
  source_path: z.string().min(1),
  backup_relative_path: RelativePathSchema,
  restore_relative_path: RelativePathSchema,
  sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  byte_size: z.number().int().nonnegative(),
}).strict();
export const BackupManifestSchema = z.object({
  schema_version: z.literal(1),
  created_at: z.string().min(1),
  db_restore_relative_path: RelativePathSchema,
  entries: z.array(BackupManifestEntrySchema),
  manifest_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
}).strict();

export type BackupInput = {
  readonly db_path: string;
  readonly include_paths?: readonly string[];
  readonly output_dir: string;
  readonly created_at: string;
};

export type RestoreInput = {
  readonly manifest_path: string;
  readonly restore_dir: string;
};

export type BackupEntryKind = z.infer<typeof BackupEntryKindSchema>;
export type BackupManifestEntry = z.infer<typeof BackupManifestEntrySchema>;
export type BackupManifest = z.infer<typeof BackupManifestSchema>;

export type BackupResult = BackupManifest & {
  readonly manifest_path: string;
};

export type RestoreResult = {
  readonly db_path: string;
  readonly restored_files: readonly string[];
};

export type BackupVerificationFailure = { readonly path: string; readonly code: "FILE_MISSING" | "HASH_MISMATCH" | "MANIFEST_HASH_MISMATCH" };
export type BackupVerificationResult = { readonly valid: boolean; readonly failures: readonly BackupVerificationFailure[] };

export function createBackup(input: BackupInput): BackupResult {
  checkpointSqlite(input.db_path);
  const filesDir = join(input.output_dir, "files");
  mkdirSync(filesDir, { recursive: true });
  const entries = sourceFiles(input).map((source, index) => copyBackupEntry({ source, index, filesDir }));
  const databaseEntry = entries.find((entry) => entry.kind === "database");
  if (databaseEntry === undefined) throw new BackupError("Database file was not included in backup");
  const body = { schema_version: 1 as const, created_at: input.created_at, db_restore_relative_path: databaseEntry.restore_relative_path, entries };
  const manifest = { ...body, manifest_hash: manifestHash(body) };
  const manifestPath = join(input.output_dir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { ...manifest, manifest_path: manifestPath };
}

function checkpointSqlite(dbPath: string): void {
  if (!existsSync(dbPath)) throw new BackupError(`Database file does not exist: ${dbPath}`);
  const database = openDatabase(dbPath);
  try {
    database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    database.close();
  }
}

export function verifyBackupManifest(manifestPath: string): BackupVerificationResult {
  const manifest = readManifest(manifestPath);
  const failures: BackupVerificationFailure[] = [];
  if (manifest.manifest_hash !== manifestHash({ schema_version: manifest.schema_version, created_at: manifest.created_at, db_restore_relative_path: manifest.db_restore_relative_path, entries: manifest.entries })) {
    failures.push({ path: manifestPath, code: "MANIFEST_HASH_MISMATCH" });
  }
  for (const entry of manifest.entries) {
    const backupPath = joinInside(dirname(manifestPath), entry.backup_relative_path);
    if (!existsSync(backupPath)) {
      failures.push({ path: backupPath, code: "FILE_MISSING" });
    } else if (sha256File(backupPath) !== entry.sha256) {
      failures.push({ path: backupPath, code: "HASH_MISMATCH" });
    }
  }
  return { valid: failures.length === 0, failures };
}

export function restoreBackup(input: RestoreInput): RestoreResult {
  const verification = verifyBackupManifest(input.manifest_path);
  if (!verification.valid) throw new BackupError("Backup manifest verification failed");
  const manifest = readManifest(input.manifest_path);
  mkdirSync(input.restore_dir, { recursive: true });
  const restoredFiles = manifest.entries.map((entry) => {
    const source = joinInside(dirname(input.manifest_path), entry.backup_relative_path);
    const target = joinInside(input.restore_dir, entry.restore_relative_path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    return target;
  });
  return { db_path: join(input.restore_dir, manifest.db_restore_relative_path), restored_files: restoredFiles };
}

function sourceFiles(input: BackupInput): readonly BackupSource[] {
  const primary = [{ path: input.db_path, kind: "database" as const }, ...sqliteSidecars(input.db_path)];
  const includes = (input.include_paths ?? []).flatMap((sourcePath) => expandInclude(sourcePath));
  return [...primary, ...includes];
}

function sqliteSidecars(dbPath: string): readonly BackupSource[] {
  return [`${dbPath}-wal`, `${dbPath}-shm`]
    .filter((path) => existsSync(path))
    .map((path) => ({ path, kind: "sqlite_sidecar" as const }));
}

function expandInclude(sourcePath: string): readonly BackupSource[] {
  const stat = statSync(sourcePath);
  if (stat.isFile()) return [{ path: sourcePath, kind: "include" }];
  if (!stat.isDirectory()) throw new BackupError(`Unsupported backup source: ${sourcePath}`);
  return walkDirectory(sourcePath).map((path) => ({ path, root: sourcePath, kind: "include" }));
}

function walkDirectory(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return walkDirectory(path);
    if (entry.isFile()) return [path];
    return [];
  }).sort((left, right) => left.localeCompare(right));
}

function copyBackupEntry(input: { readonly source: BackupSource; readonly index: number; readonly filesDir: string }): BackupManifestEntry {
  const restoreRelativePath = restoreRelativePathFor(input.source);
  const backupRelativePath = join("files", `${String(input.index).padStart(3, "0")}-${restoreRelativePath.replaceAll("/", "__")}`);
  const target = join(input.filesDir, basename(backupRelativePath));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(input.source.path, target);
  return { kind: input.source.kind, source_path: input.source.path, backup_relative_path: backupRelativePath, restore_relative_path: restoreRelativePath, sha256: sha256File(target), byte_size: statSync(target).size };
}

function restoreRelativePathFor(source: BackupSource): string {
  if (source.root === undefined) return basename(source.path);
  return join(basename(source.root), relative(source.root, source.path));
}

function readManifest(manifestPath: string): BackupManifest {
  return BackupManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
}

function manifestHash(body: Omit<BackupManifest, "manifest_hash">): string {
  return sha256(JSON.stringify(body));
}

function sha256File(path: string): string {
  return sha256(readFileSync(path));
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function isSafeRelativePath(path: string): boolean {
  const normalized = normalize(path);
  return !isAbsolute(path) && normalized !== ".." && !normalized.startsWith(`..${sep}`);
}

function joinInside(root: string, relativePath: string): string {
  const base = resolve(root);
  const target = resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw new BackupError(`Backup path escapes root: ${relativePath}`);
  return target;
}

type BackupSource = {
  readonly path: string;
  readonly root?: string;
  readonly kind: BackupEntryKind;
};

export class BackupError extends Error {
  readonly name = "BackupError";
}
