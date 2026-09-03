import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { chromium, type Page } from "@playwright/test";
import { migrate, openDatabase } from "../../../../packages/persistence/src/index.js";

const WORKSPACE_DIR = process.cwd();
const ARTIFACT_DIR = resolve(WORKSPACE_DIR, "artifacts/progress/c25/current-verification");
const RUN_STAMP = process.env["NEXORA_C25_QA_STAMP"] ?? new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15);
const OUTPUT_DIR = resolve(ARTIFACT_DIR, `visual-qa-data-${RUN_STAMP}`);
const API_LOG = resolve(OUTPUT_DIR, "api.log");
const WEB_LOG = resolve(OUTPUT_DIR, "mission-control.log");
const SUMMARY_PATH = resolve(ARTIFACT_DIR, `c25-studio-media-visual-qa-summary-${RUN_STAMP}.json`);
const DESKTOP_SCREENSHOT = resolve(ARTIFACT_DIR, `c25-studio-media-desktop-${RUN_STAMP}.png`);
const DESKTOP_POST_ACTIONS_SCREENSHOT = resolve(ARTIFACT_DIR, `c25-studio-media-desktop-post-actions-${RUN_STAMP}.png`);
const MOBILE_SCREENSHOT = resolve(ARTIFACT_DIR, `c25-studio-media-mobile-${RUN_STAMP}.png`);

const API_ORIGIN = "http://127.0.0.1:4310";
const WEB_ORIGIN = "http://127.0.0.1:4313";
const LOCAL_CONTROL_SECRET = process.env["NEXORA_C25_QA_CONTROL_SECRET"] ?? "local-c25-control-plane-test-key-only";
const TIME = "2026-09-04T04:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  otherWorkspace: "01ZRZ3NDEKTSV4RRFFQ69Z5FAV",
  owner: "01YRZ3NDEKTSV4RRFFQ69Y5FAV",
  agent: "01DRZ3NDEKTSV4RRFFQ69D5FAV",
  goal: "01ERZ3NDEKTSV4RRFFQ69E5FAV",
  ticket: "01FRZ3NDEKTSV4RRFFQ69F5FAV",
  run: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  media: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  renderJob: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  notebook: "notebook-c25-market-brief",
  source: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  generation: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  avatar: "avatar-c25-founder-demo",
  share: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
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
  readonly actionFeedback: readonly string[];
  readonly statusSections: Readonly<Record<string, boolean>>;
  readonly temporaryUrlTextPresent: boolean;
  readonly temporaryUrlVisibleElements: number;
  readonly desktop: ScreenshotEvidence;
  readonly desktopPostActions: ScreenshotEvidence;
  readonly mobile: ScreenshotEvidence & { readonly mobileNavItems: number };
  readonly noInvalidAriaRefs: boolean;
  readonly noCjkGlyphs: boolean;
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
  VITE_NEXORA_STUDIO_MEDIA_OFFLINE_FIXTURE: "0",
});

const seedResults: SeedResult[] = [];
const requestOrigins = new Set<string>();

