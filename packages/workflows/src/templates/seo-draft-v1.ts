import { SeoDraftWorkflowDefinitionSchema } from "../definition.js";

export const SEO_DRAFT_WORKFLOW = SeoDraftWorkflowDefinitionSchema.parse({
  schema_version: 1,
  id: "seo_draft_v1",
  title: "SEO draft workflow with independent judge",
  trigger: { kind: "manual_or_schedule", required_scope: "site" },
  steps: [
    { id: "gsc_fixture", title: "GSC fixture", kind: "fixture", connector_id: "gsc.fixture", requires_review: false },
    { id: "opportunity", title: "Opportunity selector", kind: "transform", connector_id: null, requires_review: false },
    { id: "draft", title: "Draft writer", kind: "draft_writer", connector_id: "seo.draft_writer", requires_review: false },
    { id: "judge", title: "Independent Judge", kind: "judge", connector_id: "seo.independent_judge", requires_review: false },
    { id: "human_review", title: "Human Review", kind: "review_gate", connector_id: null, requires_review: true },
  ],
  quality_gates: ["source_data_present", "claims_have_sources", "no_invented_metrics", "canonical_url_present", "internal_links_checked"],
  failure_policy: { retry_failed_step_only: true, max_attempts: 3, on_unknown_side_effect: "reconcile", publish: "disabled" },
});
