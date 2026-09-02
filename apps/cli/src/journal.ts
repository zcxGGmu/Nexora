import {
  DescriptorIdSchema,
  GraphIndexSnapshotSchema,
  IdempotencyKeySchema,
  JournalEntryDescriptorSchema,
  JournalSourceSchema,
  MemoryCandidateSchema,
  PayloadHashSchema,
  RiskLevelSchema,
  UlidSchema,
  VaultBridgeDescriptorSchema,
  WorkspaceIdSchema,
  WritebackRequestSchema,
  containsPathLikeText,
  containsSecretLikeText,
} from "@nexora/contracts";

export type JournalControlRequest = {
  readonly method: "POST";
  readonly path: string;
  readonly headers: JournalHeaders;
  readonly body: object;
  readonly descriptor_only: true;
};

type JournalHeaders = {
  readonly "idempotency-key": string;
  readonly "if-match"?: string;
};

type WritebackDecisionAction = "approve" | "reject";
const CLI_VALIDATION_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function parseJournalCommand(input: string): JournalControlRequest {
  const tokens = tokenize(input);
  rejectForbiddenDescriptorOnlyContent(input, tokens);
  if (tokens[0] !== "/journal") throw new Error("Unsupported journal command");
  const command = requiredToken(tokens, 1, "journal command");
  if (command === "vault") return parseVault(tokens.slice(2));
  if (command === "entry") return parseEntry(tokens.slice(2));
  if (command === "source") return parseSource(tokens.slice(2));
  if (command === "graph") return parseGraph(tokens.slice(2));
  if (command === "memory") return parseMemory(tokens.slice(2));
  if (command === "writeback") return parseWriteback(tokens.slice(2));
  throw new Error("Unsupported journal command");
}

function parseVault(tokens: readonly string[]): JournalControlRequest {
  const flags = parseFlags(tokens);
  rejectUnknownFlags(flags, new Set(["workspace", "vault", "name", "kind", "root-ref", "idempotency-key"]));
  const body = {
    id: DescriptorIdSchema.parse(requireFlag(flags, "vault")),
    workspace_id: workspace(flags),
    schema_version: 1,
    revision: 1,
    name: requireSecretSafeFlag(flags, "name"),
    kind: requireFlag(flags, "kind"),
    root_ref: requireFlag(flags, "root-ref"),
    access_mode: "read_only",
    sync_status: "not_indexed",
    graph_enabled: true,
    fts_enabled: true,
    allowed_source_kinds: ["manual", "omi", "obsidian", "memory", "artifact"],
    last_indexed_at: null,
    descriptor_only: true,
  };
  VaultBridgeDescriptorSchema.parse({ ...body, created_at: CLI_VALIDATION_TIMESTAMP, updated_at: CLI_VALIDATION_TIMESTAMP });
  return {
    method: "POST",
    path: "/v1/vaults",
    headers: idempotencyHeaders(flags),
    body,
    descriptor_only: true,
  };
}

function parseEntry(tokens: readonly string[]): JournalControlRequest {
  const flags = parseFlags(tokens);
  rejectUnknownFlags(flags, new Set(["workspace", "entry", "vault", "date", "title", "summary", "source", "candidate", "run", "goal-loop", "tag", "idempotency-key"]));
  const body = {
    id: ulidFlag(flags, "entry"),
    workspace_id: workspace(flags),
    schema_version: 1,
    vault_id: DescriptorIdSchema.parse(requireFlag(flags, "vault")),
    entry_date: requireFlag(flags, "date"),
    title: requireSecretSafeFlag(flags, "title"),
    summary: requireSecretSafeFlag(flags, "summary"),
    source_ids: ulidListFlag(flags, "source"),
    memory_candidate_ids: optionalUlidListFlag(flags, "candidate"),
    run_id: optionalUlidFlag(flags, "run"),
    goal_loop_id: optionalUlidFlag(flags, "goal-loop"),
    tags: stringListFlag(flags, "tag"),
    descriptor_only: true,
  };
  JournalEntryDescriptorSchema.parse({ ...body, created_at: CLI_VALIDATION_TIMESTAMP, updated_at: CLI_VALIDATION_TIMESTAMP });
  return {
    method: "POST",
    path: "/v1/journal/entries",
    headers: idempotencyHeaders(flags),
    body,
    descriptor_only: true,
  };
}

