import type { MemoryVersion } from "@nexora/contracts";

export type MemoryConflict = {
  readonly kind: "conflict";
  readonly review_id: string;
  readonly conflict_group_id: string;
  readonly active: { readonly version: number; readonly content_hash: string };
  readonly candidate: { readonly version: number; readonly content_hash: string };
};

export function toMemoryConflict(active: MemoryVersion, candidate: MemoryVersion): MemoryConflict {
  return {
    kind: "conflict",
    review_id: requireText(candidate.review_id, "review_id"),
    conflict_group_id: requireText(candidate.conflict_group_id, "conflict_group_id"),
    active: { version: active.note_version, content_hash: active.content_hash },
    candidate: { version: candidate.note_version, content_hash: candidate.content_hash },
  };
}

function requireText(value: string | null, field: string): string {
  if (value !== null) return value;
  throw new MemoryConflictError(`${field} is required for conflict versions`);
}

export class MemoryConflictError extends Error {
  readonly name = "MemoryConflictError";
}
