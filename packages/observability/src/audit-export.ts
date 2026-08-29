import { createHash } from "node:crypto";
import { PayloadHashSchema, z } from "@nexora/contracts";
import type { SqliteDatabase } from "@nexora/persistence";

const AuditEntrySchema = z.object({
  event_id: z.string().min(1),
  workspace_id: z.string().min(1),
  run_id: z.string().min(1).nullable(),
  sequence: z.number().int().nonnegative(),
  event_type: z.string().min(1),
  occurred_at: z.string().min(1),
  received_at: z.string().min(1),
  trace_id: z.string().min(1),
  attempt_id: z.string().min(1).nullable(),
  step_id: z.string().min(1).nullable(),
  schema_version: z.number().int().positive(),
  payload_hash: PayloadHashSchema,
  previous_hash: PayloadHashSchema.nullable(),
  record_hash: PayloadHashSchema,
  chain_hash: PayloadHashSchema,
}).strict();

export const AuditLogExportSchema = z.object({
  schema_version: z.literal(1),
  workspace_id: z.string().min(1),
  exported_at: z.string().min(1),
  entry_count: z.number().int().nonnegative(),
  root_hash: PayloadHashSchema,
  export_hash: PayloadHashSchema,
  entries: z.array(AuditEntrySchema),
}).strict();

export type AuditLogEntry = z.infer<typeof AuditEntrySchema>;
export type AuditLogExport = z.infer<typeof AuditLogExportSchema>;
export type AuditFailureCode = "ENTRY_COUNT_MISMATCH" | "RECORD_HASH_MISMATCH" | "CHAIN_HASH_MISMATCH" | "ROOT_HASH_MISMATCH" | "EXPORT_HASH_MISMATCH";
export type AuditVerificationFailure = { readonly event_id: string | null; readonly code: AuditFailureCode };
export type AuditVerificationResult = { readonly valid: boolean; readonly failures: readonly AuditVerificationFailure[] };

export function exportAuditLog(database: SqliteDatabase, input: { readonly workspace_id: string; readonly exported_at?: string }): AuditLogExport {
  let previousHash: string | null = null;
  const entries = eventRows(database, input.workspace_id).map((row) => {
    const payload = readText(row["payload_json"]);
    const entryWithoutHashes = {
      event_id: readText(row["event_id"]),
      workspace_id: readText(row["workspace_id"]),
      run_id: readNullableText(row["run_id"]),
      sequence: readInteger(row["sequence"]),
      event_type: readText(row["event_type"]),
      occurred_at: readText(row["occurred_at"]),
      received_at: readText(row["received_at"]),
      trace_id: readText(row["trace_id"]),
      attempt_id: readNullableText(row["attempt_id"]),
      step_id: readNullableText(row["step_id"]),
      schema_version: readInteger(row["schema_version"]),
      payload_hash: sha256(payload),
      previous_hash: previousHash,
    };
    const recordHash = recordHashFor(entryWithoutHashes);
    const chainHash = chainHashFor(recordHash, previousHash);
    previousHash = chainHash;
    return { ...entryWithoutHashes, record_hash: recordHash, chain_hash: chainHash };
  });
  const rootHash = previousHash ?? sha256("nexora:audit:empty");
  const body = { schema_version: 1 as const, workspace_id: input.workspace_id, exported_at: input.exported_at ?? new Date(0).toISOString(), entry_count: entries.length, root_hash: rootHash, entries };
  return AuditLogExportSchema.parse({ ...body, export_hash: exportHashFor(body) });
}

export function verifyAuditLog(value: AuditLogExport): AuditVerificationResult {
  const audit = AuditLogExportSchema.parse(value);
  const failures: AuditVerificationFailure[] = [];
  let previousHash: string | null = null;
  for (const entry of audit.entries) {
    const withoutHashes = { ...entry, record_hash: undefined, chain_hash: undefined };
    const recordHash = recordHashFor({
      event_id: entry.event_id,
      workspace_id: entry.workspace_id,
      run_id: entry.run_id,
      sequence: entry.sequence,
      event_type: entry.event_type,
      occurred_at: entry.occurred_at,
      received_at: entry.received_at,
      trace_id: entry.trace_id,
      attempt_id: entry.attempt_id,
      step_id: entry.step_id,
      schema_version: entry.schema_version,
      payload_hash: entry.payload_hash,
      previous_hash: previousHash,
    });
    if (withoutHashes.previous_hash !== previousHash || entry.record_hash !== recordHash) failures.push({ event_id: entry.event_id, code: "RECORD_HASH_MISMATCH" });
    const chainHash = chainHashFor(recordHash, previousHash);
    if (entry.chain_hash !== chainHash) failures.push({ event_id: entry.event_id, code: "CHAIN_HASH_MISMATCH" });
    previousHash = entry.chain_hash;
  }
  if (audit.entry_count !== audit.entries.length) failures.push({ event_id: null, code: "ENTRY_COUNT_MISMATCH" });
  if (audit.root_hash !== (audit.entries.at(-1)?.chain_hash ?? sha256("nexora:audit:empty"))) failures.push({ event_id: null, code: "ROOT_HASH_MISMATCH" });
  if (audit.export_hash !== exportHashFor({ schema_version: audit.schema_version, workspace_id: audit.workspace_id, exported_at: audit.exported_at, entry_count: audit.entry_count, root_hash: audit.root_hash, entries: audit.entries })) failures.push({ event_id: null, code: "EXPORT_HASH_MISMATCH" });
  return { valid: failures.length === 0, failures };
}

function eventRows(database: SqliteDatabase, workspaceId: string): readonly Record<string, unknown>[] {
  return database.prepare("SELECT event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version FROM events WHERE workspace_id = ? ORDER BY COALESCE(run_id, ''), sequence ASC, event_id ASC").all(workspaceId);
}

function recordHashFor(entry: Omit<AuditLogEntry, "record_hash" | "chain_hash">): string {
  return sha256(["record", entry.event_id, entry.workspace_id, entry.run_id ?? "", String(entry.sequence), entry.event_type, entry.occurred_at, entry.received_at, entry.trace_id, entry.attempt_id ?? "", entry.step_id ?? "", String(entry.schema_version), entry.payload_hash, entry.previous_hash ?? ""].join("\n"));
}

function chainHashFor(recordHash: string, previousHash: string | null): string {
  return sha256(["chain", previousHash ?? "", recordHash].join("\n"));
}

function exportHashFor(body: Omit<AuditLogExport, "export_hash">): string {
  return sha256(JSON.stringify(body));
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function readText(value: unknown): string {
  if (typeof value !== "string") throw new AuditExportError("Expected text column");
  return value;
}

function readNullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return readText(value);
}

function readInteger(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint" && Number.isSafeInteger(Number(value))) return Number(value);
  throw new AuditExportError("Expected integer column");
}

export class AuditExportError extends Error {
  readonly name = "AuditExportError";
}
