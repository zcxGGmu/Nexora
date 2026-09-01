import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import { chromium, type Browser, type Page } from "@playwright/test";
import {
  GoalContinuationRepository,
  GoalLoopRepository,
  migrate,
  openDatabase,
  type SqliteDatabase,
} from "../../../../packages/persistence/src/index.ts";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const OTHER_WORKSPACE_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const ACTOR_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const AGENT_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const GOAL_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const TICKET_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01GRZ3NDEKTSV4RRFFQ69G5FAV";
const SESSION_ID = "01HRZ3NDEKTSV4RRFFQ69H5FAV";
const LOOP_ID = "01NRZ3NDEKTSV4RRFFQ69N5FAV";
const CONTINUATION_ID = "01PRZ3NDEKTSV4RRFFQ69P5FAV";
const TIME = "2026-09-01T08:00:00.000Z";
const DEADLINE = "2026-12-31T00:00:00.000Z";
const TOKEN_SECRET = "0123456789abcdef0123456789abcdef";

type OverflowSnapshot = {
  readonly htmlScrollWidth: number;
  readonly htmlClientWidth: number;
  readonly bodyScrollWidth: number;
  readonly bodyClientWidth: number;
  readonly overflow: boolean;
};

type AriaSnapshot = {
  readonly missingRefs: readonly string[];
  readonly invalidIds: readonly string[];
};

type ControlSnapshot = {
  readonly kind: string | null;
  readonly disabled: boolean;
  readonly text: string;
};

const cwd = process.cwd();
const timestamp = process.env["C20_VISUAL_QA_STAMP"] ?? timestampForFile(new Date());
const artifactDir = resolve(cwd, "artifacts/progress/c20/current-verification");
const dataDir = join(artifactDir, `visual-qa-data-rerun-${timestamp}`);
const dbPath = join(dataDir, "nexora.sqlite");
const apiLog = join(artifactDir, `c20-visual-api-rerun-${timestamp}.log`);
const webLog = join(artifactDir, `c20-visual-web-rerun-${timestamp}.log`);
const qaLog = join(artifactDir, `c20-visual-qa-rerun-${timestamp}.log`);
const summaryPath = join(artifactDir, `c20-visual-qa-summary-rerun-${timestamp}.json`);
const desktopPath = join(artifactDir, `c20-goal-mode-desktop-1440x900-rerun-${timestamp}.png`);
const postJudgePath = join(artifactDir, `c20-goal-mode-post-judge-1440x900-rerun-${timestamp}.png`);
const mobilePath = join(artifactDir, `c20-goal-mode-mobile-390x844-rerun-${timestamp}.png`);
const mobileControlsPath = join(artifactDir, `c20-goal-mode-mobile-controls-390x844-rerun-${timestamp}.png`);

mkdirSync(dataDir, { recursive: true });

const qaLines: string[] = [];

let apiProcess: ChildProcess | null = null;
let webProcess: ChildProcess | null = null;
let browser: Browser | null = null;

