import { describe, expect, it } from "vitest";

import { createPolicyEvent, redactSecrets } from "./index.js";

const SENTINEL = "nxr_live_secret_123456";

describe("policy redaction", () => {
  it("Given secret sentinel values When redacted Then logs and previews cannot contain the sentinel", () => {
    // Given
    const payload = {
      message: `token=${SENTINEL}`,
      nested: { api_key: SENTINEL, safe: "visible" },
      items: ["alpha", SENTINEL],
    };

    // When
    const result = redactSecrets(payload, { secret_refs: [SENTINEL] });

    // Then
    const json = JSON.stringify(result.value);
    expect(json).not.toContain(SENTINEL);
    expect(json).toContain("visible");
    expect(result.redactions).toEqual(expect.arrayContaining(["$.message", "$.nested.api_key", "$.items[1]"]));
  });

  it("Given a redaction decision When an event is created Then the event payload does not leak secrets", () => {
    // Given
    const result = redactSecrets({ error: `failed with ${SENTINEL}` }, { secret_refs: [SENTINEL] });

    // When
    const event = createPolicyEvent({
      decision: {
        allowed: false,
        code: "POLICY_DENIED",
        event_type: "secret.redacted",
        reason: "Secret value was redacted",
        required_action: "inspect_redactions",
        redactions: result.redactions,
      },
      event_id: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
      workspace_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      run_id: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
      trace_id: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
      occurred_at: "2026-08-26T04:00:00.000Z",
      actor: { type: "system", id: null },
      sequence: 0,
    });

    // Then
    expect(JSON.stringify(event)).not.toContain(SENTINEL);
    expect(event.event_type).toBe("secret.redacted");
    expect(event.redactions).toEqual(result.redactions);
  });

  it("Given cyclic data When redacted Then traversal terminates safely", () => {
    const cyclic: Record<string, unknown> = { token: SENTINEL };
    cyclic["self"] = cyclic;

    const result = redactSecrets(cyclic, { secret_refs: [SENTINEL] });

    expect(JSON.stringify(result.value)).not.toContain(SENTINEL);
    expect(result.redactions).toContain("$.token");
  });
});
