import { z } from "zod";
import { MetadataSchema } from "./common.js";
import { UlidSchema } from "./ids.js";
import { PayloadHashSchema, PolicyDecisionSchema, RiskLevelSchema, RoleSchema } from "./policy.js";
export const ReviewDecisionSchema = MetadataSchema.extend({ artifact_id: UlidSchema, artifact_version: z.number().int().positive(), review_version: z.number().int().positive(), judge_result: z.enum(["pass", "fail", "needs_revision"]), human_decision: z.enum(["approved", "rejected", "changes_requested", "approved_with_edits", "pending"]), reviewer_id: UlidSchema, reviewer_role: RoleSchema, reason: z.string().min(1), approved_payload_hash: PayloadHashSchema.nullable(), risk_level: RiskLevelSchema, policy_decision: PolicyDecisionSchema }).strict().superRefine((decision, context) => {
  const approved = decision.human_decision === "approved" || decision.human_decision === "approved_with_edits";
  if (decision.approved_payload_hash !== null && !approved) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["approved_payload_hash"], message: "payload hash requires an approved decision" });
  }
  if (decision.risk_level === "R3" && approved) {
    if (decision.reviewer_role !== "Owner" && decision.reviewer_role !== "Reviewer") context.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewer_role"], message: "R3 approval requires Owner or Reviewer" });
    if (decision.approved_payload_hash === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["approved_payload_hash"], message: "R3 approval requires payload hash" });
  }
});
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
