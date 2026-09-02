import { DescriptorIdSchema, UlidSchema, WorkspaceIdSchema, containsPathLikeText, containsSecretLikeText } from "@nexora/contracts";

export type LearningControlRequest = {
  readonly method: "POST";
  readonly path: string;
  readonly headers: LearningHeaders;
  readonly body: LearningCandidateBody | SkillLifecycleBody;
  readonly descriptor_only: true;
};

type LearningHeaders = {
  readonly "idempotency-key": string;
  readonly "if-match"?: string;
};

type LearningCandidateBody = {
  readonly schema_version: 1;
  readonly workspace_id: string;
  readonly run_id: string;
  readonly goal_loop_id: string;
  readonly source_event_id: string;
  readonly proposed_skill_id: string;
  readonly lesson: string;
  readonly proposed_diff_summary: string;
  readonly evidence_refs: readonly string[];
  readonly descriptor_only: true;
};

type SkillLifecycleBody = {
  readonly schema_version: 1;
  readonly workspace_id: string;
  readonly version_id: string;
  readonly reason: string;
  readonly installation_revision?: number;
  readonly rollback_to_version_id?: string;
};

type SkillAction = "approve" | "install" | "revoke" | "quarantine" | "rollback";

export function parseLearningCommand(input: string): LearningControlRequest {
  const tokens = tokenize(input);
  rejectForbiddenDescriptorOnlyContent(input, tokens);
  const command = tokens[0];
  if (command === "/learn") return parseLearn(tokens);
  if (command === "/skill") return parseSkillLifecycle(tokens);
  throw new Error("Unsupported skills learning command");
}

function parseLearn(tokens: readonly string[]): LearningControlRequest {
  const flags = parseFlags(tokens.slice(1));
  rejectUnknownFlags(flags, new Set(["workspace", "run", "goal-loop", "source-event", "proposed-skill", "lesson", "diff", "evidence", "idempotency-key"]));
  const workspaceId = WorkspaceIdSchema.parse(requireFlag(flags, "workspace"));
  return {
    method: "POST",
    path: "/v1/learning/candidates",
    headers: { "idempotency-key": requireFlag(flags, "idempotency-key") },
    body: {
      schema_version: 1,
      workspace_id: workspaceId,
      run_id: parseUlid(requireFlag(flags, "run")),
      goal_loop_id: parseUlid(requireFlag(flags, "goal-loop")),
      source_event_id: parseUlid(requireFlag(flags, "source-event")),
      proposed_skill_id: DescriptorIdSchema.parse(requireFlag(flags, "proposed-skill")),
      lesson: requireSecretSafeFlag(flags, "lesson"),
      proposed_diff_summary: requireSecretSafeFlag(flags, "diff"),
      evidence_refs: parseEvidenceRefs(requireFlag(flags, "evidence")),
      descriptor_only: true,
    },
    descriptor_only: true,
  };
}

function parseSkillLifecycle(tokens: readonly string[]): LearningControlRequest {
  const action = parseSkillAction(requiredToken(tokens, 1, "skill action"));
  const skillId = DescriptorIdSchema.parse(requiredToken(tokens, 2, "skill id"));
  const flags = parseFlags(tokens.slice(3));
  const body = lifecycleBody(flags, action);
  return {
    method: "POST",
    path: `/v1/skills/${skillId}/${action}`,
    headers: { "idempotency-key": requireFlag(flags, "idempotency-key"), "if-match": requirePositiveIntegerText(flags, "if-match") },
    body,
    descriptor_only: true,
  };
}

function lifecycleBody(flags: ReadonlyMap<string, string>, action: SkillAction): SkillLifecycleBody {
  rejectUnknownFlags(flags, lifecycleAllowedFlags(action));
  const base: Omit<SkillLifecycleBody, "rollback_to_version_id"> = {
    schema_version: 1,
    workspace_id: WorkspaceIdSchema.parse(requireFlag(flags, "workspace")),
    version_id: parseUlid(requireFlag(flags, "version")),
    reason: requireSecretSafeFlag(flags, "reason"),
  };
  const withInstallationRevision = requiresInstallationRevision(action)
    ? { ...base, installation_revision: requirePositiveIntegerNumber(flags, "installation-revision") }
    : base;
  if (action !== "rollback") return withInstallationRevision;
  return { ...withInstallationRevision, rollback_to_version_id: parseUlid(requireFlag(flags, "rollback-to")) };
}

function parseSkillAction(value: string): SkillAction {
  if (value === "approve" || value === "install" || value === "revoke" || value === "quarantine" || value === "rollback") return value;
  throw new Error("Unsupported skill lifecycle action");
}

function parseEvidenceRefs(value: string): readonly string[] {
  const refs = value.split(",").map((ref) => ref.trim()).filter((ref) => ref.length > 0);
  if (refs.length === 0) throw new Error("Missing --evidence");
  for (const ref of refs) {
    if (!/^(?:artifact|workspace|memory|skill):\/\/[^\s]+$/.test(ref) || containsSecretLikeText(ref) || containsPathLikeText(ref)) throw new Error("Evidence refs must be descriptor-only internal references without credential refs");
  }
  return refs;
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

function lifecycleAllowedFlags(action: SkillAction): ReadonlySet<string> {
  const common = ["workspace", "version", "reason", "if-match", "idempotency-key"];
  if (action === "rollback") return new Set([...common, "installation-revision", "rollback-to"]);
  if (requiresInstallationRevision(action)) return new Set([...common, "installation-revision"]);
  return new Set(common);
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

function requirePositiveIntegerText(flags: ReadonlyMap<string, string>, name: string): string {
  const value = requireFlag(flags, name);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive integer`);
  return value;
}

function requirePositiveIntegerNumber(flags: ReadonlyMap<string, string>, name: string): number {
  return Number(requirePositiveIntegerText(flags, name));
}

function requiresInstallationRevision(action: SkillAction): boolean {
  return action === "revoke" || action === "quarantine" || action === "rollback";
}

function requiredToken(tokens: readonly string[], index: number, label: string): string {
  const token = tokens[index];
  if (token === undefined || token.length === 0) throw new Error(`Missing ${label}`);
  return token;
}

function parseUlid(value: string): string {
  return UlidSchema.parse(value);
}

function rejectForbiddenDescriptorOnlyContent(input: string, tokens: readonly string[]): void {
  if (containsSecretLikeText(input)) throw new Error("Descriptor-only learning commands cannot contain secret-shaped content");
  const externalFlags = new Set(["--url", "--pdf", "--file", "--path", "--source", "--credential", "--mcp", "--provider", "--send", "--connector", "--install-external"]);
  const externalFlag = tokens.find((token) => externalFlags.has(token));
  if (externalFlag !== undefined) throw new Error(`External reads or side effects are disabled for descriptor-only learning commands: ${externalFlag}`);
  const externalRef = tokens.find((token) => /^(?:https?|file|secret):\/\//i.test(token));
  if (externalRef !== undefined) throw new Error("External reads and credential refs are disabled for descriptor-only learning commands");
  const pathLike = tokens.find((token, index) => index > 0 && !token.startsWith("--") && containsPathLikeText(token));
  if (pathLike !== undefined) throw new Error("Local paths and credential refs are disabled for descriptor-only learning commands");
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
