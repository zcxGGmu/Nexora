import { parseEnvironment } from "../packages/config/src/index.js";
import { restoreBackup } from "../packages/observability/src/index.js";
import { openDatabase, validateMigration } from "../packages/persistence/src/index.js";

type RestoreCliArgs = {
  readonly manifest_path: string | undefined;
  readonly restore_dir: string | undefined;
};

function parseArgs(argv: readonly string[]): RestoreCliArgs {
  const manifestIndex = argv.indexOf("--manifest");
  const restoreIndex = argv.indexOf("--restore-dir");
  return { manifest_path: manifestIndex === -1 ? undefined : argv[manifestIndex + 1], restore_dir: restoreIndex === -1 ? undefined : argv[restoreIndex + 1] };
}

function required(value: string | undefined, name: string): string {
  if (value === undefined) throw new RestoreCliError(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  parseEnvironment(process.env);
  const args = parseArgs(process.argv.slice(2));
  const restored = restoreBackup({ manifest_path: required(args.manifest_path, "--manifest"), restore_dir: required(args.restore_dir, "--restore-dir") });
  const database = openDatabase(restored.db_path);
  try {
    validateMigration(database);
  } finally {
    database.close();
  }
  console.log(JSON.stringify({ db_path: restored.db_path, restored_files: restored.restored_files.length, migration: "valid" }, null, 2));
}

class RestoreCliError extends Error {
  readonly name = "RestoreCliError";
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Restore failed");
  process.exitCode = 1;
});