function parseSource(tokens: readonly string[]): JournalControlRequest {
  const flags = parseFlags(tokens);
  rejectUnknownFlags(flags, new Set(["workspace", "source", "vault", "entry", "kind", "ref", "hash", "idempotency-key"]));
  const body = {
    id: ulidFlag(flags, "source"),
    workspace_id: workspace(flags),
    schema_version: 1,
    vault_id: DescriptorIdSchema.parse(requireFlag(flags, "vault")),
    journal_entry_id: ulidFlag(flags, "entry"),
    source_kind: requireFlag(flags, "kind"),
    source_ref: requireFlag(flags, "ref"),
    source_hash: PayloadHashSchema.parse(requireFlag(flags, "hash")),
    descriptor_only: true,
  };
  JournalSourceSchema.parse({ ...body, created_at: CLI_VALIDATION_TIMESTAMP, updated_at: CLI_VALIDATION_TIMESTAMP, captured_at: CLI_VALIDATION_TIMESTAMP });
  return {
    method: "POST",
    path: "/v1/journal/sources",
    headers: idempotencyHeaders(flags),
    body,
    descriptor_only: true,
  };
}

function parseGraph(tokens: readonly string[]): JournalControlRequest {
  const flags = parseFlags(tokens);
  rejectUnknownFlags(flags, new Set(["workspace", "graph", "vault", "kind", "source-hash", "graph-hash", "fts-hash", "nodes", "edges", "documents", "idempotency-key"]));
  const body = {
    id: ulidFlag(flags, "graph"),
    workspace_id: workspace(flags),
    schema_version: 1,
    vault_id: DescriptorIdSchema.parse(requireFlag(flags, "vault")),
    index_kind: requireFlag(flags, "kind"),
    source_hash: PayloadHashSchema.parse(requireFlag(flags, "source-hash")),
    graph_hash: PayloadHashSchema.parse(requireFlag(flags, "graph-hash")),
    fts_hash: PayloadHashSchema.parse(requireFlag(flags, "fts-hash")),
    node_count: positiveInteger(requireFlag(flags, "nodes"), "nodes"),
    edge_count: positiveInteger(requireFlag(flags, "edges"), "edges"),
    document_count: positiveInteger(requireFlag(flags, "documents"), "documents"),
    stale: false,
    descriptor_only: true,
  };
  GraphIndexSnapshotSchema.parse({ ...body, created_at: CLI_VALIDATION_TIMESTAMP, updated_at: CLI_VALIDATION_TIMESTAMP, indexed_at: CLI_VALIDATION_TIMESTAMP });
  return {
    method: "POST",
    path: "/v1/journal/graph-indexes",
    headers: idempotencyHeaders(flags),
    body,
    descriptor_only: true,
  };
}

function parseMemory(tokens: readonly string[]): JournalControlRequest {
  const flags = parseFlags(tokens);
  rejectUnknownFlags(flags, new Set(["workspace", "candidate", "vault", "entry", "source", "kind", "path", "summary", "hash", "risk", "idempotency-key"]));
  const body = {
    id: ulidFlag(flags, "candidate"),
    workspace_id: workspace(flags),
    schema_version: 1,
    vault_id: DescriptorIdSchema.parse(requireFlag(flags, "vault")),
    journal_entry_id: ulidFlag(flags, "entry"),
    source_ids: ulidListFlag(flags, "source"),
    candidate_kind: requireFlag(flags, "kind"),
    proposed_path: requireFlag(flags, "path"),
    summary: requireSecretSafeFlag(flags, "summary"),
    content_hash: PayloadHashSchema.parse(requireFlag(flags, "hash")),
    risk_level: RiskLevelSchema.parse(requireFlag(flags, "risk")),
    status: "needs_review",
    descriptor_only: true,
  };
  MemoryCandidateSchema.parse({ ...body, created_at: CLI_VALIDATION_TIMESTAMP, updated_at: CLI_VALIDATION_TIMESTAMP });
  return {
    method: "POST",
    path: "/v1/journal/memory-candidates",
    headers: idempotencyHeaders(flags),
    body,
    descriptor_only: true,
  };
}

function parseWriteback(tokens: readonly string[]): JournalControlRequest {
  const action = requiredToken(tokens, 0, "writeback action");
  if (action === "request") return parseWritebackRequest(tokens.slice(1));
  if (action === "approve" || action === "reject") return parseWritebackDecision(tokens, action);
  throw new Error("Unsupported journal writeback command");
}

