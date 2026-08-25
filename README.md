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
docs/adr/              architecture decisions
artifacts/progress/    command and runtime evidence by commit
```

## Architecture

The production direction is a single TypeScript monorepo. React/Vite Mission Control calls the Fastify Control API. Later stages will add typed domain commands, SQLite as the state source, an append-only event store, and durable worker orchestration. C00 deliberately leaves database, queue, and external connector checks as `not_configured` until those stages land.
