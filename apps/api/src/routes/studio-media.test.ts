import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { SqliteDatabase } from "@nexora/persistence";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, seedRun } from "./test-fixtures.js";
import { createLocalBearerToken } from "../plugins/auth.js";
import { TOKEN_SECRET } from "./test-fixtures.js";

const MEDIA_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const NOTEBOOK_ID = "notebook-c25-market-brief";
const AVATAR_ID = "avatar-c25-founder-demo";
const OTHER_RUN_ID = "01JRZ3NDEKTSV4RRFFQ69J5FAV";
const RENDER_JOB_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const NOTEBOOK_SOURCE_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const NOTEBOOK_GENERATION_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const SHARE_ID = "01GRZ3NDEKTSV4RRFFQ69G5FAV";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const AcceptedCommandSchema = z.object({ schema_version: z.literal(1), command_id: z.string(), status: z.literal("accepted"), object_type: z.string(), object_id: z.string(), status_url: z.string() }).passthrough();
const ErrorSchema = z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), required_action: z.string() }).passthrough();

describe("C25 Studio/Media API", () => {
  it("Given media notebook and avatar descriptors When owner posts them Then descriptor-only facts are accepted and readers can inspect them", async () => {
    const fixture = createControlFixture();
    try {
      seedRun(fixture.database, "running");
      const media = await fixture.api.inject({ method: "POST", url: "/v1/studio/media-artifacts", headers: commandHeaders("studio:media:c25"), payload: mediaPayload() });
      const renderJob = await fixture.api.inject({ method: "POST", url: "/v1/studio/render-jobs", headers: commandHeaders("studio:render-job:c25"), payload: renderJobPayload() });
      const notebook = await fixture.api.inject({ method: "POST", url: "/v1/studio/notebooks", headers: commandHeaders("studio:notebook:c25"), payload: notebookPayload() });
      const source = await fixture.api.inject({ method: "POST", url: "/v1/studio/notebook-sources", headers: commandHeaders("studio:notebook-source:c25"), payload: notebookSourcePayload() });
      const generation = await fixture.api.inject({ method: "POST", url: "/v1/studio/notebook-generations", headers: commandHeaders("studio:notebook-generation:c25"), payload: notebookGenerationPayload() });
      const avatar = await fixture.api.inject({ method: "POST", url: "/v1/studio/avatar-profiles", headers: commandHeaders("studio:avatar:c25"), payload: avatarPayload() });
      const share = await fixture.api.inject({ method: "POST", url: "/v1/studio/shares", headers: commandHeaders("studio:share-fact:c25"), payload: sharePayload() });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/studio?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });
      const renderDetail = await fixture.api.inject({ method: "GET", url: `/v1/studio/render-jobs/${RENDER_JOB_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });
      const sourceDetail = await fixture.api.inject({ method: "GET", url: `/v1/studio/notebook-sources/${NOTEBOOK_SOURCE_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });
      const generationDetail = await fixture.api.inject({ method: "GET", url: `/v1/studio/notebook-generations/${NOTEBOOK_GENERATION_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });
      const shareDetail = await fixture.api.inject({ method: "GET", url: `/v1/studio/shares/${SHARE_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });

      expect(media.statusCode).toBe(202);
      expect(renderJob.statusCode).toBe(202);
      expect(notebook.statusCode).toBe(202);
      expect(source.statusCode).toBe(202);
      expect(generation.statusCode).toBe(202);
      expect(avatar.statusCode).toBe(202);
      expect(share.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(media.json())).toMatchObject({ object_type: "media_artifact", object_id: MEDIA_ID });
      expect(AcceptedCommandSchema.parse(renderJob.json())).toMatchObject({ object_type: "render_job", object_id: RENDER_JOB_ID, status_url: `/v1/studio/render-jobs/${RENDER_JOB_ID}?workspace_id=${IDS.workspace}` });
      expect(detail.statusCode).toBe(200);
      expect(renderDetail.statusCode).toBe(200);
      expect(sourceDetail.statusCode).toBe(200);
      expect(generationDetail.statusCode).toBe(200);
      expect(shareDetail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        schema_version: 1,
        media_artifacts: [expect.objectContaining({ id: MEDIA_ID, descriptor_only: true })],
        render_jobs: [expect.objectContaining({ id: RENDER_JOB_ID, side_effect_policy: "none" })],
        notebooks: [expect.objectContaining({ id: NOTEBOOK_ID })],
        notebook_sources: [expect.objectContaining({ id: NOTEBOOK_SOURCE_ID, source_hash: HASH })],
        notebook_generations: [expect.objectContaining({ id: NOTEBOOK_GENERATION_ID, source_ids: [NOTEBOOK_SOURCE_ID] })],
        avatar_profiles: [expect.objectContaining({ id: AVATAR_ID, run_id: IDS.run, voice_clone_mode: "disabled" })],
        shares: [expect.objectContaining({ id: SHARE_ID, status: "pending_review" })],
      });
      expect(renderDetail.json()).toMatchObject({ render_job: expect.objectContaining({ id: RENDER_JOB_ID }) });
      expect(sourceDetail.json()).toMatchObject({ notebook_source: expect.objectContaining({ id: NOTEBOOK_SOURCE_ID }) });
      expect(generationDetail.json()).toMatchObject({ notebook_generation: expect.objectContaining({ id: NOTEBOOK_GENERATION_ID }) });
      expect(shareDetail.json()).toMatchObject({ share: expect.objectContaining({ id: SHARE_ID }) });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given preview share rerender and notebook generation commands When posted Then Idempotency-Key and If-Match semantics are enforced", async () => {
    const fixture = createControlFixture([
      "02DRZ3NDEKTSV4RRFFQ69G5FAV",
      "02ERZ3NDEKTSV4RRFFQ69G5FAV",
      "02FRZ3NDEKTSV4RRFFQ69G5FAV",
    ]);
    try {
      seedRun(fixture.database, "running");
      await fixture.api.inject({ method: "POST", url: "/v1/studio/media-artifacts", headers: commandHeaders("studio:media:commands"), payload: mediaPayload() });
      const share = await fixture.api.inject({ method: "POST", url: `/v1/studio/media-artifacts/${MEDIA_ID}/share`, headers: commandHeaders("studio:share:c25", "1"), payload: studioCommand("share", "media_artifact", MEDIA_ID) });
      const replay = await fixture.api.inject({ method: "POST", url: `/v1/studio/media-artifacts/${MEDIA_ID}/share`, headers: commandHeaders("studio:share:c25", "1"), payload: studioCommand("share", "media_artifact", MEDIA_ID) });
      const conflict = await fixture.api.inject({ method: "POST", url: `/v1/studio/media-artifacts/${MEDIA_ID}/share`, headers: commandHeaders("studio:share:c25", "1"), payload: { ...studioCommand("share", "media_artifact", MEDIA_ID), reason: "Changed reason" } });
      const stale = await fixture.api.inject({ method: "POST", url: `/v1/studio/media-artifacts/${MEDIA_ID}/rerender`, headers: commandHeaders("studio:rerender:stale", "0"), payload: studioCommand("rerender", "media_artifact", MEDIA_ID) });
      const secondShare = await fixture.api.inject({ method: "POST", url: `/v1/studio/media-artifacts/${MEDIA_ID}/share`, headers: commandHeaders("studio:share:c25-second", "1"), payload: studioCommand("share", "media_artifact", MEDIA_ID) });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/studio?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });

      expect(share.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(replay.json())).toEqual(AcceptedCommandSchema.parse(share.json()));
      expect(conflict.statusCode).toBe(409);
      expect(stale.statusCode).toBe(409);
      expect(secondShare.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(secondShare.json()).object_id).not.toBe(AcceptedCommandSchema.parse(share.json()).object_id);
      expect(detail.json()).toMatchObject({ commands: [expect.objectContaining({ kind: "share" }), expect.objectContaining({ kind: "share" })] });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given unsafe refs provider claims or non-owner caller When posted Then errors are scope-safe and redacted", async () => {
    const fixture = createControlFixture();
    try {
      seedRun(fixture.database, "running");
      const unsafe = await fixture.api.inject({ method: "POST", url: "/v1/studio/media-artifacts", headers: commandHeaders("studio:media:unsafe"), payload: { ...mediaPayload(), preview_ref: "https://temporary.example/preview.mp4", provider_ref: "secret://studio/live-token" } });
      const viewer = await fixture.api.inject({ method: "POST", url: "/v1/studio/avatar-profiles", headers: { authorization: viewerHeader(), "idempotency-key": "studio:avatar:viewer" }, payload: avatarPayload() });

      expect(unsafe.statusCode).toBe(400);
      expect(viewer.statusCode).toBe(403);
      expect(ErrorSchema.parse(viewer.json())).toMatchObject({ code: "SCOPE_DENIED" });
      expect(JSON.stringify([unsafe.json(), viewer.json()])).not.toContain("live-token");
      expect(JSON.stringify([unsafe.json(), viewer.json()])).not.toContain("https://temporary.example");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an avatar profile bound to one run When revoke uses another run Then the command is rejected", async () => {
    const fixture = createControlFixture(["01KRZ3NDEKTSV4RRFFQ69K5FAV"]);
    try {
      seedRun(fixture.database, "running");
      seedOtherRun(fixture.database);
      const avatar = await fixture.api.inject({ method: "POST", url: "/v1/studio/avatar-profiles", headers: commandHeaders("studio:avatar:run-bound"), payload: avatarPayload() });
      const foreignRunRevoke = await fixture.api.inject({ method: "POST", url: `/v1/studio/avatar-profiles/${AVATAR_ID}/revoke`, headers: commandHeaders("studio:avatar:foreign-run", "1"), payload: studioCommand("revoke_avatar", "avatar_profile", AVATAR_ID, OTHER_RUN_ID) });

      expect(avatar.statusCode).toBe(202);
      expect(foreignRunRevoke.statusCode).toBe(409);
      expect(ErrorSchema.parse(foreignRunRevoke.json())).toMatchObject({ code: "VERSION_CONFLICT" });
    } finally {
      await closeControlFixture(fixture);
    }
  });
});

