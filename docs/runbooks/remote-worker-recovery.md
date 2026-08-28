# Remote Worker Recovery

## Detect

Treat `CONNECTOR_UNAVAILABLE` and remote process termination as a paused/queued execution condition. Do not replace the adapter with local execution automatically. Preserve the current Attempt, last committed cursor, egress receipt, and fencing evidence.

## Resume

1. Confirm the Run still targets `remote` and the provider/region policy is still allowed.
2. Confirm the lease is current; after expiry, acquire a new lease and fencing token.
3. Rebuild the bounded redacted snapshot and verify its canonical `snapshot_hash`.
4. Mint a fresh short-lived capability token whose scope matches the new lease/fence and whose expiry is bounded by the run deadline.
5. Reconnect to the remote worker and issue `resume` from the last committed cursor.
6. Append remote events through the origin event store with normal fencing and idempotency checks.

Expired tokens, scope/provider/region denial, malformed envelopes, snapshot hash mismatches, and stale fencing tokens are stop conditions. They must not be retried as local work. `cancel_unknown` and unknown side effects remain frozen for reconciliation.

## Explicit Location Switch

An operator may switch a failed or paused Attempt to another location only through an explicit command. The command creates a new queued Attempt and pending Step with `previous_attempt_id`; it never mutates or reuses the old Attempt. The new queue payload records the selected execution location so retries cannot silently change runtime placement.

## Evidence

Record the policy decision and egress receipt before sending data, then record the outcome/error separately. Include provider, region, classification, redaction count, snapshot hash, cursor, lease id, and fencing token. Never include bearer tokens, secret values, vault paths, or complete chat context in logs or receipts.
