# Journal/Vault Operations

Journal routes are local control-plane APIs. They record vault bridge descriptors, daily journal entries, source descriptors, graph/FTS snapshots, memory candidates, writeback requests, and writeback decisions. They do not connect to real Obsidian, OMI, MCP, providers, external networks, credentials, or user vault writeback paths.

## Inspect vaults

```bash
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/vaults?workspace_id=$WORKSPACE_ID"
```

Use vault detail when checking graph, memory, or writeback state:

```bash
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/vaults/$VAULT_ID?workspace_id=$WORKSPACE_ID"
```

The detail projection includes entries, sources, graph indexes, memory candidates, writeback requests, and writeback decisions. Writeback request facts expose the revision used by `If-Match` on approve/reject commands.

## Register descriptors

All journal writes require Owner workspace authority and an `Idempotency-Key`. The key must be an opaque safe command id that passes the shared idempotency-key schema; do not put `secret://`, raw paths, bearer tokens, URLs, or credential-shaped text in the header because accepted responses echo the command id. Vaults must remain `access_mode: "read_only"` and `descriptor_only: true`.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: journal:vault:$REQUEST_ID" \
  --data @vault-bridge.json \
  "http://127.0.0.1:4310/v1/vaults"
```

Entries, sources, graph indexes, and memory candidates use `/v1/journal/entries`, `/v1/journal/sources`, `/v1/journal/graph-indexes`, and `/v1/journal/memory-candidates`. Reusing an idempotency key with changed client-controlled resource semantics must return `IDEMPOTENCY_KEY_REUSED`. `created_at` and `updated_at` are server-owned for API/CLI writes and are ignored in the canonical request hash; semantic event timestamps such as `captured_at` and `indexed_at` remain part of the resource payload.

## Request writeback

Writeback requests record intent only. They must reference a memory candidate in the same workspace and same vault, target the selected vault root (`target_ref === root_ref`) or a child descriptor path under that root, and start as `pending_review`.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: journal:writeback:$REQUEST_ID" \
  --data @writeback-request.json \
  "http://127.0.0.1:4310/v1/journal/writebacks"
```

Approval or rejection appends a decision fact and updates the request state. It does not write a file or call a vault connector.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: journal:approve:$REQUEST_ID" \
  -H "If-Match: $WRITEBACK_REQUEST_REVISION" \
  --data '{"schema_version":1,"workspace_id":"'$WORKSPACE_ID'","reason":"approved reviewed diff","descriptor_only":true}' \
  "http://127.0.0.1:4310/v1/journal/writebacks/$WRITEBACK_REQUEST_ID/approve"
```

## Safety checks

Before marking a Journal incident or stage complete, verify:

- Vault descriptors remain `read_only` and `descriptor_only`.
- References use only `workspace://`, `artifact://`, `memory://`, or `journal://` namespaces.
- Inputs reject `file://`, `secret://`, raw absolute paths, HTTP(S), traversal, token-shaped text, and credential-shaped text.
- Sources and memory candidates match the same workspace, vault, and journal entry.
- Writeback requests match the same workspace and vault as their candidate, including raw SQL bypass attempts.
- Writeback request `target_ref` stays inside the matching vault `root_ref`, including raw SQL bypass attempts.
- Writeback decisions are append-only and terminal requests cannot be mutated or deleted.
- Writeback request revisions advance by exactly one on approve/reject and cannot be jumped through raw SQL.
- Journal payload JSON keeps exact top-level keys; unknown fields are rejected in contracts and migration triggers.
- CLI/API retries with the same safe idempotency key and unchanged semantics replay instead of conflicting on server-owned timestamps.
- Mission Control `/journal?workspace=ws-demo` shows no-external-connection, graph/FTS, memory candidate, writeback approval, and mobile no-overflow status.

## Current limitations

- C22 does not read real Obsidian vault files or OMI transcripts.
- C22 does not call MCP, providers, web APIs, or external networks for journal data.
- C22 does not read credentials or `secret://` targets.
- C22 does not write approved diffs back to a user vault; approved writeback remains a local descriptor fact.
