import { z } from "zod";
import { TimestampSchema } from "./common.js";
import { containsSecretLikeText } from "./goal.js";
import { IdempotencyKeySchema } from "./gateway.js";
import { RunIdSchema, UlidSchema, WorkspaceIdSchema } from "./ids.js";
import { PayloadHashSchema, RiskLevelSchema } from "./policy.js";
import { DescriptorIdSchema } from "./registry.js";

const DEFAULT_IGNORABLE_CODE_POINT_PATTERN = /\p{Default_Ignorable_Code_Point}/u;
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const DescriptorMetadataSchema = z.object({
  id: DescriptorIdSchema,
  workspace_id: WorkspaceIdSchema,
  schema_version: z.literal(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  revision: z.number().int().positive().default(1),
}).strict();

const FactMetadataSchema = z.object({
  id: UlidSchema,
  workspace_id: WorkspaceIdSchema,
  schema_version: z.literal(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
}).strict();

const SecretSafeTextSchema = (maximumLength: number): z.ZodType<string> => z.string().min(1).max(maximumLength)
  .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
  .refine((value) => !DEFAULT_IGNORABLE_CODE_POINT_PATTERN.test(value), "default-ignorable characters are not allowed");

const NullableSecretSafeTextSchema = (maximumLength: number): z.ZodType<string | null> => SecretSafeTextSchema(maximumLength).nullable();

const BrowserComputerTargetRefSchema = z.string().min(1).max(512)
  .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
  .refine(isSafeBrowserComputerTargetRef, "browser/computer target refs must stay inside descriptor-safe targets");

const BrowserComputerArtifactRefSchema = z.string().min(1).max(512)
  .regex(/^artifact:\/\/[A-Za-z0-9._~/-]+$/)
  .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
  .refine((value) => !hasUnsafePathSegments(value.slice("artifact://".length)), "artifact refs must not include traversal");

export const BrowserComputerSessionModeSchema = z.enum(["foreground", "background"]);
export const BrowserComputerSessionStatusSchema = z.enum(["active", "paused", "stopped", "takeover_requested", "error"]);
export const BrowserComputerActionKindSchema = z.enum(["navigate", "click", "type", "scroll", "screenshot", "app_focus"]);
export const BrowserComputerActionStatusSchema = z.enum(["pending_approval", "approved", "policy_denied", "completed", "failed"]);
export const BrowserComputerActionReceiptStatusSchema = z.enum(["policy_denied", "completed", "failed", "acknowledged"]);
export const BrowserComputerCommandKindSchema = z.enum(["pause", "resume", "stop", "takeover"]);
export const BrowserComputerTargetKindSchema = z.enum(["browser_url", "computer_app"]);
export const HumanApprovalDecisionSchema = z.enum(["approved", "denied"]);
export const SandboxNetworkModeSchema = z.enum(["deny_by_default"]);
export const SandboxFilesystemModeSchema = z.enum(["deny"]);
export const SandboxClipboardModeSchema = z.enum(["deny"]);
export const SandboxCredentialModeSchema = z.enum(["deny"]);
export const SandboxAutomationModeSchema = z.enum(["approval_required"]);
export const TargetAllowlistDecisionSchema = z.enum(["allow", "deny"]);

export const SandboxPolicySchema = DescriptorMetadataSchema.extend({
  name: SecretSafeTextSchema(160),
  network_mode: SandboxNetworkModeSchema,
  filesystem_mode: SandboxFilesystemModeSchema,
  clipboard_mode: SandboxClipboardModeSchema,
  credential_mode: SandboxCredentialModeSchema,
  automation_mode: SandboxAutomationModeSchema,
  allowed_target_kinds: z.array(BrowserComputerTargetKindSchema).min(1).max(8),
  descriptor_only: z.literal(true),
}).strict();

const BaseBrowserComputerSessionSchema = FactMetadataSchema.extend({
  revision: z.number().int().positive().default(1),
  run_id: RunIdSchema,
  gateway_session_id: UlidSchema,
  sandbox_policy_id: DescriptorIdSchema,
  name: SecretSafeTextSchema(160),
  mode: BrowserComputerSessionModeSchema,
  status: BrowserComputerSessionStatusSchema,
  last_screenshot_id: UlidSchema.nullable(),
  takeover_by: z.string().min(1).max(160).nullable().refine((value) => value === null || !containsSecretLikeText(value), "secret-shaped text is not allowed"),
  descriptor_only: z.literal(true),
}).strict();

export const BrowserSessionDescriptorSchema = BaseBrowserComputerSessionSchema.extend({
  kind: z.literal("browser"),
  current_target_ref: BrowserComputerTargetRefSchema.nullable(),
}).strict();

export const ComputerUseSessionDescriptorSchema = BaseBrowserComputerSessionSchema.extend({
  kind: z.literal("computer"),
  platform: z.enum(["macos", "linux", "windows"]),
  display_ref: BrowserComputerTargetRefSchema,
  active_app_ref: BrowserComputerTargetRefSchema.nullable(),
}).strict();

export const TargetAllowlistEntrySchema = FactMetadataSchema.extend({
  session_id: UlidSchema,
  target_kind: BrowserComputerTargetKindSchema,
  target_ref: BrowserComputerTargetRefSchema,
  decision: TargetAllowlistDecisionSchema,
  reason: SecretSafeTextSchema(512),
  expires_at: TimestampSchema.nullable(),
  created_by: z.string().min(1).max(160).nullable().refine((value) => value === null || !containsSecretLikeText(value), "secret-shaped text is not allowed"),
  descriptor_only: z.literal(true),
}).strict();

export const HumanApprovalSchema = FactMetadataSchema.extend({
  session_id: UlidSchema,
  action_intent_id: UlidSchema,
  action_payload_hash: PayloadHashSchema,
  decision: HumanApprovalDecisionSchema,
  decided_by: z.string().min(1).max(160).refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed"),
  decided_at: TimestampSchema,
  reason: SecretSafeTextSchema(512),
  descriptor_only: z.literal(true),
}).strict();

export const ActionIntentSchema = FactMetadataSchema.extend({
  revision: z.number().int().positive().default(1),
  session_id: UlidSchema,
  run_id: RunIdSchema,
  action_kind: BrowserComputerActionKindSchema,
  target_ref: BrowserComputerTargetRefSchema,
  input_summary: SecretSafeTextSchema(1000),
  risk_level: RiskLevelSchema,
  approval_id: UlidSchema.nullable(),
  idempotency_key: IdempotencyKeySchema,
  status: BrowserComputerActionStatusSchema,
  descriptor_only: z.literal(true),
}).strict();

export const ActionReceiptSchema = FactMetadataSchema.extend({
  revision: z.number().int().positive().default(1),
  session_id: UlidSchema,
  action_intent_id: UlidSchema,
  status: BrowserComputerActionReceiptStatusSchema,
  result_ref: BrowserComputerArtifactRefSchema.nullable(),
  screenshot_id: UlidSchema.nullable(),
  error_code: z.string().min(1).max(96).nullable(),
  error_message: NullableSecretSafeTextSchema(512),
  external_effect: z.literal(false),
  descriptor_only: z.literal(true),
}).strict();

export const ScreenshotReceiptSchema = FactMetadataSchema.extend({
  session_id: UlidSchema,
  action_intent_id: UlidSchema,
  image_ref: BrowserComputerArtifactRefSchema,
  viewport_width: z.number().int().positive().max(16_384),
  viewport_height: z.number().int().positive().max(16_384),
  image_hash: PayloadHashSchema,
  redacted: z.literal(true),
  descriptor_only: z.literal(true),
}).strict();

export const BrowserComputerCommandSchema = z.object({
  schema_version: z.literal(1),
  command_id: UlidSchema,
  workspace_id: WorkspaceIdSchema,
  session_id: UlidSchema,
  kind: BrowserComputerCommandKindSchema,
  idempotency_key: IdempotencyKeySchema,
  expected_revision: z.number().int().positive(),
  reason: NullableSecretSafeTextSchema(1000),
  descriptor_only: z.literal(true),
  created_at: TimestampSchema,
}).strict();

export type SandboxPolicy = z.infer<typeof SandboxPolicySchema>;
export type BrowserSessionDescriptor = z.infer<typeof BrowserSessionDescriptorSchema>;
export type ComputerUseSessionDescriptor = z.infer<typeof ComputerUseSessionDescriptorSchema>;
export type BrowserComputerSessionDescriptor = BrowserSessionDescriptor | ComputerUseSessionDescriptor;
export type TargetAllowlistEntry = z.infer<typeof TargetAllowlistEntrySchema>;
export type HumanApproval = z.infer<typeof HumanApprovalSchema>;
export type ActionIntent = z.infer<typeof ActionIntentSchema>;
export type ActionReceipt = z.infer<typeof ActionReceiptSchema>;
export type ScreenshotReceipt = z.infer<typeof ScreenshotReceiptSchema>;
export type BrowserComputerCommand = z.infer<typeof BrowserComputerCommandSchema>;
export type BrowserComputerSessionStatus = z.infer<typeof BrowserComputerSessionStatusSchema>;

export type BrowserComputerExecutionDecision =
  | { readonly allowed: true; readonly code: "POLICY_ALLOWED"; readonly required_action: "record_descriptor_receipt" }
  | { readonly allowed: false; readonly code: "POLICY_DENIED"; readonly required_action: "approve_browser_target" }
  | { readonly allowed: false; readonly code: "APPROVAL_REQUIRED"; readonly required_action: "approve_action" };

const SESSION_STATUS_TRANSITIONS: Readonly<Record<BrowserComputerSessionStatus, readonly BrowserComputerSessionStatus[]>> = {
  active: ["paused", "stopped", "takeover_requested", "error"],
  paused: ["active", "stopped", "takeover_requested", "error"],
  stopped: [],
  takeover_requested: ["stopped"],
  error: ["stopped"],
};

export function canTransitionBrowserComputerSession(from: BrowserComputerSessionStatus, to: BrowserComputerSessionStatus): boolean {
  BrowserComputerSessionStatusSchema.parse(from);
  BrowserComputerSessionStatusSchema.parse(to);
  return SESSION_STATUS_TRANSITIONS[from].includes(to);
}

export function canExecuteActionIntent(action: ActionIntent, allowlist: readonly TargetAllowlistEntry[], approval: HumanApproval | null, now: string): BrowserComputerExecutionDecision {
  const activeAllow = allowlist.some((entry) => allowlistCoversAction(entry, action, now));
  if (!activeAllow) return { allowed: false, code: "POLICY_DENIED", required_action: "approve_browser_target" };
  if (approval === null || approval.workspace_id !== action.workspace_id || approval.session_id !== action.session_id || approval.action_intent_id !== action.id || approval.action_payload_hash !== browserComputerActionPayloadHash(action) || approval.decision !== "approved") {
    return { allowed: false, code: "APPROVAL_REQUIRED", required_action: "approve_action" };
  }
  return { allowed: true, code: "POLICY_ALLOWED", required_action: "record_descriptor_receipt" };
}

export function browserComputerActionPayloadHash(action: ActionIntent): string {
  return `sha256:${sha256Hex(JSON.stringify(canonicalActionIntentPayload(action)))}`;
}

function canonicalActionIntentPayload(action: ActionIntent): object {
  return {
    id: action.id,
    workspace_id: action.workspace_id,
    schema_version: action.schema_version,
    session_id: action.session_id,
    run_id: action.run_id,
    action_kind: action.action_kind,
    target_ref: action.target_ref,
    input_summary: action.input_summary,
    risk_level: action.risk_level,
    approval_id: action.approval_id,
    descriptor_only: action.descriptor_only,
  };
}

function sha256Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const message = new Uint8Array(paddedLength);
  message.set(bytes);
  message[bytes.length] = 0x80;

  const view = new DataView(message.buffer);
  view.setUint32(paddedLength - 8, Math.floor((bytes.length * 8) / 0x100000000), false);
  view.setUint32(paddedLength - 4, (bytes.length * 8) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const words = new Uint32Array(64);

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }

    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(readWord(words, index - 15), 7) ^ rotateRight(readWord(words, index - 15), 18) ^ (readWord(words, index - 15) >>> 3);
      const s1 = rotateRight(readWord(words, index - 2), 17) ^ rotateRight(readWord(words, index - 2), 19) ^ (readWord(words, index - 2) >>> 10);
      words[index] = (readWord(words, index - 16) + s0 + readWord(words, index - 7) + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const bigS1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + bigS1 + choose + sha256Constant(index) + readWord(words, index)) >>> 0;
      const bigS0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (bigS0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map(wordToHex).join("");
}

function rotateRight(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

function readWord(words: Uint32Array, index: number): number {
  const value = words[index];
  if (value === undefined) throw new Error("SHA-256 schedule index is out of range");
  return value;
}

function sha256Constant(index: number): number {
  const value = SHA256_K[index];
  if (value === undefined) throw new Error("SHA-256 constant index is out of range");
  return value;
}

function wordToHex(word: number): string {
  let result = "";
  for (let shift = 28; shift >= 0; shift -= 4) {
    result += "0123456789abcdef".charAt((word >>> shift) & 0xf);
  }
  return result;
}

function allowlistCoversAction(entry: TargetAllowlistEntry, action: ActionIntent, now: string): boolean {
  if (entry.workspace_id !== action.workspace_id || entry.session_id !== action.session_id || entry.decision !== "allow") return false;
  if (entry.expires_at !== null && entry.expires_at <= now) return false;
  if (entry.target_ref === action.target_ref) return true;
  return browserDomainCoversTarget(entry.target_ref, action.target_ref);
}

function browserDomainCoversTarget(allowlistRef: string, actionRef: string): boolean {
  if (!allowlistRef.startsWith("browser://domain/") || !actionRef.startsWith("browser://url/")) return false;
  const allowedHost = allowlistRef.slice("browser://domain/".length).toLowerCase();
  const target = browserUrlFromRef(actionRef);
  if (target === null) return false;
  const targetHost = target.hostname.toLowerCase();
  return targetHost === allowedHost || targetHost.endsWith(`.${allowedHost}`);
}

function isSafeBrowserComputerTargetRef(value: string): boolean {
  if (DEFAULT_IGNORABLE_CODE_POINT_PATTERN.test(value) || /\s/.test(value) || value.includes("\\")) return false;
  if (/^(?:file|secret|smb|sftp|ftp):\/\//i.test(value)) return false;
  if (value.startsWith("browser://url/")) return browserUrlFromRef(value) !== null;
  if (value.startsWith("browser://domain/")) return isSafeHostname(value.slice("browser://domain/".length));
  if (value.startsWith("computer://app/")) return /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value.slice("computer://app/".length));
  if (value.startsWith("computer://display/")) return /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value.slice("computer://display/".length));
  return false;
}

function browserUrlFromRef(reference: string): URL | null {
  const remainder = reference.slice("browser://url/".length);
  if (containsUnsafeDecodedMarkers(remainder)) return null;
  const slash = remainder.indexOf("/");
  if (slash <= 0) return null;
  const protocol = remainder.slice(0, slash);
  if (protocol !== "http" && protocol !== "https") return null;
  const locator = remainder.slice(slash + 1);
  if (locator.length === 0) return null;
  try {
    const url = new URL(`${protocol}://${locator}`);
    if (url.protocol !== `${protocol}:`) return null;
    if (url.username.length > 0 || url.password.length > 0) return null;
    if (!isSafeHostname(url.hostname)) return null;
    const decodedPath = decodePercentLayers(`${url.pathname}${url.search}`);
    if (containsUnsafeDecodedMarkers(decodedPath) || hasUnsafePathSegments(decodedPath)) return null;
    return url;
  } catch {
    return null;
  }
}

function isSafeHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!/^[a-z0-9.-]+$/.test(host) || host.length < 3 || host.length > 253) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  const ipv4 = parseIpv4(host);
  if (ipv4 !== null) return !isUnsafeIpv4(ipv4);
  return host.includes(".") && !host.split(".").some((segment) => segment.length === 0 || segment.startsWith("-") || segment.endsWith("-"));
}

