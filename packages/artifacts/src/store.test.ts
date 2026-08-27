import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate, openDatabase } from "@nexora/persistence";
import { ArtifactStore, ArtifactStoreError } from "./store.js";
import type { StoreArtifactInput } from "./store.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const GOAL_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const TICKET_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const AGENT_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const RECEIPT_ID = "01GRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-26T04:00:00.000Z";

function seedGraph(database: ReturnType<typeof openDatabase>): void {
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Demo", TIME, TIME);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(AGENT_ID, WORKSPACE_ID, "{}", TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(GOAL_ID, WORKSPACE_ID, "Goal", "Objective", "[]", "{}", TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(TICKET_ID, WORKSPACE_ID, GOAL_ID, "ready", "ticket:c07", "{}", TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(RUN_ID, WORKSPACE_ID, TICKET_ID, "queued", "{}", TIME, TIME);
  database.prepare("INSERT INTO receipts(id, workspace_id, run_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)").run(RECEIPT_ID, WORKSPACE_ID, RUN_ID, "{}", TIME, TIME);
}

describe("ArtifactStore", () => {
  it("Given artifact content When stored Then it is immutable and can be queried by run provenance", () => {
    const root = mkdtempSync(join(tmpdir(), "nexora-artifacts-"));
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    seedGraph(database);
    const store = new ArtifactStore(database, root, { now: () => TIME });

    const input = {
      workspace_id: WORKSPACE_ID,
      artifact_id: ARTIFACT_ID,
      version: 1,
      content_type: "markdown",
      content: "# Draft\n\nEvidence-backed draft.",
      source_ticket: TICKET_ID,
      source_run: RUN_ID,
      source_agent: AGENT_ID,
      model: "deterministic-fixture",
      receipt_refs: [RECEIPT_ID],
      judge_ref: null,
      review_ref: null,
      parent_artifact_refs: [],
      metadata: { title: "Draft" },
    } satisfies StoreArtifactInput;
    const stored = store.write(input);

    expect(stored.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(store.read({ workspace_id: WORKSPACE_ID, artifact_id: ARTIFACT_ID, version: 1 }).content).toBe("# Draft\n\nEvidence-backed draft.");
    expect(store.findByRun({ workspace_id: WORKSPACE_ID, run_id: RUN_ID }).map((item) => item.artifact_id)).toEqual([ARTIFACT_ID]);
    expect(() => store.write({ ...input, content: "changed" })).toThrowError(ArtifactStoreError);
    expect(() => database.prepare("UPDATE artifact_versions SET content_hash = ? WHERE workspace_id = ? AND artifact_id = ?").run("sha256:bad", WORKSPACE_ID, ARTIFACT_ID)).toThrow();

    database.close();
    rmSync(root, { recursive: true, force: true });
  });
});