function commandHeaders(idempotencyKey: string, ifMatch?: string): Record<string, string> {
  return ifMatch === undefined
    ? { authorization: ownerHeader(), "idempotency-key": idempotencyKey, traceparent: IDS.owner }
    : { authorization: ownerHeader(), "idempotency-key": idempotencyKey, "if-match": ifMatch, traceparent: IDS.owner };
}

function viewerHeader(): string {
  return createLocalBearerToken({ workspace_id: IDS.workspace, actor_id: IDS.owner, role: "Viewer", tokenSecret: TOKEN_SECRET });
}

function mediaPayload(): object {
  return { id: MEDIA_ID, workspace_id: IDS.workspace, schema_version: 1, revision: 1, run_id: IDS.run, title: "C25 source-backed video preview", media_type: "video", source_refs: ["artifact://research/c25/source-pack.json"], prompt_ref: "artifact://prompts/c25/video-script.md", model_ref: null, provider_ref: null, codec: "mp4:h264", duration_ms: 90_000, caption_ref: "artifact://media/c25/captions.vtt", thumbnail_ref: "artifact://media/c25/thumbnail.png", preview_ref: "artifact://media/c25/preview.mp4", render_version: 1, moderation_status: "needs_review", share_policy: "review_required", temporary_url_expires_at: null, descriptor_only: true };
}

