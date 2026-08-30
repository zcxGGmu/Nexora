import { describe, expect, it } from "vitest";
import {
  BackendDescriptorSchema,
  ProviderDescriptorSchema,
  RuntimeDescriptorSchema,
  ToolDescriptorSchema,
} from "@nexora/contracts";
import { migrate, openDatabase } from "../index.js";
import { BackendRepository, ProviderRepository, RuntimeRepository, ToolRepository, WorkspaceRepository } from "./index.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-30T04:00:00.000Z";
const meta = { id: "runtime-hermes-local", workspace_id: WORKSPACE_ID, schema_version: 1 as const, created_at: TIME, updated_at: TIME };

describe("registry repositories", () => {
  it("persists and lists workspace-scoped runtime and catalog descriptors", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    new WorkspaceRepository(database).create({ id: WORKSPACE_ID, name: "Demo", schema_version: 1, created_at: TIME, updated_at: TIME });
    const runtime = RuntimeDescriptorSchema.parse({ ...meta, name: "Hermes local", kind: "hermes", version: "0.20.6", protocol_version: 1, capabilities: ["skills"], health: "healthy", enabled: true, execution_location: "local", endpoint_ref: null, provider: "nous_portal", data_classification: "internal", last_heartbeat_at: TIME });
    const provider = ProviderDescriptorSchema.parse({ ...meta, id: "provider-openrouter", name: "OpenRouter", kind: "openrouter", health: "healthy", enabled: true, data_classification: "confidential", region: "us", model_ids: [], endpoint_ref: "secret://providers/openrouter" });
    const backend = BackendDescriptorSchema.parse({ ...meta, id: "backend-local", name: "Local process", kind: "local", execution_location: "local", capabilities: ["subprocess"], health: "healthy", enabled: true, data_classification: "internal", endpoint_ref: null });
    const tool = ToolDescriptorSchema.parse({ ...meta, id: "tool-memory-read", name: "Memory read", kind: "builtin", version: "1.0.0", capabilities: ["memory:read"], risk_level: "R0", data_classification: "internal", health: "healthy", enabled: true, requires_review: false, endpoint_ref: null });

    expect(new RuntimeRepository(database).create(runtime)).toEqual(runtime);
    expect(new ProviderRepository(database).create(provider)).toEqual(provider);
    expect(new BackendRepository(database).create(backend)).toEqual(backend);
    expect(new ToolRepository(database).create(tool)).toEqual(tool);
    expect(new RuntimeRepository(database).get(WORKSPACE_ID, runtime.id)).toEqual(runtime);
    expect(new ProviderRepository(database).list(WORKSPACE_ID)).toEqual([provider]);
    expect(new BackendRepository(database).list(WORKSPACE_ID)).toEqual([backend]);
    expect(new ToolRepository(database).list(WORKSPACE_ID)).toEqual([tool]);
    database.close();
  });

  it("rejects a duplicate descriptor and enforces optimistic update versions", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    new WorkspaceRepository(database).create({ id: WORKSPACE_ID, name: "Demo", schema_version: 1, created_at: TIME, updated_at: TIME });
    const runtime = RuntimeDescriptorSchema.parse({ ...meta, name: "Hermes local", kind: "hermes", version: "0.20.6", protocol_version: 1, capabilities: ["skills"], health: "healthy", enabled: true, execution_location: "local", endpoint_ref: null, provider: "nous_portal", data_classification: "internal", last_heartbeat_at: TIME });
    const repository = new RuntimeRepository(database);
    repository.create(runtime);
    expect(() => repository.create(runtime)).toThrow();
    expect(() => repository.update({ ...runtime, health: "degraded", updated_at: "2026-08-30T04:01:00.000Z" }, 2)).toThrow();
    expect(repository.update({ ...runtime, health: "degraded", updated_at: "2026-08-30T04:01:00.000Z" }, 1).health).toBe("degraded");
    expect(repository.get(WORKSPACE_ID, runtime.id)?.revision).toBe(2);
    database.close();
  });

  it("allows the same descriptor id in separate workspaces", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    const workspaces = new WorkspaceRepository(database);
    workspaces.create({ id: WORKSPACE_ID, name: "Demo", schema_version: 1, created_at: TIME, updated_at: TIME });
    workspaces.create({ id: "01BRZ3NDEKTSV4RRFFQ69G5FAV", name: "Other", schema_version: 1, created_at: TIME, updated_at: TIME });
    const descriptor = (workspaceId: string) => RuntimeDescriptorSchema.parse({ ...meta, workspace_id: workspaceId, name: "Hermes local", kind: "hermes", version: "0.20.6", requested_version: null, actual_version: null, requested_provider: null, actual_provider: null, protocol_version: 1, capabilities: ["skills"], health: "healthy", enabled: true, execution_location: "local", endpoint_ref: null, provider: "nous_portal", data_classification: "internal", last_heartbeat_at: TIME });
    const repository = new RuntimeRepository(database);

    repository.create(descriptor(WORKSPACE_ID));
    repository.create(descriptor("01BRZ3NDEKTSV4RRFFQ69G5FAV"));

    expect(repository.list(WORKSPACE_ID)).toHaveLength(1);
    expect(repository.list("01BRZ3NDEKTSV4RRFFQ69G5FAV")).toHaveLength(1);
    database.close();
  });
});
