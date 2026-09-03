import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { chromium, type Page } from "@playwright/test";
import { migrate, openDatabase } from "../../../../packages/persistence/src/index.js";

const WORKSPACE_DIR = process.cwd();
const ARTIFACT_DIR = resolve(WORKSPACE_DIR, "artifacts/progress/c24/current-verification");
const RUN_STAMP = process.env["NEXORA_C24_QA_STAMP"] ?? new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15);
const OUTPUT_DIR = resolve(ARTIFACT_DIR, `visual-qa-data-${RUN_STAMP}`);
const API_LOG = resolve(OUTPUT_DIR, "api.log");
const WEB_LOG = resolve(OUTPUT_DIR, "mission-control.log");
const SUMMARY_PATH = resolve(ARTIFACT_DIR, `c24-voice-jarvis-visual-qa-summary-${RUN_STAMP}.json`);
const DESKTOP_SCREENSHOT = resolve(ARTIFACT_DIR, `c24-voice-jarvis-desktop-${RUN_STAMP}.png`);
const DESKTOP_POST_ACTIONS_SCREENSHOT = resolve(ARTIFACT_DIR, `c24-voice-jarvis-desktop-post-actions-${RUN_STAMP}.png`);
const MOBILE_SCREENSHOT = resolve(ARTIFACT_DIR, `c24-voice-jarvis-mobile-${RUN_STAMP}.png`);

const API_ORIGIN = "http://127.0.0.1:4310";
const WEB_ORIGIN = "http://127.0.0.1:4313";
const LOCAL_CONTROL_SECRET = process.env["NEXORA_C24_QA_CONTROL_SECRET"] ?? "local-c24-control-plane-test-key-only";
const TIME = "2026-09-04T01:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  otherWorkspace: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  owner: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  agent: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01FRZ3NDEKTSV4RRFFQ69F5FAV",
  run: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  gatewaySession: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  voiceSession: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  transcript: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
} as const;

type SeedResult = {
  readonly path: string;
  readonly status: number;
  readonly accepted: boolean;
};

type ScreenshotEvidence = {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly overflow: boolean;
};

type VisualSummary = {
  readonly url: string;
  readonly descriptorOnlyVisible: boolean;
  readonly seed: readonly SeedResult[];
  readonly controls: Readonly<Record<string, boolean>>;
  readonly feedback: readonly string[];
  readonly sessionHeadingReadable: boolean;
  readonly desktop: ScreenshotEvidence;
  readonly desktopPostActions: ScreenshotEvidence;
  readonly mobile: ScreenshotEvidence & { readonly mobileNavItems: number };
  readonly noInvalidAriaRefs: boolean;
  readonly noExternalConnection: boolean;
  readonly requestOrigins: readonly string[];
  readonly apiLog: string;
  readonly webLog: string;
};

mkdirSync(OUTPUT_DIR, { recursive: true });
rmSync(resolve(OUTPUT_DIR, "nexora.sqlite"), { force: true });

const databasePath = resolve(OUTPUT_DIR, "nexora.sqlite");
seedBaseDatabase(databasePath);

const api = startProcess("pnpm", ["--filter", "@nexora/api", "start"], API_LOG, {
  NEXORA_DATA_DIR: OUTPUT_DIR,
  NEXORA_DB_PATH: databasePath,
  NEXORA_AUTH_MODE: "local",
  NEXORA_CONTROL_TOKEN_SECRET: LOCAL_CONTROL_SECRET,
  NEXORA_ENABLE_LOCAL_SESSION_BOOTSTRAP: "true",
  NEXORA_API_HOST: "127.0.0.1",
  NEXORA_API_PORT: "4310",
  NEXORA_LOG_LEVEL: "warn",
});

const web = startProcess("pnpm", ["--filter", "@nexora/mission-control", "exec", "vite", "--host", "127.0.0.1", "--port", "4313"], WEB_LOG, {
  VITE_NEXORA_API_BASE_URL: API_ORIGIN,
  VITE_NEXORA_VOICE_JARVIS_OFFLINE_FIXTURE: "0",
});

