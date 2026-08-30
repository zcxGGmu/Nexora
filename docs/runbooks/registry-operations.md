# Registry Operations

The Runtime Registry is a workspace-scoped descriptor catalog. It records declared capabilities; it does not start runtimes, call models, install MCP, or send data to external services.

## Read the catalog

```bash
curl -fsS \
  -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/registry?workspace_id=$WORKSPACE_ID"
```

The response groups `runtimes`, `providers`, `models`, `backends`, and `tools`. Every item includes its declared health, enabled state, execution location or provider reference, capability list, and data classification.

## Register a descriptor

Registration is an asynchronous control-plane command and requires `workspace:admin`:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Idempotency-Key: registry:runtime:hermes-local:v1" \
  -H "Content-Type: application/json" \
  --data @runtime-hermes.json \
  "http://127.0.0.1:4310/v1/registry/runtimes"
```

`202 Accepted` means the descriptor write was accepted. Follow the returned `status_url`; it does not mean the referenced runtime is connected or healthy beyond the stored descriptor fact.

## Safety rules

- Store secret manager references such as `secret://providers/openrouter`, never API keys or bearer tokens.
- Keep `enabled=false` until a later adapter has passed health, policy, and review checks.
- Use separate descriptors for separate data classifications and execution locations.
- Treat capability strings as declarations. A tool must still pass policy, risk, scope, review, and idempotency gates at execution time.
- Do not register a model before its Provider descriptor exists in the same workspace.
- To retire an entry, disable it through a future versioned command; preserve the row and audit history rather than deleting facts.

## Update a descriptor

Updates are owner-only, versioned control-plane commands. Read the current descriptor first, preserve its `id` and `created_at`, and send the current SQLite version in `If-Match`:

```bash
curl -fsS -X PUT \
  -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Idempotency-Key: registry:runtime:hermes-local:update:v2" \
  -H "If-Match: 1" \
  -H "Content-Type: application/json" \
  --data @runtime-hermes-v2.json \
  "http://127.0.0.1:4310/v1/registry/runtimes/runtime-hermes-local"
```

`409 VERSION_CONFLICT` means another writer advanced the descriptor. Reload and retry with a new idempotency key. Reusing a key with a different descriptor payload returns `409 IDEMPOTENCY_KEY_REUSED`.

## Current limitation

The current phase has no live health probe or adapter handshake. `health` is an explicitly stored value, and all external execution remains disabled by default.
