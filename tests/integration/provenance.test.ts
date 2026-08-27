import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PolicyScope } from "../../packages/contracts/src/index.js";
import { ArtifactStore } from "../../packages/artifacts/src/index.js";
import { MemoryVault, initializeVaultLayout } from "../../packages/memory/src/index.js";
import { migrate, openDatabase } from "../../packages/persistence/src/index.js";
import type { PolicyActor } from "../../packages/policy/src/index.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const GOAL_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const TICKET_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const AGENT_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const RECEIPT_ID = "01GRZ3NDEKTSV4RRFFQ69G5FAV";
const NOTE_ID = "01HRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-26T04:00:00.000Z";
const scope: PolicyScope = { kind: "workspace", id: WORKSPACE_ID };
const actor: PolicyActor = { id: AGENT_ID, role: "Agent", workspace_id: WORKSPACE_ID, allowed_scopes: [scope] };

describe("C07 provenance integration", () => {
  it("Given a run artifact and receipt When memory is written from it Then Artifact and Memory both expose the lineage", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-provenance-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    initializeVaultLayout(root);
    database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Demo", TIME, TIME);
    database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(AGENT_ID, WORKSPACE_ID, "{}", TIME, TIME);
    database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(GOAL_ID, WORKSPACE_ID, "Goal", "Objective", "[]", "{}", TIME, TIME);
    database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(TICKET_ID, WORKSPACE_ID, GOAL_ID, "ready", "ticket:c07", "{}", TIME, TIME);
    database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(RUN_ID, WORKSPACE_ID, TICKET_ID, "queued", "{}", TIME, TIME);
    database.prepare("INSERT INTO receipts(id, workspace_id, run_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)").run(RECEIPT_ID, WORKSPACE_ID, RUN_ID, "{}", TIME, TIME);
    const artifacts = new ArtifactStore(database, root, { now: () => TIME });
    const memory = new MemoryVault(database, root, { now: () => TIME });

    const artifact = artifacts.write({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1, content_type: "markdown", content: "# Source", source_ticket: TICKET_ID, source_run: RUN_ID, source_agent: AGENT_ID, model: "deterministic-fixture", receipt_refs: [RECEIPT_ID], judge_ref: "judge://pass", review_ref: null, parent_artifact_refs: [], metadata: { title: "Source" } });
    memory.write({ actor, workspace_id: WORKSPACE_ID, requested_scope: scope, path: "Reports/seo/source.md", base_version: 0, note_id: NOTE_ID, content: "Fact from artifact", source_refs: [{ kind: "artifact", ref: artifact.content_ref, verified: true }], provenance: { created_by: { type: "agent", id: AGENT_ID }, run_id: RUN_ID, artifact_refs: [artifact.content_ref], receipt_refs: [RECEIPT_ID] } });

    const lineage = artifacts.getLineage({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 });
    const note = memory.read({ actor, workspace_id: WORKSPACE_ID, requested_scope: scope, path: "Reports/seo/source.md" });

    expect(lineage).toEqual({ source_ticket: TICKET_ID, source_run: RUN_ID, source_agent: AGENT_ID, receipt_refs: [RECEIPT_ID], judge_ref: "judge://pass", review_ref: null });
    expect(note.source_refs).toEqual([{ kind: "artifact", ref: artifact.content_ref, verified: true }]);
    expect(note.provenance.receipt_refs).toEqual([RECEIPT_ID]);

    database.close();
    rmSync(root, { recursive: true, force: true });
  });
});
