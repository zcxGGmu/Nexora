import { describe, expect, it } from "vitest";
import { MemoryNoteSchema, MemoryVersionSchema } from "@nexora/contracts";
import type { SqliteDatabase } from "@nexora/persistence";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, TIME } from "./test-fixtures.js";

const NOTE_ID = "030RZ3NDEKTSV4RRFFQ69Z5FAV";
const OTHER_NOTE_ID = "031RZ3NDEKTSV4RRFFQ69Z5FAV";
const CONTENT_HASH = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const CANDIDATE_HASH = "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

describe("Control API memory resolution", () => {
  it("Given memory notes When queried through the API Then provenance actor identity is omitted", async () => {
    const fixture = createControlFixture();
    seedMemoryCandidate(fixture.database);

    try {
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/memory/${NOTE_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });
      const list = await fixture.api.inject({ method: "GET", url: `/v1/memory?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(detail.statusCode).toBe(200);
      expect(list.statusCode).toBe(200);
      expect(JSON.stringify(detail.json())).not.toContain("created_by");
      expect(JSON.stringify(detail.json())).not.toContain(IDS.owner);
      expect(JSON.stringify(list.json())).not.toContain("created_by");
      expect(JSON.stringify(list.json())).not.toContain(IDS.owner);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a mismatched memory URL When resolving a candidate Then the API rejects it before reserving idempotency", async () => {
    const fixture = createControlFixture();
    seedMemoryCandidate(fixture.database);

    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: `/v1/memory/${OTHER_NOTE_ID}/resolve`,
        headers: { authorization: ownerHeader(), "idempotency-key": "memory:mismatch" },
        payload: { schema_version: 1, workspace_id: IDS.workspace, note_id: NOTE_ID, note_version: 2, decision: "accept_candidate" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "SCHEMA_INVALID", required_action: "correct_request" });
      expect(idempotencyRecord(fixture.database, "memory:mismatch")).toBeUndefined();
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a missing memory candidate When resolution is retried Then idempotency does not mask the conflict", async () => {
    const fixture = createControlFixture();
    seedMemoryCandidate(fixture.database);

    try {
      const headers = { authorization: ownerHeader(), "idempotency-key": "memory:missing-candidate" };
      const payload = { schema_version: 1, workspace_id: IDS.workspace, note_id: NOTE_ID, note_version: 99, decision: "accept_candidate" };
      const first = await fixture.api.inject({ method: "POST", url: `/v1/memory/${NOTE_ID}/resolve`, headers, payload });
      const second = await fixture.api.inject({ method: "POST", url: `/v1/memory/${NOTE_ID}/resolve`, headers, payload });

      expect(first.statusCode).toBe(409);
      expect(second.statusCode).toBe(409);
      expect(second.json()).toMatchObject({ code: "MEMORY_CONFLICT", required_action: "reload_memory" });
      expect(idempotencyRecord(fixture.database, "memory:missing-candidate")).toBeUndefined();
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given the active note advanced past a candidate When resolving the stale candidate Then the note is not regressed", async () => {
    const fixture = createControlFixture();
    seedMemoryCandidate(fixture.database);
    advanceMemoryNotePastCandidate(fixture.database);

    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: `/v1/memory/${NOTE_ID}/resolve`,
        headers: { authorization: ownerHeader(), "idempotency-key": "memory:stale-candidate" },
        payload: { schema_version: 1, workspace_id: IDS.workspace, note_id: NOTE_ID, note_version: 2, decision: "accept_candidate" },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "MEMORY_CONFLICT", required_action: "reload_memory" });
      expect(currentMemoryNote(fixture.database)).toMatchObject({ current_version: 3, trust_state: "trusted" });
      expect(idempotencyRecord(fixture.database, "memory:stale-candidate")).toBeUndefined();
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an unsupported reject decision When resolving memory Then the API rejects it instead of no-op accepting", async () => {
    const fixture = createControlFixture();
    seedMemoryCandidate(fixture.database);

    try {
      const response = await fixture.api.inject({
        method: "POST",
        url: `/v1/memory/${NOTE_ID}/resolve`,
        headers: { authorization: ownerHeader(), "idempotency-key": "memory:reject-candidate" },
        payload: { schema_version: 1, workspace_id: IDS.workspace, note_id: NOTE_ID, note_version: 2, decision: "reject_candidate" },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "MEMORY_CONFLICT", required_action: "resolve_append_only_rejection" });
      expect(idempotencyRecord(fixture.database, "memory:reject-candidate")).toBeUndefined();
    } finally {
      await closeControlFixture(fixture);
    }
  });
});

function seedMemoryCandidate(database: SqliteDatabase): void {
  const sourceRefs = [{ kind: "manual", ref: "manual://c09", verified: true }];
  const provenance = { created_by: { type: "human", id: IDS.owner }, run_id: null, artifact_refs: [], receipt_refs: [] };
  const note = MemoryNoteSchema.parse({ id: NOTE_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, path: "Reports/c09.md", scope: { kind: "workspace", id: IDS.workspace }, current_version: 1, trust_state: "trusted", source_refs: sourceRefs, provenance });
  const active = MemoryVersionSchema.parse({ id: NOTE_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, note_id: NOTE_ID, path: note.path, note_version: 1, content_hash: CONTENT_HASH, content_ref: `vault://.nexora/memory/${NOTE_ID}/v1.md`, source_refs: sourceRefs, trust_state: "trusted", provenance, status: "active", conflict_group_id: null, review_id: null });
  const candidate = MemoryVersionSchema.parse({ ...active, note_version: 2, content_hash: CANDIDATE_HASH, content_ref: `vault://.nexora/memory/${NOTE_ID}/v2.md`, trust_state: "conflict", status: "candidate", conflict_group_id: IDS.otherStep, review_id: IDS.event0 });
  database.prepare("INSERT INTO memory_notes(id, workspace_id, path, scope_kind, scope_id, current_version, trust_state, source_refs_json, provenance_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(note.id, note.workspace_id, note.path, note.scope.kind, note.scope.id, note.current_version, note.trust_state, JSON.stringify(note.source_refs), JSON.stringify(note.provenance), JSON.stringify(note), note.schema_version, note.created_at, note.updated_at);
  for (const version of [active, candidate]) {
    database.prepare("INSERT INTO memory_versions(id, workspace_id, note_id, path, note_version, content_hash, content_ref, source_refs_json, trust_state, provenance_json, status, conflict_group_id, review_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(version.id, version.workspace_id, version.note_id, version.path, version.note_version, version.content_hash, version.content_ref, JSON.stringify(version.source_refs), version.trust_state, JSON.stringify(version.provenance), version.status, version.conflict_group_id, version.review_id, JSON.stringify(version), version.schema_version, version.created_at, version.updated_at);
  }
}

function advanceMemoryNotePastCandidate(database: SqliteDatabase): void {
  const note = currentMemoryNote(database);
  const active = MemoryVersionSchema.parse({
    id: NOTE_ID,
    workspace_id: IDS.workspace,
    schema_version: 1,
    created_at: TIME,
    updated_at: TIME,
    note_id: NOTE_ID,
    path: note.path,
    note_version: 3,
    content_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    content_ref: `vault://.nexora/memory/${NOTE_ID}/v3.md`,
    source_refs: note.source_refs,
    trust_state: "trusted",
    provenance: note.provenance,
    status: "active",
    conflict_group_id: null,
    review_id: null,
  });
  const updated = MemoryNoteSchema.parse({ ...note, current_version: 3, updated_at: TIME });
  database.prepare("INSERT INTO memory_versions(id, workspace_id, note_id, path, note_version, content_hash, content_ref, source_refs_json, trust_state, provenance_json, status, conflict_group_id, review_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(active.id, active.workspace_id, active.note_id, active.path, active.note_version, active.content_hash, active.content_ref, JSON.stringify(active.source_refs), active.trust_state, JSON.stringify(active.provenance), active.status, active.conflict_group_id, active.review_id, JSON.stringify(active), active.schema_version, active.created_at, active.updated_at);
  database.prepare("UPDATE memory_notes SET current_version = ?, trust_state = ?, source_refs_json = ?, provenance_json = ?, payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ?").run(updated.current_version, updated.trust_state, JSON.stringify(updated.source_refs), JSON.stringify(updated.provenance), JSON.stringify(updated), updated.updated_at, IDS.workspace, NOTE_ID);
}

function currentMemoryNote(database: SqliteDatabase) {
  const row = database.prepare("SELECT payload_json FROM memory_notes WHERE workspace_id = ? AND id = ?").get(IDS.workspace, NOTE_ID);
  if (row === undefined) throw new Error("expected seeded memory note");
  const payload = row["payload_json"];
  if (typeof payload !== "string") throw new Error("expected memory note payload");
  return MemoryNoteSchema.parse(JSON.parse(payload));
}

function idempotencyRecord(database: SqliteDatabase, key: string): unknown {
  return database.prepare("SELECT idempotency_key FROM idempotency_records WHERE workspace_id = ? AND idempotency_key = ?").get(IDS.workspace, key);
}
