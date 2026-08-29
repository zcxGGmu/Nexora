import { ArtifactSchema, EgressReceiptSchema, ReceiptSchema, type Artifact, type EgressReceipt, type Receipt } from "@nexora/contracts";
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

export class EgressReceiptRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: EgressReceipt): EgressReceipt {
    const parsed = EgressReceiptSchema.parse(record);
    try {
      this.database
        .prepare("INSERT INTO egress_receipts(id, workspace_id, run_id, attempt_id, step_id, trace_id, execution_location, provider, region, data_classification, redaction_count, snapshot_hash, policy_decision_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(parsed.receipt_id, parsed.workspace_id, parsed.run_id, parsed.attempt_id, parsed.step_id, parsed.trace_id, parsed.execution_location, parsed.provider, parsed.region, parsed.data_classification, parsed.redaction_count, parsed.snapshot_hash, json(parsed.policy_decision), json(parsed), parsed.schema_version, parsed.created_at, parsed.created_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): EgressReceipt | undefined {
    const row = this.database.prepare("SELECT payload_json FROM egress_receipts WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], EgressReceiptSchema);
  }

  list(workspaceId: string): readonly EgressReceipt[] {
    const rows = this.database.prepare("SELECT payload_json FROM egress_receipts WHERE workspace_id = ? ORDER BY created_at DESC, id ASC").all(workspaceId);
    return rows.map((row) => readJson(row["payload_json"], EgressReceiptSchema));
  }

  listByRun(workspaceId: string, runId: string): readonly EgressReceipt[] {
    const rows = this.database.prepare("SELECT payload_json FROM egress_receipts WHERE workspace_id = ? AND run_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, runId);
    return rows.map((row) => readJson(row["payload_json"], EgressReceiptSchema));
  }
}
