import { QueryClient } from "@tanstack/react-query";
import ky from "ky";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:4310";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 10 * 1000,
    },
  },
});

export const controlApi = ky.create({
  prefix: import.meta.env["VITE_NEXORA_API_BASE_URL"] ?? DEFAULT_API_BASE_URL,
  retry: { limit: 1 },
  timeout: 5_000,
});

export type QueryPhase = "loading" | "ready" | "empty" | "error" | "offline" | "permission-filtered";
export type WritePhase = "submitting" | "success" | "validation_error" | "permission_denied" | "conflict";

export const queryStateTransitions = {
  loading: ["ready", "empty", "error", "offline", "permission-filtered"],
} as const satisfies Record<"loading", readonly QueryPhase[]>;

export const writeStateTransitions = {
  submitting: ["success", "validation_error", "permission_denied", "conflict"],
} as const satisfies Record<"submitting", readonly WritePhase[]>;

export async function readControlProjection<T>(path: string, workspace: string): Promise<T> {
  return controlApi.get(path, { searchParams: { workspace_id: workspace } }).json<T>();
}
