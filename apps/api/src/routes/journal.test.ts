import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GoalLoopRepository, type SqliteDatabase } from "@nexora/persistence";
import { createLocalBearerToken } from "../plugins/auth.js";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, seedRun, TIME, TOKEN_SECRET } from "./test-fixtures.js";

const VAULT_ID = "vault-obsidian-demo";
const ENTRY_ID = "01VRZ3NDEKTSV4RRFFQ69V5FAV";
const SOURCE_ID = "01WRZ3NDEKTSV4RRFFQ69W5FAV";
const GRAPH_ID = "01XRZ3NDEKTSV4RRFFQ69X5FAV";
const CANDIDATE_ID = "01YRZ3NDEKTSV4RRFFQ69Y5FAV";
const REQUEST_ID = "01ZRZ3NDEKTSV4RRFFQ69Z5FAV";
const DECISION_ID = "012RZ3NDEKTSV4RRFFQ69S5FAV";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const GRAPH_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DIFF_HASH = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const DEADLINE = "2026-09-02T05:00:00.000Z";

const AcceptedCommandSchema = z.object({ schema_version: z.literal(1), command_id: z.string(), status: z.literal("accepted"), object_type: z.string(), object_id: z.string(), status_url: z.string() }).passthrough();
const ErrorSchema = z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), required_action: z.string() }).passthrough();
describe("C22 Journal API", () => {
  it("Given journal facts When a run reader lists and opens a vault Then graph memory and writeback descriptors are visible", async () => {
    const fixture = createControlFixture([DECISION_ID]);
    try {
      await seedJournalGraph(fixture);
      const list = await fixture.api.inject({ method: "GET", url: `/v1/vaults?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/vaults/${VAULT_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });
      const crossWorkspace = await fixture.api.inject({ method: "GET", url: `/v1/vaults?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader(IDS.otherWorkspace) } });

      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject({ schema_version: 1, vaults: [expect.objectContaining({ id: VAULT_ID, access_mode: "read_only", descriptor_only: true })] });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        schema_version: 1,
        vault: expect.objectContaining({ id: VAULT_ID, sync_status: "indexed" }),
        entries: [expect.objectContaining({ id: ENTRY_ID, entry_date: "2026-09-02" })],
        sources: [expect.objectContaining({ id: SOURCE_ID, source_kind: "omi" })],
        graph_indexes: [expect.objectContaining({ id: GRAPH_ID, index_kind: "graph_fts" })],
        memory_candidates: [expect.objectContaining({ id: CANDIDATE_ID, status: "needs_review" })],
        writeback_requests: [expect.objectContaining({ id: REQUEST_ID, status: "pending_review" })],
        writeback_decisions: [],
      });
      expect(crossWorkspace.statusCode).toBe(403);
      expect(JSON.stringify(detail.json())).not.toContain("secret://");
      expect(JSON.stringify(detail.json())).not.toContain("/Users/zq");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given vault and journal descriptors When posted Then owner writes are idempotent and unsafe refs are rejected", async () => {
    const fixture = createControlFixture();
    try {
      const first = await fixture.api.inject({ method: "POST", url: "/v1/vaults", headers: commandHeaders("journal:vault:c22"), payload: vault() });
      const replay = await fixture.api.inject({ method: "POST", url: "/v1/vaults", headers: commandHeaders("journal:vault:c22"), payload: vault() });
      const conflict = await fixture.api.inject({ method: "POST", url: "/v1/vaults", headers: commandHeaders("journal:vault:c22"), payload: { ...vault(), name: "Different vault" } });
      const viewer = await fixture.api.inject({ method: "POST", url: "/v1/vaults", headers: { authorization: viewerHeader(), "idempotency-key": "journal:vault:viewer" }, payload: vault() });
      const unsafe = await fixture.api.inject({ method: "POST", url: "/v1/vaults", headers: commandHeaders("journal:vault:unsafe"), payload: { ...vault(), root_ref: "file:///Users/zq/Obsidian", name: "token=abcd1234" } });

      expect(first.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(replay.json())).toEqual(AcceptedCommandSchema.parse(first.json()));
      expect(conflict.statusCode).toBe(409);
      expect(viewer.statusCode).toBe(403);
      expect(unsafe.statusCode).toBe(400);
      expect(JSON.stringify(unsafe.json())).not.toContain("abcd1234");
      expect(JSON.stringify(unsafe.json())).not.toContain("/Users/zq");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given accepted journal commands When status URLs are fetched Then scoped live descriptors are returned", async () => {
    const fixture = createControlFixture();
    try {
      seedRun(fixture.database, "running");
      seedSession(fixture.database);
      seedGoalLoop(fixture.database);

      const vaultAccepted = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: "/v1/vaults", headers: commandHeaders("journal:status:vault"), payload: vault() })).json());
      const entryAccepted = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: "/v1/journal/entries", headers: commandHeaders("journal:status:entry"), payload: entry() })).json());
      const sourceAccepted = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: "/v1/journal/sources", headers: commandHeaders("journal:status:source"), payload: source() })).json());
      const graphAccepted = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: "/v1/journal/graph-indexes", headers: commandHeaders("journal:status:graph"), payload: graph() })).json());
      const candidateAccepted = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: "/v1/journal/memory-candidates", headers: commandHeaders("journal:status:candidate"), payload: candidate() })).json());
      const writebackAccepted = AcceptedCommandSchema.parse((await fixture.api.inject({ method: "POST", url: "/v1/journal/writebacks", headers: commandHeaders("journal:status:writeback"), payload: writebackRequest() })).json());

      const vaultStatus = await fetchStatus(fixture, vaultAccepted.status_url);
      const entryStatus = await fetchStatus(fixture, entryAccepted.status_url);
      const sourceStatus = await fetchStatus(fixture, sourceAccepted.status_url);
      const graphStatus = await fetchStatus(fixture, graphAccepted.status_url);
      const candidateStatus = await fetchStatus(fixture, candidateAccepted.status_url);
      const writebackStatus = await fetchStatus(fixture, writebackAccepted.status_url);
      const scopedMiss = await fixture.api.inject({ method: "GET", url: `/v1/journal/entries/${ENTRY_ID}?workspace_id=${IDS.otherWorkspace}`, headers: { authorization: ownerHeader(IDS.otherWorkspace) } });

      expect(vaultStatus.statusCode).toBe(200);
      expect(vaultStatus.json()).toMatchObject({ schema_version: 1, vault: expect.objectContaining({ id: VAULT_ID }) });
      expect(entryStatus.statusCode).toBe(200);
      expect(entryStatus.json()).toMatchObject({ schema_version: 1, entry: expect.objectContaining({ id: ENTRY_ID, vault_id: VAULT_ID }) });
      expect(sourceStatus.statusCode).toBe(200);
      expect(sourceStatus.json()).toMatchObject({ schema_version: 1, source: expect.objectContaining({ id: SOURCE_ID, journal_entry_id: ENTRY_ID }) });
      expect(graphStatus.statusCode).toBe(200);
      expect(graphStatus.json()).toMatchObject({ schema_version: 1, graph_index: expect.objectContaining({ id: GRAPH_ID, index_kind: "graph_fts" }) });
      expect(candidateStatus.statusCode).toBe(200);
      expect(candidateStatus.json()).toMatchObject({ schema_version: 1, memory_candidate: expect.objectContaining({ id: CANDIDATE_ID, status: "needs_review" }) });
      expect(writebackStatus.statusCode).toBe(200);
      expect(writebackStatus.json()).toMatchObject({ schema_version: 1, writeback_request: expect.objectContaining({ id: REQUEST_ID, status: "pending_review" }) });
      expect(scopedMiss.statusCode).toBe(404);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given CLI-shaped journal facts without client timestamps When posted twice Then server-owned timestamps do not break idempotency", async () => {
    const fixture = createControlFixture();
    try {
      seedRun(fixture.database, "running");
      seedSession(fixture.database);
      seedGoalLoop(fixture.database);
      await fixture.api.inject({ method: "POST", url: "/v1/vaults", headers: commandHeaders("journal:cli:vault"), payload: vault() });
      await fixture.api.inject({ method: "POST", url: "/v1/journal/entries", headers: commandHeaders("journal:cli:entry"), payload: entry() });

      const first = await fixture.api.inject({ method: "POST", url: "/v1/journal/sources", headers: commandHeaders("journal:cli:source"), payload: cliSource() });
      const replay = await fixture.api.inject({ method: "POST", url: "/v1/journal/sources", headers: commandHeaders("journal:cli:source"), payload: cliSource() });
      const conflict = await fixture.api.inject({ method: "POST", url: "/v1/journal/sources", headers: commandHeaders("journal:cli:source"), payload: { ...cliSource(), source_ref: "workspace://omi/transcripts/changed.md" } });

      expect(first.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(replay.json())).toEqual(AcceptedCommandSchema.parse(first.json()));
      expect(conflict.statusCode).toBe(409);
      expect((await fetchStatus(fixture, AcceptedCommandSchema.parse(first.json()).status_url)).json()).toMatchObject({
        source: expect.objectContaining({ id: SOURCE_ID, created_at: TIME, updated_at: TIME, captured_at: TIME }),
      });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given writeback target outside vault root or unsafe idempotency key When posted Then API rejects without durable leaks", async () => {
    const fixture = createControlFixture();
    try {
      await seedJournalCandidateGraph(fixture);
      await fixture.api.inject({ method: "POST", url: "/v1/vaults", headers: commandHeaders("journal:vault:other"), payload: otherVault() });

      const outsideRoot = await fixture.api.inject({
        method: "POST",
        url: "/v1/journal/writebacks",
        headers: commandHeaders("journal:writeback:outside-root"),
        payload: { ...writebackRequest(), id: DECISION_ID, target_ref: "workspace://vaults/other/Journal/2026-09-02.md" },
      });
      const unsafeKey = await fixture.api.inject({
        method: "POST",
        url: "/v1/journal/writebacks",
        headers: { authorization: ownerHeader(), "idempotency-key": "journal:writeback:token=abcd1234", traceparent: IDS.owner },
        payload: writebackRequest(),
      });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/vaults/${VAULT_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(outsideRoot.statusCode).toBe(409);
      expect(ErrorSchema.parse(outsideRoot.json())).toMatchObject({ code: "VERSION_CONFLICT", required_action: "inspect_constraint" });
      expect(unsafeKey.statusCode).toBe(400);
      expect(ErrorSchema.parse(unsafeKey.json())).toMatchObject({ code: "SCHEMA_INVALID", required_action: "correct_idempotency_key" });
      expect(JSON.stringify(unsafeKey.json())).not.toContain("abcd1234");
      expect(detail.json()).toMatchObject({ writeback_requests: [] });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given writeback clients include overwritten fields When replayed Then idempotency hashes only canonical command semantics", async () => {
    const fixture = createControlFixture();
    try {
      await seedJournalCandidateGraph(fixture);
      const noisyClientBody = { ...writebackRequest(), revision: 7, requested_by: "owner:client", requested_at: "2026-09-02T04:59:59.000Z", created_at: "2026-09-02T04:59:58.000Z", updated_at: "2026-09-02T04:59:58.000Z" };
      const canonicalClientBody = { ...writebackRequest(), created_at: undefined, updated_at: undefined, revision: undefined, requested_by: undefined, requested_at: undefined };

      const first = await fixture.api.inject({ method: "POST", url: "/v1/journal/writebacks", headers: commandHeaders("journal:writeback:canonical"), payload: noisyClientBody });
      const replay = await fixture.api.inject({ method: "POST", url: "/v1/journal/writebacks", headers: commandHeaders("journal:writeback:canonical"), payload: canonicalClientBody });
      const status = await fetchStatus(fixture, AcceptedCommandSchema.parse(first.json()).status_url);

      expect(first.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(replay.json())).toEqual(AcceptedCommandSchema.parse(first.json()));
      expect(status.json()).toMatchObject({
        writeback_request: expect.objectContaining({ revision: 1, requested_by: `owner:${IDS.owner}`, requested_at: TIME, created_at: TIME, updated_at: TIME }),
      });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given pending writeback When approve or reject is posted Then If-Match idempotency and descriptor-only decisions are enforced", async () => {
    const fixture = createControlFixture([DECISION_ID]);
    try {
      await seedJournalGraph(fixture);
      const escalatedCandidate = await fixture.api.inject({ method: "POST", url: "/v1/journal/memory-candidates", headers: commandHeaders("journal:candidate:escalated"), payload: { ...candidate(), id: DECISION_ID, status: "applied" } });
      const escalatedRequest = await fixture.api.inject({ method: "POST", url: "/v1/journal/writebacks", headers: commandHeaders("journal:writeback:escalated"), payload: { ...writebackRequest(), id: DECISION_ID, status: "approved" } });
      const missingMatch = await fixture.api.inject({ method: "POST", url: `/v1/journal/writebacks/${REQUEST_ID}/approve`, headers: { authorization: ownerHeader(), "idempotency-key": "journal:writeback:missing" }, payload: decisionBody("Approve reviewed diff") });
      const viewer = await fixture.api.inject({ method: "POST", url: `/v1/journal/writebacks/${REQUEST_ID}/approve`, headers: { authorization: viewerHeader(), "idempotency-key": "journal:writeback:viewer", "if-match": "1" }, payload: decisionBody("Approve reviewed diff") });
      const approve = await fixture.api.inject({ method: "POST", url: `/v1/journal/writebacks/${REQUEST_ID}/approve`, headers: commandHeaders("journal:writeback:approve", "1"), payload: decisionBody("Approve reviewed diff") });
      const replay = await fixture.api.inject({ method: "POST", url: `/v1/journal/writebacks/${REQUEST_ID}/approve`, headers: commandHeaders("journal:writeback:approve", "1"), payload: decisionBody("Approve reviewed diff") });
      const stale = await fixture.api.inject({ method: "POST", url: `/v1/journal/writebacks/${REQUEST_ID}/reject`, headers: commandHeaders("journal:writeback:stale", "1"), payload: decisionBody("Reject stale diff") });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/vaults/${VAULT_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(escalatedCandidate.statusCode).toBe(400);
      expect(escalatedRequest.statusCode).toBe(400);
      expect(missingMatch.statusCode).toBe(428);
      expect(viewer.statusCode).toBe(403);
      expect(approve.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(replay.json())).toEqual(AcceptedCommandSchema.parse(approve.json()));
      expect(stale.statusCode).toBe(409);
      expect(detail.json()).toMatchObject({
        writeback_requests: [expect.objectContaining({ id: REQUEST_ID, status: "approved", revision: 2 })],
        writeback_decisions: [expect.objectContaining({ request_id: REQUEST_ID, decision: "approve", descriptor_only: true })],
      });
      expect(JSON.stringify(detail.json())).not.toContain("external_write_executed");
    } finally {
      await closeControlFixture(fixture);
    }
  });
});

async function seedJournalGraph(fixture: ReturnType<typeof createControlFixture>): Promise<void> {
  await seedJournalCandidateGraph(fixture);
  await fixture.api.inject({ method: "POST", url: "/v1/journal/writebacks", headers: commandHeaders("journal:writeback:seed"), payload: writebackRequest() });
}

async function seedJournalCandidateGraph(fixture: ReturnType<typeof createControlFixture>): Promise<void> {
  seedRun(fixture.database, "running");
  seedSession(fixture.database);
  seedGoalLoop(fixture.database);
  await fixture.api.inject({ method: "POST", url: "/v1/vaults", headers: commandHeaders("journal:vault:seed"), payload: vault() });
  await fixture.api.inject({ method: "POST", url: "/v1/journal/entries", headers: commandHeaders("journal:entry:seed"), payload: entry() });
  await fixture.api.inject({ method: "POST", url: "/v1/journal/sources", headers: commandHeaders("journal:source:seed"), payload: source() });
  await fixture.api.inject({ method: "POST", url: "/v1/journal/graph-indexes", headers: commandHeaders("journal:graph:seed"), payload: graph() });
  await fixture.api.inject({ method: "POST", url: "/v1/journal/memory-candidates", headers: commandHeaders("journal:candidate:seed"), payload: candidate() });
}

function commandHeaders(idempotencyKey: string, ifMatch?: string): Record<string, string> {
  return ifMatch === undefined
    ? { authorization: ownerHeader(), "idempotency-key": idempotencyKey, traceparent: IDS.owner }
    : { authorization: ownerHeader(), "idempotency-key": idempotencyKey, "if-match": ifMatch, traceparent: IDS.owner };
}

function viewerHeader(): string {
  return createLocalBearerToken({ workspace_id: IDS.workspace, actor_id: IDS.owner, role: "Viewer", tokenSecret: TOKEN_SECRET });
}

async function fetchStatus(fixture: ReturnType<typeof createControlFixture>, statusUrl: string) {
  return fixture.api.inject({ method: "GET", url: statusUrl, headers: { authorization: viewerHeader() } });
}

function seedSession(database: SqliteDatabase): void {
  database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES ('gateway-c22-journal', ?, 'Gateway C22 Journal', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME, TIME);
  database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES ('channel-c22-journal', ?, 'gateway-c22-journal', 'Channel C22 Journal', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'gateway-c22-journal', 'channel-c22-journal', ?, ?, NULL, 'background', 'active', 'turn-1', NULL, ?, '{}', 1, ?, ?)").run(IDS.attempt, IDS.workspace, IDS.agent, IDS.run, TIME, TIME, TIME);
}

function seedGoalLoop(database: SqliteDatabase): void {
  new GoalLoopRepository(database).create({ id: IDS.event0, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, run_id: IDS.run, session_id: IDS.attempt, parent_loop_id: null, root_loop_id: IDS.event0, status: "running", objective: "Review journal memory candidates.", definition_of_done: ["Journal candidates are reviewed."], max_turns: 5, turn_count: 1, budget: { max_tokens: 10_000, max_cost_usd: 1 }, deadline_at: DEADLINE, continuation_cursor: "turn-1", judge: { done: false, reason: "Continue." }, descriptor_only: true });
}

function vault(): object {
  return { id: VAULT_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, name: "Obsidian Demo Vault", kind: "obsidian", root_ref: "workspace://vaults/demo", access_mode: "read_only", sync_status: "indexed", graph_enabled: true, fts_enabled: true, allowed_source_kinds: ["manual", "omi", "obsidian", "memory", "artifact"], last_indexed_at: TIME, descriptor_only: true };
}

function otherVault(): object {
  return { ...vault(), id: "vault-other-demo", name: "Other Demo Vault", root_ref: "workspace://vaults/other" };
}

function entry(): object {
  return { id: ENTRY_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, vault_id: VAULT_ID, entry_date: "2026-09-02", title: "Daily operating journal", summary: "Captured operator decisions and reviewed memory candidates.", source_ids: [SOURCE_ID], memory_candidate_ids: [CANDIDATE_ID], run_id: IDS.run, goal_loop_id: IDS.event0, tags: ["daily", "ops"], descriptor_only: true };
}

function source(): object {
  return { id: SOURCE_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, vault_id: VAULT_ID, journal_entry_id: ENTRY_ID, source_kind: "omi", source_ref: "workspace://omi/transcripts/2026-09-02-standup.md", source_hash: HASH, captured_at: TIME, descriptor_only: true };
}

function cliSource(): object {
  return { id: SOURCE_ID, workspace_id: IDS.workspace, schema_version: 1, vault_id: VAULT_ID, journal_entry_id: ENTRY_ID, source_kind: "omi", source_ref: "workspace://omi/transcripts/2026-09-02-standup.md", source_hash: HASH, descriptor_only: true };
}

function graph(): object {
  return { id: GRAPH_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, vault_id: VAULT_ID, index_kind: "graph_fts", indexed_at: TIME, source_hash: HASH, graph_hash: GRAPH_HASH, fts_hash: HASH, node_count: 42, edge_count: 64, document_count: 8, stale: false, descriptor_only: true };
}

function candidate(): object {
  return { id: CANDIDATE_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, vault_id: VAULT_ID, journal_entry_id: ENTRY_ID, source_ids: [SOURCE_ID], candidate_kind: "lesson", proposed_path: "memory://Journal/2026-09-02.md", summary: "Record that C22 writeback must remain approval-only.", content_hash: HASH, risk_level: "R1", status: "needs_review", descriptor_only: true };
}

function writebackRequest(): object {
  return { id: REQUEST_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, vault_id: VAULT_ID, candidate_id: CANDIDATE_ID, target_ref: "workspace://vaults/demo/Journal/2026-09-02.md", diff_hash: DIFF_HASH, reason: "Operator staged a local memory candidate for later vault merge.", status: "pending_review", requested_by: "owner:linda", requested_at: TIME, expected_target_revision: 3, descriptor_only: true };
}

function decisionBody(reason: string): object {
  return { schema_version: 1, workspace_id: IDS.workspace, reason, descriptor_only: true };
}