const seedResults: SeedResult[] = [];
const requestOrigins = new Set<string>();

try {
  await waitForOk(`${API_ORIGIN}/v1/health`, api);
  const cookie = await bootstrapCookie();
  seedResults.push(await postControl(cookie, "/v1/gateways", "qa:gateway:c24", gatewayDescriptor(), [202]));
  seedResults.push(await postControl(cookie, "/v1/channels", "qa:channel:c24", channelDescriptor(), [202]));
  seedResults.push(await postControl(cookie, "/v1/sessions", "qa:gateway-session:c24", gatewaySession(), [202]));
  seedResults.push(await postControl(cookie, "/v1/voice-sessions", "qa:voice-session:c24", voiceSession(), [202]));
  seedResults.push(await postControl(cookie, "/v1/voice-transcripts", "qa:voice-transcript:c24", transcriptDescriptor(), [202]));
  seedResults.push(await postControl(cookie, `/v1/voice-sessions/${IDS.voiceSession}/wake`, "qa:voice-wake:c24", sessionCommand("wake"), [202], "1"));

  await waitForOk(WEB_ORIGIN, web);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("request", (request) => requestOrigins.add(new URL(request.url()).origin));
    await page.goto(`${WEB_ORIGIN}/voice-jarvis?workspace=ws-demo`, { waitUntil: "networkidle" });
    await requireText(page, "Voice / Jarvis");
    await requireText(page, "Descriptor-only voice control");
    await requireText(page, "No external connection");
    await requireText(page, "Audio policy");
    await requireText(page, "Wake word");
    await requireText(page, "Voice sessions");
    await requireText(page, "Transcripts");
    await requireText(page, "Transcript facts");
    await requireText(page, "Command facts");
    await requireText(page, "No microphone is read");
    const controls = await visibleControls(page, ["Wake", "Interrupt", "Pause", "Delete transcript", "Export transcript"]);
    const sessionHeadingReadable = await hasReadableSessionHeading(page);
    if (!sessionHeadingReadable) throw new Error("Voice/Jarvis session heading is not readable at 1440x900");
    const desktopOverflow = await hasHorizontalOverflow(page);
    await page.screenshot({ path: DESKTOP_SCREENSHOT, fullPage: false });

    await page.getByRole("button", { name: "Pause" }).click();
    await requireText(page, "pause accepted");
    await page.getByRole("button", { name: "Export transcript" }).click();
    await requireText(page, "export_transcript accepted");
    const desktopPostActionsOverflow = await hasHorizontalOverflow(page);
    await page.screenshot({ path: DESKTOP_POST_ACTIONS_SCREENSHOT, fullPage: false });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_ORIGIN}/voice-jarvis?workspace=ws-demo`, { waitUntil: "networkidle" });
    await requireText(page, "Voice / Jarvis");
    await requireText(page, "Descriptor-only voice control");
    await requireText(page, "Audio policy");
    await requireText(page, "Wake word");
    await requireText(page, "Command facts");
    await requireText(page, "provider connection is attempted");
    const mobileNavItems = await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link").count();
    const mobileOverflow = await hasHorizontalOverflow(page);
    const noInvalidAriaRefs = await page.evaluate(() => {
      const ids = new Set(Array.from(document.querySelectorAll("[id]")).map((element) => element.id));
      return Array.from(document.querySelectorAll("[aria-labelledby]")).every((element) => {
        const value = element.getAttribute("aria-labelledby");
        return value === null || value.split(/\s+/).every((id) => ids.has(id));
      });
    });
    await page.screenshot({ path: MOBILE_SCREENSHOT, fullPage: false });

    const feedback = await page.locator(".state-plane, .status-badge, .row-meta").allTextContents();
    const summary: VisualSummary = {
      url: `${WEB_ORIGIN}/voice-jarvis?workspace=ws-demo`,
      descriptorOnlyVisible: true,
      seed: seedResults,
      controls,
      feedback,
      sessionHeadingReadable,
      desktop: { path: workspaceRelativePath(DESKTOP_SCREENSHOT), width: 1440, height: 900, overflow: desktopOverflow },
      desktopPostActions: { path: workspaceRelativePath(DESKTOP_POST_ACTIONS_SCREENSHOT), width: 1440, height: 900, overflow: desktopPostActionsOverflow },
      mobile: { path: workspaceRelativePath(MOBILE_SCREENSHOT), width: 390, height: 844, overflow: mobileOverflow, mobileNavItems },
      noInvalidAriaRefs,
      noExternalConnection: Array.from(requestOrigins).every((origin) => origin === API_ORIGIN || origin === WEB_ORIGIN),
      requestOrigins: Array.from(requestOrigins).sort(),
      apiLog: workspaceRelativePath(API_LOG),
      webLog: workspaceRelativePath(WEB_LOG),
    };
    writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await browser.close();
  }
} finally {
  await stopProcess(web);
  await stopProcess(api);
}

function seedBaseDatabase(path: string): void {
  const database = openDatabase(path);
  try {
    migrate(database, { now: () => TIME });
    const agent = { id: IDS.agent, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, purpose: "Coordinate Voice/Jarvis QA", role: "Agent", allowed_scopes: [{ kind: "workspace", id: IDS.workspace }], runtime: { kind: "local", adapter: "deterministic" }, model_policy: { allowed_models: ["deterministic"], default_model: "deterministic" }, memory_reads: [{ scope: "workspace" }], tools: { allow: ["memory:read"], deny: [] }, handoff_outputs: ["report"], requires_review: false };
    const goal = { id: IDS.goal, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, title: "Voice Jarvis QA", objective: "Exercise descriptor-only voice control", definition_of_done: ["visual qa evidence captured"] };
    const ticket = { id: IDS.ticket, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, status: "ready", definition_of_done: ["voice page visible"], assigned_agents: [IDS.agent], approval_policy: { mode: "required" }, idempotency_key: "ticket:c24:qa" };
    const run = { id: IDS.run, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, ticket_id: IDS.ticket, execution_location: "local", status: "running", budget: { max_tokens: 10000, max_cost_usd: 10 }, memory_snapshot: { snapshot_id: IDS.workspace, version: 1 }, connector_versions: { deterministic: "1.0.0" } };
    database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(IDS.workspace, "Demo", TIME, TIME);
    database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(IDS.otherWorkspace, "Other", TIME, TIME);
    database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(IDS.agent, IDS.workspace, JSON.stringify(agent), TIME, TIME);
    database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.goal, IDS.workspace, goal.title, goal.objective, JSON.stringify(goal.definition_of_done), JSON.stringify(goal), TIME, TIME);
    database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.ticket, IDS.workspace, IDS.goal, ticket.status, ticket.idempotency_key, JSON.stringify(ticket), TIME, TIME);
    database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.ticket, run.status, JSON.stringify(run), TIME, TIME);
  } finally {
    database.close();
  }
}

function startProcess(command: string, args: readonly string[], logPath: string, env: Readonly<Record<string, string>>): ChildProcessWithoutNullStreams {
  const log = createWriteStream(logPath, { flags: "a" });
  const child = spawn(command, [...args], { cwd: WORKSPACE_DIR, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  return child;
}

async function waitForOk(url: string, child: ChildProcessWithoutNullStreams): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Process exited while waiting for ${url}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function bootstrapCookie(): Promise<string> {
  const response = await fetch(`${API_ORIGIN}/v1/auth/local-session`, { method: "POST", headers: { origin: WEB_ORIGIN, host: "127.0.0.1:4310" } });
  if (response.status !== 204) throw new Error(`Local session bootstrap failed with ${response.status}`);
  const setCookie = response.headers.get("set-cookie");
  const cookie = setCookie?.split(";")[0];
  if (cookie === undefined || cookie.length === 0) throw new Error("Local session cookie was not returned");
  return cookie;
}

async function postControl(cookie: string, path: string, idempotencyKey: string, body: object, expectedStatuses: readonly number[], ifMatch?: string): Promise<SeedResult> {
  const headers: Record<string, string> = { cookie, "content-type": "application/json", "idempotency-key": idempotencyKey, traceparent: IDS.owner };
  if (ifMatch !== undefined) headers["if-match"] = ifMatch;
  const response = await fetch(`${API_ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await response.text();
  if (!expectedStatuses.includes(response.status)) throw new Error(`POST ${path} returned ${response.status}: ${text}`);
  return { path, status: response.status, accepted: response.status === 202 };
}

