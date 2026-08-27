import { z } from "zod";
import { PolicyActionSchema, UlidSchema, WorkspaceIdSchema } from "@nexora/contracts";
import { assertScope, type PolicyActor } from "@nexora/policy";
import { ApiHttpError } from "../services/errors.js";

export const WorkspaceQuerySchema = z.object({ workspace_id: WorkspaceIdSchema }).strict();
export const IdParamsSchema = z.object({ id: UlidSchema }).strict();
export const RunParamsSchema = z.object({ id: UlidSchema, action: z.enum(["pause", "resume", "retry", "cancel"]).optional() }).strict();
export const EventQuerySchema = z.object({ workspace_id: WorkspaceIdSchema, after: z.string().min(1).optional(), limit: z.coerce.number().int().min(1).max(1000).default(100), step_id: UlidSchema.optional() }).strict();
export const VersionedArtifactQuerySchema = WorkspaceQuerySchema.extend({ version: z.coerce.number().int().positive().default(1) }).strict();
export const VersionedReviewQuerySchema = WorkspaceQuerySchema.extend({ review_version: z.coerce.number().int().positive().default(1) }).strict();

export function requireQueryScope(actor: PolicyActor, action: z.infer<typeof PolicyActionSchema>, workspaceId: string): void {
  const decision = assertScope({ actor, action: PolicyActionSchema.parse(action), enforcement_point: "api", requested_scope: { kind: "workspace", id: WorkspaceIdSchema.parse(workspaceId) } });
  if (!decision.allowed) throw new ApiHttpError({ status_code: 403, code: decision.code, message: decision.reason, retryable: false, required_action: decision.required_action });
}
