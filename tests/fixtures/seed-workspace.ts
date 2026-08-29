import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { migrate, openDatabase, withTransaction, type SqliteDatabase } from "../../packages/persistence/src/index.js";

export const DEFAULT_SEED_IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  agent: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  attempt: "01FRZ3NDEKTSV4RRFFQ69F5FAV",
  step: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  job: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  artifact: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
  artifactVersion: "01KRZ3NDEKTSV4RRFFQ69K5FAV",
  receipt: "01SRZ3NDEKTSV4RRFFQ69S5FAV",
  review: "01MRZ3NDEKTSV4RRFFQ69M5FAV",
  memory: "01NRZ3NDEKTSV4RRFFQ69N5FAV",
} as const;

const SEED_TIME = "2026-08-29T00:00:00.000Z";
const DRAFT_CONTENT = "# Seed SEO draft\n\nEvidence-backed draft fixture for release QA.\n";
const MEMORY_CONTENT = "# Release QA memory\n\nTrusted seed fixture context.\n";

export type SeedWorkspaceOptions = {
  readonly data_dir: string;
  readonly now?: string;
};

export type SeedWorkspaceResult = {
  readonly workspace_id: string;
  readonly db_path: string;
  readonly vault_path: string;
  readonly seeded_at: string;
  readonly counts: {
    readonly workspaces: 1;
    readonly agents: 1;
    readonly goals: 1;
    readonly tickets: 1;
    readonly memory_notes: 1;
    readonly artifact_versions: 1;
    readonly draft_reviews: 1;
  };
};

export function seedWorkspace(options: SeedWorkspaceOptions): SeedWorkspaceResult {
  const dataDir = resolveSeedDataDirectory(options.data_dir);
  const now = options.now ?? SEED_TIME;
  const dbPath = join(dataDir, "nexora.sqlite");
  const vaultPath = join(dataDir, "vault");
  assertContainedPath(dataDir, dbPath);
  assertContainedPath(dataDir, vaultPath);
  mkdirSync(vaultPath, { recursive: true });
  assertContainedPath(dataDir, vaultPath);
  const memoryDirectory = join(vaultPath, ".nexora", "memory", DEFAULT_SEED_IDS.memory);
  const artifactDirectory = join(vaultPath, "Artifacts", DEFAULT_SEED_IDS.artifact, "v1");
  assertContainedPath(dataDir, memoryDirectory);
  assertContainedPath(dataDir, artifactDirectory);
  mkdirSync(memoryDirectory, { recursive: true });
  mkdirSync(artifactDirectory, { recursive: true });
  assertContainedPath(dataDir, memoryDirectory);
  assertContainedPath(dataDir, artifactDirectory);
  const memoryPath = join(memoryDirectory, "v1.md");
  const activeMemoryPath = join(vaultPath, "release-qa.md");
  const artifactHash = sha256(DRAFT_CONTENT);
  const artifactPath = join(artifactDirectory, `${artifactHash.slice("sha256:".length)}.txt`);
  assertContainedPath(dataDir, memoryPath);
  assertContainedPath(dataDir, activeMemoryPath);
  assertContainedPath(dataDir, artifactPath);
  writeFileSync(memoryPath, MEMORY_CONTENT, { encoding: "utf8" });
  writeFileSync(activeMemoryPath, MEMORY_CONTENT, { encoding: "utf8" });
  writeFileSync(artifactPath, DRAFT_CONTENT, { encoding: "utf8" });

  const database = openDatabase(dbPath);
  try {
    migrate(database, { now: () => now });
    withTransaction(database, () => insertSeedGraph(database, now, artifactHash));
  } finally {
    database.close();
  }

  return {
    workspace_id: DEFAULT_SEED_IDS.workspace,
    db_path: dbPath,
    vault_path: vaultPath,
    seeded_at: now,
    counts: {
      workspaces: 1,
      agents: 1,
      goals: 1,
      tickets: 1,
      memory_notes: 1,
      artifact_versions: 1,
      draft_reviews: 1,
    },
  };
}

