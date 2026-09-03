import {
  AvatarProfileDescriptorSchema,
  DescriptorIdSchema,
  IdempotencyKeySchema,
  StudioCommandSchema,
  TimestampSchema,
  UlidSchema,
  WorkspaceIdSchema,
  containsPathLikeText,
  containsSecretLikeText,
} from "@nexora/contracts";

export type StudioMediaControlRequest = {
  readonly method: "POST";
  readonly path: string;
  readonly headers: StudioMediaHeaders;
  readonly body: object;
  readonly descriptor_only: true;
};

type StudioMediaHeaders = {
  readonly "idempotency-key": string;
  readonly "if-match"?: string;
};

type StudioCommandKind = "preview" | "share" | "rerender" | "notebook_generate" | "revoke_avatar";
type StudioCommandTargetType = "media_artifact" | "notebook" | "avatar_profile";

const CLI_VALIDATION_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const PLACEHOLDER_HASH = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

export function parseStudioMediaCommand(input: string): StudioMediaControlRequest {
  const tokens = tokenize(input);
  rejectForbiddenDescriptorOnlyContent(tokens);
  const root = requiredToken(tokens, 0, "studio command");
  if (root === "/studio") return parseStudio(tokens.slice(1));
  if (root === "/notebook") return parseNotebook(tokens.slice(1));
  if (root === "/avatar") return parseAvatar(tokens.slice(1));
  throw new Error("Unsupported Studio/Media command");
}

function parseStudio(tokens: readonly string[]): StudioMediaControlRequest {
  const command = requiredToken(tokens, 0, "studio action");
  if (command === "render") return parseStudioTargetCommand(tokens.slice(1), "rerender", "render");
  if (command === "share") return parseStudioTargetCommand(tokens.slice(1), "share", "share");
  if (command === "preview") return parseStudioTargetCommand(tokens.slice(1), "preview", "preview");
  throw new Error("Unsupported studio command");
}

function parseNotebook(tokens: readonly string[]): StudioMediaControlRequest {
  const command = requiredToken(tokens, 0, "notebook action");
  if (command !== "generate") throw new Error("Unsupported notebook command");
  const notebookId = DescriptorIdSchema.parse(requiredToken(tokens, 1, "notebook id"));
  const flags = parseFlags(tokens.slice(2));
  rejectUnknownFlags(flags, new Set(["workspace", "run", "source", "output", "reason", "if-match", "idempotency-key"]));
  return commandRequest({ flags, targetId: notebookId, targetType: "notebook", kind: "notebook_generate", path: `/v1/studio/notebooks/${notebookId}/generate`, reason: flags.get("reason") ?? "Operator requested notebook generation." });
}

function parseAvatar(tokens: readonly string[]): StudioMediaControlRequest {
  const command = requiredToken(tokens, 0, "avatar action");
  if (command !== "profile") throw new Error("Unsupported avatar command");
  const avatarId = DescriptorIdSchema.parse(requiredToken(tokens, 1, "avatar id"));
  const flags = parseFlags(tokens.slice(2));
  rejectUnknownFlags(flags, new Set(["workspace", "run", "consent", "expires", "idempotency-key"]));
  const body = {
    id: avatarId,
    workspace_id: workspace(flags),
    schema_version: 1,
    revision: 1,
    run_id: ulidFlag(flags, "run"),
    display_name: "CLI avatar profile descriptor",
    consent_status: "approved",
    consent_artifact_ref: requireRefFlag(flags, "consent"),
    face_source_hash: PLACEHOLDER_HASH,
    voice_source_hash: PLACEHOLDER_HASH,
    voice_clone_mode: "disabled",
    render_mode: "descriptor_only",
    expires_at: TimestampSchema.parse(requireFlag(flags, "expires")),
    revoked_at: null,
    descriptor_only: true,
  };
  AvatarProfileDescriptorSchema.parse({ ...body, created_at: CLI_VALIDATION_TIMESTAMP, updated_at: CLI_VALIDATION_TIMESTAMP });
  return { method: "POST", path: "/v1/studio/avatar-profiles", headers: idempotencyHeaders(flags), body, descriptor_only: true };
}

