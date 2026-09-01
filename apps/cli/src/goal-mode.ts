import { BudgetSchema, TimestampSchema, UlidSchema, WorkspaceIdSchema } from "@nexora/contracts";

export type GoalModeRequest = {
  readonly method: "POST";
  readonly path: string;
  readonly headers: {
    readonly "idempotency-key": string;
    readonly "if-match": string;
  };
  readonly body: ResumeGoalBody | SubgoalBody;
  readonly descriptor_only: true;
};

type ResumeGoalBody = {
  readonly schema_version: 1;
  readonly workspace_id: string;
  readonly cursor: string;
};

type SubgoalBody = {
  readonly schema_version: 1;
  readonly workspace_id: string;
  readonly objective: string;
  readonly max_turns: number;
  readonly deadline_at: string;
  readonly budget: {
    readonly max_tokens: number;
    readonly max_cost_usd: number;
  };
};

export function parseGoalModeCommand(input: string): GoalModeRequest {
  const tokens = tokenize(input);
  rejectExternalFlags(tokens);
  const command = tokens[0];
  if (command === "/goal" && tokens[1] === "resume") return parseResume(tokens);
  if (command === "/subgoal") return parseSubgoal(tokens);
  throw new Error("Unsupported goal mode command");
}

function parseResume(tokens: readonly string[]): GoalModeRequest {
  const loopId = parseUlid(requiredToken(tokens, 2, "goal loop id"));
  const flags = parseFlags(tokens.slice(3));
  const workspaceId = WorkspaceIdSchema.parse(requireFlag(flags, "workspace"));
  const cursor = requireFlag(flags, "cursor");
  return {
    method: "POST",
    path: `/v1/goal-loops/${loopId}/resume`,
    headers: commandHeaders(flags),
    body: { schema_version: 1, workspace_id: workspaceId, cursor },
    descriptor_only: true,
  };
}

function parseSubgoal(tokens: readonly string[]): GoalModeRequest {
  const loopId = parseUlid(requiredToken(tokens, 1, "parent goal loop id"));
  const flags = parseFlags(tokens.slice(2));
  const workspaceId = WorkspaceIdSchema.parse(requireFlag(flags, "workspace"));
  const deadline = TimestampSchema.parse(requireFlag(flags, "deadline"));
  const budget = BudgetSchema.parse({ max_tokens: positiveInteger(requireFlag(flags, "budget-tokens"), "budget-tokens"), max_cost_usd: positiveNumber(requireFlag(flags, "budget-usd"), "budget-usd") });
  return {
    method: "POST",
    path: `/v1/goal-loops/${loopId}/subgoals`,
    headers: commandHeaders(flags),
    body: {
      schema_version: 1,
      workspace_id: workspaceId,
      objective: requireFlag(flags, "objective"),
      max_turns: positiveInteger(requireFlag(flags, "max-turns"), "max-turns"),
      deadline_at: deadline,
      budget,
    },
    descriptor_only: true,
  };
}

function commandHeaders(flags: ReadonlyMap<string, string>): GoalModeRequest["headers"] {
  return { "idempotency-key": requireFlag(flags, "idempotency-key"), "if-match": requireFlag(flags, "if-match") };
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

function parseUlid(value: string): string {
  return UlidSchema.parse(value);
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive number`);
  return parsed;
}

function rejectExternalFlags(tokens: readonly string[]): void {
  const externalFlags = new Set(["--send", "--provider", "--connector", "--mcp"]);
  const externalFlag = tokens.find((token) => externalFlags.has(token));
  if (externalFlag !== undefined) throw new Error(`External side effects are disabled for descriptor-only Goal Mode commands: ${externalFlag}`);
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
