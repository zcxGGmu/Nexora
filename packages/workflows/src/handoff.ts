import { TimestampSchema, UlidSchema, z } from "@nexora/contracts";

export const SeoDraftHandoffSchema = z
  .object({
    workflow_id: z.literal("seo_draft_v1"),
    run_id: UlidSchema,
    artifact_id: UlidSchema,
    artifact_version: z.number().int().positive(),
    review_id: UlidSchema,
    review_version: z.number().int().positive(),
    expires_at: TimestampSchema,
    publish_disabled: z.literal(true),
    required_action: z.literal("human_review"),
  })
  .strict();

export type SeoDraftHandoff = z.infer<typeof SeoDraftHandoffSchema>;

export function createSeoDraftHandoff(input: Omit<SeoDraftHandoff, "workflow_id" | "publish_disabled" | "required_action">): SeoDraftHandoff {
  return SeoDraftHandoffSchema.parse({ ...input, workflow_id: "seo_draft_v1", publish_disabled: true, required_action: "human_review" });
}
