# C12 Manual QA Matrix

## Environment

- Existing launchd demo on `127.0.0.1:5173` was left running and returned `HTTP/1.1 200 OK`.
- Temporary Mission Control preview used `127.0.0.1:4311` for C12 browser verification.
- Node engine warning observed: current Node `v25.9.0`, repo requires `>=22.13.0 <23.0.0`.

## Checks

- Workflow Studio desktop: opened `/workflows/seo_draft_v1?workspace=ws-demo&tab=stations`; confirmed `seo_draft_v1`, five stations, quality gates, retry policy, reconcile policy, and `publish disabled`.
- Workflow Studio mobile: same route at 390 x 844; confirmed readable panels and existing five-item bottom navigation.
- SEO Draft Run desktop: opened `/workflows/seo_draft_v1/runs/seo-run-demo?workspace=ws-demo&tab=run`; confirmed `waiting_review`, source fixture path, `Judge pass`, and no publish/indexing boundary.
- SEO Draft Run mobile: same run route at 390 x 844; confirmed `Open Review` remains visible above the bottom navigation.
- Review handoff journey: Playwright clicked `Start SEO draft run`, landed on SEO Draft Run, clicked `Open Review`, and observed Review Center with `Risk R2`.
- Unknown workflow run guard: static route test confirms `/workflows/seo_draft_v1/runs/unknown-run` renders a missing Run boundary instead of reusing fixture data.
