# Development Runbook

## Prerequisites

- Node.js `>=22.13.0 <23.0.0` and pnpm `10.10.0`.
- The repository has no required external database, queue, telemetry collector, or provider.
- Set `NEXORA_DATA_DIR` before starting the API or worker.

## Local services

```bash
pnpm install --frozen-lockfile
pnpm dev:api       # http://127.0.0.1:4310
pnpm dev:worker
pnpm dev:web       # http://127.0.0.1:4311
```

For a reproducible browser run, `pnpm test:e2e` starts the 4311 Vite server automatically. The separately managed demo at `127.0.0.1:5173` is not part of this command and must not be restarted by QA.

## Seed and fault fixtures

Create or refresh a deterministic local workspace graph:

```bash
NEXORA_DATA_DIR=/tmp/nexora-c16/data pnpm tsx tests/fixtures/seed-workspace.ts --data-dir /tmp/nexora-c16/data
```

The command is idempotent and writes only SQLite, vault memory, and artifact fixture files under the selected data directory. It never contacts a provider or persists a secret.

Fault injection is an explicit in-process fixture for timeout, crash, stale lease, projection degradation, and connector outage. Use it from tests or a drill harness; do not enable it in a production environment.

## Verification loop

```bash
pnpm lint
pnpm typecheck
pnpm test --run
pnpm test:integration
pnpm --filter @nexora/mission-control build
pnpm test:e2e
```

The Node 25 engine warning is expected in this desktop environment; CI pins Node 22.13.0.
