# Skills/Learning Operations

Skills/Learning routes are local control-plane APIs. They record skill descriptors, reviewed versions, approved snapshots, installations, invocation facts, and learning candidates. They do not execute MCP tools, fetch URLs or PDFs, read credentials, install external code, or send provider/SaaS side effects.

## Inspect skills

```bash
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/skills?workspace_id=$WORKSPACE_ID"
```

Use skill detail when checking a lifecycle issue:

```bash
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/skills/$SKILL_ID?workspace_id=$WORKSPACE_ID"
```

The detail projection includes versions, sources, scans, reviews, installations, invocation facts, and learning candidates. Skill facts expose the descriptor revision for `If-Match`; installation facts expose a separate revision required in the body for revoke, quarantine, and rollback commands.

## Capture a learning candidate

`/learn` requires an `Idempotency-Key` and Owner workspace authority. The server sets `status=needs_review`; callers must not provide a different status.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: learn:$REQUEST_ID" \
  --data @learning-candidate.json \
  "http://127.0.0.1:4310/v1/learning/candidates"
```

Exact replay returns the original accepted command. Reusing the key with a changed lesson, diff summary, run, loop, source event, proposed skill, descriptor flag, or evidence refs must return an idempotency conflict. The source event must already exist on the same workspace and run.

## Lifecycle commands

Every lifecycle command uses the current skill descriptor revision in `If-Match`. Revoke, quarantine, and rollback also require the target installation revision from the skill detail projection in `installation_revision` so stale descriptor and stale installation views are rejected independently.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: skill:quarantine:$REQUEST_ID" \
  -H "If-Match: $SKILL_REVISION" \
  --data '{"schema_version":1,"workspace_id":"'$WORKSPACE_ID'","version_id":"'$VERSION_ID'","installation_revision":'$INSTALLATION_REVISION',"reason":"reviewed scan finding"}' \
  "http://127.0.0.1:4310/v1/skills/$SKILL_ID/quarantine"
```

Rollback requires `rollback_to_version_id` and the target must belong to the same skill, be approved, carry an approved snapshot hash/reference, and differ from the currently installed version.

## Safety checks

Before marking a Skills/Learning incident or stage complete, verify:

- `/learn` accepted only descriptor references and rejected `file://`, `secret://`, `vault://providers/...`, absolute local paths, and secret-shaped text.
- Installation points to one approved version and one approved snapshot hash.
- Duplicate active install attempts for the same workspace and skill conflict, even when the competing install targets a different approved version.
- Rollback rejects the current installed version at the API, repository, and SQL trigger layers.
- Invocation facts match the actual run and goal loop pairing.
- Source, scan, review, invocation, and command facts remain append-only.
- Mission Control `/skills?workspace=ws-demo` shows the no-external-connection boundary and no wide table on mobile.

## Current limitations

- C21 does not apply learning candidates to real skill files.
- C21 does not execute installed skills or MCP tools.
- C21 does not read external URLs, PDFs, local paths, vault provider credentials, or secrets.
- C21 Mission Control actions are local control commands only; a successful command does not prove external execution.
