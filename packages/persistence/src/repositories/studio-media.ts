import type { SQLInputValue } from "node:sqlite";
import {
  AvatarProfileDescriptorSchema,
  MediaArtifactDescriptorSchema,
  NotebookDescriptorSchema,
  NotebookGenerationDescriptorSchema,
  NotebookSourceDescriptorSchema,
  RenderJobDescriptorSchema,
  StudioCommandSchema,
  StudioShareDescriptorSchema,
  canUseNotebookGenerationSource,
  type AvatarProfileDescriptor,
  type MediaArtifactDescriptor,
  type NotebookDescriptor,
  type NotebookGenerationDescriptor,
  type NotebookSourceDescriptor,
  type RenderJobDescriptor,
  type StudioCommand,
  type StudioShareDescriptor,
} from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { PersistenceError, json, readJson, sqliteError } from "./utils.js";

export type MediaArtifactCreateResult = { readonly kind: "created"; readonly media_artifact: MediaArtifactDescriptor };
export type RenderJobCreateResult = { readonly kind: "created"; readonly render_job: RenderJobDescriptor };
export type NotebookCreateResult = { readonly kind: "created"; readonly notebook: NotebookDescriptor };
export type NotebookSourceCreateResult = { readonly kind: "created"; readonly source: NotebookSourceDescriptor };
export type NotebookGenerationCreateResult = { readonly kind: "created"; readonly generation: NotebookGenerationDescriptor };
export type AvatarProfileCreateResult = { readonly kind: "created"; readonly avatar: AvatarProfileDescriptor };
export type StudioShareCreateResult = { readonly kind: "created"; readonly share: StudioShareDescriptor };
export type StudioCommandRecordResult = { readonly command: StudioCommand; readonly replayed: boolean };

export class MediaArtifactRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): MediaArtifactCreateResult {
    const parsed = MediaArtifactDescriptorSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO media_artifacts(id, workspace_id, run_id, media_type, title, preview_ref, source_refs_json, prompt_ref, model_ref, provider_ref, codec, duration_ms, caption_ref, thumbnail_ref, render_version, moderation_status, share_policy, temporary_url_expires_at, descriptor_only, payload_json, version, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.run_id, parsed.media_type, parsed.title, parsed.preview_ref, json(parsed.source_refs), parsed.prompt_ref, parsed.model_ref, parsed.codec, parsed.duration_ms, parsed.caption_ref, parsed.thumbnail_ref, parsed.render_version, parsed.moderation_status, parsed.share_policy, parsed.temporary_url_expires_at, json(parsed), parsed.revision, parsed.schema_version, parsed.created_at, parsed.updated_at);
      return { kind: "created", media_artifact: parsed };
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): MediaArtifactDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM media_artifacts WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readVersionedMediaArtifact(row);
  }

  list(workspaceId: string): readonly MediaArtifactDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM media_artifacts WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId);
    return rows.map(readVersionedMediaArtifact);
  }
}

export class RenderJobRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): RenderJobCreateResult {
    const parsed = RenderJobDescriptorSchema.parse(record);
    requireMediaArtifact(this.database, parsed.workspace_id, parsed.media_artifact_id, parsed.run_id);
    try {
      this.database.prepare("INSERT INTO media_render_jobs(id, workspace_id, media_artifact_id, run_id, worker_descriptor_id, status, input_hash, output_artifact_ref, retry_of_job_id, side_effect_policy, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.media_artifact_id, parsed.run_id, parsed.worker_descriptor_id, parsed.status, parsed.input_hash, parsed.output_artifact_ref, parsed.retry_of_job_id, parsed.side_effect_policy, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return { kind: "created", render_job: parsed };
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listByMedia(workspaceId: string, mediaArtifactId: string): readonly RenderJobDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json FROM media_render_jobs WHERE workspace_id = ? AND media_artifact_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, mediaArtifactId);
    return rows.map((row) => readJson(row["payload_json"], RenderJobDescriptorSchema));
  }