function renderJobPayload(): object {
  return { id: RENDER_JOB_ID, workspace_id: IDS.workspace, schema_version: 1, media_artifact_id: MEDIA_ID, run_id: IDS.run, worker_descriptor_id: "render-worker-c25-local-descriptor", status: "queued", input_hash: HASH, output_artifact_ref: null, retry_of_job_id: null, side_effect_policy: "none", descriptor_only: true };
}

function notebookPayload(): object {
  return { id: NOTEBOOK_ID, workspace_id: IDS.workspace, schema_version: 1, revision: 1, run_id: IDS.run, title: "C25 NotebookLM descriptor", source_policy: "snapshot_only", generation_policy: "local_descriptor_only", share_policy: "review_required", descriptor_only: true };
}

function notebookSourcePayload(): object {
  return { id: NOTEBOOK_SOURCE_ID, workspace_id: IDS.workspace, schema_version: 1, notebook_id: NOTEBOOK_ID, run_id: IDS.run, source_kind: "artifact_snapshot", source_ref: "artifact://research/c25/source-pack.json", source_hash: HASH, snapshot_ref: "artifact://notebooks/c25/source-pack.snapshot.json", title: "Market source pack", descriptor_only: true };
}

function notebookGenerationPayload(): object {
  return { id: NOTEBOOK_GENERATION_ID, workspace_id: IDS.workspace, schema_version: 1, notebook_id: NOTEBOOK_ID, run_id: IDS.run, source_ids: [NOTEBOOK_SOURCE_ID], generation_kind: "brief", prompt_ref: "artifact://prompts/c25/notebook-brief.md", output_ref: "artifact://notebooks/c25/generated-brief.md", citation_refs: ["artifact://notebooks/c25/source-pack.snapshot.json#p1"], status: "draft", descriptor_only: true };
}

function avatarPayload(): object {
  return { id: AVATAR_ID, workspace_id: IDS.workspace, schema_version: 1, revision: 1, run_id: IDS.run, display_name: "Founder avatar descriptor", consent_status: "approved", consent_artifact_ref: "artifact://avatars/c25/consent.json", face_source_hash: HASH, voice_source_hash: HASH, voice_clone_mode: "disabled", render_mode: "descriptor_only", expires_at: "2026-10-04T04:00:00.000Z", revoked_at: null, descriptor_only: true };
}

function sharePayload(): object {
  return { id: SHARE_ID, workspace_id: IDS.workspace, schema_version: 1, media_artifact_id: MEDIA_ID, run_id: IDS.run, status: "pending_review", preview_ref: "artifact://media/c25/preview.mp4", expires_at: "2026-09-04T05:00:00.000Z", descriptor_only: true };
}

function studioCommand(kind: "preview" | "share" | "rerender" | "notebook_generate" | "revoke_avatar", targetType: "media_artifact" | "notebook" | "avatar_profile", targetId: string, runId: string = IDS.run): object {
  return { schema_version: 1, workspace_id: IDS.workspace, run_id: runId, kind, target_type: targetType, target_id: targetId, reason: `Operator requested ${kind}.`, descriptor_only: true };
}

function seedOtherRun(database: SqliteDatabase): void {
  const run = {
    id: OTHER_RUN_ID,
    workspace_id: IDS.workspace,
    schema_version: 1,
    created_at: "2026-08-27T04:00:00.000Z",
    updated_at: "2026-08-27T04:00:00.000Z",
    ticket_id: IDS.ticket,
    execution_location: "local",
    status: "running",
    budget: { max_tokens: 10_000, max_cost_usd: 10 },
    memory_snapshot: { snapshot_id: IDS.workspace, version: 1 },
    connector_versions: { deterministic: "1.0.0" },
  };
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(OTHER_RUN_ID, IDS.workspace, IDS.ticket, JSON.stringify(run), run.created_at, run.updated_at);
}
