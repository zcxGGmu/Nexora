import { describe, expect, it } from "vitest";

import { EgressPolicyDeniedError, createEgressReceipt, evaluateEgressPolicy } from "./index.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const HASH = "sha256:" + "a".repeat(64);
const TIME = "2026-08-28T14:00:00.000Z";
const receiptInput = {
  receipt_id: ID,
  workspace_id: ID,
  run_id: ID,
  attempt_id: ID,
  step_id: ID,
  trace_id: ID,
  execution_location: "remote",
  provider: "github",
  region: "us",
  data_classification: "internal",
  redaction_count: 2,
  snapshot_hash: HASH,
  created_at: TIME,
} as const;

describe("policy egress", () => {
  it("Given remote restricted data When minimal snapshot is absent Then egress is denied", () => {
    // Given / When
    const decision = evaluateEgressPolicy({
      execution_location: "remote",
      provider: "openai",
      region: "us",
      data_classification: "restricted",
      allowed_providers: ["openai"],
      allowed_regions: ["us"],
      minimal_snapshot: false,
      target_url: "https://api.openai.com/v1/responses",
    });

    // Then
    expect(decision).toMatchObject({ allowed: false, code: "POLICY_DENIED", event_type: "policy.denied" });
  });

  it("Given local internal data When provider and region are allowed Then egress is allowed", () => {
    // Given / When
    const decision = evaluateEgressPolicy({
      execution_location: "local",
      provider: "local-runtime",
      region: "local",
      data_classification: "internal",
      allowed_providers: ["local-runtime"],
      allowed_regions: ["local"],
      minimal_snapshot: false,
      target_url: "http://127.0.0.1:3000/runtime",
    });

    // Then
    expect(decision).toMatchObject({ allowed: true });
  });

  it.each(["http://169.254.169.254/latest/meta-data", "https://example.com/../../secret", "file:///etc/passwd", "ftp://example.com/resource", "http://[::1]/", "https://[2606:4700:4700::1111]/", "https://[::ffff:127.0.0.1]/", "https://[::ffff:7f00:1]/", "https://[0:0:0:0:0:ffff:7f00:1]/", "https://[::ffff:a00:1]/", "https://[::ffff:ac10:1]/", "https://[::ffff:c0a8:1]/"])("rejects unsafe egress target %s", (targetUrl) => {
    // Given / When
    const decision = evaluateEgressPolicy({
      execution_location: "remote",
      provider: "github",
      region: "us",
      data_classification: "public",
      allowed_providers: ["github"],
      allowed_regions: ["us"],
      minimal_snapshot: true,
      target_url: targetUrl,
    });

    // Then
    expect(decision).toMatchObject({ allowed: false, code: "POLICY_DENIED" });
  });

  it.each(["2606:4700:4700::1111", "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:1", "::ffff:a00:1", "::ffff:ac10:1", "::ffff:c0a8:1"])("rejects unsafe resolved IP %s", (resolvedIp) => {
    const decision = evaluateEgressPolicy({
      execution_location: "remote",
      provider: "github",
      region: "us",
      data_classification: "public",
      allowed_providers: ["github"],
      allowed_regions: ["us"],
      minimal_snapshot: true,
      target_url: "https://api.github.com/repos/acme/site/contents",
      resolved_ips: [resolvedIp],
    });

    expect(decision).toMatchObject({ allowed: false, code: "POLICY_DENIED" });
  });

  it.each(["100.64.0.1", "192.0.0.1", "198.18.0.1", "224.0.0.1", "0177.0.0.1"])("rejects non-global resolved IPv4 %s", (resolvedIp) => {
    const decision = evaluateEgressPolicy({
      execution_location: "remote",
      provider: "github",
      region: "us",
      data_classification: "public",
      allowed_providers: ["github"],
      allowed_regions: ["us"],
      minimal_snapshot: true,
      target_url: "https://api.github.com/repos/acme/site/contents",
      resolved_ips: [resolvedIp],
    });

    expect(decision).toMatchObject({ allowed: false, code: "POLICY_DENIED" });
  });

  it("Given remote public data When provider region and resolved IP are allowed Then egress is allowed", () => {
    const decision = evaluateEgressPolicy({
      execution_location: "remote",
      provider: "github",
      region: "us",
      data_classification: "public",
      allowed_providers: ["github"],
      allowed_regions: ["us"],
      minimal_snapshot: true,
      target_url: "https://api.github.com/repos/acme/site/contents",
      resolved_ips: ["140.82.112.5"],
    });

    expect(decision).toMatchObject({ allowed: true });
  });

  it("Given remote public host without resolved IPs When evaluated Then egress is denied by default", () => {
    const decision = evaluateEgressPolicy({
      execution_location: "remote",
      provider: "github",
      region: "us",
      data_classification: "public",
      allowed_providers: ["github"],
      allowed_regions: ["us"],
      minimal_snapshot: true,
      target_url: "https://api.github.com/repos/acme/site/contents",
    });

    expect(decision).toMatchObject({ allowed: false, code: "POLICY_DENIED" });
  });

  it("Given a normalized allowed decision When an egress receipt is created Then its policy evidence is preserved", () => {
    const receipt = createEgressReceipt({
      ...receiptInput,
      policy_decision: { allowed: true, code: null, event_type: null, reason: "approved", required_action: "none", redactions: [] },
    });

    expect(receipt).toMatchObject({ schema_version: 1, execution_location: "remote", policy_decision: { allowed: true }, snapshot_hash: HASH });
  });

  it("Given denied evaluated egress When a receipt is requested Then no receipt is issued", () => {
    expect(() => createEgressReceipt({
      ...receiptInput,
      policy_input: {
        execution_location: "remote",
        provider: "blocked-provider",
        region: "us",
        data_classification: "internal",
        allowed_providers: ["github"],
        allowed_regions: ["us"],
        minimal_snapshot: true,
        target_url: "https://api.github.com/repos/acme/site",
        resolved_ips: ["140.82.112.5"],
      },
    })).toThrow(EgressPolicyDeniedError);
  });

  it("Given allowed evaluated egress When a receipt is requested Then the evaluated decision is recorded", () => {
    const receipt = createEgressReceipt({
      ...receiptInput,
      policy_input: {
        execution_location: "remote",
        provider: "github",
        region: "us",
        data_classification: "internal",
        allowed_providers: ["github"],
        allowed_regions: ["us"],
        minimal_snapshot: true,
        target_url: "https://api.github.com/repos/acme/site",
        resolved_ips: ["140.82.112.5"],
      },
    });

    expect(receipt.policy_decision).toMatchObject({ allowed: true, required_action: "none" });
  });

  it("Given an evaluated policy whose metadata differs from the receipt When created Then the receipt is denied", () => {
    expect(() => createEgressReceipt({
      ...receiptInput,
      provider: "different-provider",
      policy_input: {
        execution_location: "remote",
        provider: "github",
        region: "us",
        data_classification: "internal",
        allowed_providers: ["github"],
        allowed_regions: ["us"],
        minimal_snapshot: true,
        target_url: "https://api.github.com/repos/acme/site",
        resolved_ips: ["140.82.112.5"],
      },
    })).toThrow(EgressPolicyDeniedError);
  });
});