function parseStudioTargetCommand(tokens: readonly string[], kind: StudioCommandKind, routeAction: string): StudioMediaControlRequest {
  const mediaId = UlidSchema.parse(requiredToken(tokens, 0, "media artifact id"));
  const flags = parseFlags(tokens.slice(1));
  rejectUnknownFlags(flags, new Set(["workspace", "run", "source", "preview", "reason", "if-match", "idempotency-key"]));
  return commandRequest({ flags, targetId: mediaId, targetType: "media_artifact", kind, path: `/v1/studio/media-artifacts/${mediaId}/${routeAction}`, reason: flags.get("reason") ?? `Operator requested ${kind}.` });
}

function commandRequest(input: { readonly flags: ReadonlyMap<string, string>; readonly targetId: string; readonly targetType: StudioCommandTargetType; readonly kind: StudioCommandKind; readonly path: string; readonly reason: string }): StudioMediaControlRequest {
  const body = {
    schema_version: 1,
    workspace_id: workspace(input.flags),
    run_id: ulidFlag(input.flags, "run"),
    kind: input.kind,
    target_type: input.targetType,
    target_id: input.targetId,
    reason: secretSafeText(input.reason, "reason"),
    descriptor_only: true,
  };
  StudioCommandSchema.parse({ ...body, command_id: commandIdForValidation(input.targetId), idempotency_key: requireFlag(input.flags, "idempotency-key"), expected_revision: positiveInteger(requireFlag(input.flags, "if-match"), "if-match"), created_at: CLI_VALIDATION_TIMESTAMP });
  return { method: "POST", path: input.path, headers: { ...idempotencyHeaders(input.flags), "if-match": requirePositiveIntegerText(input.flags, "if-match") }, body, descriptor_only: true };
}

function commandIdForValidation(targetId: string): string {
  const parsed = UlidSchema.safeParse(targetId);
  return parsed.success ? parsed.data : "01ARZ3NDEKTSV4RRFFQ69G5FAV";
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

function idempotencyHeaders(flags: ReadonlyMap<string, string>): StudioMediaHeaders {
  const parsed = IdempotencyKeySchema.safeParse(requireFlag(flags, "idempotency-key"));
  if (!parsed.success) throw new Error("--idempotency-key must be a safe idempotency token without secret or credential markers");
  return { "idempotency-key": parsed.data };
}

function workspace(flags: ReadonlyMap<string, string>): string {
  return WorkspaceIdSchema.parse(requireFlag(flags, "workspace"));
}

function ulidFlag(flags: ReadonlyMap<string, string>, name: string): string {
  return UlidSchema.parse(requireFlag(flags, name));
}

function requireRefFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = requireFlag(flags, name);
  if (containsSecretLikeText(value) || containsPathLikeText(value)) throw new Error(`--${name} must be a descriptor-only artifact reference`);
  return value;
}

function requireFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value.length === 0) throw new Error(`Missing --${name}`);
  return value;
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

function secretSafeText(value: string, label: string): string {
  if (containsSecretLikeText(value) || containsPathLikeText(value)) throw new Error(`--${label} contains credential, path, or external content`);
  return value;
}

function rejectForbiddenDescriptorOnlyContent(tokens: readonly string[]): void {
  const externalFlags = new Set(["--notebooklm", "--credential", "--provider", "--avatar-provider", "--media-provider", "--mcp", "--connect", "--external", "--face-file", "--voice-file", "--url", "--pdf", "--drive"]);
  const forbiddenFlag = tokens.find((token) => externalFlags.has(token));
  if (forbiddenFlag !== undefined) throw new Error(`Studio/Media external provider, credential, file, or NotebookLM side effects are disabled for descriptor-only commands: ${forbiddenFlag}`);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.startsWith("--") || isMetadataFlagValue(tokens, index)) continue;
    if (/^(?:file|secret|smb|sftp|ftp|http|https):\/\//i.test(token)) throw new Error("Credential, file, URL, NotebookLM, and media provider inputs are disabled for descriptor-only Studio/Media commands");
    if ((index > 0 && token.startsWith("/")) || token.startsWith("~/") || containsSecretLikeText(token)) throw new Error("Descriptor-only Studio/Media commands cannot contain credential-shaped or local path content");
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
      if (current.length > 0) tokens.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (quoted) throw new Error("Unclosed quote");
  if (current.length > 0) tokens.push(current);
  return tokens;
}