function parseWritebackRequest(tokens: readonly string[]): JournalControlRequest {
  const flags = parseFlags(tokens);
  rejectUnknownFlags(flags, new Set(["workspace", "request", "vault", "candidate", "target", "diff-hash", "reason", "target-revision", "idempotency-key"]));
  return {
    method: "POST",
    path: "/v1/journal/writebacks",
    headers: idempotencyHeaders(flags),
    body: WritebackRequestSchema.omit({ created_at: true, updated_at: true, requested_by: true, requested_at: true }).parse({
      id: ulidFlag(flags, "request"),
      workspace_id: workspace(flags),
      schema_version: 1,
      revision: 1,
      vault_id: DescriptorIdSchema.parse(requireFlag(flags, "vault")),
      candidate_id: ulidFlag(flags, "candidate"),
      target_ref: requireFlag(flags, "target"),
      diff_hash: PayloadHashSchema.parse(requireFlag(flags, "diff-hash")),
      reason: requireSecretSafeFlag(flags, "reason"),
      status: "pending_review",
      expected_target_revision: positiveInteger(requireFlag(flags, "target-revision"), "target-revision"),
      descriptor_only: true,
    }),
    descriptor_only: true,
  };
}

function parseWritebackDecision(tokens: readonly string[], action: WritebackDecisionAction): JournalControlRequest {
  const requestId = ulidToken(tokens, 1, "writeback request id");
  const flags = parseFlags(tokens.slice(2));
  rejectUnknownFlags(flags, new Set(["workspace", "reason", "if-match", "idempotency-key"]));
  return {
    method: "POST",
    path: `/v1/journal/writebacks/${requestId}/${action}`,
    headers: { ...idempotencyHeaders(flags), "if-match": requirePositiveIntegerText(flags, "if-match") },
    body: { schema_version: 1, workspace_id: workspace(flags), reason: requireSecretSafeFlag(flags, "reason"), descriptor_only: true },
    descriptor_only: true,
  };
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

function idempotencyHeaders(flags: ReadonlyMap<string, string>): JournalHeaders {
  const parsed = IdempotencyKeySchema.safeParse(requireFlag(flags, "idempotency-key"));
  if (!parsed.success) throw new Error("--idempotency-key must be a safe idempotency token without secret or path-shaped content");
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
  if (containsPathLikeText(value)) throw new Error(`--${name} contains local path or credential reference content`);
  return value;
}

function ulidFlag(flags: ReadonlyMap<string, string>, name: string): string {
  return UlidSchema.parse(requireFlag(flags, name));
}

function optionalUlidFlag(flags: ReadonlyMap<string, string>, name: string): string | null {
  const value = flags.get(name);
  return value === undefined ? null : UlidSchema.parse(value);
}

function ulidListFlag(flags: ReadonlyMap<string, string>, name: string): readonly string[] {
  return splitList(requireFlag(flags, name)).map((value) => UlidSchema.parse(value));
}

function optionalUlidListFlag(flags: ReadonlyMap<string, string>, name: string): readonly string[] {
  const value = flags.get(name);
  return value === undefined ? [] : splitList(value).map((item) => UlidSchema.parse(item));
}

function stringListFlag(flags: ReadonlyMap<string, string>, name: string): readonly string[] {
  const value = flags.get(name);
  return value === undefined ? [] : splitList(value);
}

function splitList(value: string): readonly string[] {
  const values = value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  if (values.length === 0) throw new Error("Expected at least one list item");
  return values;
}

function requirePositiveIntegerText(flags: ReadonlyMap<string, string>, name: string): string {
  const value = requireFlag(flags, name);
  positiveInteger(value, name);
  return value;
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`--${label} must be a non-negative integer`);
  return parsed;
}

function ulidToken(tokens: readonly string[], index: number, label: string): string {
  return UlidSchema.parse(requiredToken(tokens, index, label));
}

function requiredToken(tokens: readonly string[], index: number, label: string): string {
  const token = tokens[index];
  if (token === undefined || token.length === 0) throw new Error(`Missing ${label}`);
  return token;
}

function rejectForbiddenDescriptorOnlyContent(input: string, tokens: readonly string[]): void {
  void input;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.startsWith("--") || isMetadataFlagValue(tokens, index)) continue;
    if (containsSecretLikeText(token)) throw new Error("Descriptor-only journal commands cannot contain secret-shaped content");
  }
  const externalFlags = new Set(["--url", "--pdf", "--file", "--source-path", "--credential", "--mcp", "--provider", "--connector", "--connect", "--send", "--write-file", "--obsidian-live", "--omi-live"]);
  const externalFlag = tokens.find((token) => externalFlags.has(token));
  if (externalFlag !== undefined) throw new Error(`External reads or side effects are disabled for descriptor-only journal commands: ${externalFlag}`);
  const externalRef = tokens.find((token) => /^(?:https?|file|secret|smb):\/\//i.test(token));
  if (externalRef !== undefined) throw new Error("External reads and credential refs are disabled for descriptor-only journal commands");
  const pathLike = tokens.find((token, index) => index > 0 && !token.startsWith("--") && containsPathLikeText(token));
  if (pathLike !== undefined) throw new Error("Local paths and credential refs are disabled for descriptor-only journal commands");
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
