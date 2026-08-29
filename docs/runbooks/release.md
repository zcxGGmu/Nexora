# Release Runbook

## Candidate checks

Run the complete local gate from a clean checkout with Node 22:

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test --run && pnpm test:integration
pnpm --filter @nexora/mission-control build
pnpm test:e2e
```

CI runs the same commands and installs a pinned Chromium browser for Playwright. The workflow is `.github/workflows/ci.yml`.

## Docker Compose smoke

Compose is a local release-like deployment. It runs API, worker, and web only, with SQLite in the named `nexora-data` volume and API/web bound to loopback:

```bash
docker compose config
docker compose build
docker compose up -d
nc -z 127.0.0.1 4310
nc -z 127.0.0.1 4311
curl -fsS http://127.0.0.1:4310/v1/health
curl -fsS -I http://127.0.0.1:4311/
docker compose ps
```

Stop the candidate without deleting the data volume:

```bash
docker compose down
```

Do not publish these images as a production release. The API is configured with disabled local auth for the local compose smoke only; deployers must provide the normal local auth mode and secret contract.

## Backup and recovery

Use [backup-restore.md](backup-restore.md) to create a WAL-checkpointed manifest, restore into a separate directory, validate migrations, and independently verify the audit export. Never restore over the live data directory during an incident.

## Release handoff

Attach the C16 artifacts, CI result, Playwright report, axe result, backup/restore report, fault drill output, and the exact implementation commit SHA. Record the Node engine warning and any unavailable Docker daemon as limitations; neither is evidence of a successful release.
