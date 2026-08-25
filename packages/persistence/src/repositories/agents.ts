import { AgentProfileSchema, type AgentProfile } from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { json, readJson, sqliteError, updateChanged } from "./utils.js";

export class AgentRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: AgentProfile): AgentProfile {
    AgentProfileSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(record.id, record.workspace_id, json(record), record.schema_version, record.created_at, record.updated_at);
      return record;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): AgentProfile | undefined {
    const row = this.database.prepare("SELECT payload_json FROM agents WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], AgentProfileSchema);
  }

  update(record: AgentProfile, expectedVersion: number): AgentProfile {
    AgentProfileSchema.parse(record);
    const result = this.database.prepare("UPDATE agents SET payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?").run(json(record), record.schema_version, record.updated_at, record.workspace_id, record.id, expectedVersion);
    updateChanged(result, "Agent");
    return record;
  }
}
