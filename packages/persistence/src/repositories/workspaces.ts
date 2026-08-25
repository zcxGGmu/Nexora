import type { SqliteDatabase } from "../db.js";
import { PersistenceError, readText, sqliteError } from "./utils.js";

export type WorkspaceRecord = {
  readonly id: string;
  readonly name: string;
  readonly schema_version: 1;
  readonly created_at: string;
  readonly updated_at: string;
};

export class WorkspaceRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: WorkspaceRecord): WorkspaceRecord {
    try {
      this.database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(record.id, record.name, record.schema_version, record.created_at, record.updated_at);
      return record;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(id: string): WorkspaceRecord | undefined {
    const row = this.database.prepare("SELECT id, name, schema_version, created_at, updated_at FROM workspaces WHERE id = ?").get(id);
    if (row === undefined) return undefined;
    return { id: readText(row["id"]), name: readText(row["name"]), schema_version: 1, created_at: readText(row["created_at"]), updated_at: readText(row["updated_at"]) };
  }

  require(id: string): WorkspaceRecord {
    const record = this.get(id);
    if (record === undefined) throw new PersistenceError("NOT_FOUND", "Workspace not found");
    return record;
  }
}
