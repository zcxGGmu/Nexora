import { z } from "zod";
import type { SqliteDatabase } from "../db.js";

export class PersistenceError extends Error {
  readonly code: "VERSION_CONFLICT" | "IDEMPOTENCY_KEY_REUSED" | "NOT_FOUND" | "CONSTRAINT_VIOLATION";

  constructor(code: PersistenceError["code"], message: string) {
    super(message);
    this.name = "PersistenceError";
    this.code = code;
  }
}

export function readText(value: unknown): string {
  if (typeof value !== "string") throw new PersistenceError("CONSTRAINT_VIOLATION", "Expected text column");
  return value;
}

export function readJson<TSchema extends z.ZodTypeAny>(value: unknown, schema: TSchema): z.output<TSchema> {
  try {
    return schema.parse(JSON.parse(readText(value)));
  } catch {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Stored contract failed validation");
  }
}

export function json(value: unknown): string {
  return JSON.stringify(value);
}

export function sqliteError(error: unknown, fallback: PersistenceError["code"] = "CONSTRAINT_VIOLATION"): PersistenceError {
  const message = error instanceof Error ? error.message : "SQLite operation failed";
  if (/UNIQUE constraint failed: .*idempotency_key/i.test(message)) return new PersistenceError("IDEMPOTENCY_KEY_REUSED", "Idempotency key is already reserved");
  return new PersistenceError(fallback, "SQLite operation failed");
}

export function updateChanged(result: { readonly changes: number | bigint }, entity: string): void {
  if (result.changes !== 1 && result.changes !== 1n) throw new PersistenceError("VERSION_CONFLICT", `${entity} version conflict`);
}

export function tableExists(database: SqliteDatabase, table: string): boolean {
  return database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
}
