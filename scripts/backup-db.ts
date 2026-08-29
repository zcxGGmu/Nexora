import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseEnvironment } from "../packages/config/src/index.js";
import { createBackup } from "../packages/observability/src/index.js";

type BackupCliArgs = {
  readonly output_dir: string | undefined;
};

function parseArgs(argv: readonly string[]): BackupCliArgs {
  const outputIndex = argv.indexOf("--output");
  return { output_dir: outputIndex === -1 ? undefined : argv[outputIndex + 1] };
}

function isoStamp(value: string): string {
  return value.replaceAll(":", "").replaceAll(".", "");
}

async function main(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const args = parseArgs(process.argv.slice(2));
  const createdAt = new Date().toISOString();
  const outputDir = args.output_dir ?? join(environment.dataDir, "backups", isoStamp(createdAt));
  const vaultPath = join(environment.dataDir, "vault");
  const manifest = createBackup({ db_path: environment.dbPath, include_paths: existsSync(vaultPath) ? [vaultPath] : [], output_dir: outputDir, created_at: createdAt });
  console.log(JSON.stringify({ manifest_path: manifest.manifest_path, entry_count: manifest.entries.length, root: outputDir }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Backup failed");
  process.exitCode = 1;
});
