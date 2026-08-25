import { ArtifactSchema, ReceiptSchema, type Artifact, type Receipt } from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { json, readJson, sqliteError } from "./utils.js";

export class ArtifactRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: Artifact): Artifact {
    ArtifactSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO artifacts(id, workspace_id, artifact_version, source_ticket, source_run, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(record.id, record.workspace_id, record.version, record.source_ticket, record.source_run, record.status, json(record), record.schema_version, record.created_at, record.updated_at);
      return record;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string, version: number): Artifact | undefined {
    const row = this.database.prepare("SELECT payload_json FROM artifacts WHERE workspace_id = ? AND id = ? AND artifact_version = ?").get(workspaceId, id, version);
    return row === undefined ? undefined : readJson(row["payload_json"], ArtifactSchema);
  }
}

export class ReceiptRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: Receipt): Receipt {
    ReceiptSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO receipts(id, workspace_id, run_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(record.id, record.workspace_id, record.run_id, json(record), record.schema_version, record.created_at, record.updated_at);
      return record;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): Receipt | undefined {
    const row = this.database.prepare("SELECT payload_json FROM receipts WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], ReceiptSchema);
  }
}
