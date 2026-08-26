import { z } from "zod";
import { RetryPolicySchema } from "./common.js";
import { DataClassificationSchema, EgressPolicySchema, PolicyScopeSchema, RiskLevelSchema } from "./policy.js";
const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
export const ConnectorDescriptorSchema = z.object({ id: z.string().min(1), version: SemverSchema, risk_level: RiskLevelSchema, data_classification: DataClassificationSchema, allowed_scopes: z.array(PolicyScopeSchema).min(1), egress: EgressPolicySchema, input_schema: z.object({ schema_version: z.literal(1), name: z.string().min(1) }).strict(), output_schema: z.object({ schema_version: z.literal(1), name: z.string().min(1) }).strict(), supports_idempotency: z.boolean(), supports_dry_run: z.boolean(), timeout_seconds: z.number().finite().positive().max(86400), retry: RetryPolicySchema, rollback: z.enum(["supported", "unsupported", "compensating"]), requires_review: z.boolean() }).strict();
export type ConnectorDescriptor = z.infer<typeof ConnectorDescriptorSchema>;
