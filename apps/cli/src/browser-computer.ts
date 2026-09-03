import {
  ActionIntentSchema,
  BrowserComputerCommandSchema,
  BrowserSessionDescriptorSchema,
  DescriptorIdSchema,
  IdempotencyKeySchema,
  UlidSchema,
  WorkspaceIdSchema,
  containsSecretLikeText,
} from "@nexora/contracts";

export type BrowserComputerControlRequest = {
  readonly method: "POST";
  readonly path: string;
  readonly headers: BrowserComputerHeaders;
  readonly body: object;
  readonly descriptor_only: true;
};

type BrowserComputerHeaders = {
  readonly "idempotency-key": string;
  readonly "if-match"?: string;
};

type BrowserComputerCommandKind = "pause" | "resume" | "stop" | "takeover";
const CLI_VALIDATION_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function parseBrowserComputerCommand(input: string): BrowserComputerControlRequest {
  const tokens = tokenize(input);
  rejectForbiddenDescriptorOnlyContent(tokens);
  const root = requiredToken(tokens, 0, "browser/computer command");
  if (root === "/browser") return parseBrowser(tokens.slice(1));
  if (root === "/computer") return parseComputer(tokens.slice(1));
  throw new Error("Unsupported browser/computer command");
}

function parseBrowser(tokens: readonly string[]): BrowserComputerControlRequest {
  const command = requiredToken(tokens, 0, "browser command");
  if (command === "session") return parseBrowserSession(tokens.slice(1));
  if (command === "action") return parseBrowserAction(tokens.slice(1));
  if (isSessionCommand(command)) return parseSessionCommand("/browser", command, tokens.slice(1));
  throw new Error("Unsupported browser command");
}

function parseComputer(tokens: readonly string[]): BrowserComputerControlRequest {
  const command = requiredToken(tokens, 0, "computer command");
  if (isSessionCommand(command)) return parseSessionCommand("/computer", command, tokens.slice(1));
  throw new Error("Unsupported computer command");
}

function parseBrowserSession(tokens: readonly string[]): BrowserComputerControlRequest {
  const action = requiredToken(tokens, 0, "browser session action");
  if (action !== "start") throw new Error("Unsupported browser session command");
  const flags = parseFlags(tokens.slice(1));
  rejectUnknownFlags(flags, new Set(["workspace", "session", "run", "gateway-session", "sandbox", "name", "target", "idempotency-key"]));
  const body = {
    id: ulidFlag(flags, "session"),
    workspace_id: workspace(flags),
    schema_version: 1,
    revision: 1,
    run_id: ulidFlag(flags, "run"),
    gateway_session_id: ulidFlag(flags, "gateway-session"),
    sandbox_policy_id: DescriptorIdSchema.parse(requireFlag(flags, "sandbox")),
    name: requireSecretSafeFlag(flags, "name"),
    kind: "browser",
    mode: "foreground",
    status: "active",
    current_target_ref: requireSafeTarget(flags, "target"),
    last_screenshot_id: null,
    takeover_by: null,
    descriptor_only: true,
  };
  BrowserSessionDescriptorSchema.parse({ ...body, created_at: CLI_VALIDATION_TIMESTAMP, updated_at: CLI_VALIDATION_TIMESTAMP });
  return { method: "POST", path: "/v1/browser-sessions", headers: idempotencyHeaders(flags), body, descriptor_only: true };
}

function parseBrowserAction(tokens: readonly string[]): BrowserComputerControlRequest {
  const action = requiredToken(tokens, 0, "browser action");
  if (action !== "navigate") throw new Error("Unsupported browser action");
  const flags = parseFlags(tokens.slice(1));
  rejectUnknownFlags(flags, new Set(["workspace", "session", "action", "run", "target", "summary", "approval", "idempotency-key"]));
  const headers = idempotencyHeaders(flags);
  const body = {
    id: ulidFlag(flags, "action"),
    workspace_id: workspace(flags),
    schema_version: 1,
    revision: 1,
    session_id: ulidFlag(flags, "session"),
    run_id: ulidFlag(flags, "run"),
    action_kind: "navigate",
    target_ref: requireSafeTarget(flags, "target"),
    input_summary: requireSecretSafeFlag(flags, "summary"),
    risk_level: "R2",
    approval_id: optionalUlidFlag(flags, "approval"),
    idempotency_key: headers["idempotency-key"],
    status: "pending_approval",
    descriptor_only: true,
  };
  ActionIntentSchema.parse({ ...body, created_at: CLI_VALIDATION_TIMESTAMP, updated_at: CLI_VALIDATION_TIMESTAMP });
  return { method: "POST", path: "/v1/browser-actions", headers, body, descriptor_only: true };
}

