import { AttemptSchema, RunSchema, StepSchema, type Attempt, type Run, type Step } from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { json, readJson, sqliteError, updateChanged } from "./utils.js";

export class RunRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: Run): Run {
    RunSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(record.id, record.workspace_id, record.ticket_id, record.status, json(record), record.schema_version, record.created_at, record.updated_at);
      return record;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): Run | undefined {
    const row = this.database.prepare("SELECT payload_json FROM runs WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], RunSchema);
  }

  update(record: Run, expectedVersion: number): Run {
    RunSchema.parse(record);
    const result = this.database.prepare("UPDATE runs SET ticket_id = ?, status = ?, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?").run(record.ticket_id, record.status, json(record), record.schema_version, record.updated_at, record.workspace_id, record.id, expectedVersion);
    updateChanged(result, "Run");
    return record;
  }
}

export class AttemptRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: Attempt): Attempt {
    AttemptSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO attempts(id, workspace_id, run_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(record.id, record.workspace_id, record.run_id, record.status, json(record), record.schema_version, record.created_at, record.updated_at);
      return record;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): Attempt | undefined {
    const row = this.database.prepare("SELECT payload_json FROM attempts WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], AttemptSchema);
  }
}

export class StepRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: Step): Step {
    StepSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO steps(id, workspace_id, run_id, attempt_id, agent_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(record.id, record.workspace_id, record.run_id, record.attempt_id, record.agent_id, record.status, json(record), record.schema_version, record.created_at, record.updated_at);
      return record;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): Step | undefined {
    const row = this.database.prepare("SELECT payload_json FROM steps WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], StepSchema);
  }
}
