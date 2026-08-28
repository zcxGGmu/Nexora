import { createHash } from "node:crypto";
import type { MemorySourceRef, MemoryTrustState } from "@nexora/contracts";

export function sha256MemoryContent(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function canonicalSnapshotHash(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  if (serialized === undefined) throw new TypeError("Snapshot value cannot be serialized");
  return sha256MemoryContent(serialized);
}

export function trustStateForSources(sourceRefs: readonly MemorySourceRef[]): MemoryTrustState {
  return sourceRefs.some((source) => source.verified) ? "trusted" : "unverified";
}

export function applyUnverifiedMarker(content: string, sourceRefs: readonly MemorySourceRef[]): string {
  if (sourceRefs.some((source) => source.verified) || content.startsWith("[unverified]")) return content;
  return `[unverified]\n${content}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (isRecord(value)) {
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    const result: Record<string, unknown> = {};
    for (const [key, child] of entries) result[key] = canonicalize(child);
    return result;
  }
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint" || (typeof value === "number" && !Number.isFinite(value))) {
    throw new TypeError("Snapshot value contains a non-JSON value");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