  get(workspaceId: string, id: string): RenderJobDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json FROM media_render_jobs WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], RenderJobDescriptorSchema);
  }

  list(workspaceId: string): readonly RenderJobDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json FROM media_render_jobs WHERE workspace_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId);
    return rows.map((row) => readJson(row["payload_json"], RenderJobDescriptorSchema));
  }
}

export class NotebookRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): NotebookCreateResult {
    const parsed = NotebookDescriptorSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO notebooks(id, workspace_id, run_id, title, source_policy, generation_policy, share_policy, descriptor_only, payload_json, version, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.run_id, parsed.title, parsed.source_policy, parsed.generation_policy, parsed.share_policy, json(parsed), parsed.revision, parsed.schema_version, parsed.created_at, parsed.updated_at);
      return { kind: "created", notebook: parsed };
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): NotebookDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM notebooks WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readVersionedNotebook(row);
  }

  list(workspaceId: string): readonly NotebookDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM notebooks WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId);
    return rows.map(readVersionedNotebook);
  }
}

export class NotebookSourceRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): NotebookSourceCreateResult {
    const parsed = NotebookSourceDescriptorSchema.parse(record);
    requireNotebook(this.database, parsed.workspace_id, parsed.notebook_id, parsed.run_id);
    try {
      this.database.prepare("INSERT INTO notebook_sources(id, workspace_id, notebook_id, run_id, source_kind, source_ref, source_hash, snapshot_ref, title, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.notebook_id, parsed.run_id, parsed.source_kind, parsed.source_ref, parsed.source_hash, parsed.snapshot_ref, parsed.title, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return { kind: "created", source: parsed };
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): NotebookSourceDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json FROM notebook_sources WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], NotebookSourceDescriptorSchema);
  }

  listByNotebook(workspaceId: string, notebookId: string): readonly NotebookSourceDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json FROM notebook_sources WHERE workspace_id = ? AND notebook_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, notebookId);
    return rows.map((row) => readJson(row["payload_json"], NotebookSourceDescriptorSchema));
  }

  list(workspaceId: string): readonly NotebookSourceDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json FROM notebook_sources WHERE workspace_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId);
    return rows.map((row) => readJson(row["payload_json"], NotebookSourceDescriptorSchema));
  }
}

export class NotebookGenerationRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): NotebookGenerationCreateResult {
    const parsed = NotebookGenerationDescriptorSchema.parse(record);
    requireNotebook(this.database, parsed.workspace_id, parsed.notebook_id, parsed.run_id);
    requireGenerationSources(this.database, parsed);
    try {
      this.database.prepare("INSERT INTO notebook_generations(id, workspace_id, notebook_id, run_id, source_ids_json, generation_kind, prompt_ref, output_ref, citation_refs_json, status, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.notebook_id, parsed.run_id, json(parsed.source_ids), parsed.generation_kind, parsed.prompt_ref, parsed.output_ref, json(parsed.citation_refs), parsed.status, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return { kind: "created", generation: parsed };
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listByNotebook(workspaceId: string, notebookId: string): readonly NotebookGenerationDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json FROM notebook_generations WHERE workspace_id = ? AND notebook_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, notebookId);
    return rows.map((row) => readJson(row["payload_json"], NotebookGenerationDescriptorSchema));
  }

  get(workspaceId: string, id: string): NotebookGenerationDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json FROM notebook_generations WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], NotebookGenerationDescriptorSchema);
  }

  list(workspaceId: string): readonly NotebookGenerationDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json FROM notebook_generations WHERE workspace_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId);
    return rows.map((row) => readJson(row["payload_json"], NotebookGenerationDescriptorSchema));
  }
}