function parseSessionCommand(root: "/browser" | "/computer", kind: BrowserComputerCommandKind, tokens: readonly string[]): BrowserComputerControlRequest {
  void root;
  const sessionId = ulidToken(tokens, 0, "browser/computer session id");
  const flags = parseFlags(tokens.slice(1));
  rejectUnknownFlags(flags, new Set(["workspace", "reason", "if-match", "idempotency-key"]));
  const body = { schema_version: 1, workspace_id: workspace(flags), kind, reason: requireSecretSafeFlag(flags, "reason"), descriptor_only: true };
  BrowserComputerCommandSchema.parse({ ...body, command_id: sessionId, session_id: sessionId, idempotency_key: requireFlag(flags, "idempotency-key"), expected_revision: positiveInteger(requireFlag(flags, "if-match"), "if-match"), created_at: CLI_VALIDATION_TIMESTAMP });
  return { method: "POST", path: `/v1/browser-sessions/${sessionId}/${kind}`, headers: { ...idempotencyHeaders(flags), "if-match": requirePositiveIntegerText(flags, "if-match") }, body, descriptor_only: true };
}

function isSessionCommand(value: string): value is BrowserComputerCommandKind {
  return value === "pause" || value === "resume" || value === "stop" || value === "takeover";
}

function parseFlags(tokens: readonly string[]): ReadonlyMap<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < tokens.length; index += 2) {
    const rawName = tokens[index];
    const value = tokens[index + 1];
    if (rawName === undefined || !rawName.startsWith("--")) throw new Error("Expected a flag name");
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${rawName}`);
    flags.set(rawName.slice(2), value);
  }
  return flags;
}

function rejectUnknownFlags(flags: ReadonlyMap<string, string>, allowed: ReadonlySet<string>): void {
  for (const name of flags.keys()) {
    if (!allowed.has(name)) throw new Error(`Unsupported --${name}`);
  }
}

function idempotencyHeaders(flags: ReadonlyMap<string, string>): BrowserComputerHeaders {
  const parsed = IdempotencyKeySchema.safeParse(requireFlag(flags, "idempotency-key"));
  if (!parsed.success) throw new Error("--idempotency-key must be a safe idempotency token without secret or credential markers");
  return { "idempotency-key": parsed.data };
}

function workspace(flags: ReadonlyMap<string, string>): string {
  return WorkspaceIdSchema.parse(requireFlag(flags, "workspace"));
}

function requireFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value.length === 0) throw new Error(`Missing --${name}`);
  return value;
}

function requireSecretSafeFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = requireFlag(flags, name);
  if (containsSecretLikeText(value)) throw new Error(`--${name} contains secret-shaped content`);
  return value;
}

function requireSafeTarget(flags: ReadonlyMap<string, string>, name: string): string {
  const value = requireFlag(flags, name);
  const parsed = ActionIntentSchema.shape.target_ref.safeParse(value);
  if (!parsed.success) throw new Error(`--${name} must be a descriptor-only safe target; external SSRF, paths, and credentials are blocked`);
  return parsed.data;
}

function ulidFlag(flags: ReadonlyMap<string, string>, name: string): string {
  return UlidSchema.parse(requireFlag(flags, name));
}

function optionalUlidFlag(flags: ReadonlyMap<string, string>, name: string): string | null {
  const value = flags.get(name);
  return value === undefined ? null : UlidSchema.parse(value);
}

function ulidToken(tokens: readonly string[], index: number, label: string): string {
  return UlidSchema.parse(requiredToken(tokens, index, label));
}

function requiredToken(tokens: readonly string[], index: number, label: string): string {
  const token = tokens[index];
  if (token === undefined || token.length === 0) throw new Error(`Missing ${label}`);
  return token;
}

function requirePositiveIntegerText(flags: ReadonlyMap<string, string>, name: string): string {
  const value = requireFlag(flags, name);
  positiveInteger(value, name);
  return value;
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`--${label} must be a positive integer`);
  return parsed;
}

function rejectForbiddenDescriptorOnlyContent(tokens: readonly string[]): void {
  const externalFlags = new Set(["--credential", "--connect", "--send", "--external", "--provider", "--mcp", "--web-live", "--desktop-live", "--execute-real-click", "--read-file", "--write-file"]);
  const forbiddenFlag = tokens.find((token) => externalFlags.has(token));
  if (forbiddenFlag !== undefined) throw new Error(`External side effects are disabled for descriptor-only browser/computer commands: ${forbiddenFlag}`);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.startsWith("--") || isMetadataFlagValue(tokens, index)) continue;
    if (/^(?:file|secret|smb|sftp|ftp):\/\//i.test(token)) throw new Error("Credentials, files, and external path refs are disabled for descriptor-only browser/computer commands");
    if (containsSecretLikeText(token)) throw new Error("Descriptor-only browser/computer commands cannot contain secret-shaped content");
  }
}

function isMetadataFlagValue(tokens: readonly string[], index: number): boolean {
  const previous = tokens[index - 1];
  return previous === "--idempotency-key" || previous === "--if-match";
}

function tokenize(input: string): readonly string[] {
  const tokens: string[] = [];
  let current = "";
  let quoted = false;
  for (const character of input.trim()) {
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (/\s/.test(character) && !quoted) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (quoted) throw new Error("Unterminated quoted argument");
  if (current.length > 0) tokens.push(current);
  return tokens;
}