try {
  seedDatabase(dbPath);
  apiProcess = spawnLogged("pnpm", ["--filter", "@nexora/api", "start"], apiLog, {
    ...process.env,
    NEXORA_API_HOST: "127.0.0.1",
    NEXORA_API_PORT: "4310",
    NEXORA_AUTH_MODE: "local",
    NEXORA_CONTROL_TOKEN_SECRET: TOKEN_SECRET,
    NEXORA_DATA_DIR: dataDir,
    NEXORA_DB_PATH: dbPath,
    NEXORA_ENABLE_LOCAL_SESSION_BOOTSTRAP: "true",
    NEXORA_LOG_LEVEL: "info",
    NEXORA_MIGRATION_MODE: "auto",
  });
  webProcess = spawnLogged("pnpm", ["--filter", "@nexora/mission-control", "exec", "vite", "--host", "127.0.0.1", "--port", "4313"], webLog, {
    ...process.env,
    VITE_NEXORA_API_BASE_URL: "http://127.0.0.1:4310",
  });

  await waitForHttp("http://127.0.0.1:4310/v1/health");
  await waitForHttp("http://127.0.0.1:4313/goal-mode?workspace=ws-demo");

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const url = "http://127.0.0.1:4313/goal-mode?workspace=ws-demo";

  await page.goto(url, { waitUntil: "networkidle" });
  await waitForGoalMode(page);
  await assertVisibleText(page, "No external connection is opened");
  await assertVisibleText(page, "Judge JSON { done, reason }");
  await assertVisibleText(page, "Continuation cursor turn-2");
  await assertVisibleText(page, "Run scope 01GRZ3NDEKTSV4RRFFQ69G5FAV");
  await assertVisibleText(page, "Session scope 01HRZ3NDEKTSV4RRFFQ69H5FAV");
  await assertVisibleText(page, "Judge failure cannot claim success");

  const desktop = {
    viewport: "1440x900",
    overflow: await readOverflow(page),
    aria: await readAria(page),
    controls: await readControls(page),
    descriptorOnlyVisible: await textIsVisible(page, "Descriptor-only loop"),
  };
  assertNoOverflow(desktop.overflow, "desktop");
  assertNoAriaIssues(desktop.aria, "desktop");
  assertControls(desktop.controls);
  await page.screenshot({ path: desktopPath, fullPage: false });

  await clickControl(page, "pause");
  await assertVisibleText(page, "pause accepted; rereading Goal Mode projection.");
  await clickControl(page, "resume");
  await assertVisibleText(page, "resume accepted; rereading Goal Mode projection.");
  await clickControl(page, "steer");
  await assertVisibleText(page, "steer accepted; rereading Goal Mode projection.");
  forceWaitingJudge(dbPath);
  await page.reload({ waitUntil: "networkidle" });
  await waitForGoalMode(page);
  await clickControl(page, "judge");
  await assertVisibleText(page, "judge accepted; rereading Goal Mode projection.");
  await assertVisibleText(page, "Continuation cursor turn-3");
  await page.screenshot({ path: postJudgePath, fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: "networkidle" });
  await waitForGoalMode(page);
  const mobile = {
    viewport: "390x844",
    overflow: await readOverflow(page),
    aria: await readAria(page),
    navText: await page.locator('nav[aria-label="Mobile navigation"]').innerText(),
    navCount: await page.locator('nav[aria-label="Mobile navigation"] a').count(),
    controls: await readControls(page),
    descriptorOnlyVisible: await textIsVisible(page, "No external connection is opened"),
    cjkPresent: /[\u3400-\u9fff]/.test(await page.locator("body").innerText()),
  };
  assertNoOverflow(mobile.overflow, "mobile");
  assertNoAriaIssues(mobile.aria, "mobile");
  if (mobile.navCount !== 5) throw new Error(`Expected 5 mobile nav items, saw ${String(mobile.navCount)}`);
  assertControls(mobile.controls);
  await page.screenshot({ path: mobilePath, fullPage: false });
  await page.locator('[data-control-kind="subgoal"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: mobileControlsPath, fullPage: false });

  const summary = {
    url,
    timestamp,
    desktop,
    actions: {
      pauseFeedback: "pause accepted; rereading Goal Mode projection.",
      resumeFeedback: "resume accepted; rereading Goal Mode projection.",
      steerFeedback: "steer accepted; rereading Goal Mode projection.",
      judgeFeedback: "judge accepted; rereading Goal Mode projection.",
      afterJudgeCursor: "turn-3",
      descriptorOnly: true,
    },
    mobile,
    screenshots: [desktopPath, postJudgePath, mobilePath, mobileControlsPath],
    logs: { apiLog, webLog, qaLog },
  };
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  qaLines.push(JSON.stringify({ summary: summaryPath, screenshots: summary.screenshots }, null, 2));
  writeFileSync(qaLog, `${qaLines.join("\n")}\n`);
  console.log(JSON.stringify({ summary: summaryPath, screenshots: summary.screenshots }, null, 2));
} finally {
  if (browser !== null) await browser.close();
  await stopProcess(webProcess);
  await stopProcess(apiProcess);
}

function seedDatabase(path: string): void {
  const database = openDatabase(path);
  try {
    migrate(database, { now: () => TIME });
    seedWorkspaceGraph(database);
    seedRun(database);
    seedSession(database);
    new GoalLoopRepository(database).create({
      id: LOOP_ID,
      workspace_id: WORKSPACE_ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      goal_id: GOAL_ID,
      run_id: RUN_ID,
      session_id: SESSION_ID,
      parent_loop_id: null,
      root_loop_id: LOOP_ID,
      status: "running",
      objective: "Continue this goal until the judge reports done.",
      definition_of_done: ["Judge JSON has done true."],
      max_turns: 5,
      turn_count: 1,
      budget: { max_tokens: 20_000, max_cost_usd: 2 },
      deadline_at: DEADLINE,
      continuation_cursor: "turn-1",
      judge: null,
      descriptor_only: true,
    });
    new GoalContinuationRepository(database).record({
      id: CONTINUATION_ID,
      workspace_id: WORKSPACE_ID,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      goal_loop_id: LOOP_ID,
      run_id: RUN_ID,
      session_id: SESSION_ID,
      turn: 2,
      previous_cursor: "turn-1",
      cursor: "turn-2",
      judge: { done: false, reason: "Need one more verification turn." },
      idempotency_key: "goal:visual:seed-continuation",
      recovery_kind: "normal",
      descriptor_only: true,
    });
  } finally {
    database.close();
  }
}

function seedWorkspaceGraph(database: SqliteDatabase): void {
  const agent = { id: AGENT_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, purpose: "Coordinate", role: "Agent", allowed_scopes: [{ kind: "workspace", id: WORKSPACE_ID }], runtime: { kind: "local", adapter: "deterministic" }, model_policy: { allowed_models: ["deterministic"], default_model: "deterministic" }, memory_reads: [{ scope: "workspace" }], tools: { allow: ["memory:read"], deny: [] }, handoff_outputs: ["report"], requires_review: false };
  const goal = { id: GOAL_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, title: "Goal", objective: "Objective", definition_of_done: ["done"] };
  const ticket = { id: TICKET_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: GOAL_ID, status: "ready", definition_of_done: ["done"], assigned_agents: [AGENT_ID], approval_policy: { mode: "required" }, idempotency_key: "ticket:c20-visual" };
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Demo", TIME, TIME);
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(OTHER_WORKSPACE_ID, "Other", TIME, TIME);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(AGENT_ID, WORKSPACE_ID, JSON.stringify(agent), TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(GOAL_ID, WORKSPACE_ID, goal.title, goal.objective, JSON.stringify(goal.definition_of_done), JSON.stringify(goal), TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(TICKET_ID, WORKSPACE_ID, GOAL_ID, ticket.status, ticket.idempotency_key, JSON.stringify(ticket), TIME, TIME);
}

function seedRun(database: SqliteDatabase): void {
  const run = { id: RUN_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, ticket_id: TICKET_ID, execution_location: "local", status: "running", budget: { max_tokens: 10_000, max_cost_usd: 10 }, memory_snapshot: { snapshot_id: WORKSPACE_ID, version: 1 }, connector_versions: { deterministic: "1.0.0" } };
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(RUN_ID, WORKSPACE_ID, TICKET_ID, run.status, JSON.stringify(run), TIME, TIME);
}

function seedSession(database: SqliteDatabase): void {
  database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES ('gateway-c20-visual', ?, 'Gateway C20 Visual', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(WORKSPACE_ID, TIME, TIME, TIME);
  database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES ('channel-c20-visual', ?, 'gateway-c20-visual', 'Channel C20 Visual', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(WORKSPACE_ID, TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'gateway-c20-visual', 'channel-c20-visual', ?, ?, NULL, 'background', 'active', 'turn-2', NULL, ?, '{}', 1, ?, ?)").run(SESSION_ID, WORKSPACE_ID, AGENT_ID, RUN_ID, TIME, TIME, TIME);
}

function forceWaitingJudge(path: string): void {
  const database = openDatabase(path);
  try {
    database.prepare("UPDATE goal_loops SET status = 'waiting_judge', updated_at = ?, payload_json = json_set(payload_json, '$.status', 'waiting_judge', '$.updated_at', ?) WHERE workspace_id = ? AND id = ?").run(TIME, TIME, WORKSPACE_ID, LOOP_ID);
  } finally {
    database.close();
  }
}

function spawnLogged(command: string, args: readonly string[], logPath: string, env: NodeJS.ProcessEnv): ChildProcess {
  const output = createWriteStream(logPath, { flags: "a" });
  const child = spawn(command, [...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(output);
  child.stderr.pipe(output);
  return child;
}

async function waitForHttp(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
      lastError = `HTTP ${String(response.status)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function waitForGoalMode(page: Page): Promise<void> {
  await page.locator("#goal-mode-title").waitFor({ state: "visible", timeout: 20_000 });
}

async function assertVisibleText(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 10_000 });
}

async function textIsVisible(page: Page, text: string): Promise<boolean> {
  return page.getByText(text, { exact: false }).first().isVisible();
}

async function clickControl(page: Page, kind: string): Promise<void> {
  await page.locator(`[data-control-kind="${kind}"]`).click();
}

async function readControls(page: Page): Promise<readonly ControlSnapshot[]> {
  return page.locator("[data-control-kind]").evaluateAll((elements) => elements.map((element) => {
    const button = element instanceof HTMLButtonElement ? element : null;
    return {
      kind: element.getAttribute("data-control-kind"),
      disabled: button?.disabled ?? false,
      text: element.textContent?.trim() ?? "",
    };
  }));
}

async function readOverflow(page: Page): Promise<OverflowSnapshot> {
  return page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return {
      htmlScrollWidth: html.scrollWidth,
      htmlClientWidth: html.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      overflow: html.scrollWidth > html.clientWidth || body.scrollWidth > body.clientWidth,
    };
  });
}

async function readAria(page: Page): Promise<AriaSnapshot> {
  return page.evaluate(() => {
    const ids = new Set(Array.from(document.querySelectorAll("[id]"), (element) => element.id));
    const missingRefs: string[] = [];
    const invalidIds = Array.from(ids).filter((id) => /\s/.test(id));
    for (const element of Array.from(document.querySelectorAll("[aria-labelledby]"))) {
      const value = element.getAttribute("aria-labelledby");
      if (value === null) continue;
      for (const id of value.split(/\s+/).filter(Boolean)) {
        if (!ids.has(id)) missingRefs.push(id);
      }
    }
    return { missingRefs, invalidIds };
  });
}

function assertNoOverflow(snapshot: OverflowSnapshot, label: string): void {
  if (snapshot.overflow) throw new Error(`${label} has horizontal overflow: ${JSON.stringify(snapshot)}`);
}

function assertNoAriaIssues(snapshot: AriaSnapshot, label: string): void {
  if (snapshot.missingRefs.length > 0 || snapshot.invalidIds.length > 0) throw new Error(`${label} aria issues: ${JSON.stringify(snapshot)}`);
}

function assertControls(controls: readonly ControlSnapshot[]): void {
  const expected = ["pause", "resume", "steer", "judge", "resume-command", "subgoal"];
  const present = new Set(controls.map((control) => control.kind));
  for (const kind of expected) {
    if (!present.has(kind)) throw new Error(`Missing Goal Mode control ${kind}`);
  }
}

async function stopProcess(child: ChildProcess | null): Promise<void> {
  if (child === null || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([onceExit(child), delay(2_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function onceExit(child: ChildProcess): Promise<void> {
  return new Promise((resolveOnce) => {
    child.once("exit", () => resolveOnce());
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function timestampForFile(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}${value("month")}${value("day")}-${value("hour")}${value("minute")}${value("second")}`;
}
