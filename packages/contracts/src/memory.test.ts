import { describe, expect, it } from "vitest";
import { ArtifactVersionSchema, MemoryNoteSchema, MemorySnapshotSchema, MemoryVersionSchema } from "./index.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-08-26T04:00:00.000Z";
const meta = { id: ID, workspace_id: ID, schema_version: 1 as const, created_at: TIME, updated_at: TIME };
const source = { kind: "receipt" as const, ref: "receipt://source", verified: true };
const provenance = { created_by: { type: "agent" as const, id: ID }, run_id: ID, artifact_refs: ["artifact://draft"], receipt_refs: ["receipt://source"] };
const hash = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("C07 memory and artifact contracts", () => {
  it("Given memory and artifact provenance payloads When parsed Then strict versioned contracts preserve lineage", () => {
    expect(MemoryNoteSchema.parse({ ...meta, path: "About/business.md", scope: { kind: "workspace", id: ID }, current_version: 1, trust_state: "trusted", source_refs: [source], provenance })).toMatchObject({ path: "About/business.md" });
    expect(MemoryVersionSchema.parse({ ...meta, note_id: ID, path: "About/business.md", note_version: 1, content_hash: hash, content_ref: "vault://About/business.md", source_refs: [source], trust_state: "trusted", provenance, status: "active", conflict_group_id: null, review_id: null })).toMatchObject({ note_version: 1 });
    expect(MemorySnapshotSchema.parse({ ...meta, snapshot_version: 1, notes: [{ note_id: ID, path: "About/business.md", version: 1, content_hash: hash }] })).toMatchObject({ snapshot_version: 1 });
    expect(ArtifactVersionSchema.parse({ ...meta, artifact_id: ID, artifact_version: 1, content_type: "markdown", content_hash: hash, content_ref: "artifact://draft", byte_size: 12, source_ticket: ID, source_run: ID, source_agent: ID, model: "deterministic", receipt_refs: [ID], judge_ref: null, review_ref: null, parent_artifact_refs: [], metadata: { title: "Draft" }, preview: { kind: "markdown", preview: "Draft", truncated: false, redactions: [] } })).toMatchObject({ source_run: ID });
  });
});
