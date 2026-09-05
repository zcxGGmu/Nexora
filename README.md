<p align="center">
  <img src="docs/assets/nexora-icon.svg" alt="Nexora project icon" width="112" height="112" />
</p>

<h1 align="center">Nexora</h1>

<p align="center"><a href="README.zh-CN.md">简体中文</a></p>

<p align="center"><strong>Local-first Agent OS control plane for durable, reviewed automation.</strong></p>

<p align="center">Coordinate multi-agent work through Mission Control, typed APIs, durable facts, review gates, receipts, checkpoints, skills, memory, and descriptor-only integrations.</p>

Nexora keeps the operating boundary visible. Commands record control-plane facts; external execution stays disabled until a later stage adds explicit adapters, consent, sandboxing, policy gates, receipts, and verification evidence.

## Start Here

```bash
nvm use
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test --run --reporter=dot --silent
pnpm --filter @nexora/mission-control build
```

- **Run locally:** `pnpm dev:api`, `pnpm dev:worker`, and `pnpm dev:web` in separate terminals.
- **Control surface:** Mission Control opens at `http://127.0.0.1:4311/` after the web service starts.
- **Data model:** the local database stores descriptors, events, receipts, checkpoints, schedules, and projections.
- **Default boundary:** descriptor-only control facts are allowed; live external execution is denied by default.

## Current Status

- Latest completed stage: C25 Studio / Media / Avatar control plane.
- Latest scoped commit: `0a3df795210f4b1520036f85b2a1df55adbc5335` (`feat: add studio media control plane`).
- Current readiness: C26 multi-agent team coordination and attachment descriptors are the next planned stage.
- Runtime boundary: local control-plane and descriptor-only unless a later stage explicitly enables a real adapter.
- Verification evidence: focused, unit, integration, e2e, Mission Control build, visual QA, ADRs, runbooks, and progress logs live under `artifacts/progress/` and `docs/`.

## What Works Today

Nexora currently provides a verified local control plane for:

| Area | What it covers | Boundary |
|---|---|---|
| Runtime registry | Runtime, provider, model, backend, tool, and protocol catalog descriptors | No real provider or external tool execution |
| Gateway | Gateway, channel, session, cursor checkpoint, message idempotency, delivery receipts, allowlists | No live messaging, web, or API provider connection |
| Goal Mode | Continuation, auxiliary Judge JSON, max turns, subgoals, pause/resume, deadline and budget controls | No real external Judge provider |
| Skills/Learning | Skill descriptors, versions, approved snapshots, quarantine, learning candidates, `/learn` | No external skill install or tool execution |
| Journal | Vault bridge descriptors, source snapshots, graph/FTS snapshots, memory candidates, writeback review facts | No real external vault, wearable, or protocol writeback |
| Browser/Computer | Browser/computer session descriptors, sandbox policy, target allowlists, approvals, action and screenshot receipts | No live browser or desktop automation |
| Voice/Jarvis | Audio policy, wake word, voice session, transcript lifecycle, wall-mode commands | No microphone read, speaker playback, STT/VAD/TTS, or voice provider call |
| Studio/Media | Media artifacts, render jobs, source/generation descriptors, avatar consent, share and command facts | No media/avatar provider, URL/PDF/cloud-file pull, render, or publish |

## Install

Use Node.js 22 and pnpm 10.10.0. The repository is intentionally local-first and does not require an external database, queue, provider account, telemetry collector, or SaaS credential.

```bash
nvm use
pnpm install --frozen-lockfile
cp .env.example .env
```

Minimum environment:

```bash
NEXORA_DATA_DIR=./.nexora/data
NEXORA_API_HOST=127.0.0.1
NEXORA_API_PORT=4310
NEXORA_LOG_LEVEL=info
NEXORA_AUTH_MODE=local
NEXORA_DB_PATH=./.nexora/data/nexora.sqlite
NEXORA_MIGRATION_MODE=auto
```

