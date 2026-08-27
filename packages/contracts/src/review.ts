import { z } from "zod";
import { MetadataSchema, TimestampSchema } from "./common.js";
import { createEventEnvelopeSchema } from "./envelope.js";
import { UlidSchema } from "./ids.js";
import { PayloadHashSchema, PolicyDecisionSchema, PolicyScopeSchema, RiskLevelSchema, RoleSchema } from "./policy.js";

const ReviewActorSchema = z.object({ type: z.enum(["system", "agent", "human", "connector"]), id: UlidSchema.nullable() }).strict();
const ReviewEventPayloadSchema = z
  .object({ review_id: UlidSchema, artifact_id: UlidSchema, artifact_version: z.number().int().positive(), review_version: z.number().int().positive(), payload_hash: PayloadHashSchema, risk_level: RiskLevelSchema, requested_scope: PolicyScopeSchema })
  .strict();

export const ReviewRequestSchema = MetadataSchema.extend({ artifact_id: UlidSchema, artifact_version: z.number().int().positive(), review_version: z.number().int().positive(), requested_scope: PolicyScopeSchema, payload_hash: PayloadHashSchema, risk_level: RiskLevelSchema, target_ref: z.string().min(1), reason: z.string().min(1), expires_at: TimestampSchema, requested_by: ReviewActorSchema, policy_decision: PolicyDecisionSchema }).strict();
export const ReviewDecisionSchema = MetadataSchema.extend({ artifact_id: UlidSchema, artifact_version: z.number().int().positive(), review_version: z.number().int().positive(), requested_scope: PolicyScopeSchema, expires_at: TimestampSchema, judge_result: z.enum(["pass", "fail", "needs_revision"]), human_decision: z.enum(["approved", "rejected", "changes_requested", "approved_with_edits", "pending"]), reviewer_id: UlidSchema, reviewer_role: RoleSchema, reason: z.string().min(1), approved_payload_hash: PayloadHashSchema.nullable(), risk_level: RiskLevelSchema, policy_decision: PolicyDecisionSchema }).strict().superRefine((decision, context) => {
  const approved = decision.human_decision === "approved" || decision.human_decision === "approved_with_edits";
  if (decision.approved_payload_hash !== null && !approved) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["approved_payload_hash"], message: "payload hash requires an approved decision" });
  }
  if (approved && decision.approved_payload_hash === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["approved_payload_hash"], message: "approval requires payload hash" });
  if (decision.risk_level === "R3" && approved) {
    if (decision.reviewer_role !== "Owner" && decision.reviewer_role !== "Reviewer") context.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewer_role"], message: "R3 approval requires Owner or Reviewer" });
    if (decision.approved_payload_hash === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["approved_payload_hash"], message: "R3 approval requires payload hash" });
  }
});
export const ReviewRequestedEventSchema = createEventEnvelopeSchema(ReviewEventPayloadSchema).refine((event) => event.event_type === "review.requested", "event type must be review.requested");
export const ReviewDecidedEventSchema = createEventEnvelopeSchema(ReviewEventPayloadSchema.extend({ human_decision: z.enum(["approved", "rejected", "changes_requested", "approved_with_edits"]), reviewer_id: UlidSchema })).refine((event) => event.event_type === "review.decided", "event type must be review.decided");

export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
export type ReviewRequestedEvent = z.infer<typeof ReviewRequestedEventSchema>;
export type ReviewDecidedEvent = z.infer<typeof ReviewDecidedEventSchema>;
