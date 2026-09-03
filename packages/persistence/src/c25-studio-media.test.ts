import { describe, expect, it } from "vitest";
import {
  AvatarProfileRepository,
  CORE_MIGRATION_VERSION,
  CORE_TABLES,
  MediaArtifactRepository,
  NotebookGenerationRepository,
  NotebookRepository,
  NotebookSourceRepository,
  RenderJobRepository,
  StudioShareRepository,
  migrate,
  openDatabase,
  type SqliteDatabase,
} from "@nexora/persistence";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  otherWorkspace: "01ZRZ3NDEKTSV4RRFFQ69Z5FAV",
  goal: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
  ticket: "01KRZ3NDEKTSV4RRFFQ69K5FAV",
  run: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  otherRun: "01LRZ3NDEKTSV4RRFFQ69L5FAV",
  media: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  renderJob: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  notebook: "notebook-c25-market-brief",
  source: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  generation: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  avatar: "avatar-c25-founder-demo",
  share: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  command: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
};

const TIME = "2026-09-04T04:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("C25 Studio/Media/NotebookLM/Avatar persistence", () => {
  it("Given migrations run When schema is validated Then C25 tables and migration version 16 exist", () => {
    const database = openDatabase(":memory:");
    try {
      migrate(database, { now: () => TIME });
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row["name"]);
      const triggers = database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all().map((row) => row["name"]);

      expect(CORE_MIGRATION_VERSION).toBe(16);
      expect(CORE_TABLES).toEqual(expect.arrayContaining(["media_artifacts", "media_render_jobs", "notebooks", "notebook_sources", "notebook_generations", "avatar_profiles", "studio_shares", "studio_commands"]));
      expect(tables).toEqual(expect.arrayContaining(["media_artifacts", "media_render_jobs", "notebooks", "notebook_sources", "notebook_generations", "avatar_profiles", "studio_shares", "studio_commands"]));
      expect(triggers).toEqual(expect.arrayContaining(["c25_media_artifacts_payload_json_insert", "c25_render_jobs_no_delete", "c25_notebook_generations_source_scope_insert", "c25_avatar_profiles_no_update", "c25_studio_commands_no_update"]));
      expect(triggers).toEqual(expect.arrayContaining(["c25_media_artifacts_ref_text_safe_insert", "c25_render_jobs_payload_json_insert", "c25_notebook_sources_payload_json_insert", "c25_studio_commands_target_scope_insert"]));
    } finally {
      database.close();
    }
  });

  it("Given C25 descriptors When repositories write them Then scope payload parity and append-only facts hold", () => {
    withDatabase((database) => {
      const media = new MediaArtifactRepository(database).create(mediaArtifact());
      const render = new RenderJobRepository(database).create(renderJob());
      const notebook = new NotebookRepository(database).create(notebookDescriptor());
      const source = new NotebookSourceRepository(database).create(notebookSource());
      const generation = new NotebookGenerationRepository(database).create(notebookGeneration());
      const avatar = new AvatarProfileRepository(database).create(avatarProfile());
      const share = new StudioShareRepository(database).create(shareDescriptor());

      expect(media.kind).toBe("created");
      expect(render.render_job.status).toBe("queued");
      expect(notebook.notebook.id).toBe(IDS.notebook);
      expect(source.source.source_hash).toBe(HASH);
      expect(generation.generation.source_ids).toEqual([IDS.source]);
      expect(avatar.avatar.run_id).toBe(IDS.run);
      expect(avatar.avatar.voice_clone_mode).toBe("disabled");
      expect(share.share.status).toBe("pending_review");
      expect(() => database.prepare("UPDATE media_render_jobs SET status = 'succeeded' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.renderJob)).toThrow(/append|command|immutable|abort|constraint/i);
      expect(() => database.prepare("UPDATE notebook_generations SET status = 'approved' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.generation)).toThrow(/append|immutable|update|abort|constraint/i);
      expect(() => database.prepare("DELETE FROM studio_shares WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.share)).toThrow(/append|immutable|delete|abort|constraint/i);
    });
  });

  it("Given raw SQL bypass attempts When refs or scope drift Then migration triggers reject secrets paths URLs and foreign sources", () => {
    withDatabase((database) => {
      expect(() => insertRawMediaArtifact(database, { ...mediaArtifact(), preview_ref: "https://temporary.example/preview.mp4" })).toThrow(/ref|secret|path|abort|constraint/i);
      new NotebookRepository(database).create(notebookDescriptor());
      expect(() => insertRawNotebookSource(database, { ...notebookSource(), source_ref: "secret://notebooklm/live-token" })).toThrow(/ref|secret|path|abort|constraint/i);
      expect(() => insertRawAvatarProfile(database, { ...avatarProfile(), consent_artifact_ref: "file:///Users/zq/avatar.mov" })).toThrow(/ref|secret|path|abort|constraint/i);
    });
  });

  it("Given raw SQL C25 refs When encoded nested path or invisible variants are inserted Then every ref surface rejects them", () => {
    withDatabase((database) => {
      new MediaArtifactRepository(database).create(mediaArtifact());
      new RenderJobRepository(database).create(renderJob());
      new NotebookRepository(database).create(notebookDescriptor());
      new NotebookSourceRepository(database).create(notebookSource());

      expect(() => insertRawMediaArtifact(database, { ...mediaArtifact(), id: "01MZZ3NDEKTSV4RRFFQ69M5FAV", source_refs: ["artifact://research/c25/t%6fken=abcd1234.json"] })).toThrow(/ref|secret|path|normalized|abort|constraint/i);
      expect(() => insertRawMediaArtifact(database, { ...mediaArtifact(), id: "01NZZ3NDEKTSV4RRFFQ69N5FAV", prompt_ref: "artifact://prompts/c25/../secret.md" })).toThrow(/ref|secret|path|normalized|abort|constraint/i);
      expect(() => insertRawRenderJob(database, { ...renderJob(), id: "01PZZ3NDEKTSV4RRFFQ69P5FAV", output_artifact_ref: "artifact://media/c25/t%256fken=abcd1234.mp4" })).toThrow(/ref|secret|path|normalized|abort|constraint/i);
      expect(() => insertRawNotebookSource(database, { ...notebookSource(), id: "01QZZ3NDEKTSV4RRFFQ69Q5FAV", source_ref: "artifact://research\\c25\\raw.json" })).toThrow(/ref|secret|path|normalized|abort|constraint/i);
      expect(() => insertRawNotebookGeneration(database, { ...notebookGeneration(), id: "01RZZ3NDEKTSV4RRFFQ69R5FAV", output_ref: "artifact:///notebooks/c25/generated.md" })).toThrow(/ref|secret|path|normalized|abort|constraint/i);
      expect(() => insertRawNotebookGeneration(database, { ...notebookGeneration(), id: "01SZZ3NDEKTSV4RRFFQ69S5FAV", citation_refs: ["artifact://notebooks/c25/./source.json"] })).toThrow(/ref|secret|path|normalized|abort|constraint/i);
      expect(() => insertRawStudioShare(database, { ...shareDescriptor(), id: "01TZZ3NDEKTSV4RRFFQ69T5FAV", preview_ref: "artifact://safe/secret://token" })).toThrow(/ref|secret|path|normalized|abort|constraint/i);
      expect(() => insertRawAvatarProfile(database, { ...avatarProfile(), id: "avatar-c25-invisible", consent_artifact_ref: "artifact://avatars/c25/consent\u200b.json" })).toThrow(/ref|secret|path|normalized|abort|constraint/i);
    });
  });

  it("Given raw SQL text payloads When secret or path markers are obfuscated Then all C25 text surfaces reject them", () => {
    withDatabase((database) => {
      new MediaArtifactRepository(database).create(mediaArtifact());
      new NotebookRepository(database).create(notebookDescriptor());

      expect(() => insertRawMediaArtifact(database, { ...mediaArtifact(), id: "01VZZ3NDEKTSV4RRFFQ69V5FAV", title: "client%5fsecret=abcd1234" })).toThrow(/secret|safe|normalized|abort|constraint/i);
      expect(() => insertRawNotebook(database, { ...notebookDescriptor(), id: "notebook-c25-secret", title: "Notebook api\u200b_key=abcd1234" })).toThrow(/secret|safe|normalized|abort|constraint/i);
      expect(() => insertRawRenderJob(database, { ...renderJob(), id: "01WZZ3NDEKTSV4RRFFQ69W5FAV", note: "secret%3a//studio/live-token" })).toThrow(/secret|safe|normalized|abort|constraint/i);
      expect(() => insertRawNotebookGeneration(database, { ...notebookGeneration(), id: "01XZZ3NDEKTSV4RRFFQ69X5FAV", note: "token=abcd1234" })).toThrow(/secret|safe|normalized|abort|constraint/i);
      expect(() => insertRawAvatarProfile(database, { ...avatarProfile(), id: "avatar-c25-path", display_name: "/Users/zq/private-avatar.mov" })).toThrow(/secret|path|safe|normalized|abort|constraint/i);
      expect(() => insertRawStudioShare(database, { ...shareDescriptor(), id: "01YZZ3NDEKTSV4RRFFQ69Y5FAV", note: "https://cdn.example.com/live-preview.mp4" })).toThrow(/secret|path|safe|normalized|abort|constraint/i);
      expect(() => insertRawStudioCommand(database, { ...studioCommand(), command_id: "01ZZZ3NDEKTSV4RRFFQ69Z5FAV", idempotency_key: "studio:t%6fken=abcd1234" })).toThrow(/secret|safe|normalized|abort|constraint/i);
      expect(() => insertRawStudioCommand(database, { ...studioCommand(), command_id: "020ZZ3NDEKTSV4RRFFQ69Z5FAV", reason: "authorization=Bearer abc" })).toThrow(/secret|safe|normalized|abort|constraint/i);
    });
  });

  it("Given raw SQL inserts When workspace run parent or payload parity drifts Then database rejects them", () => {
    withDatabase((database) => {
      new MediaArtifactRepository(database).create(mediaArtifact());
      new NotebookRepository(database).create(notebookDescriptor());
      new NotebookSourceRepository(database).create(notebookSource());
      new AvatarProfileRepository(database).create(avatarProfile());

      expect(() => insertRawMediaArtifact(database, { ...mediaArtifact(), id: "021ZZ3NDEKTSV4RRFFQ69Z5FAV", workspace_id: IDS.otherWorkspace })).toThrow(/foreign|scope|run|constraint|abort/i);
      expect(() => insertRawRenderJob(database, { ...renderJob(), id: "022ZZ3NDEKTSV4RRFFQ69Z5FAV", run_id: IDS.otherRun })).toThrow(/scope|run|media|foreign|constraint|abort/i);
      expect(() => insertRawNotebookSource(database, { ...notebookSource(), id: "023ZZ3NDEKTSV4RRFFQ69Z5FAV", run_id: IDS.otherRun })).toThrow(/scope|run|notebook|foreign|constraint|abort/i);
      expect(() => insertRawStudioShare(database, { ...shareDescriptor(), id: "024ZZ3NDEKTSV4RRFFQ69Z5FAV", run_id: IDS.otherRun })).toThrow(/scope|run|media|foreign|constraint|abort/i);
      expect(() => insertRawStudioCommand(database, { ...studioCommand(), command_id: "025ZZ3NDEKTSV4RRFFQ69Z5FAV", run_id: IDS.otherRun })).toThrow(/scope|run|target|foreign|constraint|abort/i);
      expect(() => insertRawStudioCommand(database, { ...studioCommand(), command_id: "026ZZ3NDEKTSV4RRFFQ69Z5FAV", target_id: IDS.avatar, target_type: "avatar_profile", kind: "share" })).toThrow(/target|kind|scope|constraint|abort/i);
      expect(() => insertRawStudioCommand(database, { ...studioCommand(), command_id: "02CZZ3NDEKTSV4RRFFQ69Z5FAV", kind: "revoke_avatar", target_id: IDS.avatar, target_type: "avatar_profile", run_id: IDS.otherRun })).toThrow(/scope|run|target|foreign|constraint|abort/i);

      expect(() => insertRawRenderJob(database, { ...renderJob(), id: "027ZZ3NDEKTSV4RRFFQ69Z5FAV", payload_status: "succeeded" })).toThrow(/payload|parity|constraint|abort/i);
      expect(() => insertRawNotebookSource(database, { ...notebookSource(), id: "028ZZ3NDEKTSV4RRFFQ69Z5FAV", payload_source_ref: "artifact://research/c25/other.json" })).toThrow(/payload|parity|constraint|abort/i);
      expect(() => insertRawNotebookGeneration(database, { ...notebookGeneration(), id: "029ZZ3NDEKTSV4RRFFQ69Z5FAV", payload_citation_refs: ["artifact://notebooks/c25/other.json#p1"] })).toThrow(/payload|parity|constraint|abort/i);
      expect(() => insertRawStudioShare(database, { ...shareDescriptor(), id: "02AZZ3NDEKTSV4RRFFQ69Z5FAV", payload_status: "approved" })).toThrow(/payload|parity|constraint|abort/i);
      expect(() => insertRawStudioCommand(database, { ...studioCommand(), command_id: "02BZZ3NDEKTSV4RRFFQ69Z5FAV", payload_reason: "Different command reason." })).toThrow(/payload|parity|constraint|abort/i);
    });
  });
});

function withDatabase(callback: (database: SqliteDatabase) => void): void {
  const database = openDatabase(":memory:");
  try {
    migrate(database, { now: () => TIME });
    seedWorkspaceRun(database);
    callback(database);
  } finally {
    database.close();
  }
}

function seedWorkspaceRun(database: SqliteDatabase): void {
  const goal = { id: IDS.goal, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, title: "C25 goal", objective: "Validate Studio/Media control-plane", definition_of_done: ["done"] };
  const ticket = { id: IDS.ticket, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, status: "ready", definition_of_done: ["done"], assigned_agents: [], approval_policy: { mode: "required" }, idempotency_key: "ticket:c25" };
  const run = { id: IDS.run, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, ticket_id: IDS.ticket, execution_location: "local", status: "running", budget: { max_tokens: 10_000, max_cost_usd: 10 }, memory_snapshot: { snapshot_id: IDS.workspace, version: 1 }, connector_versions: { deterministic: "1.0.0" } };
  const otherRun = { ...run, id: IDS.otherRun };
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'C25 workspace', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'C25 other workspace', 1, ?, ?)").run(IDS.otherWorkspace, TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.goal, IDS.workspace, goal.title, goal.objective, JSON.stringify(goal.definition_of_done), JSON.stringify(goal), TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'ready', ?, ?, 1, ?, ?)").run(IDS.ticket, IDS.workspace, IDS.goal, ticket.idempotency_key, JSON.stringify(ticket), TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.ticket, JSON.stringify(run), TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.otherRun, IDS.workspace, IDS.ticket, JSON.stringify(otherRun), TIME, TIME);
}

function mediaArtifact(): object {
  return { id: IDS.media, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, run_id: IDS.run, title: "C25 source-backed video preview", media_type: "video", source_refs: ["artifact://research/c25/source-pack.json"], prompt_ref: "artifact://prompts/c25/video-script.md", model_ref: null, provider_ref: null, codec: "mp4:h264", duration_ms: 90_000, caption_ref: "artifact://media/c25/captions.vtt", thumbnail_ref: "artifact://media/c25/thumbnail.png", preview_ref: "artifact://media/c25/preview.mp4", render_version: 1, moderation_status: "needs_review", share_policy: "review_required", temporary_url_expires_at: null, descriptor_only: true };
}

function renderJob(): object {
  return { id: IDS.renderJob, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, media_artifact_id: IDS.media, run_id: IDS.run, worker_descriptor_id: "render-worker-c25-local-descriptor", status: "queued", input_hash: HASH, output_artifact_ref: null, retry_of_job_id: null, side_effect_policy: "none", descriptor_only: true };
}

function notebookDescriptor(): object {
  return { id: IDS.notebook, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, run_id: IDS.run, title: "C25 NotebookLM descriptor", source_policy: "snapshot_only", generation_policy: "local_descriptor_only", share_policy: "review_required", descriptor_only: true };
}

function notebookSource(): object {
  return { id: IDS.source, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, notebook_id: IDS.notebook, run_id: IDS.run, source_kind: "artifact_snapshot", source_ref: "artifact://research/c25/source-pack.json", source_hash: HASH, snapshot_ref: "artifact://notebooks/c25/source-pack.snapshot.json", title: "Market source pack", descriptor_only: true };
}

function notebookGeneration(): object {
  return { id: IDS.generation, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, notebook_id: IDS.notebook, run_id: IDS.run, source_ids: [IDS.source], generation_kind: "brief", prompt_ref: "artifact://prompts/c25/notebook-brief.md", output_ref: "artifact://notebooks/c25/generated-brief.md", citation_refs: ["artifact://notebooks/c25/source-pack.snapshot.json#p1"], status: "draft", descriptor_only: true };
}

function avatarProfile(): object {
  return { id: IDS.avatar, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, run_id: IDS.run, display_name: "Founder avatar descriptor", consent_status: "approved", consent_artifact_ref: "artifact://avatars/c25/consent.json", face_source_hash: HASH, voice_source_hash: HASH, voice_clone_mode: "disabled", render_mode: "descriptor_only", expires_at: "2026-10-04T04:00:00.000Z", revoked_at: null, descriptor_only: true };
}

function shareDescriptor(): object {
  return { id: IDS.share, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, media_artifact_id: IDS.media, run_id: IDS.run, status: "pending_review", preview_ref: "artifact://media/c25/preview.mp4", expires_at: "2026-09-04T05:00:00.000Z", descriptor_only: true };
}

function studioCommand(): object {
  return { schema_version: 1, command_id: IDS.command, workspace_id: IDS.workspace, run_id: IDS.run, kind: "share", target_id: IDS.media, target_type: "media_artifact", idempotency_key: "studio:share:raw-c25", expected_revision: 1, reason: "Operator requested descriptor-only share.", descriptor_only: true, created_at: TIME };
}

function insertRawMediaArtifact(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO media_artifacts(id, workspace_id, run_id, media_type, title, preview_ref, source_refs_json, prompt_ref, model_ref, provider_ref, codec, duration_ms, caption_ref, thumbnail_ref, render_version, moderation_status, share_policy, temporary_url_expires_at, descriptor_only, payload_json, version, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, ?, ?)").run(textProperty(payload, "id", IDS.media), textProperty(payload, "workspace_id", IDS.workspace), textProperty(payload, "run_id", IDS.run), textProperty(payload, "media_type", "video"), textProperty(payload, "title", "Raw media artifact"), nullableTextProperty(payload, "preview_ref"), JSON.stringify(arrayProperty(payload, "source_refs", ["artifact://research/c25/source-pack.json"])), textProperty(payload, "prompt_ref", "artifact://prompts/c25/video-script.md"), nullableTextProperty(payload, "model_ref"), textProperty(payload, "codec", "mp4:h264"), numberProperty(payload, "duration_ms", 90_000), nullableTextProperty(payload, "caption_ref"), nullableTextProperty(payload, "thumbnail_ref"), numberProperty(payload, "render_version", 1), textProperty(payload, "moderation_status", "needs_review"), textProperty(payload, "share_policy", "review_required"), nullableTextProperty(payload, "temporary_url_expires_at"), JSON.stringify(payloadForJson(payload)), numberProperty(payload, "revision", 1), TIME, TIME);
}

function insertRawRenderJob(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO media_render_jobs(id, workspace_id, media_artifact_id, run_id, worker_descriptor_id, status, input_hash, output_artifact_ref, retry_of_job_id, side_effect_policy, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', 1, ?, 1, ?, ?)").run(textProperty(payload, "id", IDS.renderJob), textProperty(payload, "workspace_id", IDS.workspace), textProperty(payload, "media_artifact_id", IDS.media), textProperty(payload, "run_id", IDS.run), textProperty(payload, "worker_descriptor_id", "render-worker-c25-local-descriptor"), textProperty(payload, "status", "queued"), textProperty(payload, "input_hash", HASH), nullableTextProperty(payload, "output_artifact_ref"), nullableTextProperty(payload, "retry_of_job_id"), JSON.stringify(payloadForJson(payload)), TIME, TIME);
}

function insertRawNotebook(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO notebooks(id, workspace_id, run_id, title, source_policy, generation_policy, share_policy, descriptor_only, payload_json, version, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'snapshot_only', 'local_descriptor_only', 'review_required', 1, ?, ?, 1, ?, ?)").run(textProperty(payload, "id", IDS.notebook), textProperty(payload, "workspace_id", IDS.workspace), textProperty(payload, "run_id", IDS.run), textProperty(payload, "title", "Raw notebook"), JSON.stringify(payloadForJson(payload)), numberProperty(payload, "revision", 1), TIME, TIME);
}

function insertRawNotebookSource(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO notebook_sources(id, workspace_id, notebook_id, run_id, source_kind, source_ref, source_hash, snapshot_ref, title, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'artifact_snapshot', ?, ?, ?, ?, 1, ?, 1, ?, ?)").run(textProperty(payload, "id", IDS.source), textProperty(payload, "workspace_id", IDS.workspace), textProperty(payload, "notebook_id", IDS.notebook), textProperty(payload, "run_id", IDS.run), textProperty(payload, "source_ref", "artifact://research/c25/source-pack.json"), textProperty(payload, "source_hash", HASH), textProperty(payload, "snapshot_ref", "artifact://notebooks/c25/source-pack.snapshot.json"), textProperty(payload, "title", "Raw source"), JSON.stringify(payloadForJson(payload)), TIME, TIME);
}

function insertRawNotebookGeneration(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO notebook_generations(id, workspace_id, notebook_id, run_id, source_ids_json, generation_kind, prompt_ref, output_ref, citation_refs_json, status, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'brief', ?, ?, ?, ?, 1, ?, 1, ?, ?)").run(textProperty(payload, "id", IDS.generation), textProperty(payload, "workspace_id", IDS.workspace), textProperty(payload, "notebook_id", IDS.notebook), textProperty(payload, "run_id", IDS.run), JSON.stringify(arrayProperty(payload, "source_ids", [IDS.source])), textProperty(payload, "prompt_ref", "artifact://prompts/c25/notebook-brief.md"), textProperty(payload, "output_ref", "artifact://notebooks/c25/generated-brief.md"), JSON.stringify(arrayProperty(payload, "citation_refs", ["artifact://notebooks/c25/source-pack.snapshot.json#p1"])), textProperty(payload, "status", "draft"), JSON.stringify(payloadForJson(payload)), TIME, TIME);
}

function insertRawAvatarProfile(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO avatar_profiles(id, workspace_id, run_id, display_name, consent_status, consent_artifact_ref, face_source_hash, voice_source_hash, voice_clone_mode, render_mode, expires_at, revoked_at, descriptor_only, payload_json, version, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'disabled', 'descriptor_only', ?, NULL, 1, ?, ?, 1, ?, ?)").run(textProperty(payload, "id", IDS.avatar), textProperty(payload, "workspace_id", IDS.workspace), textProperty(payload, "run_id", IDS.run), textProperty(payload, "display_name", "Raw avatar"), textProperty(payload, "consent_status", "approved"), textProperty(payload, "consent_artifact_ref", "artifact://avatars/c25/consent.json"), textProperty(payload, "face_source_hash", HASH), textProperty(payload, "voice_source_hash", HASH), textProperty(payload, "expires_at", "2026-10-04T04:00:00.000Z"), JSON.stringify(payloadForJson(payload)), numberProperty(payload, "revision", 1), TIME, TIME);
}

function insertRawStudioShare(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO studio_shares(id, workspace_id, media_artifact_id, run_id, status, preview_ref, expires_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)").run(textProperty(payload, "id", IDS.share), textProperty(payload, "workspace_id", IDS.workspace), textProperty(payload, "media_artifact_id", IDS.media), textProperty(payload, "run_id", IDS.run), textProperty(payload, "status", "pending_review"), textProperty(payload, "preview_ref", "artifact://media/c25/preview.mp4"), textProperty(payload, "expires_at", "2026-09-04T05:00:00.000Z"), JSON.stringify(payloadForJson(payload)), TIME, TIME);
}

function insertRawStudioCommand(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO studio_commands(command_id, workspace_id, run_id, kind, target_id, target_type, idempotency_key, expected_revision, reason, descriptor_only, payload_json, schema_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, 1, ?)").run(textProperty(payload, "command_id", IDS.command), textProperty(payload, "workspace_id", IDS.workspace), textProperty(payload, "run_id", IDS.run), textProperty(payload, "kind", "share"), textProperty(payload, "target_id", IDS.media), textProperty(payload, "target_type", "media_artifact"), textProperty(payload, "idempotency_key", "studio:share:raw-c25"), textProperty(payload, "reason", "Operator requested descriptor-only share."), JSON.stringify(payloadForJson(payload)), TIME);
}

function payloadForJson(payload: object): object {
  const overrides = {
    status: textProperty(payload, "payload_status", textProperty(payload, "status", "")),
    source_ref: textProperty(payload, "payload_source_ref", textProperty(payload, "source_ref", "")),
    citation_refs: arrayProperty(payload, "payload_citation_refs", arrayProperty(payload, "citation_refs", [])),
    reason: textProperty(payload, "payload_reason", textProperty(payload, "reason", "")),
  };
  return Object.fromEntries(Object.entries({ ...payload, ...overrides }).filter(([key, value]) => value !== "" && !key.startsWith("payload_")));
}

function textProperty(payload: object, key: string, fallback: string): string {
  const value = Reflect.get(payload, key);
  return typeof value === "string" ? value : fallback;
}

function nullableTextProperty(payload: object, key: string): string | null {
  const value = Reflect.get(payload, key);
  return typeof value === "string" ? value : null;
}

function numberProperty(payload: object, key: string, fallback: number): number {
  const value = Reflect.get(payload, key);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function arrayProperty(payload: object, key: string, fallback: readonly string[]): readonly string[] {
  const value = Reflect.get(payload, key);
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : fallback;
}
