import { QueryClient } from "@tanstack/react-query";
import ky, { HTTPError } from "ky";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:4310";
const API_BASE_URL = import.meta.env["VITE_NEXORA_API_BASE_URL"] ?? DEFAULT_API_BASE_URL;

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
  prefix: API_BASE_URL,
  credentials: "include",
  retry: { limit: 1 },
  timeout: 5_000,
});

const localSessionApi = ky.create({ prefix: API_BASE_URL, credentials: "include", retry: { limit: 0 }, timeout: 5_000 });

export type QueryPhase = "loading" | "ready" | "empty" | "error" | "offline" | "permission-filtered";
export type WritePhase = "submitting" | "success" | "validation_error" | "permission_denied" | "conflict";

export const queryStateTransitions = {
  loading: ["ready", "empty", "error", "offline", "permission-filtered"],
} as const satisfies Record<"loading", readonly QueryPhase[]>;

export const writeStateTransitions = {
  submitting: ["success", "validation_error", "permission_denied", "conflict"],
} as const satisfies Record<"submitting", readonly WritePhase[]>;

export async function readControlProjection<T>(path: string, workspace: string): Promise<T> {
  try {
    return await controlApi.get(path, { searchParams: { workspace_id: workspace } }).json<T>();
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
    await bootstrapLocalSession();
    return controlApi.get(path, { searchParams: { workspace_id: workspace } }).json<T>();
  }
}

async function bootstrapLocalSession(): Promise<void> {
  if (!isLoopbackControlApiBaseUrl()) throw new Error("Local session bootstrap is only available for loopback control APIs");
  await localSessionApi.post("/v1/auth/local-session");
}

export function isLoopbackControlApiBaseUrl(value: string = API_BASE_URL): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (url.protocol === "http:" || url.protocol === "https:") && (hostname === "localhost" || hostname === "::1" || /^127(?:\.\d{1,3}){3}$/.test(hostname));
  } catch {
    return false;
  }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof HTTPError && error.response.status === 401;
}
