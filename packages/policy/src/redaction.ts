export type RedactionOptions = {
  readonly secret_refs: readonly string[];
};

export type RedactionResult = {
  readonly value: unknown;
  readonly redactions: readonly string[];
};

type RedactionRun = {
  readonly value: unknown;
  readonly redactions: readonly string[];
};

export function redactSecrets(value: unknown, options: RedactionOptions): RedactionResult {
  const result = redactValue(value, "$", options.secret_refs.filter((secret) => secret.length > 0), new WeakSet<object>());
  return { value: result.value, redactions: result.redactions };
}

function redactValue(value: unknown, path: string, secrets: readonly string[], seen: WeakSet<object>): RedactionRun {
  if (typeof value === "string") return redactString(value, path, secrets);
  if (Array.isArray(value)) return redactArray(value, path, secrets, seen);
  if (isRecord(value)) return redactRecord(value, path, secrets, seen);
  return { value, redactions: [] };
}

function redactString(value: string, path: string, secrets: readonly string[]): RedactionRun {
  let redacted = value;
  for (const secret of secrets) {
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted === value ? { value, redactions: [] } : { value: redacted, redactions: [path] };
}

function redactArray(values: readonly unknown[], path: string, secrets: readonly string[], seen: WeakSet<object>): RedactionRun {
  if (seen.has(values)) return { value: "[Circular]", redactions: [] };
  seen.add(values);
  const redactions: string[] = [];
  const redactedValues = values.map((item, index) => {
    const result = redactValue(item, `${path}[${index}]`, secrets, seen);
    redactions.push(...result.redactions);
    return result.value;
  });
  seen.delete(values);
  return { value: redactedValues, redactions };
}

function redactRecord(value: Record<string, unknown>, path: string, secrets: readonly string[], seen: WeakSet<object>): RedactionRun {
  if (seen.has(value)) return { value: "[Circular]", redactions: [] };
  seen.add(value);
  const redactions: string[] = [];
  const redacted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const result = redactValue(child, `${path}.${key}`, secrets, seen);
    redactions.push(...result.redactions);
    redacted[key] = result.value;
  }
  seen.delete(value);
  return { value: redacted, redactions };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
