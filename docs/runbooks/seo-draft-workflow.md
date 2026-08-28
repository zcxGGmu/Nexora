# SEO Draft Workflow Runbook

## Scope

C12 introduces `seo_draft_v1`, a deterministic SEO draft workflow that turns a Search Console fixture into a Markdown draft artifact, source receipt, independent judge result, and pending human review.

## Workflow Stations

1. `gsc_fixture` reads the supplied GSC fixture rows only.
2. `opportunity` selects the source-backed query and canonical URL pair.
3. `draft` writes a Markdown artifact with a `## Source receipt` section.
4. `judge` independently checks source data, claims, invented metrics, canonical URL, and internal links.
5. `human_review` stops the run at `waiting_review` with publish disabled.

## Operating Policy

- Retry is limited to the failed step and capped at 3 attempts.
- Empty GSC fixture data blocks the workflow before artifact or review creation.
- Judge failures are repaired only when a source-backed revision can be produced.
- Persistent judge failure marks the run `failed` after 3 attempts.
- Publish, CMS, and indexing side effects are disabled for this workflow.
- Repeated commands with the same idempotency key and request hash reuse the existing artifact reference.

## Verification Surface

- Unit: `packages/workflows/src/definition.test.ts`
- Integration: `tests/integration/seo-draft-workflow.test.ts`
- Runtime station contract: `packages/runtime-adapters/src/seo-workflow-stations.test.ts`
- Mission Control page rendering: `apps/mission-control/src/pages/workflow.test.tsx`
- Browser journey: `tests/e2e/seo-draft-review.spec.ts`

## Manual Smoke

1. Open `/workflows/seo_draft_v1?workspace=ws-demo&tab=stations`.
2. Confirm `publish disabled`, `retry failed step only`, and all five stations are visible.
3. Click `Start SEO draft run`.
4. Confirm the run page shows `waiting_review`, `Judge pass`, and `No publish or indexing call executed`.
5. Click `Open Review` and confirm Review Center opens on an R2 review.
