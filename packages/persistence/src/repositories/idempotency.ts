import { withTransaction, type SqliteDatabase } from "../db.js";
import { PersistenceError, readText, sqliteError, updateChanged } from "./utils.js";

export type IdempotencyRecord = {
  readonly workspace_id: string;
  readonly idempotency_key: string;
  readonly request_hash: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly created_at: string;
};

export type IdempotencyResourceUpdate = {
  readonly workspace_id: string;
  readonly idempotency_key: string;
  readonly request_hash: string;
  readonly from_resource_type: string;
  readonly to_resource_type: string;
  readonly resource_id: string;
};

export type IdempotencyReservation =
  | { readonly kind: "reserved"; readonly record: IdempotencyRecord }
  | { readonly kind: "existing"; readonly record: IdempotencyRecord };

export class IdempotencyRepository {
  constructor(private readonly database: SqliteDatabase) {}

  reserve(record: IdempotencyRecord): IdempotencyRecord {
    return this.reserveOrGet(record).record;
  }

  reserveOrGet(record: IdempotencyRecord): IdempotencyReservation {
    return withTransaction(this.database, () => {
      let inserted = false;
      try {
        const result = this.database.prepare("INSERT OR IGNORE INTO idempotency_records(workspace_id, idempotency_key, request_hash, resource_type, resource_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(record.workspace_id, record.idempotency_key, record.request_hash, record.resource_type, record.resource_id, record.created_at);
        inserted = result.changes === 1 || result.changes === 1n;
      } catch (error) {
        throw sqliteError(error);
      }
      const existing = this.get(record.workspace_id, record.idempotency_key);
      if (existing === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Idempotency reservation was not written");
      if (existing.request_hash !== record.request_hash) throw new PersistenceError("IDEMPOTENCY_KEY_REUSED", "Idempotency key was reused with a different request");
      return { kind: inserted ? "reserved" : "existing", record: existing };
    });
  }

  replaceResource(record: IdempotencyResourceUpdate): IdempotencyRecord {
    return withTransaction(this.database, () => {
      const existing = this.get(record.workspace_id, record.idempotency_key);
      if (existing === undefined) throw new PersistenceError("NOT_FOUND", "Idempotency reservation was not found");
      if (existing.request_hash !== record.request_hash) throw new PersistenceError("IDEMPOTENCY_KEY_REUSED", "Idempotency key was reused with a different request");
      if (existing.resource_type !== record.from_resource_type || existing.resource_id !== record.resource_id) throw new PersistenceError("CONSTRAINT_VIOLATION", "Idempotency reservation has a different resource");
      try {
        const result = this.database
          .prepare("UPDATE idempotency_records SET resource_type = ? WHERE workspace_id = ? AND idempotency_key = ? AND request_hash = ? AND resource_type = ? AND resource_id = ?")
          .run(record.to_resource_type, record.workspace_id, record.idempotency_key, record.request_hash, record.from_resource_type, record.resource_id);
        updateChanged(result, "idempotency reservation");
      } catch (error) {
        throw sqliteError(error);
      }
      const updated = this.get(record.workspace_id, record.idempotency_key);
      if (updated === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Idempotency reservation was not updated");
      return updated;
    });
  }

  get(workspaceId: string, key: string): IdempotencyRecord | undefined {
    const row = this.database.prepare("SELECT workspace_id, idempotency_key, request_hash, resource_type, resource_id, created_at FROM idempotency_records WHERE workspace_id = ? AND idempotency_key = ?").get(workspaceId, key);
    if (row === undefined) return undefined;
    return { workspace_id: readText(row["workspace_id"]), idempotency_key: readText(row["idempotency_key"]), request_hash: readText(row["request_hash"]), resource_type: readText(row["resource_type"]), resource_id: readText(row["resource_id"]), created_at: readText(row["created_at"]) };
  }
}
