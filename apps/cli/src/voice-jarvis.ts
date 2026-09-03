import {
  DescriptorIdSchema,
  IdempotencyKeySchema,
  TimestampSchema,
  UlidSchema,
  VoiceCommandSchema,
  VoiceSessionDescriptorSchema,
  WorkspaceIdSchema,
  containsSecretLikeText,
} from "@nexora/contracts";

export type VoiceJarvisControlRequest = {
  readonly method: "POST";
  readonly path: string;
  readonly headers: VoiceJarvisHeaders;
  readonly body: object;
  readonly descriptor_only: true;
};

type VoiceJarvisHeaders = {
  readonly "idempotency-key": string;
  readonly "if-match"?: string;
};

type SessionCommandKind = "wake" | "interrupt" | "pause" | "resume";
type TranscriptCommandInput = "delete" | "export";
const CLI_VALIDATION_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function parseVoiceJarvisCommand(input: string): VoiceJarvisControlRequest {
  const tokens = tokenize(input);
  rejectForbiddenDescriptorOnlyContent(tokens);
  const root = requiredToken(tokens, 0, "voice/jarvis command");
  if (root === "/voice") return parseVoice(tokens.slice(1));
  if (root === "/jarvis") return parseJarvis(tokens.slice(1));
  throw new Error("Unsupported voice/jarvis command");
}

function parseVoice(tokens: readonly string[]): VoiceJarvisControlRequest {
  const command = requiredToken(tokens, 0, "voice command");
  if (command === "session") return parseVoiceSession(tokens.slice(1));
  if (command === "transcript") return parseTranscriptCommand(tokens.slice(1));
  if (isSessionCommand(command)) return parseSessionCommand(command, tokens.slice(1));
  throw new Error("Unsupported voice command");
}

function parseJarvis(tokens: readonly string[]): VoiceJarvisControlRequest {
  const command = requiredToken(tokens, 0, "jarvis command");
  if (isSessionCommand(command)) return parseSessionCommand(command, tokens.slice(1));
  throw new Error("Unsupported jarvis command");
}

function parseVoiceSession(tokens: readonly string[]): VoiceJarvisControlRequest {
  const action = requiredToken(tokens, 0, "voice session action");
  if (action !== "start") throw new Error("Unsupported voice session command");
  const flags = parseFlags(tokens.slice(1));
  rejectUnknownFlags(flags, new Set(["workspace", "session", "run", "gateway-session", "policy", "wake-word", "name", "mode", "locale", "max-turns", "max-transcript-chars", "deadline", "idempotency-key"]));
  const body = {
    id: ulidFlag(flags, "session"),
    workspace_id: workspace(flags),
    schema_version: 1,
    revision: 1,
    run_id: ulidFlag(flags, "run"),
    gateway_session_id: ulidFlag(flags, "gateway-session"),
    audio_policy_id: DescriptorIdSchema.parse(requireFlag(flags, "policy")),
    wake_word_id: DescriptorIdSchema.parse(requireFlag(flags, "wake-word")),
    name: requireSecretSafeFlag(flags, "name"),
    mode: voiceMode(requireFlag(flags, "mode")),
    status: "idle",
    locale: requireFlag(flags, "locale"),
    turn_count: 0,
    interaction_budget: { max_turns: positiveInteger(requireFlag(flags, "max-turns"), "max-turns"), max_transcript_chars: positiveInteger(requireFlag(flags, "max-transcript-chars"), "max-transcript-chars") },
    deadline_at: TimestampSchema.parse(requireFlag(flags, "deadline")),
    input_audio_ref: null,
    output_audio_ref: null,
    current_transcript_id: null,
    interrupted_at: null,
    descriptor_only: true,
  };
  VoiceSessionDescriptorSchema.parse({ ...body, created_at: CLI_VALIDATION_TIMESTAMP, updated_at: CLI_VALIDATION_TIMESTAMP });
  return { method: "POST", path: "/v1/voice-sessions", headers: idempotencyHeaders(flags), body, descriptor_only: true };
}

