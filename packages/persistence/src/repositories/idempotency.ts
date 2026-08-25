import { withTransaction, type SqliteDatabase } from "../db.js";
import { PersistenceError, readText, sqliteError } from "./utils.js";

export type IdempotencyRecord = {
  readonly workspace_id: string;
  readonly idempotency_key: string;
  readonly request_hash: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly created_at: string;
};

export class IdempotencyRepository {
  constructor(private readonly database: SqliteDatabase) {}

  reserve(record: IdempotencyRecord): IdempotencyRecord {
    return withTransaction(this.database, () => {
      try {
        this.database.prepare("INSERT OR IGNORE INTO idempotency_records(workspace_id, idempotency_key, request_hash, resource_type, resource_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(record.workspace_id, record.idempotency_key, record.request_hash, record.resource_type, record.resource_id, record.created_at);
      } catch (error) {
        throw sqliteError(error);
      }
      const existing = this.get(record.workspace_id, record.idempotency_key);
      if (existing === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Idempotency reservation was not written");
      if (existing.request_hash !== record.request_hash) throw new PersistenceError("IDEMPOTENCY_KEY_REUSED", "Idempotency key was reused with a different request");
      return existing;
    });
  }

  get(workspaceId: string, key: string): IdempotencyRecord | undefined {
    const row = this.database.prepare("SELECT workspace_id, idempotency_key, request_hash, resource_type, resource_id, created_at FROM idempotency_records WHERE workspace_id = ? AND idempotency_key = ?").get(workspaceId, key);
    if (row === undefined) return undefined;
    return { workspace_id: readText(row["workspace_id"]), idempotency_key: readText(row["idempotency_key"]), request_hash: readText(row["request_hash"]), resource_type: readText(row["resource_type"]), resource_id: readText(row["resource_id"]), created_at: readText(row["created_at"]) };
  }
}
