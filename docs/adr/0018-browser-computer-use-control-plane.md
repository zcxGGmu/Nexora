# ADR-0018: Browser and Computer Use Control Plane

## Context

Nexora needs a Browser/Computer Use surface after Journal so operators can inspect browser session descriptors, desktop-use descriptors, sandbox policy, target allowlists, human approvals, action intents, action receipts, screenshot receipts, pause/resume, stop, and takeover commands. C23 is still a control-plane stage. It must not connect to real browsers, desktop automation, external websites, providers, MCP servers, credentials, or user files.

## Decision

- Add strict contracts for `SandboxPolicy`, `BrowserSessionDescriptor`, `ComputerUseSessionDescriptor`, `TargetAllowlistEntry`, `HumanApproval`, `ActionIntent`, `ActionReceipt`, `ScreenshotReceipt`, and `BrowserComputerCommand`.
- Keep C23 descriptor-only. API `202 Accepted` responses record local facts and command receipts; they do not navigate, click, type, focus real applications, capture live browser pixels, read files, read credentials, call providers, call MCP, or send outbound network requests.
- Force sandbox defaults to deny network by default, deny filesystem, deny clipboard, deny credentials, and require approval for automation. Allowed target kinds are explicit descriptor values, not execution capability.
- Store all C23 facts with `workspace_id`. Sessions also bind to a run and gateway session; actions bind to the same run and session; approvals bind to the action payload hash; receipts bind to executable approved action policy at receipt time.
- Enforce allowlist default deny. A missing, denied, expired, unsafe, or scope-mismatched allowlist prevents executable receipts and does not produce an action receipt side effect.
- Enforce receipt consistency at both repository and database layers. Non-null `ActionReceipt.screenshot_id` is valid only when a screenshot receipt already exists with the same `workspace_id`, `session_id`, and `action_intent_id`; screenshot receipts are append-only, so accepted references cannot be invalidated later.
- Treat action receipts and screenshot receipts as append-only facts. Acknowledge is represented by an additional action receipt fact with status `acknowledged`, not by mutating the original receipt.
- Require Owner write authority for all C23 writes and `run:read` for reads. Session commands and receipt acknowledgement require `If-Match` against the current revision. Idempotency keys are opaque safe command ids and may not contain secret/path-shaped content.
- Validate descriptor refs at contracts and migration layers. C23 accepts descriptor-safe browser URLs, domain allowlist refs, computer app refs, and artifact refs while rejecting private/metadata IP targets, userinfo, raw paths, traversal, encoded/default-ignorable secret markers, `secret://`, and hardcoded credential-shaped text.
- Expose the control plane through API routes, CLI parser semantics, and Mission Control `/browser-computer` with sandbox health, allowlist, approval, session queue, action receipt, screenshot receipt, pause/resume, stop, takeover, acknowledge, and no-external-connection status visible on desktop and mobile.

## Consequences

Operators can review browser/computer-use intents and approvals with durable local facts while preserving the no-side-effect boundary. The database backs the critical invariants even when callers bypass repositories with raw SQL, including append-only facts, target safety, allowlist policy, receipt executability, screenshot/action receipt pairing, payload parity, and guarded session state transitions.

The tradeoff is that C23 intentionally does not run real browser automation, desktop control, screenshot capture, credential access, MCP calls, or external web access. Future live execution adapters will need a separate execution-stage ADR covering DNS rebinding defenses, private-network resolution, runtime sandboxing, credential mediation, rate limits, audit receipts, and explicit operator authorization.

## Rollback

Disable `/v1/browser-*` routes and remove Mission Control `/browser-computer` navigation first. Preserve migration 14 rows for audit/export before a planned rollback. Do not mutate or delete existing browser/computer facts outside a controlled migration rollback because receipts, screenshots, approvals, allowlists, and action intents are append-only audit records.