function workspaceRelativePath(path: string): string {
  return relative(WORKSPACE_DIR, path);
}

async function requireText(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 10000 });
}

async function visibleControls(page: Page, labels: readonly string[]): Promise<Readonly<Record<string, boolean>>> {
  const entries = await Promise.all(labels.map(async (label) => [label, await page.getByRole("button", { name: label }).isVisible()] as const));
  return Object.fromEntries(entries);
}

async function hasReadableSessionHeading(page: Page): Promise<boolean> {
  return page.getByRole("heading", { name: /Jarvis wall mode control session/ }).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width >= 180 && rect.height <= 72;
  });
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

async function stopProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (child.exitCode !== null) return;
    await delay(100);
  }
  child.kill("SIGKILL");
}

function gatewayDescriptor(): object {
  return { id: "gateway-c24-voice", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, name: "Gateway C24 Voice", kind: "custom", version: "1.0.0", requested_version: "1.0.0", actual_version: null, protocol_version: 1, capabilities: ["sessions"], health: "healthy", status: "connected", enabled: true, execution_location: "local", endpoint_ref: null, data_classification: "internal", last_heartbeat_at: TIME, revision: 1 };
}

function channelDescriptor(): object {
  return { id: "channel-c24-voice", workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, gateway_id: "gateway-c24-voice", name: "Channel C24 Voice", kind: "custom", version: "1.0.0", status: "connected", enabled: true, capabilities: ["sessions"], credential_ref: null, endpoint_ref: null, allowlist_mode: "deny_by_default", data_classification: "internal", revision: 1 };
}

