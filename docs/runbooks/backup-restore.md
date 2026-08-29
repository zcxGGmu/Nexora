# Backup and Restore Runbook

## Scope

This runbook covers the C15 local recovery path for the Nexora Agent OS SQLite database, vault files, and artifact files. It does not require an external database, object store, or telemetry backend.

## Create a backup

Set the runtime data directory first:

```bash
export NEXORA_DATA_DIR=/path/to/nexora-data
pnpm tsx scripts/backup-db.ts --output /path/to/backup-dir
```

The script:

- opens the configured SQLite database,
- runs a WAL checkpoint before copying,
- copies the database plus SQLite sidecar files when present,
- includes `NEXORA_DATA_DIR/vault` when it exists,
- writes `manifest.json` with file hashes and byte sizes.

## Restore a backup

Restore into a fresh directory:

```bash
export NEXORA_DATA_DIR=/path/to/nexora-data
pnpm tsx scripts/restore-db.ts --manifest /path/to/backup-dir/manifest.json --restore-dir /path/to/restore-dir
```

The script verifies the manifest before copying files, restores the database and vault tree, opens the restored database, and validates the current migration version.

## Verify audit integrity after restore

Run an audit export against each restored workspace:

```bash
export NEXORA_DATA_DIR=/path/to/restore-dir
pnpm tsx scripts/verify-audit.ts --workspace 01ARZ3NDEKTSV4RRFFQ69G5FAV --output /path/to/audit.json
pnpm tsx scripts/verify-audit.ts --audit /path/to/audit.json
```

Treat any `valid: false` result as a security incident and follow `docs/runbooks/security-incident.md`.

## Expected evidence

- Backup manifest path, entry count, and manifest hash.
- Restore output with `migration: valid`.
- Audit verification output with `valid: true` and zero failures.
- Spot check that restored vault memory and artifact files are present under the restored `vault` directory.
