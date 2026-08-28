import { RemoteExecutionSnapshotSchema, z, type RemoteExecutionSnapshot } from "@nexora/contracts";
import { canonicalSnapshotHash, sha256MemoryContent } from "@nexora/memory";
import { redactSecrets } from "@nexora/policy";

const RemoteSnapshotBuildInputSchema = z.object({
  workspace_id: z.string(),
  run_id: z.string(),
  attempt_id: z.string(),
  step_id: z.string(),
  trace_id: z.string(),
  lease_id: z.string(),
  fencing_token: z.number(),
  deadline_at: z.string(),
  budget: z.object({ max_tokens: z.number(), max_cost_usd: z.number() }).strict(),
  artifact_refs: z.array(z.unknown()),
  memory_refs: z.array(z.unknown()),
  policy_snapshot: z.unknown(),
  secret_refs: z.array(z.string()).max(128).optional(),
  now: z.string().optional(),
}).strict();

export function buildRemoteSnapshot(input: unknown): RemoteExecutionSnapshot {
  const parsed = RemoteSnapshotBuildInputSchema.parse(input);
  const secrets = parsed.secret_refs ?? [];
  const redactions: string[] = [];
  const memoryRefs = parsed.memory_refs.map((ref) => {
    const result = z.object({ note_id: z.string(), note_version: z.number(), content_hash: z.string(), content: z.string() }).strict().parse(ref);
    const redacted = redactSecrets(result.content, { secret_refs: secrets });
    if (redacted.redactions.length > 0) redactions.push(...redacted.redactions.map(() => `memory_refs[${redactions.length}]`));
    const content = z.string().parse(redacted.value);
    return { ...result, transmitted_hash: sha256MemoryContent(content), content };
  });
  const snapshotWithoutHash = RemoteExecutionSnapshotSchema.omit({ snapshot_hash: true }).parse({
    schema_version: 1,
    workspace_id: parsed.workspace_id,
    run_id: parsed.run_id,
    attempt_id: parsed.attempt_id,
    step_id: parsed.step_id,
    trace_id: parsed.trace_id,
    lease_id: parsed.lease_id,
    fencing_token: parsed.fencing_token,
    deadline_at: parsed.deadline_at,
    budget: parsed.budget,
    artifact_refs: parsed.artifact_refs,
    memory_refs: memoryRefs,
    policy_snapshot: parsed.policy_snapshot,
    redaction_count: redactions.length,
  });
  const snapshot = RemoteExecutionSnapshotSchema.parse({ ...snapshotWithoutHash, snapshot_hash: canonicalSnapshotHash(snapshotWithoutHash) });
  if (scanSnapshotForSecrets(snapshot, secrets).length > 0) throw new Error("Remote snapshot contains an unredacted secret");
  return snapshot;
}

export function scanSnapshotForSecrets(snapshot: RemoteExecutionSnapshot, secrets: readonly string[]): readonly string[] {
  const findings: string[] = [];
  const secretValues = secrets.filter((secret) => secret.length > 0);
  const visit = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      if (secretValues.some((secret) => value.includes(secret))) findings.push(path);
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:bearer|api[_-]?key|access[_-]?token|secret)\s*[=:]/i.test(value)) findings.push(path);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (typeof value === "object" && value !== null) {
      Object.entries(value).forEach(([key, child]) => {
        if (/^(?:secret|token|api[_-]?key|authorization|private[_-]?key|vault|chat_history)/i.test(key)) findings.push(`${path}.${key}`);
        visit(child, `${path}.${key}`);
      });
    }
  };
  visit(snapshot, "$" );
  return findings;
}
