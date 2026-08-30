import { z } from "zod";
import type { SQLInputValue } from "node:sqlite";
import {
  BackendDescriptorSchema,
  ModelDescriptorSchema,
  ProviderDescriptorSchema,
  RuntimeDescriptorSchema,
  ToolDescriptorSchema,
  type BackendDescriptor,
  type ModelDescriptor,
  type ProviderDescriptor,
  type RuntimeDescriptor,
  type ToolDescriptor,
} from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { json, readJson, sqliteError, updateChanged } from "./utils.js";

type RegistryDescriptor = RuntimeDescriptor | ProviderDescriptor | ModelDescriptor | BackendDescriptor | ToolDescriptor;
type DescriptorTable = "runtime_descriptors" | "provider_descriptors" | "model_descriptors" | "backend_descriptors" | "tool_descriptors";

type DescriptorCodec<TDescriptor extends RegistryDescriptor> = {
  readonly table: DescriptorTable;
  readonly schema: z.ZodType<TDescriptor, z.ZodTypeDef, unknown>;
  readonly columns: string;
  readonly values: (record: TDescriptor) => readonly SQLInputValue[];
  readonly updateValues: (record: TDescriptor) => readonly SQLInputValue[];
};

class RegistryRepository<TDescriptor extends RegistryDescriptor> {
  constructor(private readonly database: SqliteDatabase, private readonly codec: DescriptorCodec<TDescriptor>) {}

