import { z } from "@nexora/contracts";

export const SeoDraftQualityGateSchema = z.enum(["source_data_present", "claims_have_sources", "no_invented_metrics", "canonical_url_present", "internal_links_checked"]);
export const SeoDraftWorkflowStepSchema = z
  .object({
    id: z.enum(["gsc_fixture", "opportunity", "draft", "judge", "human_review"]),
    title: z.string().min(1),
    kind: z.enum(["fixture", "transform", "draft_writer", "judge", "review_gate"]),
    connector_id: z.string().min(1).nullable(),
    requires_review: z.boolean(),
  })
  .strict();

export const SeoDraftWorkflowDefinitionSchema = z
  .object({
    schema_version: z.literal(1),
    id: z.literal("seo_draft_v1"),
    title: z.string().min(1),
    trigger: z.object({ kind: z.literal("manual_or_schedule"), required_scope: z.literal("site") }).strict(),
    steps: z.array(SeoDraftWorkflowStepSchema).length(5),
    quality_gates: z.array(SeoDraftQualityGateSchema).length(5),
    failure_policy: z
      .object({
        retry_failed_step_only: z.literal(true),
        max_attempts: z.literal(3),
        on_unknown_side_effect: z.literal("reconcile"),
        publish: z.literal("disabled"),
      })
      .strict(),
  })
  .strict();

export type SeoDraftQualityGate = z.infer<typeof SeoDraftQualityGateSchema>;
export type SeoDraftWorkflowStep = z.infer<typeof SeoDraftWorkflowStepSchema>;
export type SeoDraftWorkflowDefinition = z.infer<typeof SeoDraftWorkflowDefinitionSchema>;