try {
  await waitForOk(`${API_ORIGIN}/v1/health`, api);
  const cookie = await bootstrapCookie();
  seedResults.push(await postControl(cookie, "/v1/studio/media-artifacts", "qa:studio-media:c25", mediaPayload(), [202]));
  seedResults.push(await postControl(cookie, "/v1/studio/render-jobs", "qa:studio-render:c25", renderJobPayload(), [202]));
  seedResults.push(await postControl(cookie, "/v1/studio/notebooks", "qa:studio-notebook:c25", notebookPayload(), [202]));
  seedResults.push(await postControl(cookie, "/v1/studio/notebook-sources", "qa:studio-source:c25", notebookSourcePayload(), [202]));
  seedResults.push(await postControl(cookie, "/v1/studio/notebook-generations", "qa:studio-generation:c25", notebookGenerationPayload(), [202]));
  seedResults.push(await postControl(cookie, "/v1/studio/avatar-profiles", "qa:studio-avatar:c25", avatarPayload(), [202]));
  seedResults.push(await postControl(cookie, "/v1/studio/shares", "qa:studio-share-fact:c25", sharePayload(), [202]));

  await waitForOk(WEB_ORIGIN, web);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("request", (request) => requestOrigins.add(new URL(request.url()).origin));
    await page.goto(`${WEB_ORIGIN}/studio-media?workspace=ws-demo`, { waitUntil: "networkidle" });
    await requireText(page, "Studio / Media");
    await requireText(page, "Descriptor-only studio control");
    await requireText(page, "No external provider");
    await requireText(page, "No NotebookLM");
    await requireText(page, "Media artifacts");
    await requireText(page, "Render queue");
    await requireText(page, "Notebook snapshots");
    await requireText(page, "Notebook sources");
    await requireText(page, "Notebook generations");
    await requireText(page, "Avatar consent");
    await requireText(page, "Share facts");
    await requireText(page, "Command receipts");
    await requireBodyText(page, "Temporary URL");
    const controls = await visibleControls(page, ["Preview", "Share", "Rerender", "Generate brief", "Revoke avatar"]);
    const desktopOverflow = await hasHorizontalOverflow(page);
    const noInvalidAriaRefs = await hasNoInvalidAriaRefs(page);
    await page.screenshot({ path: DESKTOP_SCREENSHOT, fullPage: false });

    await page.getByRole("button", { name: "Preview" }).click();
    await requireText(page, "preview accepted");
    await page.getByRole("button", { name: "Share" }).click();
    await requireText(page, "share accepted");
    await page.getByRole("button", { name: "Rerender" }).click();
    await requireText(page, "rerender accepted");
    await page.getByRole("button", { name: "Generate brief" }).click();
    await requireText(page, "notebook_generate accepted");
    await page.getByRole("button", { name: "Revoke avatar" }).click();
    await requireText(page, "revoke_avatar accepted");
    const desktopPostActionsOverflow = await hasHorizontalOverflow(page);
    await page.screenshot({ path: DESKTOP_POST_ACTIONS_SCREENSHOT, fullPage: false });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_ORIGIN}/studio-media?workspace=ws-demo`, { waitUntil: "networkidle" });
    await requireText(page, "Studio / Media");
    await requireText(page, "Descriptor-only studio control");
    await requireText(page, "No external provider");
    await requireText(page, "Media artifacts");
    await requireText(page, "Render queue");
    await requireText(page, "Notebook snapshots");
    await requireText(page, "Avatar consent");
    await requireText(page, "Share facts");
    await requireText(page, "Command receipts");
    const mobileNavItems = await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link").count();
    const mobileOverflow = await hasHorizontalOverflow(page);
    const noCjkGlyphs = await page.evaluate(() => !/[\u3400-\u9fff\uf900-\ufaff]/u.test(document.body.innerText));
    await page.screenshot({ path: MOBILE_SCREENSHOT, fullPage: false });

    const actionFeedback = await page.locator(".state-plane, .status-badge, .row-meta").allTextContents();
    const summary: VisualSummary = {
      url: `${WEB_ORIGIN}/studio-media?workspace=ws-demo`,
      descriptorOnlyVisible: true,
      seed: seedResults,
      controls,
      actionFeedback,
      statusSections: {
        mediaArtifacts: await headingVisible(page, "Media artifacts"),
        renderQueue: await headingVisible(page, "Render queue"),
        notebookSnapshots: await headingVisible(page, "Notebook snapshots"),
        notebookSources: await headingVisible(page, "Notebook sources"),
        notebookGenerations: await headingVisible(page, "Notebook generations"),
        avatarConsent: await headingVisible(page, "Avatar consent"),
        shareFacts: await headingVisible(page, "Share facts"),
        commandReceipts: await headingVisible(page, "Command receipts"),
      },
      temporaryUrlTextPresent: await hasBodyText(page, "Temporary URL"),
      temporaryUrlVisibleElements: await visibleTextElementCount(page, "Temporary URL"),
      desktop: { path: workspaceRelativePath(DESKTOP_SCREENSHOT), width: 1440, height: 900, overflow: desktopOverflow },
      desktopPostActions: { path: workspaceRelativePath(DESKTOP_POST_ACTIONS_SCREENSHOT), width: 1440, height: 900, overflow: desktopPostActionsOverflow },
      mobile: { path: workspaceRelativePath(MOBILE_SCREENSHOT), width: 390, height: 844, overflow: mobileOverflow, mobileNavItems },
      noInvalidAriaRefs,
      noCjkGlyphs,
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
    const agent = { id: IDS.agent, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, purpose: "Coordinate Studio/Media QA", role: "Agent", allowed_scopes: [{ kind: "workspace", id: IDS.workspace }], runtime: { kind: "local", adapter: "deterministic" }, model_policy: { allowed_models: ["deterministic"], default_model: "deterministic" }, memory_reads: [{ scope: "workspace" }], tools: { allow: ["memory:read"], deny: [] }, handoff_outputs: ["report"], requires_review: false };
    const goal = { id: IDS.goal, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, title: "Studio Media QA", objective: "Exercise descriptor-only Studio/Media control", definition_of_done: ["visual qa evidence captured"] };
    const ticket = { id: IDS.ticket, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, status: "ready", definition_of_done: ["studio media page visible"], assigned_agents: [IDS.agent], approval_policy: { mode: "required" }, idempotency_key: "ticket:c25:qa" };
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

async function requireBodyText(page: Page, text: string): Promise<void> {
  if (!await hasBodyText(page, text)) throw new Error(`Expected page text was missing: ${text}`);
}

async function hasBodyText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((expected) => document.body.innerText.includes(expected), text);
}

async function visibleTextElementCount(page: Page, text: string): Promise<number> {
  return page.evaluate((expected) => Array.from(document.querySelectorAll("body *")).filter((element) => {
    if (element.textContent?.includes(expected) !== true) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }).length, text);
}

async function visibleControls(page: Page, labels: readonly string[]): Promise<Readonly<Record<string, boolean>>> {
  const entries = await Promise.all(labels.map(async (label) => [label, await page.getByRole("button", { name: label }).isVisible()] as const));
  return Object.fromEntries(entries);
}

async function headingVisible(page: Page, name: string): Promise<boolean> {
  return page.getByRole("heading", { name }).isVisible();
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

async function hasNoInvalidAriaRefs(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const ids = new Set(Array.from(document.querySelectorAll("[id]")).map((element) => element.id));
    return Array.from(document.querySelectorAll("[aria-labelledby]")).every((element) => {
      const value = element.getAttribute("aria-labelledby");
      return value === null || value.split(/\s+/).every((id) => ids.has(id));
    });
  });
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

function mediaPayload(): object {
  return { id: IDS.media, workspace_id: IDS.workspace, schema_version: 1, revision: 1, run_id: IDS.run, title: "C25 source-backed video preview", media_type: "video", source_refs: ["artifact://research/c25/source-pack.json"], prompt_ref: "artifact://prompts/c25/video-script.md", model_ref: null, provider_ref: null, codec: "mp4:h264", duration_ms: 90000, caption_ref: "artifact://media/c25/captions.vtt", thumbnail_ref: "artifact://media/c25/thumbnail.png", preview_ref: "artifact://media/c25/preview.mp4", render_version: 1, moderation_status: "needs_review", share_policy: "review_required", temporary_url_expires_at: null, descriptor_only: true };
}

function renderJobPayload(): object {
  return { id: IDS.renderJob, workspace_id: IDS.workspace, schema_version: 1, media_artifact_id: IDS.media, run_id: IDS.run, worker_descriptor_id: "render-worker-c25-local-descriptor", status: "queued", input_hash: HASH, output_artifact_ref: null, retry_of_job_id: null, side_effect_policy: "none", descriptor_only: true };
}

function notebookPayload(): object {
  return { id: IDS.notebook, workspace_id: IDS.workspace, schema_version: 1, revision: 1, run_id: IDS.run, title: "C25 NotebookLM descriptor", source_policy: "snapshot_only", generation_policy: "local_descriptor_only", share_policy: "review_required", descriptor_only: true };
}

function notebookSourcePayload(): object {
  return { id: IDS.source, workspace_id: IDS.workspace, schema_version: 1, notebook_id: IDS.notebook, run_id: IDS.run, source_kind: "artifact_snapshot", source_ref: "artifact://research/c25/source-pack.json", source_hash: HASH, snapshot_ref: "artifact://notebooks/c25/source-pack.snapshot.json", title: "Market source pack", descriptor_only: true };
}

function notebookGenerationPayload(): object {
  return { id: IDS.generation, workspace_id: IDS.workspace, schema_version: 1, notebook_id: IDS.notebook, run_id: IDS.run, source_ids: [IDS.source], generation_kind: "brief", prompt_ref: "artifact://prompts/c25/notebook-brief.md", output_ref: "artifact://notebooks/c25/generated-brief.md", citation_refs: ["artifact://notebooks/c25/source-pack.snapshot.json#p1"], status: "draft", descriptor_only: true };
}

function avatarPayload(): object {
  return { id: IDS.avatar, workspace_id: IDS.workspace, schema_version: 1, revision: 1, run_id: IDS.run, display_name: "Founder avatar descriptor", consent_status: "approved", consent_artifact_ref: "artifact://avatars/c25/consent.json", face_source_hash: HASH, voice_source_hash: HASH, voice_clone_mode: "disabled", render_mode: "descriptor_only", expires_at: "2026-10-04T04:00:00.000Z", revoked_at: null, descriptor_only: true };
}

function sharePayload(): object {
  return { id: IDS.share, workspace_id: IDS.workspace, schema_version: 1, media_artifact_id: IDS.media, run_id: IDS.run, status: "pending_review", preview_ref: "artifact://media/c25/preview.mp4", expires_at: "2026-09-04T05:00:00.000Z", descriptor_only: true };
}
