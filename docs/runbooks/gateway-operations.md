# Gateway Operations

Gateway, Channel, and Session routes are local control-plane APIs. They record declarations and command receipts; they do not connect external accounts.

## Inspect state

```bash
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/gateways?workspace_id=$WORKSPACE_ID"
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/sessions?workspace_id=$WORKSPACE_ID"
```

Session messages support cursor catch-up with `after` and `limit`. A stale or unknown cursor must be refreshed from the session snapshot.

## Control a session

Pause, steer, and resume are owner-only commands. Send a new idempotency key for every intent and the current session revision in `If-Match`. `202 Accepted` records an accepted command; it is not proof of remote delivery.

## Delivery safety

- Outbound recipients are denied unless an active allowlist entry matches the channel and subject.
- Use `POST /v1/allowlist` to create a workspace-scoped entry. Keep `decision=deny` for explicit blocks and set `expires_at` for temporary approvals.
- Delivery receipts are append-only. An exact idempotent replay returns the original accepted receipt; a reused idempotency key with different receipt content is a conflict, never an update.
- Credentials and endpoints must be `secret://` references. Never place tokens in descriptor payloads, logs, or receipts.

## Current limitation

No Telegram, Discord, Slack, WhatsApp, Signal, Web, or API transport adapter is enabled in C19. Health and connection states remain declared facts until a later, explicitly authorized connector phase.