export class AvatarProfileRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): AvatarProfileCreateResult {
    const parsed = AvatarProfileDescriptorSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO avatar_profiles(id, workspace_id, run_id, display_name, consent_status, consent_artifact_ref, face_source_hash, voice_source_hash, voice_clone_mode, render_mode, expires_at, revoked_at, descriptor_only, payload_json, version, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.run_id, parsed.display_name, parsed.consent_status, parsed.consent_artifact_ref, parsed.face_source_hash, parsed.voice_source_hash, parsed.voice_clone_mode, parsed.render_mode, parsed.expires_at, parsed.revoked_at, json(parsed), parsed.revision, parsed.schema_version, parsed.created_at, parsed.updated_at);
      return { kind: "created", avatar: parsed };
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): AvatarProfileDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM avatar_profiles WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readVersionedAvatar(row);
  }

  list(workspaceId: string): readonly AvatarProfileDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM avatar_profiles WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId);
    return rows.map(readVersionedAvatar);
  }
}

export class StudioShareRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): StudioShareCreateResult {
    const parsed = StudioShareDescriptorSchema.parse(record);
    requireMediaArtifact(this.database, parsed.workspace_id, parsed.media_artifact_id, parsed.run_id);
    try {
      this.database.prepare("INSERT INTO studio_shares(id, workspace_id, media_artifact_id, run_id, status, preview_ref, expires_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.media_artifact_id, parsed.run_id, parsed.status, parsed.preview_ref, parsed.expires_at, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return { kind: "created", share: parsed };
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listByMedia(workspaceId: string, mediaArtifactId: string): readonly StudioShareDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json FROM studio_shares WHERE workspace_id = ? AND media_artifact_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, mediaArtifactId);
    return rows.map((row) => readJson(row["payload_json"], StudioShareDescriptorSchema));
  }

  get(workspaceId: string, id: string): StudioShareDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json FROM studio_shares WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], StudioShareDescriptorSchema);
  }

  list(workspaceId: string): readonly StudioShareDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json FROM studio_shares WHERE workspace_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId);
    return rows.map((row) => readJson(row["payload_json"], StudioShareDescriptorSchema));
  }
}

export class StudioCommandRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): StudioCommandRecordResult {
    const parsed = StudioCommandSchema.parse(record);
    const existing = this.getByIdempotencyKey(parsed.workspace_id, parsed.idempotency_key);
    if (existing !== undefined) {
      if (studioCommandFingerprint(existing) !== studioCommandFingerprint(parsed)) throw new PersistenceError("IDEMPOTENCY_KEY_REUSED", "Studio command idempotency key was reused with a different payload");
      return { command: existing, replayed: true };
    }
    requireCommandTarget(this.database, parsed);
    try {
      this.database.prepare("INSERT INTO studio_commands(command_id, workspace_id, run_id, kind, target_id, target_type, idempotency_key, expected_revision, reason, descriptor_only, payload_json, schema_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)").run(parsed.command_id, parsed.workspace_id, parsed.run_id, parsed.kind, parsed.target_id, parsed.target_type, parsed.idempotency_key, parsed.expected_revision, parsed.reason, json(parsed), parsed.schema_version, parsed.created_at);
      return { command: parsed, replayed: false };
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, commandId: string): StudioCommand | undefined {
    const row = this.database.prepare("SELECT payload_json FROM studio_commands WHERE workspace_id = ? AND command_id = ?").get(workspaceId, commandId);
    return row === undefined ? undefined : readJson(row["payload_json"], StudioCommandSchema);
  }

  list(workspaceId: string): readonly StudioCommand[] {
    const rows = this.database.prepare("SELECT payload_json FROM studio_commands WHERE workspace_id = ? ORDER BY created_at ASC, command_id ASC").all(workspaceId);
    return rows.map((row) => readJson(row["payload_json"], StudioCommandSchema));
  }

  private getByIdempotencyKey(workspaceId: string, idempotencyKey: string): StudioCommand | undefined {
    const row = this.database.prepare("SELECT payload_json FROM studio_commands WHERE workspace_id = ? AND idempotency_key = ?").get(workspaceId, idempotencyKey);
    return row === undefined ? undefined : readJson(row["payload_json"], StudioCommandSchema);
  }
}

