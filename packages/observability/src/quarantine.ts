import { ConnectorQuarantineRecordSchema, type ConnectorQuarantineRecord, type PolicyRole } from "@nexora/contracts";
import { withTransaction, type SqliteDatabase } from "@nexora/persistence";

export type QuarantineInput = {
  readonly id: string;
  readonly workspace_id: string;
  readonly connector_id: string;
  readonly connector_version: string;
  readonly reason: string;
  readonly actor_id: string;
  readonly created_at: string;
};

export type ReleaseInput = {
  readonly workspace_id: string;
  readonly connector_id: string;
  readonly connector_version: string;
  readonly actor_id: string;
  readonly actor_role: PolicyRole;
  readonly reason: string;
  readonly released_at: string;
};

export class ConnectorQuarantineService {
  constructor(private readonly database: SqliteDatabase) {}

  quarantine(input: QuarantineInput): ConnectorQuarantineRecord {
    const record = ConnectorQuarantineRecordSchema.parse({
      id: input.id,
      workspace_id: input.workspace_id,
      schema_version: 1,
      created_at: input.created_at,
      updated_at: input.created_at,
      connector_id: input.connector_id,
      connector_version: input.connector_version,
      status: "active",
      reason: input.reason,
      quarantined_by: input.actor_id,
      released_by: null,
      release_reason: null,
      released_at: null,
    });
    return withTransaction(this.database, () => {
      const current = this.active(input.workspace_id, input.connector_id, input.connector_version);
      if (current !== undefined) return current;
      this.database.prepare("INSERT INTO connector_quarantines(id, workspace_id, connector_id, connector_version, status, reason, quarantined_by, released_by, release_reason, released_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(record.id, record.workspace_id, record.connector_id, record.connector_version, record.status, record.reason, record.quarantined_by, record.released_by, record.release_reason, record.released_at, JSON.stringify(record), record.schema_version, record.created_at, record.updated_at);
      return record;
    });
  }

  active(workspaceId: string, connectorId: string, connectorVersion: string): ConnectorQuarantineRecord | undefined {
    const row = this.database.prepare("SELECT payload_json FROM connector_quarantines WHERE workspace_id = ? AND connector_id = ? AND connector_version = ? AND status = 'active'").get(workspaceId, connectorId, connectorVersion);
    return row === undefined ? undefined : ConnectorQuarantineRecordSchema.parse(JSON.parse(readText(row["payload_json"])));
  }

  release(input: ReleaseInput): ConnectorQuarantineRecord {
    if (input.actor_role !== "Owner") throw new ConnectorQuarantineError("Owner role is required to release connector quarantine");
    return withTransaction(this.database, () => {
      const current = this.active(input.workspace_id, input.connector_id, input.connector_version);
      if (current === undefined) throw new ConnectorQuarantineError("Active connector quarantine was not found");
      const released = ConnectorQuarantineRecordSchema.parse({ ...current, status: "released", released_by: input.actor_id, release_reason: input.reason, released_at: input.released_at, updated_at: input.released_at });
      const result = this.database.prepare("UPDATE connector_quarantines SET status = 'released', released_by = ?, release_reason = ?, released_at = ?, payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND status = 'active'")
        .run(released.released_by, released.release_reason, released.released_at, JSON.stringify(released), released.updated_at, released.workspace_id, released.id);
      if (result.changes !== 1 && result.changes !== 1n) throw new ConnectorQuarantineError("Connector quarantine release lost its update race");
      return released;
    });
  }
}

function readText(value: unknown): string {
  if (typeof value !== "string") throw new ConnectorQuarantineError("Expected text column");
  return value;
}

export class ConnectorQuarantineError extends Error {
  readonly name = "ConnectorQuarantineError";
}
