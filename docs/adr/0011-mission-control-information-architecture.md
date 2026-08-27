# ADR-0011: Mission Control Information Architecture

## Status

Accepted for C10.

## Context

C10 is the first real Mission Control UI layer. The frontend must expose the control plane as a scoped, URL-restorable operational shell rather than a chat transcript or a decorative dashboard. Existing C09 APIs remain the authority for commands, projections, and run events.

The design contract requires a graphite control room, a single teal action accent, durable deep links, visible state explanations, and mobile navigation with exactly five destinations. The C10 shell also needs a primitive showcase before product screens are treated as visually complete.

## Decision

- Implement a native History-compatible router with explicit route definitions for `/mission-control`, `/inbox`, `/goals`, `/tickets`, `/runs/:id`, `/review/:id`, `/artifacts/:id`, `/memory`, `/settings`, plus `/cowork/:conversationId?` and `/design-system` for the C10 entry/showcase requirements.
- Preserve `workspace`, `site`, `project`, `filter`, `tab`, and `cursor` in generated hrefs so refresh and browser back restore view state without replaying commands.
- Centralize scope state in a React context. Switching scope increments a query epoch, clears stale list projections, and removes filter/tab/cursor state before new scoped data is loaded.
- Add a TanStack Query client and `ky`-based control API boundary for future C11+ projection reads. Production code does not use bare `fetch`.
- Implement a minimal SSE reducer that deduplicates events by `event_id` and tracks the latest cursor from C09 run event streams.
- Use shared `StatePlane` components for loading, empty, offline, error, permission denied, and partial success states. Each state must name the condition, impact, and next allowed action.
- Keep C10 product screens honest: Mission Control and Inbox show real shell composition and fixture projections, while later-stage workspaces render safe routed placeholders instead of pretending C11 controls already exist.

## Consequences

- The C10 frontend can be verified independently of the API process while still matching C09 URL and event contracts.
- C11 can replace fixture projections with query hooks without changing route names, shell geometry, or shared state language.
- The `/design-system` route becomes the visible acceptance surface for primitive states, focus targets, status labels, and long unbroken evidence content.
- Native routing avoids an extra router dependency for the first shell. If route loaders or nested data APIs become necessary, this ADR should be revised before adding a routing library.

## Verification

- Unit tests cover route definitions, deep-link URL state preservation, scope switching, query/write state transitions, SSE event dedupe, shared states, Mission Control priority order, Inbox tabs, status labels, and 44px target CSS.
- Browser QA must capture `/design-system`, `/mission-control`, and `/inbox` at C10 breakpoints and confirm no blank pages, no color-only states, and no body-level horizontal overflow.