## Verify It Works

Nexora does not have a single `doctor` command yet. Use this verification loop as the project health check:

```bash
pnpm lint
pnpm typecheck
pnpm test --run --reporter=dot --silent
pnpm test:integration
pnpm test:e2e
pnpm --filter @nexora/mission-control build
```

Useful focused checks:

```bash
pnpm exec vitest run packages/contracts/src/studio-media.test.ts packages/persistence/src/c25-studio-media.test.ts apps/api/src/routes/studio-media.test.ts apps/cli/src/studio-media.test.ts apps/mission-control/src/pages/studio-media.test.tsx apps/mission-control/src/app/router.test.tsx --reporter=dot
pnpm exec vitest run apps/api/src/routes/gateway.test.ts apps/api/src/routes/goal-mode.test.ts apps/api/src/routes/skills-learning.test.ts --reporter=dot
```

The desktop environment may emit an engine warning if Node is newer than the project range. The project target is `>=22.13.0 <23.0.0`; record the warning instead of changing the engine constraint.

## Run Locally

Run the services in separate terminals:

```bash
pnpm dev:api       # http://127.0.0.1:4310
pnpm dev:worker    # local orchestration worker
pnpm dev:web       # http://127.0.0.1:4311
```

Seed a deterministic local workspace graph:

```bash
NEXORA_DATA_DIR=/tmp/nexora-local/data pnpm tsx tests/fixtures/seed-workspace.ts --data-dir /tmp/nexora-local/data
```

Run a release-like loopback stack with SQLite in a named volume:

```bash
docker compose config
docker compose build
docker compose up -d
curl -fsS http://127.0.0.1:4310/v1/health
curl -fsS -I http://127.0.0.1:4311/
docker compose down
```

The compose stack is local-only: API and web bind to loopback, SQLite stays local, and no provider, connector, external database, queue, or telemetry backend is started.

## Command And API Surface

HTTP commands return `202 Accepted` when a control fact is recorded. That status does not mean external business work completed. Completion, review, and recovery are observed through persisted descriptors, events, receipts, and projections.

Common API surfaces:

| Surface | Example |
|---|---|
| Health | `GET /v1/health` |
| Registry | `GET /v1/registry?workspace_id=...` |
| Gateway | `GET /v1/gateway?workspace_id=...` |
| Goal Mode | `GET /v1/goal-loops?workspace_id=...` |
| Skills/Learning | `GET /v1/skills?workspace_id=...` |
| Journal | `GET /v1/journal?workspace_id=...` |
| Browser/Computer | `GET /v1/browser-computer?workspace_id=...` |
| Voice/Jarvis | `GET /v1/voice-sessions?workspace_id=...` |
| Studio/Media | `GET /v1/studio?workspace_id=...` |

Writes require Owner workspace authority and an `Idempotency-Key`. Versioned updates and operator commands require `If-Match`. Reads require `run:read`. Error responses use stable redacted contracts and never echo secrets, tokens, rejected raw values, or internal file paths.

## Mission Control

Mission Control is the local web control surface for operations. Current pages include:

- Inbox, goals, tickets, runs, reviews, artifacts, memory, workflows, and design system.
- Registry, Gateway, Goal Mode, Skills/Learning, Journal, Browser/Computer, Voice/Jarvis, and Studio/Media.
- Desktop and mobile responsive layouts with a five-item mobile bottom nav used by the current QA gates.

Representative local URLs:

```text
http://127.0.0.1:4311/
http://127.0.0.1:4311/registry?workspace=ws-demo
http://127.0.0.1:4311/gateway?workspace=ws-demo
http://127.0.0.1:4311/studio-media?workspace=ws-demo
```

Some stage visual QA scripts use port `4313` to isolate browser tests from the normal development server.

## Safety Model

Nexora is built around conservative control-plane guarantees:

