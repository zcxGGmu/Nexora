import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cwd = "/Users/zq/Desktop/ai-projs/posp/Nexora";
const attemptDir = join(cwd, "artifacts/progress/c21/current-verification");
mkdirSync(attemptDir, { recursive: true });

const stamp = "20260902-" + timeStamp();
const apiLog = join(attemptDir, "c21-manual-qa-api-" + stamp + ".log");
const uiLog = join(attemptDir, "c21-manual-qa-ui-" + stamp + ".log");
const serverLog = join(attemptDir, "c21-manual-qa-servers-" + stamp + ".log");
const summaryJson = join(attemptDir, "c21-manual-qa-summary-" + stamp + ".json");
const desktopPng = join(attemptDir, "c21-skills-learning-desktop-1440x900-" + stamp + ".png");
const postPng = join(attemptDir, "c21-skills-learning-post-actions-1440x900-" + stamp + ".png");
const mobilePng = join(attemptDir, "c21-skills-learning-mobile-390x844-" + stamp + ".png");
const invalidPng = join(attemptDir, "c21-skills-learning-invalid-workspace-390x844-" + stamp + ".png");
const operatorLearnInput = {
  lesson: "Require current browser screenshots before Skills/Learning signoff.",
  proposed_diff_summary: "Add operator-provided visual evidence guidance to the skill.",
  evidence_refs: ["artifact://progress/c21/operator-visual-qa.json", "workspace://Skills/visual-qa/review.md"],
};

const tmpRoot = spawnSync("mktemp", ["-d", join(tmpdir(), "nexora-c21-manual-qa.XXXXXX")], { encoding: "utf8" }).stdout.trim();
const dbPath = join(tmpRoot, "nexora.sqlite");
const secret = randomBytes(32).toString("hex");
const apiPort = freePort(45261);
const webPort = 4313;
const serverFd = openSync(serverLog, "a");
const processes = [];
let apiProcess = null;
let webProcess = null;

try {
  if (portInUse(webPort)) throw new Error("Mission Control QA port 4313 is occupied");
  seedDatabase();
  startApi();
  await runBrowser();
  const ui = JSON.parse(readFileSync(uiLog, "utf8"));
  const summary = {
    stamp,
    verdict: "PASS",
    surface: "Browser UI localhost /skills",
    url: "http://127.0.0.1:4313/skills?workspace=ws-demo",
    apiBase: "http://127.0.0.1:" + apiPort,
    dbPath,
    apiLog,
    uiLog,
    serverLog,
    runner: join(attemptDir, "c21-manual-qa-runner.mjs"),
    screenshots: [desktopPng, postPng, mobilePng, invalidPng],
    observations: ui.observations,
    apiResponses: ui.apiResponses,
    externalRequests: ui.externalRequests,
  };
  writeFileSync(summaryJson, JSON.stringify(summary, null, 2));
  process.stdout.write(summaryJson + "\n");
} catch (error) {
  writeFileSync(summaryJson, JSON.stringify({ stamp, verdict: "FAIL", blocker: formatError(error), apiLog, uiLog, serverLog }, null, 2));
  console.error(formatError(error));
  process.exitCode = 1;
} finally {
  cleanup();
}

