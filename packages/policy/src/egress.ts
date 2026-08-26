import type { DataClassification, ExecutionLocation } from "@nexora/contracts";
import { allow, deny, type PolicyDecision } from "./decisions.js";

export type EgressPolicyInput = {
  readonly execution_location: ExecutionLocation;
  readonly provider: string;
  readonly region: string;
  readonly data_classification: DataClassification;
  readonly allowed_providers: readonly string[];
  readonly allowed_regions: readonly string[];
  readonly minimal_snapshot: boolean;
  readonly target_url: string;
  readonly resolved_ips?: readonly string[];
};

export function evaluateEgressPolicy(input: EgressPolicyInput): PolicyDecision {
  const target = parseTargetUrl(input.target_url);
  if (target === undefined || hasPathTraversal(input.target_url) || isUnsafeTarget(target, input)) {
    return deny({ code: "POLICY_DENIED", event_type: "policy.denied", reason: "Egress target is not allowed", required_action: "choose_allowed_target" });
  }
  if (!input.allowed_providers.includes(input.provider)) {
    return deny({ code: "POLICY_DENIED", event_type: "policy.denied", reason: "Egress provider is not allowed", required_action: "choose_allowed_provider" });
  }
  if (!input.allowed_regions.includes(input.region)) {
    return deny({ code: "POLICY_DENIED", event_type: "policy.denied", reason: "Egress region is not allowed", required_action: "choose_allowed_region" });
  }
  if (input.execution_location === "remote" && input.data_classification !== "public" && !input.minimal_snapshot) {
    return deny({ code: "POLICY_DENIED", event_type: "policy.denied", reason: "Remote egress requires a minimal snapshot", required_action: "create_minimal_snapshot" });
  }
  if (input.execution_location === "remote" && (input.resolved_ips === undefined || input.resolved_ips.length === 0)) {
    return deny({ code: "POLICY_DENIED", event_type: "policy.denied", reason: "Remote egress requires resolved public IPs", required_action: "resolve_egress_host" });
  }
  return allow("Egress allowed");
}

function parseTargetUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

function isUnsafeTarget(target: URL, input: EgressPolicyInput): boolean {
  if (!isAllowedProtocol(target.protocol, input.execution_location)) return true;
  if (input.execution_location === "local") return false;
  if (isPrivateHost(target.hostname)) return true;
  return input.resolved_ips?.some(isPrivateHost) ?? false;
}

function hasPathTraversal(value: string): boolean {
  return value.includes("..") || value.toLowerCase().includes("%2e");
}

function isAllowedProtocol(protocol: string, executionLocation: ExecutionLocation): boolean {
  if (executionLocation === "remote") return protocol === "https:";
  return protocol === "http:" || protocol === "https:";
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  const mappedIpv4 = ipv4MappedToDotted(host);
  if (mappedIpv4 !== undefined) return isPrivateHost(mappedIpv4);
  if (host.includes(":")) return true;
  if (host === "localhost") return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  if (host === "::" || host === "0:0:0:0:0:0:0:0") return true;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  if (host.startsWith("::ffff:")) return isPrivateHost(host.slice("::ffff:".length));
  if (host.startsWith("127.")) return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("0.")) return true;
  if (host.startsWith("169.254.")) return true;
  if (host.startsWith("192.168.")) return true;
  return /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function ipv4MappedToDotted(host: string): string | undefined {
  const dotted = /^.*:ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  if (dotted !== null) return dotted[1];
  const hex = /^.*:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (hex === null) return undefined;
  const high = parseInt(hex[1] ?? "", 16);
  const low = parseInt(hex[2] ?? "", 16);
  if (!Number.isInteger(high) || !Number.isInteger(low) || high < 0 || high > 0xffff || low < 0 || low > 0xffff) return undefined;
  return `${Math.floor(high / 256)}.${high % 256}.${Math.floor(low / 256)}.${low % 256}`;
}
