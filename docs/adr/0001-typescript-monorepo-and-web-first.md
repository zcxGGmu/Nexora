# ADR-0001: TypeScript Monorepo and Web-First Mission Control

- Status: accepted
- Date: 2026-08-25
- Decision owners: Nexora maintainers

## Context

Nexora needs one local development surface for the Control API, worker process, and Mission Control UI. The implementation plan calls for a Node.js 22 TypeScript stack, a pnpm workspace, a Fastify API, a React/Vite shell, and testable package boundaries. The existing `demo/` is a separate static product surface and must not be treated as the production runtime.

## Decision

Use a pnpm workspace with `apps/api`, `apps/worker`, `apps/mission-control`, and `packages/config` as the first C00 packages. Use strict TypeScript settings, Zod at the environment boundary, Vitest for behavior tests, and Playwright configuration for later end-to-end coverage.

The API exposes `/v1/health` as the first observable contract. It reports API readiness and explicitly labels database and queue checks as `not_configured` until their stages are implemented. The web app is a real React/Vite DOM entrypoint so the control plane has a visible, browser-verifiable surface from the first commit.

## Consequences

- One lockfile and shared compiler policy make local installs and package references reproducible.
- `NEXORA_DATA_DIR` is required, while host, port, log level, and local auth mode default to local-safe values.
- Configuration errors expose field names only; raw environment values are never included in error text.
- Fastify is intentional for this approved plan even though generic TypeScript guidance may recommend another framework.
- C00 does not add database tables, queues, connectors, or business behavior. Those remain separately versioned stages.

## Rejected alternatives

- A standalone package per service was rejected because it would duplicate compiler and dependency policy before the domain contracts exist.
- Treating the existing `demo/` as production was rejected because it has no API, persistence, or worker boundary.
- Starting with database or queue wiring was rejected because health must first establish an observable, dependency-free bootstrap.