function gatewaySession(): object {
  return { id: IDS.gatewaySession, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, gateway_id: "gateway-c24-voice", channel_id: "channel-c24-voice", agent_id: IDS.agent, run_id: IDS.run, external_session_ref: null, mode: "foreground", status: "active", cursor: "turn-1", last_message_id: null, last_event_at: TIME, revision: 1 };
}

function voiceSession(): object {
  return { id: IDS.voiceSession, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, run_id: IDS.run, gateway_session_id: IDS.gatewaySession, audio_policy_id: "voice-policy-c24-jarvis", wake_word_id: "wake-word-c24-jarvis", name: "Jarvis wall mode control session", mode: "wall", status: "idle", locale: "en-US", turn_count: 0, interaction_budget: { max_turns: 12, max_transcript_chars: 20000 }, deadline_at: "2026-09-04T02:00:00.000Z", input_audio_ref: null, output_audio_ref: null, current_transcript_id: null, interrupted_at: null, descriptor_only: true };
}

function transcriptDescriptor(): object {
  return { id: IDS.transcript, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, voice_session_id: IDS.voiceSession, run_id: IDS.run, source_kind: "stt_descriptor", transcript_ref: "artifact://transcripts/c24/jarvis-turn-1.json", transcript_hash: HASH, audio_ref: null, redacted: true, lifecycle_status: "retained", expires_at: "2026-10-04T01:00:00.000Z", deleted_at: null, export_ref: null, descriptor_only: true };
}

function sessionCommand(kind: "wake" | "interrupt" | "pause" | "resume"): object {
  return { schema_version: 1, workspace_id: IDS.workspace, run_id: IDS.run, kind, reason: `Operator requested descriptor-only ${kind}.`, descriptor_only: true };
}