function seedDatabase() {
  const seedCode = String.raw`
import { openDatabase, migrate } from "@nexora/persistence";
import { LearningSourceEventSchema } from "@nexora/contracts";
import { GoalLoopRepository, SkillInstallationRepository, SkillInvocationFactRepository, SkillRepository, SkillReviewRepository, SkillScanRepository, SkillSourceRepository, SkillVersionRepository } from "@nexora/persistence";

const TIME = "2026-09-02T04:00:00.000Z";
const DEADLINE = "2026-09-02T05:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DIFF_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  otherWorkspace: "01BRZ3NDEKTSV4RRFFQ69H5FAV",
  agent: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  gateway: "gateway-c21-visual",
  channel: "channel-c21-visual",
  session: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  loop: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  skill: "skill-visual-qa",
  version: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  source: "01KRZ3NDEKTSV4RRFFQ69K5FAV",
  scan: "01MRZ3NDEKTSV4RRFFQ69M5FAV",
  review: "01NRZ3NDEKTSV4RRFFQ69N5FAV",
  install: "01PRZ3NDEKTSV4RRFFQ69P5FAV",
  invocation: "01QRZ3NDEKTSV4RRFFQ69Q5FAV",
  sourceEvent: "01RRZ3NDEKTSV4RRFFQ69R5FAV",
};

const database = openDatabase(process.env.NEXORA_DB_PATH);
migrate(database, { now: () => TIME });
database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'C21 Visual QA', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'C21 Other', 1, ?, ?)").run(IDS.otherWorkspace, TIME, TIME);
database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, '{}', 1, ?, ?)").run(IDS.agent, IDS.workspace, TIME, TIME);
database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'Learning goal', 'Record descriptor-only learning corrections.', '[\"candidate reviewed\"]', '{}', 1, ?, ?)").run(IDS.goal, IDS.workspace, TIME, TIME);
database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'ready', 'ticket:c21-visual', '{}', 1, ?, ?)").run(IDS.ticket, IDS.workspace, IDS.goal, TIME, TIME);
database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.ticket, TIME, TIME);
database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'C21 Skills Gateway', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(IDS.gateway, IDS.workspace, TIME, TIME, TIME);
database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'C21 Skills Channel', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(IDS.channel, IDS.workspace, IDS.gateway, TIME, TIME);
database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'background', 'active', 'turn-1', NULL, ?, '{}', 1, ?, ?)").run(IDS.session, IDS.workspace, IDS.gateway, IDS.channel, IDS.agent, IDS.run, TIME, TIME, TIME);
new GoalLoopRepository(database).create({ id: IDS.loop, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, run_id: IDS.run, session_id: IDS.session, parent_loop_id: null, root_loop_id: IDS.loop, status: "running", objective: "Learn from corrections.", definition_of_done: ["Learning candidate is reviewed."], max_turns: 5, turn_count: 1, budget: { max_tokens: 10000, max_cost_usd: 1 }, deadline_at: DEADLINE, continuation_cursor: "turn-1", judge: { done: false, reason: "Continue." }, descriptor_only: true });
const sourceEvent = LearningSourceEventSchema.parse({ event_id: IDS.sourceEvent, event_type: "learning.source", schema_version: 1, occurred_at: TIME, workspace_id: IDS.workspace, scope: { kind: "run", id: IDS.run }, trace_id: IDS.workspace, run_id: IDS.run, attempt_id: null, step_id: null, actor: { type: "system", id: null }, payload: { descriptor_only: true, proposed_skill_id: IDS.skill, goal_loop_id: IDS.loop, continuation_cursor: "turn-1" }, redactions: [], sequence: 0 });
database.prepare("INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, 0, 'learning.source', ?, ?, ?, NULL, NULL, ?, 1)").run(IDS.sourceEvent, IDS.workspace, IDS.run, TIME, TIME, IDS.workspace, JSON.stringify(sourceEvent));
const skills = new SkillRepository(database);
skills.create({ id: IDS.skill, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, name: "Visual QA", description: "Captures reusable visual QA rules.", status: "draft", current_version_id: null, approved_version_id: null, capabilities: ["qa:visual"], tags: ["qa"], quarantine_reason: null, descriptor_only: true });
new SkillVersionRepository(database).create({ id: IDS.version, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: IDS.skill, semver: "1.0.0", status: "approved", source_hash: HASH, snapshot_hash: HASH, snapshot_ref: "artifact://skills/visual-qa/1.0.0/SKILL.md", diff_hash: DIFF_HASH, diff_summary: "Adds a visual QA learning rule.", approved_at: TIME, approved_by: "owner:michael", revoked_at: null, rollback_to_version_id: null, descriptor_only: true });
new SkillSourceRepository(database).record({ id: IDS.source, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: IDS.skill, version_id: IDS.version, source_kind: "workspace", source_ref: "workspace://Skills/visual-qa/SKILL.md", source_hash: HASH, diff_hash: DIFF_HASH, diff_summary: "Adds a reusable visual QA correction.", descriptor_only: true });
new SkillScanRepository(database).record({ id: IDS.scan, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: IDS.skill, version_id: IDS.version, source_hash: HASH, status: "passed", findings: [], secret_findings: 0, scanned_at: TIME, descriptor_only: true });
new SkillReviewRepository(database).record({ id: IDS.review, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: IDS.skill, version_id: IDS.version, scan_id: IDS.scan, decision: "approve", reviewer_ref: "owner:michael", reason: "Reviewed source hash and approved snapshot.", approved_snapshot_hash: HASH, decided_at: TIME, descriptor_only: true });
skills.update({ id: IDS.skill, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, name: "Visual QA", description: "Captures reusable visual QA rules.", status: "active", current_version_id: IDS.version, approved_version_id: IDS.version, capabilities: ["qa:visual"], tags: ["qa"], quarantine_reason: null, descriptor_only: true }, 1);
new SkillInstallationRepository(database).install({ id: IDS.install, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: IDS.skill, version_id: IDS.version, status: "installed", approved_snapshot_hash: HASH, installed_at: TIME, revoked_at: null, quarantine_reason: null, rollback_to_version_id: null, descriptor_only: true });
new SkillInvocationFactRepository(database).record({ id: IDS.invocation, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: IDS.skill, version_id: IDS.version, installation_id: IDS.install, run_id: IDS.run, goal_loop_id: IDS.loop, status: "allowed", snapshot_hash: HASH, reason: "Installed version matches the approved snapshot.", descriptor_only: true });
database.close();
`;
  const result = spawnSync("pnpm", ["exec", "tsx", "-e", seedCode], { cwd, env: { ...process.env, NEXORA_DB_PATH: dbPath }, encoding: "utf8" });
  appendFileSync(serverLog, result.stdout + result.stderr);
  if (result.status !== 0) throw new Error("Database seed failed with exit " + result.status);
}