- Strict wire contracts reject unknown fields and invalid versions.
- SQLite migrations enforce workspace/run scope, foreign keys, payload/column parity, append-only facts, and guarded state transitions.
- Idempotency keys bind to stable client-controlled semantics; changed replay is rejected.
- `If-Match` optimistic concurrency prevents stale operator commands from silently winning.
- Descriptor references reject `secret://`, raw local paths, HTTP(S) where unsafe, traversal, backslashes, encoded secret/path markers, default-ignorable characters, and credential-shaped text.
- External execution is denied by default until a later stage adds an explicit adapter, consent, sandbox, policy, receipts, and verification gates.

## Repository Layout

```text
apps/api/              Control API, auth, command routes, local bootstrap
apps/cli/              Parser for descriptor-only control commands
apps/mission-control/  Mission Control web UI
apps/worker/           Local orchestration worker entrypoint
packages/contracts/    Versioned wire contracts
packages/persistence/  SQLite migrations, schema, repositories, rollback checks
packages/policy/       Workspace scope and authorization decisions
packages/orchestration/ Durable queue, schedules, leases, recovery
packages/runtime-adapters/ Deterministic, local, and remote adapter contracts
packages/memory/       Markdown-backed memory and receipts
packages/artifacts/    Artifact metadata and persistence helpers
packages/connectors/   Connector contracts and policy-safe descriptors
tests/                 Integration, e2e, fixtures, and recovery drills
docs/adr/              Architecture decision records
docs/runbooks/         Operator runbooks and incident/recovery procedures
artifacts/progress/    Stage evidence, verification logs, screenshots, handoffs
```

## Architecture

Nexora is a TypeScript monorepo. Mission Control calls the Control API. The API writes strict descriptor records and command facts into the local database. Domain packages define contracts, policy, persistence, orchestration, runtime adapter boundaries, memory, artifacts, and connector descriptors.

The design favors durable facts over implicit process memory:

- SQLite is the source of truth for run state, descriptors, events, schedules, receipts, and projections.
- Markdown vault files summarize memory and operational artifacts where human readability matters.
- Append-only facts back reviews, delivery receipts, browser/computer actions, voice commands, render jobs, generation descriptors, shares, and Studio commands.
- Recovery is based on checkpoints, leases, persisted cursors, idempotency records, and explicit runbooks.

## Documentation

Start here for operations and design details:

- [Development runbook](docs/runbooks/development.md)
- [Release runbook](docs/runbooks/release.md)
- [Backup and restore](docs/runbooks/backup-restore.md)
- [Registry operations](docs/runbooks/registry-operations.md)
- [Gateway operations](docs/runbooks/gateway-operations.md)
- [Goal Mode operations](docs/runbooks/goal-mode-operations.md)
- [Skills/Learning operations](docs/runbooks/skills-learning-operations.md)
- [Journal operations](docs/runbooks/journal-operations.md)
- [Browser/Computer operations](docs/runbooks/browser-computer-operations.md)
- [Voice/Jarvis operations](docs/runbooks/voice-jarvis-operations.md)
- [Studio/Media operations](docs/runbooks/studio-media-operations.md)

Architecture decisions live in [docs/adr](docs/adr). The active progress ledger is [tasks/agent-os-progress.md](tasks/agent-os-progress.md).

## Roadmap

The next planned stages are:

| Stage | Scope | Boundary |
|---|---|---|
| C26 | Multi-agent team descriptors, attachments, parallel attempts, dependencies, merge/review facts | Control-plane only |
| C27 | Business connector descriptors for enterprise systems, search, publishing, enrichment, workspace, and customer engagement surfaces | Draft/review by default; real authorization and side effects require explicit approval |
| C28 | Private/mobile deployment, backup/restore, secure networking, mobile approval, remote revoke | Deployment and remote safety gates before live operation |

## License

Private repository. Add a license file before distributing outside the project owner boundary.
