import type { SqliteDatabase } from "@nexora/persistence";

export function readText(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected text column");
  return value;
}

export function readInteger(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint" && Number.isSafeInteger(Number(value))) return Number(value);
  throw new Error("Expected integer column");
}

export function readNullableText(value: unknown): string | null {
  return value === null ? null : readText(value);
}

export function readJsonObject(value: unknown): Readonly<Record<string, string | number | boolean | null>> {
  const text = readText(value);
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected JSON object");
  const entries = Object.entries(parsed);
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of entries) {
    if (item !== null && typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") throw new Error("Queue payload contains unsupported value");
    output[key] = item;
  }
  return output;
}

export function assertTableReady(database: SqliteDatabase, table: string): void {
  const row = database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (row === undefined) throw new Error(`SQLite table ${table} is not available`);
}
