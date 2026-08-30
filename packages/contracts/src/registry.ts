import { z } from "zod";
import { DataClassificationSchema, ExecutionLocationSchema, RiskLevelSchema } from "./policy.js";
import { TimestampSchema } from "./common.js";
import { UlidSchema, WorkspaceIdSchema } from "./ids.js";

export const DescriptorIdSchema = z.string().min(1).max(96).regex(/^[a-z][a-z0-9._-]*$/);
const DescriptorNameSchema = z.string().min(1).max(160);
const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
const CapabilitySchema = z.string().min(1).max(96).regex(/^[a-z][a-z0-9:._/-]*$/);
const HealthSchema = z.enum(["unknown", "healthy", "degraded", "offline"]);
const DescriptorRefSchema = z.string().min(1).max(512).regex(/^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/);

export const RuntimeKindSchema = z.enum(["hermes", "openclaw", "claude", "codex", "antigravity", "deterministic", "local", "remote"]);
export const ProviderKindSchema = z.enum(["nous_portal", "openrouter", "openai", "anthropic", "google", "xai", "ollama", "custom"]);
export const BackendKindSchema = z.enum(["local", "docker", "ssh", "singularity", "modal", "daytona", "vercel_sandbox", "custom"]);
export const ToolKindSchema = z.enum(["builtin", "connector", "mcp"]);

const DescriptorMetadataSchema = z.object({
  id: DescriptorIdSchema,
  workspace_id: WorkspaceIdSchema,
  schema_version: z.literal(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  revision: z.number().int().positive().default(1),
}).strict();

export const RuntimeDescriptorSchema = DescriptorMetadataSchema.extend({
  name: DescriptorNameSchema,
  kind: RuntimeKindSchema,
  version: SemverSchema,
  requested_version: SemverSchema.nullable().default(null),
  actual_version: SemverSchema.nullable().default(null),
  requested_provider: z.string().min(1).max(128).nullable().default(null),
  actual_provider: z.string().min(1).max(128).nullable().default(null),
  protocol_version: z.literal(1),
  capabilities: z.array(CapabilitySchema).min(1).max(128),
  health: HealthSchema,
  enabled: z.boolean(),
  execution_location: ExecutionLocationSchema,
  endpoint_ref: DescriptorRefSchema.nullable(),
  provider: z.string().min(1).max(128).nullable(),
  data_classification: DataClassificationSchema,
  last_heartbeat_at: TimestampSchema.nullable(),
}).strict();

export const ProviderDescriptorSchema = DescriptorMetadataSchema.extend({
  name: DescriptorNameSchema,
  kind: ProviderKindSchema,
  health: HealthSchema,
  enabled: z.boolean(),
  data_classification: DataClassificationSchema,
  region: z.string().min(1).max(128),
  model_ids: z.array(DescriptorIdSchema).max(256),
  endpoint_ref: z.string().regex(/^secret:\/\/[^\s]+$/).max(512),
}).strict();

export const ModelDescriptorSchema = DescriptorMetadataSchema.extend({
  provider_id: DescriptorIdSchema,
  name: DescriptorNameSchema,
  model_name: z.string().min(1).max(256),
  capabilities: z.array(CapabilitySchema).min(1).max(128),
  context_window: z.number().int().positive().max(10_000_000),
  cost_per_million_input_tokens: z.number().finite().nonnegative().max(1_000_000),
  cost_per_million_output_tokens: z.number().finite().nonnegative().max(1_000_000),
  health: HealthSchema,
  enabled: z.boolean(),
  data_classification: DataClassificationSchema,
}).strict();

export const BackendDescriptorSchema = DescriptorMetadataSchema.extend({
  name: DescriptorNameSchema,
  kind: BackendKindSchema,
  execution_location: ExecutionLocationSchema,
  capabilities: z.array(CapabilitySchema).min(1).max(128),
  health: HealthSchema,
  enabled: z.boolean(),
  data_classification: DataClassificationSchema,
  endpoint_ref: DescriptorRefSchema.nullable(),
}).strict();

export const ToolDescriptorSchema = DescriptorMetadataSchema.extend({
  name: DescriptorNameSchema,
  kind: ToolKindSchema,
  version: SemverSchema,
  capabilities: z.array(CapabilitySchema).min(1).max(128),
  risk_level: RiskLevelSchema,
  data_classification: DataClassificationSchema,
  health: HealthSchema,
  enabled: z.boolean(),
  requires_review: z.boolean(),
  endpoint_ref: DescriptorRefSchema.nullable(),
}).strict();

export const RegistryDescriptorTypeSchema = z.enum(["runtime", "provider", "model", "backend", "tool"]);

export const RegistryCatalogSchema = z.object({
  schema_version: z.literal(1),
  workspace_id: WorkspaceIdSchema,
  runtimes: z.array(RuntimeDescriptorSchema),
  providers: z.array(ProviderDescriptorSchema),
  models: z.array(ModelDescriptorSchema),
  backends: z.array(BackendDescriptorSchema),
  tools: z.array(ToolDescriptorSchema),
}).strict();

export type RuntimeKind = z.infer<typeof RuntimeKindSchema>;
export type ProviderKind = z.infer<typeof ProviderKindSchema>;
export type BackendKind = z.infer<typeof BackendKindSchema>;
export type ToolKind = z.infer<typeof ToolKindSchema>;
export type DescriptorHealth = z.infer<typeof HealthSchema>;
export type RuntimeDescriptor = z.infer<typeof RuntimeDescriptorSchema>;
export type ProviderDescriptor = z.infer<typeof ProviderDescriptorSchema>;
export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;
export type BackendDescriptor = z.infer<typeof BackendDescriptorSchema>;
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;
export type RegistryDescriptorType = z.infer<typeof RegistryDescriptorTypeSchema>;
export type RegistryCatalog = z.infer<typeof RegistryCatalogSchema>;

export function descriptorId(value: string): string {
  return DescriptorIdSchema.parse(value);
}

export function workspaceId(value: string): string {
  return UlidSchema.parse(value);
}
