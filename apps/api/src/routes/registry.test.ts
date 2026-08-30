import { describe, expect, it } from "vitest";
import { createLocalBearerToken } from "../plugins/auth.js";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, TOKEN_SECRET } from "./test-fixtures.js";

const TIME = "2026-08-30T04:00:00.000Z";

describe("Control API registry", () => {
  it("registers a runtime descriptor and returns the unified catalog", async () => {
    const fixture = createControlFixture();
    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: "/v1/registry/runtimes",
        headers: { authorization: ownerHeader(), "idempotency-key": "registry:runtime:hermes" },
        payload: {
          id: "runtime-hermes-local",
          workspace_id: IDS.workspace,
          schema_version: 1,
          created_at: TIME,
          updated_at: TIME,
          name: "Hermes local",
          kind: "hermes",
          version: "0.20.6",
          protocol_version: 1,
          capabilities: ["skills", "tool_calling"],
          health: "healthy",
          enabled: true,
          execution_location: "local",
          endpoint_ref: null,
          provider: "nous_portal",
          data_classification: "internal",
          last_heartbeat_at: TIME,
        },
      });
      const catalog = await fixture.api.inject({ method: "GET", url: `/v1/registry?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({ object_type: "runtime_descriptor", object_id: "runtime-hermes-local", status_url: "/v1/registry/runtimes/runtime-hermes-local?workspace_id=01ARZ3NDEKTSV4RRFFQ69G5FAV" });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json()).toMatchObject({ schema_version: 1, runtimes: [{ id: "runtime-hermes-local", kind: "hermes" }], providers: [], backends: [], tools: [] });
      const detail = await fixture.api.inject({ method: "GET", url: "/v1/registry/runtimes/runtime-hermes-local?workspace_id=01ARZ3NDEKTSV4RRFFQ69G5FAV", headers: { authorization: ownerHeader() } });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ runtime: { id: "runtime-hermes-local", kind: "hermes" } });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("registers provider, model, backend, and tool descriptors in one catalog", async () => {
    const fixture = createControlFixture();
    const common = { workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME };
    try {
      const requests = [
        { path: "providers", key: "provider", payload: { ...common, id: "provider-openrouter", name: "OpenRouter", kind: "openrouter", health: "healthy", enabled: true, data_classification: "confidential", region: "us", model_ids: ["model-hermes"], endpoint_ref: "secret://providers/openrouter" } },
        { path: "models", key: "model", payload: { ...common, id: "model-hermes", provider_id: "provider-openrouter", name: "Hermes Llama", model_name: "nousresearch/hermes", capabilities: ["reasoning"], context_window: 131072, cost_per_million_input_tokens: 0, cost_per_million_output_tokens: 0, health: "healthy", enabled: true, data_classification: "confidential" } },
        { path: "backends", key: "backend", payload: { ...common, id: "backend-local", name: "Local", kind: "local", execution_location: "local", capabilities: ["subprocess"], health: "healthy", enabled: true, data_classification: "internal", endpoint_ref: null } },
        { path: "tools", key: "tool", payload: { ...common, id: "tool-memory-read", name: "Memory read", kind: "builtin", version: "1.0.0", capabilities: ["memory:read"], risk_level: "R0", data_classification: "internal", health: "healthy", enabled: true, requires_review: false, endpoint_ref: null } },
      ] as const;
      for (const [index, request] of requests.entries()) {
        const response = await fixture.api.inject({ method: "POST", url: `/v1/registry/${request.path}`, headers: { authorization: ownerHeader(), "idempotency-key": `registry:${request.path}:${index}` }, payload: request.payload });
        expect(response.statusCode).toBe(202);
      }
      const catalog = await fixture.api.inject({ method: "GET", url: `/v1/registry?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json()).toMatchObject({ providers: [{ id: "provider-openrouter" }], models: [{ id: "model-hermes", provider_id: "provider-openrouter" }], backends: [{ id: "backend-local" }], tools: [{ id: "tool-memory-read" }] });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("replays the same registration idempotently and cannot read another workspace", async () => {
    const fixture = createControlFixture();
    const payload = { id: "runtime-hermes-replay", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, name: "Hermes replay", kind: "hermes", version: "0.20.6", protocol_version: 1, capabilities: ["tool_calling"], health: "healthy", enabled: true, execution_location: "local", endpoint_ref: null, provider: null, data_classification: "internal", last_heartbeat_at: TIME };
    try {
      const headers = { authorization: ownerHeader(), "idempotency-key": "registry:runtime:replay" };
      const first = await fixture.api.inject({ method: "POST", url: "/v1/registry/runtimes", headers, payload });
      const second = await fixture.api.inject({ method: "POST", url: "/v1/registry/runtimes", headers, payload });
      const otherWorkspace = await fixture.api.inject({ method: "GET", url: `/v1/registry?workspace_id=${IDS.otherWorkspace}`, headers: { authorization: ownerHeader(IDS.otherWorkspace) } });

      expect(first.statusCode).toBe(202);
      expect(second.statusCode).toBe(202);
      expect(second.json()).toMatchObject({ object_id: "runtime-hermes-replay" });
      expect(otherWorkspace.statusCode).toBe(200);
      expect(otherWorkspace.json().runtimes).toEqual([]);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("denies registry registration to a viewer role", async () => {
    const fixture = createControlFixture();
    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: "/v1/registry/runtimes",
        headers: { authorization: createLocalBearerToken({ workspace_id: IDS.workspace, actor_id: IDS.owner, role: "Viewer", tokenSecret: TOKEN_SECRET }), "idempotency-key": "registry:runtime:viewer" },
        payload: { schema_version: 1, workspace_id: IDS.workspace, id: "runtime-viewer", name: "Viewer", kind: "local", version: "1.0.0", protocol_version: 1, capabilities: ["tool_calling"], health: "unknown", enabled: false, execution_location: "local", endpoint_ref: null, provider: null, data_classification: "internal", last_heartbeat_at: null, created_at: TIME, updated_at: TIME },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "SCOPE_DENIED" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("updates a runtime with If-Match and rejects a stale version", async () => {
    const fixture = createControlFixture();
    const payload = { id: "runtime-hermes-versioned", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, name: "Hermes versioned", kind: "hermes", version: "0.20.6", requested_version: "0.20.5", actual_version: "0.20.6", requested_provider: "nous_portal", actual_provider: "openrouter", protocol_version: 1, capabilities: ["tool_calling"], health: "healthy", enabled: true, execution_location: "local", endpoint_ref: null, provider: "nous_portal", data_classification: "internal", last_heartbeat_at: TIME } as const;
    try {
      const create = await fixture.api.inject({ method: "POST", url: "/v1/registry/runtimes", headers: { authorization: ownerHeader(), "idempotency-key": "registry:runtime:versioned:create" }, payload });
      expect(create.statusCode).toBe(202);
      const update = await fixture.api.inject({ method: "PUT", url: `/v1/registry/runtimes/${payload.id}`, headers: { authorization: ownerHeader(), "idempotency-key": "registry:runtime:versioned:update", "if-match": "1" }, payload: { ...payload, health: "degraded", actual_version: "0.20.7" } });
      const replay = await fixture.api.inject({ method: "PUT", url: `/v1/registry/runtimes/${payload.id}`, headers: { authorization: ownerHeader(), "idempotency-key": "registry:runtime:versioned:update", "if-match": "1" }, payload: { ...payload, health: "degraded", actual_version: "0.20.7" } });
      const stale = await fixture.api.inject({ method: "PUT", url: `/v1/registry/runtimes/${payload.id}`, headers: { authorization: ownerHeader(), "idempotency-key": "registry:runtime:versioned:stale", "if-match": "1" }, payload: { ...payload, health: "offline" } });
      const current = await fixture.api.inject({ method: "GET", url: `/v1/registry/runtimes/${payload.id}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(update.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: "VERSION_CONFLICT" });
      expect(current.json()).toMatchObject({ runtime: { health: "degraded", actual_version: "0.20.7", revision: 2 } });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("rejects a changed payload for a reused update idempotency key", async () => {
    const fixture = createControlFixture();
    const payload = { id: "runtime-hermes-idempotency", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, name: "Hermes idempotency", kind: "hermes", version: "0.20.6", requested_version: null, actual_version: null, requested_provider: null, actual_provider: null, protocol_version: 1, capabilities: ["tool_calling"], health: "healthy", enabled: true, execution_location: "local", endpoint_ref: null, provider: null, data_classification: "internal", last_heartbeat_at: TIME } as const;
    try {
      await fixture.api.inject({ method: "POST", url: "/v1/registry/runtimes", headers: { authorization: ownerHeader(), "idempotency-key": "registry:runtime:idempotency:create" }, payload });
      const headers = { authorization: ownerHeader(), "idempotency-key": "registry:runtime:idempotency:update", "if-match": "1" };
      const first = await fixture.api.inject({ method: "PUT", url: `/v1/registry/runtimes/${payload.id}`, headers, payload: { ...payload, health: "degraded" } });
      const changed = await fixture.api.inject({ method: "PUT", url: `/v1/registry/runtimes/${payload.id}`, headers, payload: { ...payload, health: "offline" } });

      expect(first.statusCode).toBe(202);
      expect(changed.statusCode).toBe(409);
      expect(changed.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("rejects model registration when its provider is not registered", async () => {
    const fixture = createControlFixture();
    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: "/v1/registry/models",
        headers: { authorization: ownerHeader(), "idempotency-key": "registry:model:missing-provider" },
        payload: { id: "model-orphan", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, provider_id: "provider-missing", name: "Orphan model", model_name: "example/model", capabilities: ["reasoning"], context_window: 4096, cost_per_million_input_tokens: 1, cost_per_million_output_tokens: 1, health: "unknown", enabled: false, data_classification: "internal" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "SCOPE_DENIED" });
    } finally {
      await closeControlFixture(fixture);
    }
  });
});
