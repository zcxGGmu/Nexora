# Nexora Design System

## 0. Research Log

- Embedded references: shortlisted `linear.app.md`, `sentry.md`, and `aside.md`; selected the operational discipline of `taste-skill.md` plus the dense, restrained app-shell grammar of `linear.app.md`. They are reference material, not a request to copy brand names, copy, or signature colors.
- Product evidence: [Agent OS design](docs/agent-os-design.md) supplies the control-plane states, visual assets, roles, and safety constraints. [AionUI comparison](docs/aionui-analysis-and-agent-os-comparison.md) supplies workspace-bound Cowork, Team, Preview, Cron, and runtime-confirmation patterns.
- UI research: the `ui-ux-pro-max` design-system query was run for an operational Agent OS. Its event-landing recommendation was rejected because a campaign layout is not a suitable grammar for a long-running control console.
- Visual references viewed: [contact sheet](docs/assets/agent-os-frontend/contact-sheet.png), which is structural source material only. It validates the need for dense triage, not a frozen pixel layout.
- Source boundary: the supplied `qMvkdMzuYjs` YouTube page is inaccessible in this environment. The Agent OS themes below are taken from the repository's evidence-bounded source synthesis; no unverified video sequence, transcript, performance, cost, or safety claim is adopted as fact.
- Deferred lane: no image generation or visual QA ran because this repository currently contains a documentation specification rather than a runnable UI. Before C10 screen composition, implement the primitive showcase described in Section 5 and run visual QA at the defined breakpoints.

## 1. Atmosphere & Identity

Nexora is a quiet operating room for consequential agent work: compact enough for continual scanning, calm enough to support judgment, and explicit about what the system knows, did, and is still waiting to do. Its signature is the **evidence spine**: an operator can move from a human-readable request to the exact Goal, Ticket, Run, Artifact version, review decision, and receipt without changing mental models. The interface uses neutral graphite layers and a restrained teal action color, so urgency comes from state, evidence, and hierarchy rather than decorative glow.

Design dials: `DESIGN_VARIANCE: 3`, `MOTION_INTENSITY: 2`, `VISUAL_DENSITY: 8`. This is an operational product, not a marketing canvas.

## 2. Color

### Palette

| Role | Token | Value | Usage |
|---|---|---:|---|
| Canvas | `--surface-canvas` | `#0B0D0F` | Application background |
| Shell | `--surface-shell` | `#111518` | Persistent navigation and top bar |
| Surface | `--surface-default` | `#171C20` | Lists, panels, inputs |
| Raised | `--surface-raised` | `#20272C` | Menus, sheets, focused work areas |
| Sunken | `--surface-sunken` | `#080A0B` | Timelines, code, trace regions |
| Text primary | `--text-primary` | `#F2F5F6` | Primary content |
| Text secondary | `--text-secondary` | `#B8C1C7` | Supporting information |
| Text muted | `--text-muted` | `#7D8A92` | Metadata and inactive controls |
| Border | `--border-default` | `#30393F` | Structural separation |
| Border subtle | `--border-subtle` | `#222A2F` | List separators |
| Accent | `--accent-primary` | `#1D9A8A` | One primary command, links, selected state |
| Accent hover | `--accent-hover` | `#27B29F` | Hover and pressed feedback |
| Info | `--status-info` | `#48A9E6` | Queue, sync, and informational state |
| Success | `--status-success` | `#49B675` | Verified or completed state |
| Warning | `--status-warning` | `#E6A23C` | Budget, degraded, or attention state |
| Danger | `--status-danger` | `#E76F6F` | Failure, destructive action, or R3 risk |
| Focus | `--focus-ring` | `#9DDBFF` | 2px visible focus outline plus 2px offset |

### Rules

- `--accent-primary` is for a user-initiated primary command, selected navigation, and direct links. It is not an ambient background effect.
- Status always pairs a color with a label and an icon or shape. A green dot alone never means "safe" or "complete."
- Risk is not status: an R3 badge uses label and icon even when its action is otherwise successful.
- Text and component pairings must meet WCAG 2.2 AA: 4.5:1 for normal text and 3:1 for large text and non-text focus indicators.
- No component may introduce a raw color. Add a semantic token first.

## 3. Typography

### Scale

| Role | Size | Weight | Line height | Tracking | Usage |
|---|---:|---:|---:|---:|---|
| Page title | 28px | 600 | 36px | 0 | Page context |
| Section title | 20px | 600 | 28px | 0 | Major panel heading |
| Panel title | 16px | 600 | 24px | 0 | Card or inspector title |
| Body | 14px | 400 | 22px | 0 | Default dense reading text |
| Label | 13px | 500 | 18px | 0 | Controls and list labels |
| Metadata | 12px | 400 | 16px | 0 | Timestamps, scope, IDs |
| Data | 12px | 400 | 18px | 0 | Hashes, costs, IDs, logs |

