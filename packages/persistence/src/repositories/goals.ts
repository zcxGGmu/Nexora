import { GoalSchema, type Goal } from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { json, readJson, sqliteError, updateChanged } from "./utils.js";

export class GoalRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: Goal): Goal {
    GoalSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(record.id, record.workspace_id, record.title, record.objective, JSON.stringify(record.definition_of_done), json(record), record.schema_version, record.created_at, record.updated_at);
      return record;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): Goal | undefined {
    const row = this.database.prepare("SELECT payload_json FROM goals WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], GoalSchema);
  }

  update(record: Goal, expectedVersion: number): Goal {
    GoalSchema.parse(record);
    const result = this.database.prepare("UPDATE goals SET title = ?, objective = ?, definition_of_done_json = ?, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?").run(record.title, record.objective, JSON.stringify(record.definition_of_done), json(record), record.schema_version, record.updated_at, record.workspace_id, record.id, expectedVersion);
    updateChanged(result, "Goal");
    return record;
  }
}
