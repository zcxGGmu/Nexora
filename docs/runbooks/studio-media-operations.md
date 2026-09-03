# Studio/Media Operations

Studio/Media routes are local control-plane APIs. They record media artifact descriptors, render job descriptors, Notebook descriptors, source snapshots, Notebook generation descriptors, Avatar profile descriptors, Studio share facts, and Studio command facts. They do not call NotebookLM, media generation providers, Avatar providers, MCP tools, credentials, external URLs, PDFs, Drive, render workers, preview hosts, publishing targets, or external messaging systems.

## Inspect Studio state

```bash
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/studio?workspace_id=$WORKSPACE_ID"
```

Reads require `run:read`. The projection includes media artifacts, render jobs, notebooks, Notebook sources, Notebook generations, avatar profiles, share facts, and command receipts. Descriptor revisions in the projection are used by `If-Match` on rerender, share, Notebook generation, and avatar revoke commands.

## Register descriptors

All C25 writes require Owner workspace authority and a safe `Idempotency-Key`. Do not put `secret://`, raw paths, bearer tokens, API keys, provider URLs, credential names, URL/PDF/Drive locations, or local file paths in descriptor refs, reasons, or idempotency keys.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: studio:media:$REQUEST_ID" \
  --data @media-artifact.json \
  "http://127.0.0.1:4310/v1/studio/media-artifacts"
```

Descriptor refs must use local descriptor schemes such as `artifact://`, `workspace://`, `memory://`, `journal://`, or `skill://`. C25 rejects live provider refs, HTTP(S) URLs, file paths, traversal, backslashes, encoded secret/path markers, default-ignorable characters, and credential-shaped text.

## Command descriptors

Preview, share, rerender, Notebook generation, and avatar revoke commands are descriptor-only operator commands. They require `If-Match` and append a command fact instead of executing media, NotebookLM, Avatar, publish, or revoke work.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: studio:share:$REQUEST_ID" \
  -H "If-Match: $MEDIA_ARTIFACT_REVISION" \
  --data '{"schema_version":1,"workspace_id":"'$WORKSPACE_ID'","run_id":"'$RUN_ID'","kind":"share","target_id":"'$MEDIA_ARTIFACT_ID'","target_type":"media_artifact","reason":"operator review request","descriptor_only":true}' \
  "http://127.0.0.1:4310/v1/studio/media-artifacts/$MEDIA_ARTIFACT_ID/share"
```

Retries with the same idempotency key and identical client-controlled semantics return the original command resource id. A new idempotency key for a new operator action must allocate a fresh command id so the command log remains append-only.

## Temporary URL and share recovery

Temporary URL expiry is represented as descriptor state. Expired preview/share facts require a fresh descriptor command and do not trigger provider calls, storage reads, or automatic publishing. Treat expired `temporary_url_expires_at` or share `expires_at` values as operator-visible recovery prompts, not as live URL refresh jobs.

## Safety checks

Before marking a Studio/Media incident or stage complete, verify:

- Reads require `run:read`; writes require Owner workspace authority.
- All descriptors and facts are bound to the same workspace and run.
- Commands reject missing or stale `If-Match` values.
- Idempotency replay returns the original resource only when request semantics match; changed replay returns `IDEMPOTENCY_KEY_REUSED`.
- New command actions with new idempotency keys append fresh command ids.
- Render jobs, Notebook generations, Studio shares, and Studio commands are append-only.
- Notebook generations reference existing same-workspace, same-notebook, same-run source descriptors.
- Avatar profiles require consent descriptors, disable voice cloning, and revoke through command facts only.
- Raw SQL bypass attempts reject unsafe refs, nested schemes, whitespace, traversal, backslashes, percent-encoded markers, default-ignorable characters, `secret://`, credential-shaped text, payload/column drift, cross-run facts, and target/kind mismatches.
- Mission Control `/studio-media?workspace=ws-demo` shows media artifacts, render queue, Notebook snapshots, Notebook sources, Notebook generations, Avatar consent, share facts, command receipts, real DOM controls, five mobile nav items, no overflow, and the no-external-connection/no-NotebookLM boundary.

## Current limitations

- C25 does not call live NotebookLM, media generation, avatar generation, provider SDKs, MCP, credentials, URLs, PDFs, or Drive.
- C25 does not render media, synthesize avatars, host temporary URLs, publish shares, or revoke externally published assets.
- Share and temporary URL recovery are local descriptor facts only.
- Future live Studio adapters require separate consent, sandboxing, credential mediation, artifact storage, URL/PDF/Drive ingestion policy, rate limits, takedown semantics, and external side-effect receipts before execution is enabled.
