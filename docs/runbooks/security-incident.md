# Security Incident Runbook

## Trigger Conditions

Use this runbook when any of the following occur:

- audit export verification returns `valid: false`,
- backup manifest verification reports missing files or hash mismatches,
- connector receipts show repeated high-risk side effects,
- remote egress receipt metadata does not match the approved policy snapshot.

## Immediate Actions

1. Stop issuing new connector executions for the affected workspace.
2. Preserve the database, vault, artifact files, backup manifest, and audit export output.
3. Quarantine any connector involved in the suspicious side effect path.
4. Export a fresh audit log for the workspace and compare it with the preserved export.
5. Restore the latest known-good backup into a separate directory and validate migration plus audit integrity.

## Connector Quarantine

Use `ConnectorQuarantineService` from `@nexora/observability` to create an active quarantine record. Connector policy evaluation must receive the active quarantine record before executing the connector; the policy returns `CONNECTOR_UNAVAILABLE` with `release_connector_quarantine` as the required action.

Only an `Owner` can release a quarantine. Releases require a reason, the releasing actor ID, and a release timestamp.

## Evidence to Retain

- `verify-audit` output and audit JSON export.
- Backup `manifest.json` and restore command output.
- Quarantine record ID, connector ID/version, actor ID, reason, and timestamps.
- Relevant egress receipt IDs and policy decision records.

## Recovery Criteria

Recovery is complete only when:

- restored database migration validation passes,
- audit verification returns `valid: true`,
- affected connectors are either still quarantined or released by an `Owner` with a documented reason,
- no unverified external side effect is retried without an idempotency receipt.
