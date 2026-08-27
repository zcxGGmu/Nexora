import { createHash } from "node:crypto";
import { ArtifactPreviewSchema, type ArtifactContentType, type ArtifactPreview } from "@nexora/contracts";
import { redactSecrets } from "@nexora/policy";

const PREVIEW_LIMIT = 4096;

export type CreateArtifactPreviewInput = {
  readonly content_type: ArtifactContentType;
  readonly content: string;
  readonly secret_refs: readonly string[];
};

export function sha256Content(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function createArtifactPreview(input: CreateArtifactPreviewInput): ArtifactPreview {
  const bounded = input.content.length > PREVIEW_LIMIT ? input.content.slice(0, PREVIEW_LIMIT) : input.content;
  const redactionInput = parsePreview(input.content_type, bounded);
  const redacted = redactSecrets(redactionInput, { secret_refs: input.secret_refs });
  const preview = typeof redacted.value === "string" ? redacted.value : JSON.stringify(redacted.value, null, 2);
  return ArtifactPreviewSchema.parse({ kind: input.content_type, preview, truncated: input.content.length > PREVIEW_LIMIT, redactions: redacted.redactions });
}

function parsePreview(contentType: ArtifactContentType, content: string): unknown {
  if (contentType !== "json") return content;
  try {
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) return content;
    throw error;
  }
}
