# Connector Quarantine Runbook

## Purpose

Connector quarantine prevents an unavailable, compromised, or side-effect-unknown connector from executing while investigation is active.

## Create a Quarantine

Use the C15 observability service from application code or a maintenance script:

```typescript
const quarantine = new ConnectorQuarantineService(database);
quarantine.quarantine({
  id,
  workspace_id,
  connector_id,
  connector_version,
  reason,
  actor_id,
  created_at,
});
```

There can be only one active quarantine per workspace, connector ID, and connector version.

## Enforce a Quarantine

Before connector execution, read the active record and pass it to `evaluateConnectorPolicy()`:

```typescript
const active = quarantine.active(workspaceId, connectorId, connectorVersion);
const decision = evaluateConnectorPolicy({ ...policyInput, quarantine: active });
```

An active quarantine returns `CONNECTOR_UNAVAILABLE` and `required_action: "release_connector_quarantine"`.

## Release a Quarantine

Only an `Owner` may release a connector quarantine:

```typescript
quarantine.release({
  workspace_id,
  connector_id,
  connector_version,
  actor_id,
  actor_role: "Owner",
  reason,
  released_at,
});
```

Use a specific reason such as vendor incident resolved, duplicated side effect reconciled, or audit export verified after restore.

## Verification

- Confirm `quarantine.active()` returns a record before release.
- Confirm connector policy returns `CONNECTOR_UNAVAILABLE` while active.
- Confirm non-Owner release attempts fail.
- Confirm `quarantine.active()` returns `undefined` after Owner release.
