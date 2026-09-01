import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PolicyScopeSchema, RoleSchema, UlidSchema, WorkspaceIdSchema } from "@nexora/contracts";
import type { PolicyActor } from "@nexora/policy";
import { ApiHttpError } from "../services/errors.js";

const TOKEN_PREFIX = "nexora-local-v1";
export const LOCAL_SESSION_COOKIE_NAME = "nexora_control_session";

const ActorTokenClaimsSchema = z.object({
  schema_version: z.literal(1),
  workspace_id: WorkspaceIdSchema,
  actor_id: UlidSchema,
  role: RoleSchema,
}).strict();

export type LocalAuthOptions = {
  readonly mode: "local";
  readonly tokenSecret: string;
};

export type ControlAuthOptions = LocalAuthOptions | { readonly mode: "disabled" };

export type LocalBearerTokenInput = {
  readonly workspace_id: string;
  readonly actor_id: string;
  readonly role: PolicyActor["role"];
  readonly tokenSecret: string;
};

export function createLocalBearerToken(input: LocalBearerTokenInput): string {
  const claims = ActorTokenClaimsSchema.parse({ schema_version: 1, workspace_id: input.workspace_id, actor_id: input.actor_id, role: input.role });
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `Bearer ${TOKEN_PREFIX}.${payload}.${signature(payload, input.tokenSecret)}`;
}

export function requireActor(authorization: string | string[] | undefined, options: LocalAuthOptions, cookie: string | string[] | undefined = undefined): PolicyActor {
  const header = firstHeader(authorization) ?? bearerFromCookie(firstHeader(cookie));
  if (header === undefined || !header.startsWith("Bearer ")) throw unauthorized("Authorization bearer token is required");
  const [prefix, payload, mac, extra] = header.slice("Bearer ".length).split(".");
  if (prefix !== TOKEN_PREFIX || payload === undefined || mac === undefined || extra !== undefined) throw unauthorized("Authorization bearer token is invalid");
  if (!signatureMatches(payload, mac, options.tokenSecret)) throw unauthorized("Authorization bearer token is invalid");

  const decoded = decodePayload(payload);
  const parsed = ActorTokenClaimsSchema.safeParse(decoded);
  if (!parsed.success) throw unauthorized("Authorization bearer token is invalid");
  const workspaceScope = PolicyScopeSchema.parse({ kind: "workspace", id: parsed.data.workspace_id });
  return { id: parsed.data.actor_id, role: parsed.data.role, workspace_id: parsed.data.workspace_id, allowed_scopes: [workspaceScope] };
}

function signature(payload: string, tokenSecret: string): string {
  return createHmac("sha256", tokenSecret).update(`${TOKEN_PREFIX}.${payload}`).digest("base64url");
}

function signatureMatches(payload: string, mac: string, tokenSecret: string): boolean {
  const expected = Buffer.from(signature(payload, tokenSecret), "base64url");
  const actual = Buffer.from(mac, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function decodePayload(payload: string): unknown {
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw unauthorized("Authorization bearer token is invalid");
    throw error;
  }
}

function unauthorized(message: string): ApiHttpError {
  return new ApiHttpError({ status_code: 401, code: "AUTH_EXPIRED", message, retryable: false, required_action: "authenticate" });
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function bearerFromCookie(cookie: string | undefined): string | undefined {
  if (cookie === undefined) return undefined;
  for (const entry of cookie.split(";")) {
    const [name, ...valueParts] = entry.trim().split("=");
    if (name !== LOCAL_SESSION_COOKIE_NAME) continue;
    const value = valueParts.join("=");
    if (value === "") return undefined;
    return `Bearer ${decodeCookieValue(value)}`;
  }
  return undefined;
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