function requireMediaArtifact(database: SqliteDatabase, workspaceId: string, mediaArtifactId: string, runId: string): void {
  const row = database.prepare("SELECT 1 AS found FROM media_artifacts WHERE workspace_id = ? AND id = ? AND run_id = ?").get(workspaceId, mediaArtifactId, runId);
  if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Media artifact scope constraint failed");
}

function requireNotebook(database: SqliteDatabase, workspaceId: string, notebookId: string, runId: string): void {
  const row = database.prepare("SELECT 1 AS found FROM notebooks WHERE workspace_id = ? AND id = ? AND run_id = ?").get(workspaceId, notebookId, runId);
  if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Notebook scope constraint failed");
}

function requireGenerationSources(database: SqliteDatabase, generation: NotebookGenerationDescriptor): void {
  for (const sourceId of generation.source_ids) {
    const source = new NotebookSourceRepository(database).get(generation.workspace_id, sourceId);
    if (source === undefined || !canUseNotebookGenerationSource(generation, source).allowed) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Notebook generation source scope constraint failed");
    }
  }
}

function requireCommandTarget(database: SqliteDatabase, command: StudioCommand): void {
  if (command.target_type === "media_artifact") {
    const media = new MediaArtifactRepository(database).get(command.workspace_id, command.target_id);
    if (media === undefined || media.run_id !== command.run_id || media.revision !== command.expected_revision) throw commandTargetError(media === undefined);
    return;
  }
  if (command.target_type === "notebook") {
    const notebook = new NotebookRepository(database).get(command.workspace_id, command.target_id);
    if (notebook === undefined || notebook.run_id !== command.run_id || notebook.revision !== command.expected_revision) throw commandTargetError(notebook === undefined);
    return;
  }
  const avatar = new AvatarProfileRepository(database).get(command.workspace_id, command.target_id);
  if (avatar === undefined || avatar.run_id !== command.run_id || avatar.revision !== command.expected_revision) throw commandTargetError(avatar === undefined);
}

function commandTargetError(missing: boolean): PersistenceError {
  return missing ? new PersistenceError("NOT_FOUND", "Studio command target not found") : new PersistenceError("VERSION_CONFLICT", "Studio command target revision conflict");
}

function readVersionedMediaArtifact(row: Record<string, unknown>): MediaArtifactDescriptor {
  return MediaArtifactDescriptorSchema.parse({ ...readJson(row["payload_json"], MediaArtifactDescriptorSchema), revision: readVersion(row["version"], "MediaArtifact") });
}

function readVersionedNotebook(row: Record<string, unknown>): NotebookDescriptor {
  return NotebookDescriptorSchema.parse({ ...readJson(row["payload_json"], NotebookDescriptorSchema), revision: readVersion(row["version"], "Notebook") });
}

function readVersionedAvatar(row: Record<string, unknown>): AvatarProfileDescriptor {
  return AvatarProfileDescriptorSchema.parse({ ...readJson(row["payload_json"], AvatarProfileDescriptorSchema), revision: readVersion(row["version"], "AvatarProfile") });
}

function readVersion(value: unknown, entity: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "bigint" && value > 0n) return Number(value);
  throw new PersistenceError("CONSTRAINT_VIOLATION", `${entity} version column is invalid`);
}

function studioCommandFingerprint(command: StudioCommand): string {
  return json({
    command_id: command.command_id,
    workspace_id: command.workspace_id,
    run_id: command.run_id,
    kind: command.kind,
    target_id: command.target_id,
    target_type: command.target_type,
    idempotency_key: command.idempotency_key,
    expected_revision: command.expected_revision,
    reason: command.reason,
    descriptor_only: command.descriptor_only,
    schema_version: command.schema_version,
  });
}

export function bool(value: boolean): SQLInputValue {
  return value ? 1 : 0;
}
