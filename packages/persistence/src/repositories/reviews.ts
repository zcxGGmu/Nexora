import { ReviewDecisionSchema, type ReviewDecision } from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { json, readJson, sqliteError } from "./utils.js";

export class ReviewRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: ReviewDecision): ReviewDecision {
    ReviewDecisionSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO review_decisions(id, workspace_id, artifact_id, artifact_version, review_version, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(record.id, record.workspace_id, record.artifact_id, record.artifact_version, record.review_version, json(record), record.schema_version, record.created_at, record.updated_at);
      return record;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string, reviewVersion: number): ReviewDecision | undefined {
    const row = this.database.prepare("SELECT payload_json FROM review_decisions WHERE workspace_id = ? AND id = ? AND review_version = ?").get(workspaceId, id, reviewVersion);
    return row === undefined ? undefined : readJson(row["payload_json"], ReviewDecisionSchema);
  }
}