function insertSeedGraph(database: SqliteDatabase, now: string, artifactHash: string): void {
  const ids = DEFAULT_SEED_IDS;
  const workspace = { id: ids.workspace, name: "C16 Release QA Workspace", schema_version: 1, created_at: now, updated_at: now };
  const agent = { id: ids.agent, workspace_id: ids.workspace, schema_version: 1, created_at: now, updated_at: now, purpose: "Run release QA fixtures", role: "Agent", allowed_scopes: [{ kind: "workspace", id: ids.workspace }], runtime: { kind: "local", adapter: "deterministic" }, model_policy: { allowed_models: ["deterministic"], default_model: "deterministic" }, memory_reads: [{ scope: "workspace" }], tools: { allow: ["memory:read"], deny: [] }, handoff_outputs: ["report"], requires_review: false, quality_gates: ["tests"] };
  const goal = { id: ids.goal, workspace_id: ids.workspace, schema_version: 1, created_at: now, updated_at: now, title: "Release QA", objective: "Exercise the complete local release surface", definition_of_done: ["seed is reproducible", "recovery evidence is retained"] };
  const ticket = { id: ids.ticket, workspace_id: ids.workspace, schema_version: 1, created_at: now, updated_at: now, goal_id: ids.goal, status: "ready", definition_of_done: ["draft is source-backed"], assigned_agents: [ids.agent], approval_policy: { mode: "required" }, idempotency_key: "c16:seed:ticket" };
  const run = { id: ids.run, workspace_id: ids.workspace, schema_version: 1, created_at: now, updated_at: now, ticket_id: ids.ticket, execution_location: "local", status: "waiting_review", budget: { max_tokens: 10_000, max_cost_usd: 10 }, memory_snapshot: { snapshot_id: ids.memory, version: 1 }, connector_versions: { deterministic: "1.0.0" } };
  const attempt = { id: ids.attempt, workspace_id: ids.workspace, schema_version: 1, created_at: now, updated_at: now, run_id: ids.run, status: "succeeded", execution_location: "local" };
  const step = { id: ids.step, workspace_id: ids.workspace, schema_version: 1, created_at: now, updated_at: now, run_id: ids.run, attempt_id: ids.attempt, agent_id: ids.agent, status: "succeeded", inputs: ["fixture://gsc"], outputs: [`artifact://${ids.artifact}`], retry_policy: { max_attempts: 3, backoff_ms: 100 }, requires_review: true };
  const memoryContentRef = `vault://.nexora/memory/${ids.memory}/v1.md`;
  const artifactContentRef = `artifact://Artifacts/${ids.artifact}/v1/${artifactHash.slice("sha256:".length)}.txt`;
  const memorySourceRefs = [{ kind: "file", ref: memoryContentRef, verified: true }];
  const memory = { id: ids.memory, workspace_id: ids.workspace, schema_version: 1, created_at: now, updated_at: now, path: "release-qa.md", scope: { kind: "workspace", id: ids.workspace }, current_version: 1, trust_state: "trusted", source_refs: memorySourceRefs, provenance: { created_by: { type: "human", id: ids.workspace }, run_id: ids.run, artifact_refs: [], receipt_refs: [ids.receipt] } };
  const memoryVersion = { id: ids.memory, workspace_id: ids.workspace, schema_version: 1, created_at: now, updated_at: now, note_id: ids.memory, path: "release-qa.md", note_version: 1, content_hash: sha256(MEMORY_CONTENT), content_ref: memoryContentRef, source_refs: memory.source_refs, trust_state: "trusted", provenance: memory.provenance, status: "active", conflict_group_id: null, review_id: null };
  const artifact = { id: ids.artifact, workspace_id: ids.workspace, schema_version: 1, created_at: now, updated_at: now, type: "draft", status: "draft", source_ticket: ids.ticket, source_run: ids.run, version: 1, visibility: "workspace", content_ref: artifactContentRef, evidence_refs: [`receipt://${ids.receipt}`] };
  const artifactVersion = { id: ids.artifactVersion, workspace_id: ids.workspace, schema_version: 1, created_at: now, updated_at: now, artifact_id: ids.artifact, artifact_version: 1, content_type: "markdown", content_hash: artifactHash, content_ref: artifactContentRef, byte_size: Buffer.byteLength(DRAFT_CONTENT), source_ticket: ids.ticket, source_run: ids.run, source_agent: ids.agent, model: "deterministic", receipt_refs: [`receipt://${ids.receipt}`], judge_ref: "judge://c16/seed", review_ref: `review://${ids.review}/v1`, parent_artifact_refs: [], metadata: { workflow_id: "seo_draft_v1", publish_disabled: true }, preview: { kind: "markdown", preview: DRAFT_CONTENT, truncated: false, redactions: [] } };
  const receipt = { id: ids.receipt, workspace_id: ids.workspace, schema_version: 1, created_at: now, updated_at: now, run_id: ids.run, inputs: ["fixture://gsc", `memory://${ids.memory}`], tool_calls: [{ tool: "gsc.fixture", status: "succeeded" }, { tool: "seo.draft_writer", status: "succeeded" }, { tool: "seo.independent_judge", status: "pass" }], validation_results: [{ gate: "source_data_present", passed: true }, { gate: "no_invented_metrics", passed: true }], unverified_items: [], side_effects: [{ kind: "artifact_write", reference: artifact.content_ref }] };
  const review = { id: ids.review, workspace_id: ids.workspace, schema_version: 1, created_at: now, updated_at: now, artifact_id: ids.artifact, artifact_version: 1, review_version: 1, requested_scope: { kind: "workspace", id: ids.workspace }, expires_at: "2026-08-30T00:00:00.000Z", judge_result: "pass", human_decision: "pending", reviewer_id: ids.workspace, reviewer_role: "Reviewer", reason: "C16 seed review", approved_payload_hash: null, risk_level: "R2", policy_decision: { allowed: false, code: "POLICY_REVIEW_REQUIRED", event_type: "policy.denied", reason: "Human review required", required_action: "human_review", redactions: [] } };

  database.prepare("INSERT OR IGNORE INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(workspace.id, workspace.name, now, now);
  database.prepare("INSERT OR IGNORE INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(agent.id, agent.workspace_id, JSON.stringify(agent), now, now);
  database.prepare("INSERT OR IGNORE INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(goal.id, goal.workspace_id, goal.title, goal.objective, JSON.stringify(goal.definition_of_done), JSON.stringify(goal), now, now);
  database.prepare("INSERT OR IGNORE INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(ticket.id, ticket.workspace_id, ticket.goal_id, ticket.status, ticket.idempotency_key, JSON.stringify(ticket), now, now);
  database.prepare("INSERT OR IGNORE INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(run.id, run.workspace_id, run.ticket_id, run.status, JSON.stringify(run), now, now);
  database.prepare("INSERT OR IGNORE INTO attempts(id, workspace_id, run_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(attempt.id, attempt.workspace_id, attempt.run_id, attempt.status, JSON.stringify(attempt), now, now);
  database.prepare("INSERT OR IGNORE INTO steps(id, workspace_id, run_id, attempt_id, agent_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)").run(step.id, step.workspace_id, step.run_id, step.attempt_id, step.agent_id, step.status, JSON.stringify(step), now, now);
  database.prepare("INSERT OR IGNORE INTO memory_notes(id, workspace_id, path, scope_kind, scope_id, current_version, trust_state, source_refs_json, provenance_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 1, ?, ?)").run(memory.id, memory.workspace_id, memory.path, memory.scope.kind, memory.scope.id, memory.trust_state, JSON.stringify(memory.source_refs), JSON.stringify(memory.provenance), JSON.stringify(memory), now, now);
  database.prepare("INSERT OR IGNORE INTO memory_versions(id, workspace_id, note_id, path, note_version, content_hash, content_ref, source_refs_json, trust_state, provenance_json, status, conflict_group_id, review_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 1, ?, ?)").run(memoryVersion.id, memoryVersion.workspace_id, memoryVersion.note_id, memoryVersion.path, memoryVersion.content_hash, memoryVersion.content_ref, JSON.stringify(memoryVersion.source_refs), memoryVersion.trust_state, JSON.stringify(memoryVersion.provenance), memoryVersion.status, JSON.stringify(memoryVersion), now, now);
  database.prepare("INSERT OR IGNORE INTO receipts(id, workspace_id, run_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)").run(receipt.id, receipt.workspace_id, receipt.run_id, JSON.stringify(receipt), now, now);
  database.prepare("INSERT OR IGNORE INTO artifacts(id, workspace_id, artifact_version, source_ticket, source_run, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?, 'draft', ?, 1, ?, ?)").run(artifact.id, artifact.workspace_id, artifact.source_ticket, artifact.source_run, JSON.stringify(artifact), now, now);
  database.prepare("INSERT OR IGNORE INTO artifact_versions(id, workspace_id, artifact_id, artifact_version, content_type, content_hash, content_ref, byte_size, source_ticket, source_run, source_agent, model, receipt_refs_json, judge_ref, review_ref, parent_artifact_refs_json, metadata_json, preview_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)").run(artifactVersion.id, artifactVersion.workspace_id, artifactVersion.artifact_id, artifactVersion.content_type, artifactVersion.content_hash, artifactVersion.content_ref, artifactVersion.byte_size, artifactVersion.source_ticket, artifactVersion.source_run, artifactVersion.source_agent, artifactVersion.model, JSON.stringify(artifactVersion.receipt_refs), artifactVersion.judge_ref, artifactVersion.review_ref, JSON.stringify(artifactVersion.parent_artifact_refs), JSON.stringify(artifactVersion.metadata), JSON.stringify(artifactVersion.preview), JSON.stringify(artifactVersion), now, now);
  database.prepare("INSERT OR IGNORE INTO review_decisions(id, workspace_id, artifact_id, artifact_version, review_version, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, 1, ?, ?)").run(review.id, review.workspace_id, review.artifact_id, JSON.stringify(review), now, now);
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function resolveSeedDataDirectory(input: string): string {
  const dataDir = resolve(input);
  if (existsSync(dataDir) && lstatSync(dataDir).isSymbolicLink()) throw new Error("Seed data directory must not be a symlink");
  mkdirSync(dataDir, { recursive: true });
  if (lstatSync(dataDir).isSymbolicLink()) throw new Error("Seed data directory must not be a symlink");
  return realpathSync(dataDir);
}

function assertContainedPath(root: string, target: string): void {
  const rootReal = realpathSync(root);
  const targetPath = resolve(target);
  const targetRelative = relative(rootReal, targetPath);
  if (targetRelative === ".." || targetRelative.startsWith(`..${sep}`) || isAbsolute(targetRelative)) throw new Error("Seed path must stay inside the data directory");

  let current = rootReal;
  for (const segment of targetRelative.split(sep).filter((part) => part.length > 0)) {
    current = join(current, segment);
    if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error("Seed path must not traverse a symlink");
  }
}

function parseDataDirectory(argv: readonly string[]): string {
  const index = argv.indexOf("--data-dir");
  const explicit = index >= 0 ? argv[index + 1] : undefined;
  return resolve(explicit ?? process.env["NEXORA_DATA_DIR"] ?? ".nexora/data");
}

const entryPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (entryPath !== undefined && entryPath === fileURLToPath(import.meta.url)) {
  const result = seedWorkspace({ data_dir: parseDataDirectory(process.argv.slice(2)) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