function startApi() {
  apiProcess = spawn("pnpm", ["--filter", "@nexora/api", "start"], {
    cwd,
    env: { ...process.env, NEXORA_DATA_DIR: tmpRoot, NEXORA_DB_PATH: dbPath, NEXORA_CONTROL_TOKEN_SECRET: secret, NEXORA_ENABLE_LOCAL_SESSION_BOOTSTRAP: "true", NEXORA_API_HOST: "127.0.0.1", NEXORA_API_PORT: String(apiPort), NEXORA_LOG_LEVEL: "info" },
    stdio: ["ignore", serverFd, serverFd],
  });
  processes.push(apiProcess);
  waitForHttp("http://127.0.0.1:" + apiPort + "/v1/health", 200, 30000);
  writeFileSync(apiLog, "C21 manual QA local API\nAPI base: http://127.0.0.1:" + apiPort + "\nTemporary DB: " + dbPath + "\n");
}

async function runBrowser() {
  webProcess = spawn("pnpm", ["--filter", "@nexora/mission-control", "exec", "vite", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], {
    cwd,
    env: { ...process.env, VITE_NEXORA_API_BASE_URL: "http://127.0.0.1:" + apiPort },
    stdio: ["ignore", serverFd, serverFd],
  });
  processes.push(webProcess);
  waitForHttp("http://127.0.0.1:" + webPort + "/skills?workspace=ws-demo", 200, 30000);

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const apiBase = "http://127.0.0.1:" + apiPort;
  const webBase = "http://127.0.0.1:" + webPort;
  const apiResponses = [];
  const externalRequests = [];
  const actionResponses = [];
  const allowedHostnames = new Set(["127.0.0.1", "localhost"]);

  try {
  await page.route("**/*", (route) => {
    const requestUrl = route.request().url();
    let parsed = null;
    try { parsed = new URL(requestUrl); } catch {}
    if (parsed !== null && ["http:", "https:", "ws:", "wss:"].includes(parsed.protocol) && !allowedHostnames.has(parsed.hostname)) {
      externalRequests.push({ method: route.request().method(), url: requestUrl });
      return route.abort();
    }
    return route.continue();
  });
  page.on("websocket", (ws) => {
    const url = new URL(ws.url());
    if (!allowedHostnames.has(url.hostname)) externalRequests.push({ method: "WEBSOCKET", url: ws.url() });
  });
  page.on("response", (response) => {
    if (response.url().startsWith(apiBase)) {
      const url = new URL(response.url());
      apiResponses.push({ method: response.request().method(), status: response.status(), path: url.pathname });
    }
  });

  const observations = [];
  await page.goto(webBase + "/skills?workspace=ws-demo", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Skills & Learning" }).waitFor({ timeout: 10000 });
  await page.getByRole("heading", { name: "Visual QA" }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: desktopPng });
  const desktopText = await page.locator("body").innerText();
  observations.push({ viewport: "desktop", labels: sectionSnapshot(desktopText, await controlsSnapshot(page)), layout: await layoutSnapshot(page, "desktop") });

  await page.getByLabel("Learning lesson").fill(operatorLearnInput.lesson);
  await page.getByLabel("Learning diff summary").fill(operatorLearnInput.proposed_diff_summary);
  await page.getByLabel("Learning evidence refs").fill(operatorLearnInput.evidence_refs.join("\n"));

  const learnPromise = page.waitForResponse((response) => response.url().startsWith(apiBase + "/v1/learning/candidates") && response.request().method() === "POST");
  await page.locator('[data-control-kind="learn"]').click();
  const learnResponse = await learnPromise;
  const learnPayload = learnResponse.request().postDataJSON();
  actionResponses.push({ action: "learn", status: learnResponse.status(), path: new URL(learnResponse.url()).pathname, lesson: learnPayload.lesson, proposed_diff_summary: learnPayload.proposed_diff_summary, evidence_refs: learnPayload.evidence_refs });
  assertEqual(learnPayload.lesson, operatorLearnInput.lesson, "/learn must submit operator-provided lesson");
  assertEqual(learnPayload.proposed_diff_summary, operatorLearnInput.proposed_diff_summary, "/learn must submit operator-provided diff summary");
  assertEqual(JSON.stringify(learnPayload.evidence_refs), JSON.stringify(operatorLearnInput.evidence_refs), "/learn must submit operator-provided evidence refs");
  await page.getByText("/learn accepted; rereading Skills/Learning projection.").waitFor({ timeout: 10000 });
  await page.getByText(/1 pending/).waitFor({ timeout: 10000 });

  const approvePromise = page.waitForResponse((response) => response.url().includes("/v1/skills/skill-visual-qa/approve") && response.request().method() === "POST");
  await page.locator('[data-control-kind="approve"]').click();
  const approveResponse = await approvePromise;
  actionResponses.push({ action: "approve", status: approveResponse.status(), path: new URL(approveResponse.url()).pathname });
  await page.getByText("approve accepted; rereading Skills/Learning projection.").waitFor({ timeout: 10000 });

  const quarantinePromise = page.waitForResponse((response) => response.url().includes("/v1/skills/skill-visual-qa/quarantine") && response.request().method() === "POST");
  await page.locator('[data-control-kind="quarantine"]').click();
  const quarantineResponse = await quarantinePromise;
  actionResponses.push({ action: "quarantine", status: quarantineResponse.status(), path: new URL(quarantineResponse.url()).pathname });
  await page.getByText("quarantine accepted; rereading Skills/Learning projection.").waitFor({ timeout: 10000 });
  await page.getByText("Install quarantined").waitFor({ timeout: 10000 });
  await page.screenshot({ path: postPng });
  observations.push({ actions: actionResponses, feedback: await latestStatus(page), labelsAfterActions: sectionSnapshot(await page.locator("body").innerText(), await controlsSnapshot(page)) });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(webBase + "/skills?workspace=ws-demo", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Skills & Learning" }).waitFor({ timeout: 10000 });
  await page.getByRole("heading", { name: "Visual QA" }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: mobilePng });
  const mobileText = await page.locator("body").innerText();
  observations.push({ viewport: "mobile", mobileNavCount: await page.locator(".mobile-nav a").count(), labels: sectionSnapshot(mobileText, await controlsSnapshot(page)), layout: await layoutSnapshot(page, "mobile") });

  const beforeInvalidCount = apiResponses.length;
  await page.goto(webBase + "/skills?workspace=not-a-workspace", { waitUntil: "domcontentloaded" });
  await page.getByText("Invalid Skills/Learning workspace scope").waitFor({ timeout: 10000 });
  await page.screenshot({ path: invalidPng });
  observations.push({ invalidWorkspace: true, apiRequestsDuringInvalidWorkspace: apiResponses.length - beforeInvalidCount, layout: await layoutSnapshot(page, "invalid-mobile") });

  await browser.close();
  writeFileSync(uiLog, JSON.stringify({ observations, apiResponses, externalRequests, screenshots: [desktopPng, postPng, mobilePng, invalidPng] }, null, 2));
  assertEqual(externalRequests.length, 0, "Browser must not request external hosts");
  assertEqual(actionResponses.every((response) => response.status === 202), true, "Browser controls must receive 202 API responses");
  assertEqual(observations.some((entry) => entry.viewport === "mobile" && entry.mobileNavCount === 5), true, "Mobile bottom navigation must keep five items");
  for (const observation of observations) {
    if (observation.layout !== undefined) {
      assertEqual(observation.layout.scrollWidth <= observation.layout.clientWidth, true, observation.layout.label + " must not horizontally overflow");
      assertEqual(observation.layout.invalidAriaReferences.length, 0, observation.layout.label + " must not have invalid aria-labelledby references");
      assertEqual(observation.layout.overflowing.length, 0, observation.layout.label + " must not have overflowing elements");
    }
  }
  assertNonEmpty(desktopPng);
  assertNonEmpty(postPng);
  assertNonEmpty(mobilePng);
  assertNonEmpty(invalidPng);
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}

async function controlsSnapshot(page) {
  return page.locator("button.row-action").evaluateAll((buttons) => buttons.map((button) => ({ text: button.textContent === null ? "" : button.textContent.trim(), disabled: button.hasAttribute("disabled"), controlKind: button.getAttribute("data-control-kind") })));
}

async function latestStatus(page) {
  return page.locator('[role="status"]').last().innerText().catch(() => null);
}

async function layoutSnapshot(page, label) {
  return page.evaluate((snapshotLabel) => {
    const invalidAriaReferences = [];
    document.querySelectorAll("[aria-labelledby]").forEach((node) => {
      const ids = (node.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
      for (const id of ids) if (document.getElementById(id) === null) invalidAriaReferences.push(node.tagName.toLowerCase() + "#" + id);
    });
    const overflowing = [];
    document.querySelectorAll("body *").forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && (rect.right > document.documentElement.clientWidth + 1 || rect.left < -1)) overflowing.push(node.tagName.toLowerCase());
    });
    return { label: snapshotLabel, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, tableCount: document.querySelectorAll("table").length, cjkTextPresent: /[\u3400-\u9fff]/.test(document.body.innerText), invalidAriaReferences, overflowing: Array.from(new Set(overflowing)).slice(0, 20) };
  }, label);
}

