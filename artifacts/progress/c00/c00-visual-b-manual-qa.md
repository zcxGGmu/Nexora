# C00 Visual QA Pass B - Manual QA Matrix

Verdict: PASS
Confidence: HIGH

Scope: read-only visual fidelity and CJK precision review for the intentionally minimal React/Vite Mission Control bootstrap shell. No reference design was provided or expected. Expected visible title: `Control plane is starting`.

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| C00-VB-001 | Valid fresh visual capture | Web screenshot artifact | `python3` PNG signature/dimension/mtime inspection of `artifacts/progress/c00/mission-control-shell-fresh.png`; direct image open with `view_image(..., detail: original)` | PASS | A1, A2 |
| C00-VB-002 | Requested shell copy is visible | Web screenshot artifact + source | Direct screenshot inspection of `mission-control-shell-fresh.png`; source read via `nl -ba apps/mission-control/src/main.tsx` | PASS | A1, A3 |
| C00-VB-003 | Browser recovery evidence supports live React render | Browser recovery evidence | Read `artifacts/progress/c00/mission-control-recovery.md` and cross-check DOM text against `apps/mission-control/src/main.tsx` | PASS | A2, A3 |
| C00-VB-004 | Prompt source path resolution | Source tree | `rg --files -g 'main.tsx'` found the actual app entry at `apps/mission-control/src/main.tsx`; prompt shorthand `src/main.tsx` does not exist at repo root | PASS | A3 |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| C00-VB-A01 | Capture artifact integrity | Mismatched image extension or stale screenshot | Final screenshot must be PNG-signature-valid, fully openable, and newer than rendered source | PASS | A1 |
| C00-VB-A02 | CJK wrapping precision | CJK orphaning, clipping, or wide-glyph drift | Not applicable because the rendered shell contains only English copy and no CJK glyphs | not_applicable | A1, A3 |
| C00-VB-A03 | Reference fidelity | Missing pixel-reference comparison | Not applicable because C00 intent explicitly has no reference design and is a minimal bootstrap shell | not_applicable | A2, A3 |
| C00-VB-A04 | Fake visual surface | Pasted raster instead of live DOM | Source renders live React DOM text through `createRoot`; screenshot and recovery DOM show text, not a static screenshot/image substitution | PASS | A2, A3 |

### artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | PNG screenshot | Signature-valid 1280x720 fresh Mission Control shell capture showing `Nexora Mission Control` and `Control plane is starting` | `artifacts/progress/c00/mission-control-shell-fresh.png` |
| A2 | Markdown evidence | Browser recovery note documenting fixed React import, DOM markup, rendered text, no fresh tab console errors, and superseded bad JPEG artifact | `artifacts/progress/c00/mission-control-recovery.md` |
| A3 | Source code | Actual React/Vite entry point rendering the observed minimal shell | `apps/mission-control/src/main.tsx` |
| A4 | HTML shell | Vite HTML host with `#root` and module script `/src/main.tsx` | `apps/mission-control/index.html` |

## Pass B Evidence Trace

- No image-diff hotspots were produced because there is no reference packet or pixel target for this bootstrap shell.
- Visual inspection: upper-left default browser flow layout on white background; `Nexora Mission Control` appears as normal paragraph text and `Control plane is starting` appears as the primary `h1`, matching `apps/mission-control/src/main.tsx:6-9`.
- CJK precision: not applicable; no Korean/Japanese/Chinese text appears in the screenshot or rendered source.

## Findings

- None blocking.
- Non-blocking evidence note: prompt path `src/main.tsx` is not present at repo root; actual source is `apps/mission-control/src/main.tsx`.

## Blocking

- Empty.
