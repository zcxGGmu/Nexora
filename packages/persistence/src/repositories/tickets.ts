import { TicketSchema, type Ticket } from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { json, readJson, sqliteError, updateChanged } from "./utils.js";

export class TicketRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: Ticket): Ticket {
    TicketSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(record.id, record.workspace_id, record.goal_id, record.status, record.idempotency_key, json(record), record.schema_version, record.created_at, record.updated_at);
      return record;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): Ticket | undefined {
    const row = this.database.prepare("SELECT payload_json FROM tickets WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], TicketSchema);
  }

  update(record: Ticket, expectedVersion: number): Ticket {
    TicketSchema.parse(record);
    const result = this.database.prepare("UPDATE tickets SET goal_id = ?, status = ?, idempotency_key = ?, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?").run(record.goal_id, record.status, record.idempotency_key, json(record), record.schema_version, record.updated_at, record.workspace_id, record.id, expectedVersion);
    updateChanged(result, "Ticket");
    return record;
  }
}
