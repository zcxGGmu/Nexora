# End-to-End Journeys

The browser suite uses the fixture-backed Mission Control pages and never claims a real external side effect.

## Operator

1. Open Mission Control in the active workspace.
2. Follow a Goal/Ticket link to Run Detail.
3. Inspect the event cursor, budget, Artifact, and receipt.
4. Pause, stop, or retry only through the labelled recovery controls; prior side effects remain visible.
5. Refresh a deep link and confirm URL state survives without a second command.

## Reviewer

1. Open an R2 or R3 Review from Inbox.
2. Read the diff, source receipt, Judge, scope, risk, egress, cost, expiry, and exact payload hash.
3. Confirm approval is disabled for stale payloads or missing evidence.
4. Record a reasoned decision; the fixture reports that no external side effect was executed.

## Mobile and accessibility

Run at 390x844. Confirm exactly five mobile navigation items, no document-level horizontal overflow, a keyboard skip link, named navigation, 44px interactive targets, reduced-motion behavior, and zero axe violations.

## Recovery cases

The C16 fixture suite covers timeout, crash, stale lease, projection degradation, and connector outage. C15 backup/restore and audit verification remain the source of truth for database and evidence recovery; the browser suite does not replace those checks.
