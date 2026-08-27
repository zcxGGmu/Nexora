import { createHash } from "node:crypto";
import type { MemorySourceRef, MemoryTrustState } from "@nexora/contracts";

export function sha256MemoryContent(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function trustStateForSources(sourceRefs: readonly MemorySourceRef[]): MemoryTrustState {
  return sourceRefs.some((source) => source.verified) ? "trusted" : "unverified";
}

export function applyUnverifiedMarker(content: string, sourceRefs: readonly MemorySourceRef[]): string {
  if (sourceRefs.some((source) => source.verified) || content.startsWith("[unverified]")) return content;
  return `[unverified]\n${content}`;
}
