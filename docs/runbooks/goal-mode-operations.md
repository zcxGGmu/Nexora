# Goal Mode Operations

Goal Mode routes are local control-plane APIs. They record loop descriptors, continuations, Judge decisions, and operator commands. They do not call external model providers, browser automation, NotebookLM, voice services, MCP servers, or business SaaS connectors.

## Inspect loops

```bash
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/goal-loops?workspace_id=$WORKSPACE_ID"
```

Use the loop detail route when checking recovery or command history:

```bash
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/goal-loops/$GOAL_LOOP_ID?workspace_id=$WORKSPACE_ID"
```

## Start or resume a loop

Create and resume commands require an `Idempotency-Key`. Mutating commands against an existing loop also require the current revision in `If-Match`.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: goal:create:$REQUEST_ID" \
  --data @goal-loop.json \
  "http://127.0.0.1:4310/v1/goal-loops"
```

An exact replay with the same idempotency key returns the original accepted fact. Reusing the key with different content must be treated as a conflict.

## Judge decisions

Judge decisions are JSON facts shaped as `{ "done": boolean, "reason": string }`.

- `done=false` records a continuation, advances the cursor, and keeps the loop `running`.
- `done=true` can mark success only when max-turn, budget, and deadline constraints still allow success.
- Judge failure, malformed JSON, missing reason, or exhausted limits must not claim success.

The C20 Judge path is descriptor-only. Do not wire a real provider, model endpoint, MCP server, browser, or external tool into this route without a later approved stage.

## Pause, steer, resume, and subgoals

Pause, steer, resume, `/goal resume`, and `/subgoal` are operator control commands. A `202 Accepted` response means the command fact was recorded locally; it does not prove external execution.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: goal:pause:$REQUEST_ID" \
  -H "If-Match: $CURRENT_REVISION" \
  --data '{"schema_version":1,"workspace_id":"'$WORKSPACE_ID'","reason":"operator review"}' \
  "http://127.0.0.1:4310/v1/goal-loops/$GOAL_LOOP_ID/pause"
```

Use a fresh idempotency key for every new intent. If `If-Match` fails, refetch the loop detail and re-evaluate the current status before retrying.

## Recovery checks

After API restart or worker recovery, inspect the loop detail and verify:

- Latest continuation cursor is monotonic.
- Orphan continuation recovery records a recovery kind instead of overwriting prior facts.
- Command history remains append-only.
- Scope fields match the loop workspace, run, and session descriptors.
- Error responses do not expose secret-shaped text, internal filesystem paths, or provider tokens.

## Current limitations

- No external Judge provider is invoked in C20.
- No browser/computer use, NotebookLM, voice, business SaaS, Telegram, Discord, Slack, WhatsApp, Signal, Web, API provider, or MCP connection is enabled.
- Mission Control `/goal-mode` visual QA is fixture-backed against local control-plane state and must keep showing the no-external-connection boundary until a later connector stage explicitly changes it.
