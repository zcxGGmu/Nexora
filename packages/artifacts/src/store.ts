import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ArtifactVersionSchema, systemClock, type ArtifactContentType, type ArtifactVersion, type Clock } from "@nexora/contracts";
import type { SqliteDatabase } from "@nexora/persistence";
import { createArtifactPreview, sha256Content } from "./metadata.js";

export type ArtifactStoreErrorCode = "ARTIFACT_NOT_FOUND" | "ARTIFACT_VERSION_CONFLICT" | "ARTIFACT_WRITE_FAILED";

export class ArtifactStoreError extends Error {
  readonly code: ArtifactStoreErrorCode;

  constructor(code: ArtifactStoreErrorCode, message: string) {
    super(message);
    this.name = "ArtifactStoreError";
    this.code = code;
  }
}

export type StoreArtifactInput = {
  readonly workspace_id: string;
  readonly artifact_id: string;
  readonly version: number;
  readonly content_type: ArtifactContentType;
  readonly content: string;
  readonly source_ticket: string;
  readonly source_run: string;
  readonly source_agent: string;
  readonly model: string;
  readonly receipt_refs: readonly string[];
  readonly judge_ref: string | null;
  readonly review_ref: string | null;
  readonly parent_artifact_refs: readonly string[];
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
};

export type ReadArtifactInput = {
  readonly workspace_id: string;
  readonly artifact_id: string;
  readonly version: number;
};

export type ArtifactWithContent = {
  readonly metadata: ArtifactVersion;
  readonly content: string;
};

export type ArtifactLineage = Pick<ArtifactVersion, "source_ticket" | "source_run" | "source_agent" | "receipt_refs" | "judge_ref" | "review_ref">;

export class ArtifactStore {
  constructor(private readonly database: SqliteDatabase, private readonly root: string, private readonly clock: Clock = systemClock) {}

  write(input: StoreArtifactInput): ArtifactVersion {
    const contentHash = sha256Content(input.content);
    const contentRef = this.contentRef(input.artifact_id, input.version, contentHash);
    const metadata = ArtifactVersionSchema.parse({
      id: input.artifact_id,
      workspace_id: input.workspace_id,
      schema_version: 1,
      created_at: this.clock.now(),
      updated_at: this.clock.now(),
      artifact_id: input.artifact_id,
      artifact_version: input.version,
      content_type: input.content_type,
      content_hash: contentHash,
      content_ref: contentRef,
      byte_size: Buffer.byteLength(input.content),
      source_ticket: input.source_ticket,
      source_run: input.source_run,
      source_agent: input.source_agent,
      model: input.model,
      receipt_refs: [...input.receipt_refs],
      judge_ref: input.judge_ref,
      review_ref: input.review_ref,
      parent_artifact_refs: [...input.parent_artifact_refs],
      metadata: input.metadata,
      preview: createArtifactPreview({ content_type: input.content_type, content: input.content, secret_refs: [] }),
    });

    const absolutePath = this.contentPath(metadata);
    const tempPath = `${absolutePath}.tmp-${process.pid}`;
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(tempPath, input.content, { encoding: "utf8", flag: "wx" });
    try {
      this.insert(metadata);
      renameSync(tempPath, absolutePath);
      return metadata;
    } catch (error) {
      rmSync(tempPath, { force: true });
      if (error instanceof ArtifactStoreError) throw error;
      const message = error instanceof Error ? error.message : "Artifact write failed";
      if (/UNIQUE constraint failed/i.test(message)) throw new ArtifactStoreError("ARTIFACT_VERSION_CONFLICT", "Artifact version already exists");
      throw new ArtifactStoreError("ARTIFACT_WRITE_FAILED", "Artifact metadata write failed");
    }
  }

  read(input: ReadArtifactInput): ArtifactWithContent {
    const metadata = this.get(input);
    if (metadata === undefined) throw new ArtifactStoreError("ARTIFACT_NOT_FOUND", "Artifact version not found");
    return { metadata, content: readFileSync(this.contentPath(metadata), "utf8") };
  }

  findByRun(input: { readonly workspace_id: string; readonly run_id: string }): readonly ArtifactVersion[] {
    const rows = this.database
      .prepare("SELECT payload_json FROM artifact_versions WHERE workspace_id = ? AND source_run = ? ORDER BY artifact_version ASC")
      .all(input.workspace_id, input.run_id);
    return rows.map((row) => ArtifactVersionSchema.parse(JSON.parse(readText(row["payload_json"]))));
  }

  getLineage(input: ReadArtifactInput): ArtifactLineage {
    const metadata = this.get(input);
    if (metadata === undefined) throw new ArtifactStoreError("ARTIFACT_NOT_FOUND", "Artifact version not found");
    return {
      source_ticket: metadata.source_ticket,
      source_run: metadata.source_run,
      source_agent: metadata.source_agent,
      receipt_refs: metadata.receipt_refs,
      judge_ref: metadata.judge_ref,
      review_ref: metadata.review_ref,
    };
  }

  private get(input: ReadArtifactInput): ArtifactVersion | undefined {
    const row = this.database
      .prepare("SELECT payload_json FROM artifact_versions WHERE workspace_id = ? AND artifact_id = ? AND artifact_version = ?")
      .get(input.workspace_id, input.artifact_id, input.version);
    return row === undefined ? undefined : ArtifactVersionSchema.parse(JSON.parse(readText(row["payload_json"])));
  }

  private insert(metadata: ArtifactVersion): void {
    this.database
      .prepare(
        "INSERT INTO artifact_versions(id, workspace_id, artifact_id, artifact_version, content_type, content_hash, content_ref, byte_size, source_ticket, source_run, source_agent, model, receipt_refs_json, judge_ref, review_ref, parent_artifact_refs_json, metadata_json, preview_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        metadata.id,
        metadata.workspace_id,
        metadata.artifact_id,
        metadata.artifact_version,
        metadata.content_type,
        metadata.content_hash,
        metadata.content_ref,
        metadata.byte_size,
        metadata.source_ticket,
        metadata.source_run,
        metadata.source_agent,
        metadata.model,
        JSON.stringify(metadata.receipt_refs),
        metadata.judge_ref,
        metadata.review_ref,
        JSON.stringify(metadata.parent_artifact_refs),
        JSON.stringify(metadata.metadata),
        JSON.stringify(metadata.preview),
        JSON.stringify(metadata),
        metadata.schema_version,
        metadata.created_at,
        metadata.updated_at,
      );
  }

  private contentRef(artifactId: string, version: number, contentHash: string): string {
    return `artifact://Artifacts/${artifactId}/v${version}/${contentHash.slice("sha256:".length)}.txt`;
  }

  private contentPath(metadata: ArtifactVersion): string {
    return join(this.root, "Artifacts", metadata.artifact_id, `v${metadata.artifact_version}`, `${metadata.content_hash.slice("sha256:".length)}.txt`);
  }
}

function readText(value: unknown): string {
  if (typeof value !== "string") throw new ArtifactStoreError("ARTIFACT_WRITE_FAILED", "Expected text column");
  return value;
}
