Self-review: C01 exports the planned contract modules, uses strict Zod boundaries, raw uppercase ULIDs, separate schema/protocol versions, injectable clock, typed redacted schema errors, and conservative independent status unions. No create route or persistence behavior was added.

Review note: temporary G1 probe is validation-only; it does not claim business creation or persistence.

LOC audit: all created TypeScript files are below the 250 pure-LOC ceiling; the largest is schemas.test.ts at 124 lines. Static scan found no any annotations, forbidden assertions, non-null assertions, ts-ignore/ts-expect-error, or secrets.
Checklist: strict objects and nested fields; raw uppercase ULIDs; injectable UTC clock; complete error code set with redacted parse boundary; conservative distinct statuses; EventEnvelope; RuntimeEnvelope independent versions and all discriminators; ConnectorDescriptor validation; README/ADR boundaries; no production route; demo 5173 preserved.

Source-review corrections: required event constants, artifact/review lifecycle enums, connector `retry`/`rollback` names, strict payload factories, calendar-valid UTC timestamps, ULID overflow rejection, bounded connector semver/timeouts, bounded reference arrays, and malformed-trace fallback were added and covered by regression tests.

Security follow-up: error messages/tokens are length- and character-bounded; error detail count is capped; connector_versions remains a dynamic connector-name map but both names and semver values are constrained to safe bounded patterns.
