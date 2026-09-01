import type { SQLInputValue } from "node:sqlite";
import { z } from "zod";
import type { ChannelDescriptor, GatewayDescriptor, Session } from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { PersistenceError, json, readText, sqliteError, updateChanged } from "./utils.js";

const StoredPayloadSchema = z.record(z.string(), z.unknown());

export type VersionedRecord = GatewayDescriptor | ChannelDescriptor | Session;
export type VersionedSchema<T extends VersionedRecord> = { readonly parse: (input: unknown) => T };
export type VersionedCodec<T extends VersionedRecord> = {
  readonly table: "gateways" | "channels" | "sessions";
  readonly schema: VersionedSchema<T>;
  readonly columns: string;
  readonly values: (record: T) => readonly SQLInputValue[];
  readonly updateValues: (record: T) => readonly SQLInputValue[];
};

export class VersionedRepository<T extends VersionedRecord> {
  constructor(private readonly database: SqliteDatabase, private readonly codec: VersionedCodec<T>) {}

  create(record: T): T {
    const parsed: T = this.codec.schema.parse(record);
    try {
      this.database.prepare(`INSERT INTO ${this.codec.table}(${this.codec.columns}) VALUES (${this.codec.columns.split(", ").map(() => "?").join(", ")})`).run(...this.codec.values(parsed));
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): T | undefined {
    const row = this.database.prepare(`SELECT payload_json, version FROM ${this.codec.table} WHERE workspace_id = ? AND id = ?`).get(workspaceId, id);
    if (row === undefined) return undefined;
    return readVersionedJson(row["payload_json"], readRevision(row["version"]), this.codec.schema);
  }

  list(workspaceId: string): readonly T[] {
    const rows = this.database.prepare(`SELECT payload_json, version FROM ${this.codec.table} WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC`).all(workspaceId);
    return rows.map((row) => readVersionedJson(row["payload_json"], readRevision(row["version"]), this.codec.schema));
  }

  update(record: T, expectedVersion: number): T {
    const parsed: T = this.codec.schema.parse(record);
    const updated: T = this.codec.schema.parse({ ...parsed, revision: expectedVersion + 1 });
    const mutableColumns = this.codec.columns.split(", ").filter((column) => !["id", "workspace_id", "payload_json", "schema_version", "created_at", "updated_at"].includes(column));
    const result = this.database.prepare(`UPDATE ${this.codec.table} SET ${mutableColumns.map((column) => `${column} = ?`).join(", ")}, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?`).run(
      ...this.codec.updateValues(updated), json(updated), updated.schema_version, updated.updated_at, updated.workspace_id, updated.id, expectedVersion,
    );
    updateChanged(result, "C19 record");
    return updated;
  }
}

function readRevision(value: unknown): number {
  const revision = typeof value === "bigint" ? Number(value) : value;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) throw new PersistenceError("CONSTRAINT_VIOLATION", "Stored record revision is invalid");
  return revision;
}

function readVersionedJson<T extends VersionedRecord>(value: unknown, revision: number, schema: VersionedSchema<T>): T {
  try {
    const payload = StoredPayloadSchema.parse(JSON.parse(readText(value)));
    return schema.parse({ ...payload, revision });
  } catch {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Stored contract failed validation");
  }
}
