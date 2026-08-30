# Nexora
Nexora is a next-generation multi-agent workspace for OpenClaw, Hermes, and beyond. It provides a unified command surface for orchestrating agent sessions, managing tasks, reviewing outputs, approving tool actions, extending skills, and observing agent collaboration across local and remote runtimes.

## Development

Nexora uses a pnpm TypeScript monorepo and targets Node.js 22. The C00 bootstrap is intentionally local-first: the API and worker validate their environment at startup, while the Mission Control app is a real React/Vite DOM shell.

```bash
pnpm install
cp .env.example .env
pnpm typecheck
pnpm test --run
```

Run the services in separate terminals:

```bash
pnpm dev:api       # http://127.0.0.1:4310
pnpm dev:worker    # structured idle log; Ctrl-C stops it
pnpm dev:web       # http://127.0.0.1:4311
```

Run a release-like local stack with SQLite in a named volume:

```bash
docker compose config
docker compose build
docker compose up -d
curl -fsS http://127.0.0.1:4310/v1/health
curl -fsS -I http://127.0.0.1:4311/
docker compose down
```

The compose file is local-only: API and web bind to loopback, auth is disabled only for this smoke stack, and no external database, queue, telemetry backend, provider, or connector is started.

Create a deterministic QA workspace graph and exercise the explicit fault fixture:

```bash
NEXORA_DATA_DIR=/tmp/nexora-c16/data pnpm tsx tests/fixtures/seed-workspace.ts --data-dir /tmp/nexora-c16/data
```

See [docs/runbooks/development.md](docs/runbooks/development.md), [docs/runbooks/release.md](docs/runbooks/release.md), and [docs/runbooks/e2e-journeys.md](docs/runbooks/e2e-journeys.md) for the full verification and handoff flow. Backup and security recovery remain documented in [docs/runbooks/backup-restore.md](docs/runbooks/backup-restore.md) and [docs/runbooks/security-incident.md](docs/runbooks/security-incident.md).

The API requires `NEXORA_DATA_DIR`; other C00 settings have local-safe defaults. Configuration errors are typed and only report field names, never environment values. The bootstrap health contract is:

```json
{"status":"ok","version":"0.1.0","checks":{"api":"ok","db":"not_configured","queue":"not_configured"}}
```

## Repository Layout

```text
apps/api/              Fastify Control API and health route
apps/worker/           stoppable idle worker entrypoint
apps/mission-control/  React/Vite Mission Control shell
packages/config/       Zod environment boundary
tests/fixtures/        deterministic seed and fault injection fixtures
Dockerfile.*           Node 22 service images for local release smoke
docker-compose.yml      API, worker, web, and SQLite data volume
docs/adr/              architecture decisions
artifacts/progress/    command and runtime evidence by commit
```

## Architecture

The production direction is a single TypeScript monorepo. React/Vite Mission Control calls the Fastify Control API. The current release candidate includes typed domain commands, SQLite as the state source, an append-only event store, durable worker orchestration, schedules, recovery, and a workspace-scoped Runtime/Provider Registry. Registry descriptors are declarative facts only: they do not connect Hermes, call a provider, install MCP, or execute a tool.

## Versioned Contracts

The `@nexora/contracts` package is the C01 wire-contract boundary. Persisted domain records use raw canonical uppercase 26-character ULIDs and include `schema_version: 1` with workspace and UTC timestamp metadata. Contract objects are strict: unknown top-level and nested fields are rejected. Schema version and runtime protocol version are independent axes and are rejected when old or future.

C02 uses Node 22.13+'s built-in `node:sqlite` module. `pnpm db:migrate` applies the versioned SQLite migration to `NEXORA_DB_PATH` (defaulting to `<NEXORA_DATA_DIR>/nexora.sqlite`); `NEXORA_MIGRATION_MODE=validate` checks that migration 1 is already applied without changing the database.

Commands are asynchronous. An HTTP `202 Accepted` means the command was accepted for processing; it does not mean business work completed. Clients observe completion through versioned run and event contracts.

The C17/C18 registry surface is available at `GET /v1/registry?workspace_id=...` and typed `GET/POST/PUT /v1/registry/{runtimes,providers,models,backends,tools}` routes. Reads require `run:read`; registration and updates require `workspace:admin`, an `Idempotency-Key`, and updates also require `If-Match`. See [docs/runbooks/registry-operations.md](docs/runbooks/registry-operations.md) and [ADR-0013](docs/adr/0013-runtime-provider-registry.md).

Error responses have a stable shape and never echo rejected values or third-party text:

```json
{
  "schema_version": 1,
  "code": "SCHEMA_INVALID",
  "message": "Contract validation failed",
  "retryable": false,
  "required_action": "correct_request",
  "trace_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "details": [{"path":["title"],"code":"invalid_type"}]
}
```
