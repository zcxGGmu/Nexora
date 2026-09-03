# Browser/Computer Use Operations

Browser/Computer routes are local control-plane APIs. They record sandbox policies, browser/computer session descriptors, target allowlist entries, human approvals, action intents, action receipts, screenshot receipts, and session commands. They do not connect to real browser automation, desktop control, external websites, providers, MCP servers, credentials, or user files.

## Inspect sessions

```bash
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/browser-sessions?workspace_id=$WORKSPACE_ID"
```

Use session detail when checking sandbox, allowlist, approvals, actions, and receipts:

```bash
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/browser-sessions/$SESSION_ID?workspace_id=$WORKSPACE_ID"
```

Reads require `run:read`. The detail projection includes the current session revision used by `If-Match` on pause/resume/stop/takeover commands and the action receipt revision used by acknowledgement commands.

## Register descriptors

All C23 writes require Owner workspace authority and a safe `Idempotency-Key`. Do not put `secret://`, raw paths, bearer tokens, URLs, or credential-shaped text in the idempotency key because accepted responses echo it as a command id.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: browser:session:$REQUEST_ID" \
  --data @browser-session.json \
  "http://127.0.0.1:4310/v1/browser-sessions"
```

Target allowlist entries use `/v1/browser-allowlist`. A missing or expired allowlist keeps actions denied by default. Domain allowlists are descriptor refs such as `browser://domain/example.com`; they are not wildcard patterns and do not execute network access.

## Approve actions

Recording an action intent does not execute it. If the target is allowlisted but approval is missing, the action remains pending approval and no executable action receipt is recorded.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: browser:approve:$REQUEST_ID" \
  -H "If-Match: $ACTION_REVISION" \
  --data '{"schema_version":1,"workspace_id":"'$WORKSPACE_ID'","reason":"operator approved descriptor-only action","descriptor_only":true}' \
  "http://127.0.0.1:4310/v1/browser-actions/$ACTION_ID/approve"
```

Approval binds to the action payload hash. Reusing an idempotency key with changed action semantics must return `IDEMPOTENCY_KEY_REUSED`.

## Command sessions

Pause, resume, stop, and takeover are descriptor-only state transitions on the local session record. They require `If-Match` and do not control a real browser or desktop.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: browser:pause:$REQUEST_ID" \
  -H "If-Match: $SESSION_REVISION" \
  --data '{"schema_version":1,"workspace_id":"'$WORKSPACE_ID'","kind":"pause","reason":"operator pause","descriptor_only":true}' \
  "http://127.0.0.1:4310/v1/browser-sessions/$SESSION_ID/pause"
```

Valid transitions are active to paused, stopped, takeover requested, or error; paused to active, stopped, takeover requested, or error; takeover requested to stopped; error to stopped. Stopped sessions are terminal.

## Acknowledge receipts

Acknowledgement appends a new action receipt fact with status `acknowledged`. It does not mutate the original completed receipt.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: browser:ack:$REQUEST_ID" \
  -H "If-Match: $RECEIPT_REVISION" \
  --data '{"schema_version":1,"workspace_id":"'$WORKSPACE_ID'","reason":"operator acknowledged descriptor receipt","descriptor_only":true}' \
  "http://127.0.0.1:4310/v1/browser-action-receipts/$RECEIPT_ID/acknowledge"
```

If an action receipt references a screenshot, the screenshot fact must already exist and match the same workspace, session, and action intent. This is enforced in the repository and SQLite migration triggers.

## Safety checks

Before marking a Browser/Computer incident or stage complete, verify:

- Sandbox policies remain `deny_by_default`, `deny`, `deny`, `deny`, `approval_required`, and `descriptor_only`.
- Reads require `run:read`; writes require Owner workspace authority.
- Session commands and receipt acknowledgement reject missing or stale `If-Match` values.
- Actions without a live allowlist and approved matching payload hash do not create executable receipts.
- Allowlist default deny, expired allowlists, private IP/metadata targets, userinfo URLs, wildcard-like domain refs, raw paths, `secret://`, and credential-shaped text are rejected.
- Action receipts and screenshot receipts are append-only; acknowledgement appends a separate receipt fact.
- Non-null action receipt `screenshot_id` references an existing screenshot receipt for the same workspace, session, and action intent, including raw SQL bypass attempts.
- Mission Control `/browser-computer?workspace=ws-demo` shows sandbox health, allowlist, approval, action, cursor-free receipt state, screenshot state, real DOM controls, five mobile nav items, no overflow, and the no-external-connection boundary.

## Current limitations

- C23 does not navigate real websites or call external APIs.
- C23 does not control a real desktop, browser, keyboard, mouse, clipboard, or filesystem.
- C23 does not capture live screenshots; screenshot receipts are redacted artifact descriptors.
- C23 does not read credentials, `secret://` targets, provider config, or MCP tools.
- Future live adapters need separate authorization, sandboxing, DNS/private-network defenses, and rate limits before execution is enabled.