function parseIpv4(value: string): readonly [number, number, number, number] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const parsed = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (parsed.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  const first = parsed[0];
  const second = parsed[1];
  const third = parsed[2];
  const fourth = parsed[3];
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) return null;
  return [first, second, third, fourth];
}

function isUnsafeIpv4(parts: readonly [number, number, number, number]): boolean {
  const [first, second] = parts;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && (second === 0 || second === 168)) return true;
  if (first === 198 && (second === 18 || second === 19 || second === 51)) return true;
  return first === 203 && second === 0;
}

function containsUnsafeDecodedMarkers(value: string): boolean {
  const decoded = decodePercentLayers(value).replace(/\\/g, "/").toLowerCase();
  return decoded.includes("://") || decoded.includes("secret:") || decoded.includes("token=") || decoded.includes("password=") || decoded.includes("..") || DEFAULT_IGNORABLE_CODE_POINT_PATTERN.test(decoded);
}

function hasUnsafePathSegments(value: string): boolean {
  const normalized = decodePercentLayers(value).replace(/\\/g, "/");
  return normalized.split("/").some((segment) => segment === "." || segment === "..");
}

function decodePercentLayers(value: string): string {
  let current = value;
  for (let pass = 0; pass < 10; pass += 1) {
    const decoded = current.replace(/%[0-9a-fA-F]{2}/g, (sequence) => String.fromCharCode(Number.parseInt(sequence.slice(1), 16)));
    if (decoded === current) return decoded;
    current = decoded;
  }
  return current;
}
