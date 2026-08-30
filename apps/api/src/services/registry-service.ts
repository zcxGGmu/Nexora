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
import { IdempotencyRepository, ModelRepository, BackendRepository, ProviderRepository, RuntimeRepository, ToolRepository, withTransaction, type SqliteDatabase } from "@nexora/persistence";
import { assertScope, type PolicyActor } from "@nexora/policy";
import { accepted, requestHash } from "./command-helpers.js";
import type { AcceptedCommand } from "./command-service.js";
import { ApiHttpError } from "./errors.js";

export type RegistryCommandServiceOptions = {
  readonly database: SqliteDatabase;
  readonly clock: { readonly now: () => string };
};

export class RegistryCommandService {
  private readonly idempotency: IdempotencyRepository;

  constructor(private readonly options: RegistryCommandServiceOptions) {
    this.idempotency = new IdempotencyRepository(options.database);
  }

  registerRuntime(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    return this.register(input, actor, idempotencyKey, RuntimeDescriptorSchema, new RuntimeRepository(this.options.database), "runtime_descriptor");
  }

  registerProvider(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    return this.register(input, actor, idempotencyKey, ProviderDescriptorSchema, new ProviderRepository(this.options.database), "provider_descriptor");
  }

  registerModel(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    return this.register(input, actor, idempotencyKey, ModelDescriptorSchema, new ModelRepository(this.options.database), "model_descriptor");
  }

  registerBackend(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    return this.register(input, actor, idempotencyKey, BackendDescriptorSchema, new BackendRepository(this.options.database), "backend_descriptor");
  }

  registerTool(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    return this.register(input, actor, idempotencyKey, ToolDescriptorSchema, new ToolRepository(this.options.database), "tool_descriptor");
  }

  updateRuntime(input: unknown, id: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    return this.update(input, id, actor, idempotencyKey, expectedVersion, RuntimeDescriptorSchema, new RuntimeRepository(this.options.database), "runtime_descriptor");
  }

  updateProvider(input: unknown, id: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    return this.update(input, id, actor, idempotencyKey, expectedVersion, ProviderDescriptorSchema, new ProviderRepository(this.options.database), "provider_descriptor");
  }

  updateModel(input: unknown, id: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    return this.update(input, id, actor, idempotencyKey, expectedVersion, ModelDescriptorSchema, new ModelRepository(this.options.database), "model_descriptor");
  }

  updateBackend(input: unknown, id: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    return this.update(input, id, actor, idempotencyKey, expectedVersion, BackendDescriptorSchema, new BackendRepository(this.options.database), "backend_descriptor");
  }

  updateTool(input: unknown, id: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    return this.update(input, id, actor, idempotencyKey, expectedVersion, ToolDescriptorSchema, new ToolRepository(this.options.database), "tool_descriptor");
  }

  private register<TDescriptor extends DescriptorInput>(input: unknown, actor: PolicyActor, idempotencyKey: string, schema: DescriptorSchema<TDescriptor>, repository: DescriptorRepository<TDescriptor>, objectType: DescriptorObjectType): AcceptedCommand {
    const descriptor = schema.parse(input);
    return withTransaction(this.options.database, () => {
      this.requireAdmin(actor, descriptor.workspace_id);
      this.ensureProviderReference(descriptor);
      const reservation = this.idempotency.reserveOrGet({ workspace_id: descriptor.workspace_id, idempotency_key: idempotencyKey, request_hash: requestHash(descriptor), resource_type: objectType, resource_id: descriptor.id, created_at: this.options.clock.now() });
      if (reservation.kind === "existing") return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: reservation.record.resource_id, workspace_id: descriptor.workspace_id });
      repository.create(descriptor);
      return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: descriptor.id, workspace_id: descriptor.workspace_id });
    });
  }

  private update<TDescriptor extends DescriptorInput>(input: unknown, id: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number, schema: DescriptorSchema<TDescriptor>, repository: DescriptorRepository<TDescriptor>, objectType: DescriptorObjectType): AcceptedCommand {
    const descriptor = schema.parse(input);
    if (descriptor.id !== id) throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Descriptor route id must match body id", retryable: false, required_action: "correct_request" });
    return withTransaction(this.options.database, () => {
      this.requireAdmin(actor, descriptor.workspace_id);
      const reservation = this.idempotency.reserveOrGet({ workspace_id: descriptor.workspace_id, idempotency_key: idempotencyKey, request_hash: requestHash({ descriptor, expected_version: expectedVersion }), resource_type: `${objectType}.update`, resource_id: descriptor.id, created_at: this.options.clock.now() });
      if (reservation.kind === "existing") return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: reservation.record.resource_id, workspace_id: descriptor.workspace_id });
      const current = repository.get(descriptor.workspace_id, id);
      if (current === undefined) throw notFound();
      if (descriptor.created_at !== current.created_at) throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Descriptor created_at is immutable", retryable: false, required_action: "preserve_created_at" });
      if (descriptor.revision !== expectedVersion) throw new ApiHttpError({ status_code: 409, code: "VERSION_CONFLICT", message: "Descriptor revision does not match If-Match", retryable: true, required_action: "refresh_state" });
      const candidate = schema.parse({ ...descriptor, updated_at: this.options.clock.now() });
      this.ensureProviderReference(descriptor);
      repository.update(candidate, expectedVersion);
      return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: candidate.id, workspace_id: candidate.workspace_id });
    });
  }

  private ensureProviderReference(descriptor: DescriptorInput): void {
    if (!("provider_id" in descriptor)) return;
    const provider = new ProviderRepository(this.options.database).get(descriptor.workspace_id, descriptor.provider_id);
    if (provider === undefined) throw notFound();
  }

  private requireAdmin(actor: PolicyActor, workspaceId: string): void {
    const decision = assertScope({ actor, action: "workspace:admin", enforcement_point: "api", requested_scope: { kind: "workspace", id: workspaceId } });
    if (!decision.allowed) throw new ApiHttpError({ status_code: 403, code: decision.code, message: decision.reason, retryable: false, required_action: decision.required_action });
  }
}

type DescriptorInput = RuntimeDescriptor | ProviderDescriptor | ModelDescriptor | BackendDescriptor | ToolDescriptor;
type DescriptorSchema<TDescriptor extends DescriptorInput> = { readonly parse: (input: unknown) => TDescriptor };
type DescriptorRepository<TDescriptor extends DescriptorInput> = { readonly create: (record: TDescriptor) => TDescriptor; readonly get: (workspaceId: string, id: string) => TDescriptor | undefined; readonly update: (record: TDescriptor, expectedVersion: number) => TDescriptor };
type DescriptorObjectType = "runtime_descriptor" | "provider_descriptor" | "model_descriptor" | "backend_descriptor" | "tool_descriptor";

function notFound(): ApiHttpError {
  return new ApiHttpError({ status_code: 404, code: "SCOPE_DENIED", message: "Resource not found", retryable: false, required_action: "check_scope" });
}