function sectionSnapshot(text, controls) {
  const labels = ["Skills & Learning", "Descriptor-only learning", "No external connection", "Approved snapshot", "Source hash", "Scan", "Review", "Approve", "Install", "Revoke", "Quarantine", "Rollback", "/learn", "Learning lesson", "Learning diff summary", "Learning evidence refs", "No real MCP execution", "No URL/PDF/credential reads", "Learning queue"];
  const visible = Object.fromEntries(labels.map((label) => [label, text.includes(label)]));
  return { visible, controls, allRequiredLabelsVisible: labels.every((label) => visible[label] === true) };
}

function waitForHttp(url, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = spawnSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", url], { encoding: "utf8" });
    if (result.stdout.trim() === String(expected)) return;
    spawnSync("sleep", ["0.25"]);
  }
  throw new Error("Timed out waiting for " + url + " status " + expected);
}

function freePort(start) {
  let port = start;
  while (portInUse(port)) port += 1;
  return port;
}

function portInUse(port) {
  return spawnSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], { encoding: "utf8" }).status === 0;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message + ": expected " + JSON.stringify(expected) + " got " + JSON.stringify(actual));
}

function assertNonEmpty(path) {
  if (statSync(path).size <= 0) throw new Error(path + " is empty");
}

function cleanup() {
  if (webProcess !== null) webProcess.kill();
  if (apiProcess !== null) apiProcess.kill();
  for (const child of processes) if (child.exitCode === null) child.kill();
}

function timeStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
}

function formatError(error) {
  return error instanceof Error && error.stack !== undefined ? error.stack : String(error);
}
