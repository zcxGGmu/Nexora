import { z } from "zod";
import { MetadataSchema } from "./common.js";
import { PolicyActionSchema, PolicyScopeSchema, RoleSchema } from "./policy.js";
export const AgentProfileSchema = MetadataSchema.extend({ purpose: z.string().min(1), role: RoleSchema, allowed_scopes: z.array(PolicyScopeSchema).min(1), runtime: z.object({ kind: z.enum(["local", "remote"]), adapter: z.string().min(1) }).strict(), model_policy: z.object({ allowed_models: z.array(z.string().min(1)), default_model: z.string().min(1) }).strict(), memory_reads: z.array(z.object({ scope: z.string().min(1) }).strict()), tools: z.object({ allow: z.array(PolicyActionSchema), deny: z.array(PolicyActionSchema) }).strict(), handoff_outputs: z.array(z.string()), requires_review: z.boolean(), quality_gates: z.array(z.string()) }).strict();
export type AgentProfile = z.infer<typeof AgentProfileSchema>;
