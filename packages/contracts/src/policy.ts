import { z } from "zod";
import { UlidSchema } from "./ids.js";

export const RoleSchema = z.enum(["Owner", "Operator", "Reviewer", "Viewer", "Agent"]);
export const PolicyActionSchema = z.enum(["workspace:admin", "run:read", "run:write", "memory:read", "memory:write", "artifact:read", "artifact:write", "connector:execute", "review:decide"]);
export const RiskLevelSchema = z.enum(["R0", "R1", "R2", "R3"]);
export const DataClassificationSchema = z.enum(["public", "internal", "confidential", "restricted"]);
export const ExecutionLocationSchema = z.enum(["local", "remote"]);
export const EnforcementPointSchema = z.enum(["api", "worker", "connector"]);
export const PolicyEventTypeSchema = z.enum(["scope.denied", "policy.denied", "secret.redacted"]);
export const PolicyDenialCodeSchema = z.enum(["SCOPE_DENIED", "POLICY_DENIED", "POLICY_REVIEW_REQUIRED"]);
export const PayloadHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const PolicyScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workspace"), id: UlidSchema }).strict(),
  z.object({ kind: z.literal("run"), id: UlidSchema }).strict(),
  z.object({ kind: z.literal("ticket"), id: UlidSchema }).strict(),
  z.object({ kind: z.literal("site"), id: z.string().min(1) }).strict(),
]);
export const EgressPolicySchema = z.object({ execution_location: ExecutionLocationSchema, provider: z.string().min(1), region: z.string().min(1), allowed_providers: z.array(z.string().min(1)), allowed_regions: z.array(z.string().min(1)), minimal_snapshot_required: z.boolean() }).strict();
export const PolicyDecisionSchema = z.object({ allowed: z.boolean(), code: PolicyDenialCodeSchema.nullable(), event_type: PolicyEventTypeSchema.nullable(), reason: z.string().min(1), required_action: z.string().min(1), redactions: z.array(z.string().min(1)) }).strict();

export type PolicyRole = z.infer<typeof RoleSchema>;
export type PolicyAction = z.infer<typeof PolicyActionSchema>;
export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type DataClassification = z.infer<typeof DataClassificationSchema>;
export type ExecutionLocation = z.infer<typeof ExecutionLocationSchema>;
export type EnforcementPoint = z.infer<typeof EnforcementPointSchema>;
export type PolicyEventType = z.infer<typeof PolicyEventTypeSchema>;
export type PolicyDenialCode = z.infer<typeof PolicyDenialCodeSchema>;
export type PayloadHash = z.infer<typeof PayloadHashSchema>;
export type PolicyScope = z.infer<typeof PolicyScopeSchema>;
export type EgressPolicy = z.infer<typeof EgressPolicySchema>;
export type PolicyDecisionRecord = z.infer<typeof PolicyDecisionSchema>;
