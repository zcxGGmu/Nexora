import { readFileSync, writeFileSync } from "node:fs";
import { parseEnvironment } from "../packages/config/src/index.js";
import { AuditLogExportSchema, exportAuditLog, verifyAuditLog } from "../packages/observability/src/index.js";
import { openDatabase } from "../packages/persistence/src/index.js";

type AuditCliArgs = {
  readonly audit_path: string | undefined;
  readonly output_path: string | undefined;
  readonly workspace_id: string | undefined;
};

function parseArgs(argv: readonly string[]): AuditCliArgs {
  const auditIndex = argv.indexOf("--audit");
  const outputIndex = argv.indexOf("--output");
  const workspaceIndex = argv.indexOf("--workspace");
  return {
    audit_path: auditIndex === -1 ? undefined : argv[auditIndex + 1],
    output_path: outputIndex === -1 ? undefined : argv[outputIndex + 1],
    workspace_id: workspaceIndex === -1 ? undefined : argv[workspaceIndex + 1],
  };
}

function required(value: string | undefined, name: string): string {
  if (value === undefined) throw new AuditCliError(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const args = parseArgs(process.argv.slice(2));
  const audit = args.audit_path === undefined ? exportFromDatabase(environment.dbPath, required(args.workspace_id, "--workspace")) : AuditLogExportSchema.parse(JSON.parse(readFileSync(args.audit_path, "utf8")));
  if (args.output_path !== undefined) writeFileSync(args.output_path, JSON.stringify(audit, null, 2), "utf8");
  const verification = verifyAuditLog(audit);
  console.log(JSON.stringify({ valid: verification.valid, failures: verification.failures, entry_count: audit.entry_count, root_hash: audit.root_hash, output_path: args.output_path ?? null }, null, 2));
  if (!verification.valid) process.exitCode = 1;
}

function exportFromDatabase(dbPath: string, workspaceId: string) {
  const database = openDatabase(dbPath);
  try {
    return exportAuditLog(database, { workspace_id: workspaceId, exported_at: new Date().toISOString() });
  } finally {
    database.close();
  }
}

class AuditCliError extends Error {
  readonly name = "AuditCliError";
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Audit verification failed");
  process.exitCode = 1;
});
