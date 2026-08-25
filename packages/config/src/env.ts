import { z } from "zod";

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
const AUTH_MODES = ["local", "disabled"] as const;

const EnvironmentSchema = z.object({
  NEXORA_DATA_DIR: z.string().trim().min(1),
  NEXORA_API_HOST: z.string().trim().min(1).default("127.0.0.1"),
  NEXORA_API_PORT: z.preprocess(
    (value: unknown) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
    z.number().int().min(1).max(65535).default(4310),
  ),
  NEXORA_LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  NEXORA_AUTH_MODE: z.enum(AUTH_MODES).default("local"),
});

type EnvironmentInput = Record<string, string | undefined>;

export type NexoraEnvironment = {
  readonly dataDir: string;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly logLevel: (typeof LOG_LEVELS)[number];
  readonly authMode: (typeof AUTH_MODES)[number];
};

export class EnvironmentValidationError extends Error {
  readonly name = "EnvironmentValidationError";
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    const uniqueFields = [...new Set(fields)];
    super(
      uniqueFields.length > 0
        ? `Invalid Nexora environment: ${uniqueFields.join(", ")}`
        : "Invalid Nexora environment",
    );
    this.fields = uniqueFields;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function parseEnvironment(input: EnvironmentInput): NexoraEnvironment {
  const result = EnvironmentSchema.safeParse(input);

  if (!result.success) {
    const fields = result.error.issues.flatMap((issue) => {
      const field = issue.path[0];
      return typeof field === "string" ? [field] : [];
    });
    throw new EnvironmentValidationError(fields);
  }

  return {
    dataDir: result.data.NEXORA_DATA_DIR,
    apiHost: result.data.NEXORA_API_HOST,
    apiPort: result.data.NEXORA_API_PORT,
    logLevel: result.data.NEXORA_LOG_LEVEL,
    authMode: result.data.NEXORA_AUTH_MODE,
  };
}
