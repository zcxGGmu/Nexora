import { describe, expect, it } from "vitest";
import {
  BackendDescriptorSchema,
  ModelDescriptorSchema,
  ProviderDescriptorSchema,
  RuntimeDescriptorSchema,
  ToolDescriptorSchema,
} from "./registry.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-30T04:00:00.000Z";

describe("C17/C18 registry contracts", () => {
  it("parses a runtime descriptor with capability and health facts", () => {
    const descriptor = RuntimeDescriptorSchema.parse({
      id: "runtime-hermes-local",
      workspace_id: WORKSPACE_ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      name: "Hermes local",
      kind: "hermes",
      version: "0.20.6",
      protocol_version: 1,
      capabilities: ["tool_calling", "skills", "cron"],
      health: "healthy",
      enabled: true,
      execution_location: "local",
      endpoint_ref: null,
      provider: "nous_portal",
      data_classification: "internal",
      last_heartbeat_at: TIME,
    });

    expect(descriptor.kind).toBe("hermes");
    expect(descriptor.capabilities).toContain("skills");
  });

  it("rejects an unsupported runtime protocol version", () => {
    const result = RuntimeDescriptorSchema.safeParse({
      id: "runtime-invalid",
      workspace_id: WORKSPACE_ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      name: "Invalid",
      kind: "local",
      version: "1.0.0",
      protocol_version: 2,
      capabilities: ["tool_calling"],
      health: "unknown",
      enabled: false,
      execution_location: "local",
      endpoint_ref: null,
      provider: null,
      data_classification: "internal",
      last_heartbeat_at: null,
    });

    expect(result.success).toBe(false);
  });

  it("records requested and actual runtime resolution facts", () => {
    const result = RuntimeDescriptorSchema.parse({
      id: "runtime-hermes-resolved",
      workspace_id: WORKSPACE_ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      name: "Hermes resolved",
      kind: "hermes",
      version: "0.20.6",
      requested_version: "0.20.5",
      actual_version: "0.20.6",
      requested_provider: "nous_portal",
      actual_provider: "openrouter",
      protocol_version: 1,
      capabilities: ["tool_calling"],
      health: "healthy",
      enabled: true,
      execution_location: "local",
      endpoint_ref: null,
      provider: "nous_portal",
      data_classification: "internal",
      last_heartbeat_at: TIME,
    });

    expect(result.requested_version).toBe("0.20.5");
    expect(result.actual_version).toBe("0.20.6");
    expect(result.requested_provider).toBe("nous_portal");
    expect(result.actual_provider).toBe("openrouter");
  });

  it("rejects malformed requested or actual runtime versions", () => {
    const result = RuntimeDescriptorSchema.safeParse({
      id: "runtime-invalid-resolution",
      workspace_id: WORKSPACE_ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      name: "Invalid resolution",
      kind: "local",
      version: "1.0.0",
      requested_version: "latest",
      actual_version: null,
      requested_provider: null,
      actual_provider: null,
      protocol_version: 1,
      capabilities: ["tool_calling"],
      health: "unknown",
      enabled: false,
      execution_location: "local",
      endpoint_ref: null,
      provider: null,
      data_classification: "internal",
      last_heartbeat_at: null,
    });

    expect(result.success).toBe(false);
  });

  it("rejects plaintext endpoint references that could contain secrets", () => {
    const result = ProviderDescriptorSchema.safeParse({
      id: "provider-unsafe",
      workspace_id: WORKSPACE_ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      name: "Unsafe provider",
      kind: "custom",
      health: "unknown",
      enabled: false,
      data_classification: "restricted",
      region: "local",
      model_ids: [],
      endpoint_ref: "sk-live-plaintext-secret",
    });

    expect(result.success).toBe(false);
  });

  it("parses provider, model, backend, and tool catalog descriptors", () => {
    const provider = ProviderDescriptorSchema.parse({
      id: "provider-openrouter",
      workspace_id: WORKSPACE_ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      name: "OpenRouter",
      kind: "openrouter",
      health: "healthy",
      enabled: true,
      data_classification: "confidential",
      region: "us",
      model_ids: ["model-hermes-llama"],
      endpoint_ref: "secret://providers/openrouter",
    });
    const model = ModelDescriptorSchema.parse({
      id: "model-hermes-llama",
      workspace_id: WORKSPACE_ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      provider_id: provider.id,
      name: "Hermes Llama",
      model_name: "nousresearch/hermes-3-llama-3.1-405b",
      capabilities: ["reasoning", "tool_calling"],
      context_window: 131072,
      cost_per_million_input_tokens: 0,
      cost_per_million_output_tokens: 0,
      health: "healthy",
      enabled: true,
      data_classification: "confidential",
    });
    const backend = BackendDescriptorSchema.parse({
      id: "backend-local",
      workspace_id: WORKSPACE_ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      name: "Local process",
      kind: "local",
      execution_location: "local",
      capabilities: ["subprocess", "filesystem"],
      health: "healthy",
      enabled: true,
      data_classification: "internal",
      endpoint_ref: null,
    });
    const tool = ToolDescriptorSchema.parse({
      id: "tool-memory-read",
      workspace_id: WORKSPACE_ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      name: "Memory read",
      kind: "builtin",
      version: "1.0.0",
      capabilities: ["memory:read"],
      risk_level: "R0",
      data_classification: "internal",
      health: "healthy",
      enabled: true,
      requires_review: false,
      endpoint_ref: null,
    });

    expect(model.provider_id).toBe(provider.id);
    expect(backend.execution_location).toBe("local");
    expect(tool.capabilities).toEqual(["memory:read"]);
  });
});
