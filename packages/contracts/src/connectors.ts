import { z } from "zod";
import { RetryPolicySchema } from "./common.js";
const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
export const ConnectorDescriptorSchema = z.object({ id: z.string().min(1), version: SemverSchema, risk_level: z.enum(["R0", "R1", "R2", "R3"]), data_classification: z.enum(["public", "internal", "confidential", "restricted"]), input_schema: z.object({ schema_version: z.literal(1), name: z.string().min(1) }).strict(), output_schema: z.object({ schema_version: z.literal(1), name: z.string().min(1) }).strict(), supports_idempotency: z.boolean(), supports_dry_run: z.boolean(), timeout_seconds: z.number().finite().positive().max(86400), retry: RetryPolicySchema, rollback: z.enum(["supported", "unsupported", "compensating"]), requires_review: z.boolean() }).strict();
export type ConnectorDescriptor = z.infer<typeof ConnectorDescriptorSchema>;
