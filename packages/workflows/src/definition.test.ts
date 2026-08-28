import { describe, expect, it } from "vitest";

import { SEO_DRAFT_WORKFLOW, SeoDraftWorkflowDefinitionSchema } from "./index.js";

describe("C12 SEO workflow definition", () => {
  it("Given the seo_draft_v1 template When parsed Then trigger stations gates retry and no-publish policy are explicit", () => {
    const definition = SeoDraftWorkflowDefinitionSchema.parse(SEO_DRAFT_WORKFLOW);

    expect(definition.id).toBe("seo_draft_v1");
    expect(definition.trigger).toEqual({ kind: "manual_or_schedule", required_scope: "site" });
    expect(definition.steps.map((step) => step.id)).toEqual(["gsc_fixture", "opportunity", "draft", "judge", "human_review"]);
    expect(definition.steps.find((step) => step.id === "human_review")?.kind).toBe("review_gate");
    expect(definition.quality_gates).toEqual(["source_data_present", "claims_have_sources", "no_invented_metrics", "canonical_url_present", "internal_links_checked"]);
    expect(definition.failure_policy).toEqual({ retry_failed_step_only: true, max_attempts: 3, on_unknown_side_effect: "reconcile", publish: "disabled" });
  });
});