  create(record: TDescriptor): TDescriptor {
    const parsed = this.codec.schema.parse(record);
    try {
      this.database.prepare(`INSERT INTO ${this.codec.table}(${this.codec.columns}) VALUES (${placeholders(this.codec.columns)})`).run(...this.codec.values(parsed));
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): TDescriptor | undefined {
    const row = this.database.prepare(`SELECT payload_json, version FROM ${this.codec.table} WHERE workspace_id = ? AND id = ?`).get(workspaceId, id);
    return row === undefined ? undefined : this.withRevision(row["payload_json"], row["version"]);
  }

  list(workspaceId: string): readonly TDescriptor[] {
    const rows = this.database.prepare(`SELECT payload_json, version FROM ${this.codec.table} WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC`).all(workspaceId);
    return rows.map((row) => this.withRevision(row["payload_json"], row["version"]));
  }

  update(record: TDescriptor, expectedVersion: number): TDescriptor {
    const parsed = this.codec.schema.parse(record);
    const nextRevision = expectedVersion + 1;
    const updated = this.codec.schema.parse({ ...parsed, revision: nextRevision });
    const result = this.database.prepare(`UPDATE ${this.codec.table} SET ${this.updateColumns()}, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?`).run(
      ...this.codec.updateValues(updated),
      json(updated),
      updated.schema_version,
      updated.updated_at,
      updated.workspace_id,
      updated.id,
      expectedVersion,
    );
    updateChanged(result, "Registry descriptor");
    return updated;
  }

  private withRevision(payload: unknown, version: unknown): TDescriptor {
    const parsedVersion = typeof version === "bigint" ? Number(version) : version;
    if (typeof parsedVersion !== "number" || !Number.isSafeInteger(parsedVersion) || parsedVersion < 1) throw new Error("Registry descriptor revision is invalid");
    return this.codec.schema.parse({ ...readJson(payload, this.codec.schema), revision: parsedVersion });
  }

  private updateColumns(): string { return this.codec.columns.split(", ").filter((column) => !["id", "workspace_id", "payload_json", "schema_version", "created_at", "updated_at"].includes(column)).map((column) => `${column} = ?`).join(", "); }
}

export class RuntimeRepository extends RegistryRepository<RuntimeDescriptor> {
  constructor(database: SqliteDatabase) { super(database, runtimeCodec); }
}

export class ProviderRepository extends RegistryRepository<ProviderDescriptor> {
  constructor(database: SqliteDatabase) { super(database, providerCodec); }
}

export class ModelRepository extends RegistryRepository<ModelDescriptor> {
  constructor(database: SqliteDatabase) { super(database, modelCodec); }
}

export class BackendRepository extends RegistryRepository<BackendDescriptor> {
  constructor(database: SqliteDatabase) { super(database, backendCodec); }
}

export class ToolRepository extends RegistryRepository<ToolDescriptor> {
  constructor(database: SqliteDatabase) { super(database, toolCodec); }
}

const runtimeCodec: DescriptorCodec<RuntimeDescriptor> = {
  table: "runtime_descriptors",
  schema: RuntimeDescriptorSchema,
  columns: "id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, requested_provider, actual_provider, protocol_version, capabilities_json, health, enabled, execution_location, endpoint_ref, provider, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at",
  values: (record) => [record.id, record.workspace_id, record.name, record.kind, record.version, record.requested_version, record.actual_version, record.requested_provider, record.actual_provider, record.protocol_version, json(record.capabilities), record.health, record.enabled ? 1 : 0, record.execution_location, record.endpoint_ref, record.provider, record.data_classification, record.last_heartbeat_at, json(record), record.schema_version, record.created_at, record.updated_at],
  updateValues: (record) => [record.name, record.kind, record.version, record.requested_version, record.actual_version, record.requested_provider, record.actual_provider, record.protocol_version, json(record.capabilities), record.health, record.enabled ? 1 : 0, record.execution_location, record.endpoint_ref, record.provider, record.data_classification, record.last_heartbeat_at],
};

const providerCodec: DescriptorCodec<ProviderDescriptor> = {
  table: "provider_descriptors",
  schema: ProviderDescriptorSchema,
  columns: "id, workspace_id, name, kind, health, enabled, data_classification, region, model_ids_json, endpoint_ref, payload_json, schema_version, created_at, updated_at",
  values: (record) => [record.id, record.workspace_id, record.name, record.kind, record.health, record.enabled ? 1 : 0, record.data_classification, record.region, json(record.model_ids), record.endpoint_ref, json(record), record.schema_version, record.created_at, record.updated_at],
  updateValues: (record) => [record.name, record.kind, record.health, record.enabled ? 1 : 0, record.data_classification, record.region, json(record.model_ids), record.endpoint_ref],
};

const modelCodec: DescriptorCodec<ModelDescriptor> = {
  table: "model_descriptors",
  schema: ModelDescriptorSchema,
  columns: "id, workspace_id, provider_id, name, model_name, capabilities_json, context_window, cost_input, cost_output, health, enabled, data_classification, payload_json, schema_version, created_at, updated_at",
  values: (record) => [record.id, record.workspace_id, record.provider_id, record.name, record.model_name, json(record.capabilities), record.context_window, record.cost_per_million_input_tokens, record.cost_per_million_output_tokens, record.health, record.enabled ? 1 : 0, record.data_classification, json(record), record.schema_version, record.created_at, record.updated_at],
  updateValues: (record) => [record.provider_id, record.name, record.model_name, json(record.capabilities), record.context_window, record.cost_per_million_input_tokens, record.cost_per_million_output_tokens, record.health, record.enabled ? 1 : 0, record.data_classification],
};

const backendCodec: DescriptorCodec<BackendDescriptor> = {
  table: "backend_descriptors",
  schema: BackendDescriptorSchema,
  columns: "id, workspace_id, name, kind, execution_location, capabilities_json, health, enabled, data_classification, endpoint_ref, payload_json, schema_version, created_at, updated_at",
  values: (record) => [record.id, record.workspace_id, record.name, record.kind, record.execution_location, json(record.capabilities), record.health, record.enabled ? 1 : 0, record.data_classification, record.endpoint_ref, json(record), record.schema_version, record.created_at, record.updated_at],
  updateValues: (record) => [record.name, record.kind, record.execution_location, json(record.capabilities), record.health, record.enabled ? 1 : 0, record.data_classification, record.endpoint_ref],
};

const toolCodec: DescriptorCodec<ToolDescriptor> = {
  table: "tool_descriptors",
  schema: ToolDescriptorSchema,
  columns: "id, workspace_id, name, kind, descriptor_version, capabilities_json, risk_level, data_classification, health, enabled, requires_review, endpoint_ref, payload_json, schema_version, created_at, updated_at",
  values: (record) => [record.id, record.workspace_id, record.name, record.kind, record.version, json(record.capabilities), record.risk_level, record.data_classification, record.health, record.enabled ? 1 : 0, record.requires_review ? 1 : 0, record.endpoint_ref, json(record), record.schema_version, record.created_at, record.updated_at],
  updateValues: (record) => [record.name, record.kind, record.version, json(record.capabilities), record.risk_level, record.data_classification, record.health, record.enabled ? 1 : 0, record.requires_review ? 1 : 0, record.endpoint_ref],
};

function placeholders(columns: string): string {
  return columns.split(", ").map(() => "?").join(", ");
}