function parseSessionCommand(kind: SessionCommandKind, tokens: readonly string[]): VoiceJarvisControlRequest {
  const sessionId = ulidToken(tokens, 0, "voice session id");
  const flags = parseFlags(tokens.slice(1));
  rejectUnknownFlags(flags, new Set(["workspace", "run", "reason", "if-match", "idempotency-key"]));
  const body = { schema_version: 1, workspace_id: workspace(flags), run_id: ulidFlag(flags, "run"), kind, reason: requireSecretSafeFlag(flags, "reason"), descriptor_only: true };
  VoiceCommandSchema.parse({ ...body, command_id: sessionId, voice_session_id: sessionId, idempotency_key: requireFlag(flags, "idempotency-key"), expected_revision: positiveInteger(requireFlag(flags, "if-match"), "if-match"), transcript_id: null, created_at: CLI_VALIDATION_TIMESTAMP });
  return { method: "POST", path: `/v1/voice-sessions/${sessionId}/${kind}`, headers: { ...idempotencyHeaders(flags), "if-match": requirePositiveIntegerText(flags, "if-match") }, body, descriptor_only: true };
}

function parseTranscriptCommand(tokens: readonly string[]): VoiceJarvisControlRequest {
  const rawKind = requiredToken(tokens, 0, "voice transcript command");
  if (!isTranscriptCommand(rawKind)) throw new Error("Unsupported voice transcript command");
  const transcriptId = ulidToken(tokens, 1, "voice transcript id");
  const flags = parseFlags(tokens.slice(2));
  rejectUnknownFlags(flags, new Set(["workspace", "session", "run", "reason", "if-match", "idempotency-key"]));
  const kind = rawKind === "delete" ? "delete_transcript" : "export_transcript";
  const body = { schema_version: 1, workspace_id: workspace(flags), voice_session_id: ulidFlag(flags, "session"), run_id: ulidFlag(flags, "run"), kind, reason: requireSecretSafeFlag(flags, "reason"), descriptor_only: true };
  VoiceCommandSchema.parse({ ...body, command_id: transcriptId, idempotency_key: requireFlag(flags, "idempotency-key"), expected_revision: positiveInteger(requireFlag(flags, "if-match"), "if-match"), transcript_id: transcriptId, created_at: CLI_VALIDATION_TIMESTAMP });
  return { method: "POST", path: `/v1/voice-transcripts/${transcriptId}/${rawKind}`, headers: { ...idempotencyHeaders(flags), "if-match": requirePositiveIntegerText(flags, "if-match") }, body, descriptor_only: true };
}

function isSessionCommand(value: string): value is SessionCommandKind {
  return value === "wake" || value === "interrupt" || value === "pause" || value === "resume";
}

function isTranscriptCommand(value: string): value is TranscriptCommandInput {
  return value === "delete" || value === "export";
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

function idempotencyHeaders(flags: ReadonlyMap<string, string>): VoiceJarvisHeaders {
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

function ulidFlag(flags: ReadonlyMap<string, string>, name: string): string {
  return UlidSchema.parse(requireFlag(flags, name));
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

function voiceMode(value: string): "conversation" | "push_to_talk" | "wall" {
  if (value === "conversation" || value === "push_to_talk" || value === "wall") return value;
  throw new Error("--mode must be conversation, push_to_talk, or wall");
}

function rejectForbiddenDescriptorOnlyContent(tokens: readonly string[]): void {
  const externalFlags = new Set(["--microphone", "--speaker", "--record-audio", "--play-audio", "--credential", "--provider", "--stt-provider", "--tts-provider", "--mcp", "--connect", "--external", "--live-audio"]);
  const forbiddenFlag = tokens.find((token) => externalFlags.has(token));
  if (forbiddenFlag !== undefined) throw new Error(`Voice/Jarvis audio provider side effects are disabled for descriptor-only commands: ${forbiddenFlag}`);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.startsWith("--") || isMetadataFlagValue(tokens, index)) continue;
    if (/^(?:file|secret|smb|sftp|ftp|http|https):\/\//i.test(token)) throw new Error("Credentials, audio files, and live providers are disabled for descriptor-only Voice/Jarvis commands");
    if (containsSecretLikeText(token)) throw new Error("Descriptor-only Voice/Jarvis commands cannot contain secret-shaped content");
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
