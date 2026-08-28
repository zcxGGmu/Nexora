import { EgressReceiptSchema, type DataClassification, type EgressReceipt, type ExecutionLocation, type PolicyDecisionRecord } from "@nexora/contracts";
import { allow, deny, toDecisionRecord, type PolicyDecision } from "./decisions.js";

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

type EgressReceiptBase = {
  readonly receipt_id: string;
  readonly workspace_id: string;
  readonly run_id: string;
  readonly attempt_id: string;
  readonly step_id: string;
  readonly trace_id: string;
  readonly execution_location: ExecutionLocation;
  readonly provider: string;
  readonly region: string;
  readonly data_classification: DataClassification;
  readonly redaction_count: number;
  readonly snapshot_hash: string;
  readonly created_at: string;
};

export type EgressReceiptInput = EgressReceiptBase &
  ({ readonly policy_decision: PolicyDecision | PolicyDecisionRecord; readonly policy_input?: never } | { readonly policy_input: EgressPolicyInput; readonly policy_decision?: never });

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

export function createEgressReceipt(input: EgressReceiptInput): EgressReceipt {
  const { policy_input, policy_decision: providedDecision, ...base } = input;
  if (policy_input !== undefined && !matchesReceiptMetadata(base, policy_input)) {
    throw new EgressPolicyDeniedError(toDecisionRecord(deny({ code: "POLICY_DENIED", event_type: "policy.denied", reason: "Egress receipt metadata does not match policy input", required_action: "recompute_egress_receipt" })));
  }
  const decision = policy_input === undefined ? normalizeDecision(providedDecision) : toDecisionRecord(evaluateEgressPolicy(policy_input));
  if (!decision.allowed) throw new EgressPolicyDeniedError(decision);
  return EgressReceiptSchema.parse({ ...base, schema_version: 1, policy_decision: decision });
}

function matchesReceiptMetadata(base: EgressReceiptBase, policyInput: EgressPolicyInput): boolean {
  return base.execution_location === policyInput.execution_location && base.provider === policyInput.provider && base.region === policyInput.region && base.data_classification === policyInput.data_classification;
}

function normalizeDecision(decision: PolicyDecision | PolicyDecisionRecord): PolicyDecisionRecord {
  if ("code" in decision) return { ...decision, redactions: [...decision.redactions] };
  return toDecisionRecord(decision);
}

export class EgressPolicyDeniedError extends Error {
  readonly name = "EgressPolicyDeniedError";

  constructor(readonly decision: PolicyDecisionRecord) {
    super(decision.reason);
  }
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
  if (target.username.length > 0 || target.password.length > 0) return true;
  if (input.execution_location === "remote" && target.port !== "" && target.port !== "443") return true;
  if (input.execution_location === "local") return false;
  if (isPrivateHost(target.hostname)) return true;
  return input.resolved_ips?.some((ip) => !isPublicIpv4(ip) || isPrivateHost(ip)) ?? false;
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
  if (isPublicIpv4(host) && !isGloballyRoutableIpv4(host)) return true;
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

function isPublicIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  if (parts.some((part) => part.length > 1 && part.startsWith("0"))) return false;
  const octets = parts.map((part) => Number(part));
  return octets.every((octet) => octet >= 0 && octet <= 255);
}

function isGloballyRoutableIpv4(value: string): boolean {
  const parts = value.split(".").map((part) => Number(part));
  const [first, second, third] = parts;
  if (first === undefined || second === undefined || third === undefined) return false;
  if (first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 192 && second === 0 && third === 0) return false;
  if (first === 192 && second === 0 && third === 2) return false;
  if (first === 192 && second === 88 && third === 99) return false;
  if (first === 192 && second === 168) return false;
  if (first === 198 && second === 18) return false;
  if (first === 198 && second === 19) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return !(first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31));
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