### Font Stack

- UI: `Fira Sans, Noto Sans SC, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
- Data: `Fira Code, SFMono-Regular, Consolas, monospace`

### Rules

- Body text is never below 14px; metadata remains at least 12px with a 16px line height.
- Use tabular figures for duration, cost, count, sequence, timestamp, and hash fragments.
- Do not use viewport-scaled font sizes or negative letter spacing. Text wraps before it truncates unless a list cell has an explicit accessible full-value affordance.
- Long IDs and unbroken values use `overflow-wrap: anywhere` in detail views; compact list cells truncate with a tooltip and copy action.

## 4. Spacing & Layout

### Base Unit

All intent spacing uses a 4px base.

| Token | Value | Usage |
|---|---:|---|
| `--space-1` | 4px | Icon-to-label and badge internals |
| `--space-2` | 8px | Dense row gaps |
| `--space-3` | 12px | Form field internals and panel stacks |
| `--space-4` | 16px | Default panel padding |
| `--space-5` | 20px | Page section rhythm |
| `--space-6` | 24px | Comfortable inspector spacing |
| `--space-8` | 32px | Page-section separation |

### App Grid

- Wide (`>=1440px`): 232px navigation, 56px top bar, fluid main body, optional 336px context rail.
- Desktop (`1024px-1439px`): 216px navigation, fluid main body, contextual rail opens as a resizable drawer.
- Tablet (`768px-1023px`): 64px icon rail plus labelled navigation drawer; one content pane and an overlay inspector.
- Mobile (`<768px`): one primary pane, 56px top bar, fixed five-item bottom navigation, and modal/action-sheet secondary controls.
- Every full-height app shell uses `100dvb` and a bounded `scroll-body-shell`. The main content is the page scroll owner; a list-detail page may name one scroll owner per independent pane. Any extra scroll region must have a documented job.
- Data grids use intrinsic tracks: `repeat(auto-fit, minmax(min(16rem, 100%), 1fr))`. The primary content never requires horizontal scrolling at 375px.

## 5. Components

### AppShell

- **Structure:** skip link, persistent navigation, top bar, route body, contextual inspector or drawer, mobile bottom navigation.
- **Variants:** wide, desktop, tablet, mobile; inspector open/closed.
- **States:** connected, reconnecting, offline, degraded, permission-filtered.
- **Accessibility:** skip link targets the route heading; navigation uses `aria-current`; current scope is announced after a successful change.
- **Layout:** `fixed-sidenav-shell`; only the route body owns the main scroll.

### ScopeSwitcher

- **Structure:** workspace button, hierarchical breadcrumbs, searchable picker, current policy/read-write badge.
- **Variants:** full breadcrumb, compact breadcrumb, mobile sheet.
- **States:** loading, selected, read-only, denied, stale selection.
- **Accessibility:** combobox semantics, arrow-key navigation, selection announcement, and no silent reset of filters.
- **Motion:** 180ms opacity/transform menu transition, disabled under reduced motion.

### CommandPalette And QuickComposer

- **Structure:** intent textarea, attached context chips, agent/model/tool policy summary, submit command, progressive advanced controls.
- **Variants:** global command palette, Cowork composer, create Goal/Ticket sheet.
- **States:** idle, validating, submitting, accepted, permission denied, conflict, offline draft.
- **Accessibility:** visible labels, `aria-describedby` for policy consequences, submit status in a polite live region.
- **Rule:** accepted commands show `Queued` or `Starting`, never a false "completed" state.

### StatusBadge And EvidenceChip

- **Structure:** icon, readable label, optional count or timestamp; evidence chips also deep-link to the source object.
- **Variants:** run state, risk R0-R3, trust, sync, egress, judge, review, artifact visibility.
- **States:** current, stale, unavailable, redacted.
- **Accessibility:** color is supplementary; icon-only compact form has an accessible name.

### AttentionRow And RunRow

- **Structure:** leading severity/risk marker, title, scope, current phase, elapsed/budget data, next safe action, evidence links.
- **Variants:** attention, active, paused, blocked, terminal, partial success.
- **States:** loading skeleton, empty action, inaccessible data, stale projection.
- **Layout:** one line at wide sizes; wraps into label/data/action groups on narrow sizes without moving the action outside its row.

### EvidenceInspector

- **Structure:** summary, provenance links, immutable IDs, source receipt, model/runtime data, audit events, recovery actions.
- **Variants:** run, review, artifact, memory, egress.
- **States:** loading, redacted, missing source, stale approval, reconciliation required.
- **Accessibility:** tabs use the ARIA tabs pattern; tables expose header associations and provide copyable values.

### ReviewDecisionSheet

- **Structure:** risk summary, exact payload hash, target resources, expected egress, reversibility, evidence checklist, reason field, action buttons.
- **Variants:** R1 quick confirmation, R2 review, R3 high-risk review.
- **States:** unavailable evidence, hash mismatch, stale, insufficient role, offline, submitted, executed receipt.
- **Accessibility:** trap focus only while open, restore focus to trigger, require an explicit confirmation action, and associate validation errors with their inputs.

### ArtifactPreview

- **Structure:** version header, content renderer, source summary, editor or read-only mode, Preview/Diff/Source/Receipt tabs.
- **Variants:** Markdown, code, HTML, image, PDF, Office, JSON, CSV, log, unsupported.
- **States:** loading, too large, unsupported, failed renderer, redacted, stale edit conflict.
- **Rule:** previews resolve a fixed artifact version. Editing creates a new version and invalidates any approval tied to the older payload.

### StatePlane

- **Structure:** status icon, factual title, impact statement, next permitted action, supporting evidence link.
- **Variants:** loading, empty, offline, error, permission denied, conflict, partial success, side-effect unknown.
- **Accessibility:** error/permission condition uses `role="alert"` where appropriate; success uses `aria-live="polite"` and never steals focus.

### Primitive Showcase Gate

Before composing C10 product screens, build a `/design-system` route that demonstrates every primitive above in default, hover, active, focus, disabled, loading, empty, error, redacted, and long-content states at 375px, 768px, 1024px, and 1440px. Capture visual and accessibility evidence with the C10 artifacts; no product screen is considered visually complete until its underlying primitives pass this gate.

## 6. Motion & Interaction

| Token | Duration | Easing | Usage |
|---|---:|---|---|
| `--motion-fast` | 120ms | ease-out | Press and status emphasis |
| `--motion-standard` | 180ms | ease-out | Menu, drawer, inspector transition |
| `--motion-slow` | 240ms | ease-in-out | Route-level pane replacement |

- Animate only `opacity` and `transform`; do not animate layout dimensions or progress with decorative motion.
- A live Run can update its timeline without shifting the reader away from the current event. New events append with a non-disruptive indicator if the reader has scrolled away from the tail.
- Every action has hover, pressed, keyboard-focus, disabled, and in-flight feedback. On touch, feedback is triggered by press, never hover.
- `prefers-reduced-motion` disables non-essential transitions and event entrance animation.

## 7. Depth & Surface

### Strategy

Use **tonal shift plus borders**. Graphite luminance steps make shell, work surface, evidence inspector, and modal hierarchy readable without decorative glass or luminous gradients.

| Layer | Treatment | Usage |
|---|---|---|
| Shell | `--surface-shell` plus `--border-subtle` | Navigation and top bar |
| Default | `--surface-default` plus 1px `--border-default` | Lists, panels, fields |
| Raised | `--surface-raised` plus 1px `--border-default` | Context menu, inspector, overlay |
| Modal | Raised surface plus restrained shadow `0 16px 40px rgba(0,0,0,.32)` | Decision sheets only |

- Corner radii: 4px compact controls, 6px standard controls, 8px panels/sheets. Cards never exceed 8px.
- Avoid cards inside cards. Lists and page sections use dividers and negative space; cards frame independently actionable work items.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target WCAG 2.2 AA, including 4.5:1 normal-text contrast, visible 2px focus treatment, semantic headings, and logical keyboard order.
- Interactive touch target is at least 44 by 44 CSS pixels with at least 8px separation from adjacent touch targets.
- Use Lucide icons consistently; every icon-only control has a visible tooltip and accessible name.
- Keyboard routes: `Tab` follows visual order; Escape closes sheets/menus; arrow keys operate listbox, tree, tabs, and board menus; drag operations have menu and keyboard alternatives.
- Review actions must remain operable without pointer drag, color perception, or animation.
- Respect user text scaling and avoid horizontal primary-content scroll at 375px.

### Accepted Debt

| Item | Location | Why accepted | Owner / exit |
|---|---|---|---|
| Workflow graph canvas authoring | Workflow surface | The current C10-C12 plan does not yet include a mature graph editing engine or its full keyboard model. | Ship read-only graph plus node inspector first; remove debt only after graph-edit keyboard, zoom, and screen-reader design are tested. |
| Long rich-media diff on mobile | Review and Artifact surfaces | A phone cannot safely present a full multi-column diff. | Mobile opens an evidence summary and transfers the exact deep link to desktop; retain R3 decision only where the compact evidence checklist is complete. |
