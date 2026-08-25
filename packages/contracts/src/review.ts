import { z } from "zod";
import { MetadataSchema } from "./common.js";
import { UlidSchema } from "./ids.js";
export const ReviewDecisionSchema = MetadataSchema.extend({ artifact_id: UlidSchema, artifact_version: z.number().int().positive(), review_version: z.number().int().positive(), judge_result: z.enum(["pass", "fail", "needs_revision"]), human_decision: z.enum(["approved", "rejected", "changes_requested", "approved_with_edits", "pending"]), reviewer_id: UlidSchema, reason: z.string().min(1), approved_payload_hash: z.string().min(1).nullable() }).strict();
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
