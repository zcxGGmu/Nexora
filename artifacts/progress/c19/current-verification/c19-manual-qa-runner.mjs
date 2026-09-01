import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, openSync, writeFileSync, appendFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = '/Users/zq/Desktop/ai-projs/posp/Nexora';
const attemptDir = join(cwd, 'artifacts/progress/c19/current-verification');
mkdirSync(attemptDir, { recursive: true });

const stamp = '20260901-' + timeStamp();
const apiLog = join(attemptDir, 'c19-manual-qa-api-curl-' + stamp + '.log');
const uiLog = join(attemptDir, 'c19-manual-qa-ui-browser-' + stamp + '.log');
const serverLog = join(attemptDir, 'c19-manual-qa-servers-' + stamp + '.log');
const diffLog = join(attemptDir, 'c19-manual-qa-diff-inspection-' + stamp + '.log');
const summaryJson = join(attemptDir, 'c19-manual-qa-summary-' + stamp + '.json');
const desktopPng = join(attemptDir, 'c19-manual-qa-gateway-desktop-' + stamp + '.png');
const postPng = join(attemptDir, 'c19-manual-qa-gateway-post-actions-' + stamp + '.png');
const mobilePng = join(attemptDir, 'c19-manual-qa-gateway-mobile-' + stamp + '.png');
const invalidPng = join(attemptDir, 'c19-manual-qa-gateway-invalid-workspace-' + stamp + '.png');

const tmpRoot = spawnSync('mktemp', ['-d', join(tmpdir(), 'nexora-c19-manual-qa.XXXXXX')], { encoding: 'utf8' }).stdout.trim();
const dbPath = join(tmpRoot, 'nexora.sqlite');
const secret = randomBytes(32).toString('hex');
const workspace = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const otherWorkspace = '01BRZ3NDEKTSV4RRFFQ69G5FAV';
const owner = '01CRZ3NDEKTSV4RRFFQ69G5FAV';
const viewer = '01VRZ3NDEKTSV4RRFFQ69G5FAV';
const gatewayId = 'gateway-manual-c19';
const channelId = 'channel-manual-api';
const sessionActive = '01SRZ3NDEKTSV4RRFFQ69G5FAV';
const sessionBg = '01TRZ3NDEKTSV4RRFFQ69G5FAV';
const sessionClosed = '01YRZ3NDEKTSV4RRFFQ69Y5FAV';
const sessionError = '01WRZ3NDEKTSV4RRFFQ69Y5FAV';
const nowIso = '2026-08-31T00:00:00.000Z';

let apiPort = 45219;
while (portInUse(apiPort)) apiPort += 1;
const webPort = 4313;
if (portInUse(webPort)) failEarly({ blocker: 'Mission Control QA port 4313 is occupied' });

const serverFd = openSync(serverLog, 'a');
const processes = [];
const httpArtifacts = new Map();
let apiProcess = null;
let webProcess = null;

try {
  inspectDiff();
  seedDatabase();
  const ownerToken = makeToken(workspace, owner, 'Owner');
  const viewerToken = makeToken(workspace, viewer, 'Viewer');
  const otherOwnerToken = makeToken(otherWorkspace, owner, 'Owner');

  startApi();
  appendFileSync(apiLog, 'C19 manual QA live API run ' + stamp + '\nTemporary DB: ' + dbPath + '\nAPI base: http://127.0.0.1:' + apiPort + '\n');
  curlScenario('api-health', 200, ['http://127.0.0.1:' + apiPort + '/v1/health']);
  curlScenario('cors-preflight', 204, ['-X', 'OPTIONS', 'http://127.0.0.1:' + apiPort + '/v1/gateways?workspace_id=' + workspace, '-H', 'Origin: http://127.0.0.1:' + webPort, '-H', 'Access-Control-Request-Method: GET', '-H', 'Access-Control-Request-Headers: authorization,content-type,idempotency-key,if-match']);

  const gatewayPayload = {
    schema_version: 1, id: gatewayId, workspace_id: workspace, created_at: nowIso, updated_at: nowIso,
    name: 'Manual QA Gateway', kind: 'custom', version: '1.0.0', requested_version: null, actual_version: null,
    protocol_version: 1, capabilities: ['messaging', 'sessions', 'cursor-resume'], health: 'healthy', status: 'connected',
    enabled: true, execution_location: 'local', endpoint_ref: null, data_classification: 'internal', last_heartbeat_at: null, revision: 1,
  };
  const channelPayload = {
    schema_version: 1, id: channelId, workspace_id: workspace, created_at: nowIso, updated_at: nowIso,
    gateway_id: gatewayId, name: 'Manual API Channel', kind: 'api', version: '1.0.0', status: 'connected', enabled: true,
    capabilities: ['messages', 'receipts'], credential_ref: null, endpoint_ref: null, allowlist_mode: 'deny_by_default', data_classification: 'internal', revision: 1,
  };

  postJson('create-gateway-owner', 202, ownerToken, 'qa:gateway:create', null, '/v1/gateways', gatewayPayload);
  postJson('create-channel-owner', 202, ownerToken, 'qa:channel:create', null, '/v1/channels', channelPayload);
  postJson('create-session-foreground', 202, ownerToken, 'qa:session:fg:create', null, '/v1/sessions', sessionPayload(sessionActive, 'foreground', 'active', null));
  postJson('create-session-background', 202, ownerToken, 'qa:session:bg:create', null, '/v1/sessions', sessionPayload(sessionBg, 'background', 'paused', 'bg:0'));
  postJson('create-session-closed', 202, ownerToken, 'qa:session:closed:create', null, '/v1/sessions', sessionPayload(sessionClosed, 'foreground', 'closed', null));
  postJson('create-session-error', 202, ownerToken, 'qa:session:error:create', null, '/v1/sessions', sessionPayload(sessionError, 'foreground', 'error', null));
  postJson('create-allowlist-active', 202, ownerToken, 'qa:allow:active', null, '/v1/allowlist', allowPayload('01AMZ3NDEKTSV4RRFFQ69G5FAV', 'qa-allowed', 'allow', '2027-01-01T00:00:00.000Z'));
  postJson('create-allowlist-expired', 202, ownerToken, 'qa:allow:expired', null, '/v1/allowlist', allowPayload('01BNZ3NDEKTSV4RRFFQ69G5FAV', 'qa-expired', 'allow', '2026-01-01T00:00:00.000Z'));

  getJson('viewer-read-gateways', 200, viewerToken, '/v1/gateways?workspace_id=' + workspace);
  postJson('viewer-write-denied', 403, viewerToken, 'qa:viewer:write', null, '/v1/channels', channelPayload);
  getJson('other-workspace-read-denied', 403, otherOwnerToken, '/v1/gateways?workspace_id=' + workspace);

  postJson('send-default-deny-no-entry', 403, ownerToken, 'qa:msg:deny:noentry', null, '/v1/sessions/' + sessionActive + '/messages', messagePayload('outbound', 'queued', 1, 'cursor:deny', '01DRZ3NDEKTSV4RRFFQ69D5FAV', 'owner', 'qa-denied', 'blocked no entry'));
  postJson('send-expired-allowlist-denied', 403, ownerToken, 'qa:msg:deny:expired', null, '/v1/sessions/' + sessionActive + '/messages', messagePayload('outbound', 'queued', 1, 'cursor:expired', '01ERZ3NDEKTSV4RRFFQ69E5FAV', 'owner', 'qa-expired', 'blocked expired'));
  getJson('deliveries-after-deny', 200, ownerToken, '/v1/deliveries?workspace_id=' + workspace);
  assertEqual(jsonBody('deliveries-after-deny').deliveries.length, 0, 'Denied sends must not create delivery receipts');

  postJson('send-allowlisted-message-1', 202, ownerToken, 'qa:msg:allow:1', null, '/v1/sessions/' + sessionActive + '/messages', messagePayload('outbound', 'queued', 1, 'cursor:1', '01FRZ3NDEKTSV4RRFFQ69F5FAV', 'owner', 'qa-allowed', 'allowed one'));
  const message1 = jsonBody('send-allowlisted-message-1').object_id;
  postJson('send-allowlisted-message-1-replay', 202, ownerToken, 'qa:msg:allow:1', null, '/v1/sessions/' + sessionActive + '/messages', messagePayload('outbound', 'queued', 1, 'cursor:1', '01FRZ3NDEKTSV4RRFFQ69F5FAV', 'owner', 'qa-allowed', 'allowed one'));
  const message1Replay = jsonBody('send-allowlisted-message-1-replay').object_id;
  assertEqual(message1Replay, message1, 'Message idempotency replay must return same object_id');
  postJson('send-allowlisted-message-1-key-reuse-different', 409, ownerToken, 'qa:msg:allow:1', null, '/v1/sessions/' + sessionActive + '/messages', messagePayload('outbound', 'queued', 1, 'cursor:1', '01GRZ3NDEKTSV4RRFFQ69G5FAV', 'owner', 'qa-allowed', 'different payload'));
  postJson('send-allowlisted-message-2', 202, ownerToken, 'qa:msg:allow:2', null, '/v1/sessions/' + sessionActive + '/messages', messagePayload('outbound', 'queued', 2, 'cursor:2', '01HRZ3NDEKTSV4RRFFQ69H5FAV', 'owner', 'qa-allowed', 'allowed two'));
  const message2 = jsonBody('send-allowlisted-message-2').object_id;

  getJson('messages-limit-page1', 200, ownerToken, '/v1/sessions/' + sessionActive + '/messages?workspace_id=' + workspace + '&limit=1');
  const pageCursor = jsonBody('messages-limit-page1').next_cursor;
  getJson('messages-page2-after-next-cursor', 200, ownerToken, '/v1/sessions/' + sessionActive + '/messages?workspace_id=' + workspace + '&after=' + encodeURIComponent(pageCursor) + '&limit=1');
  getJson('messages-page-after-literal-cursor', 200, ownerToken, '/v1/sessions/' + sessionActive + '/messages?workspace_id=' + workspace + '&after=' + encodeURIComponent('cursor:1') + '&limit=10');
  getJson('cursor-checkpoint', 200, ownerToken, '/v1/sessions/' + sessionActive + '/cursor?workspace_id=' + workspace);
  assertEqual(jsonBody('cursor-checkpoint').checkpoint.cursor, 'cursor:2', 'Cursor checkpoint must advance to latest comparable cursor');

  postJson('send-closed-session-rejected', 409, ownerToken, 'qa:msg:closed', null, '/v1/sessions/' + sessionClosed + '/messages', messagePayload('outbound', 'queued', 1, 'cursor:closed', '01JRZ3NDEKTSV4RRFFQ69J5FAV', 'owner', 'qa-allowed', 'closed reject'));
  postJson('send-error-session-rejected', 409, ownerToken, 'qa:msg:error', null, '/v1/sessions/' + sessionError + '/messages', messagePayload('outbound', 'queued', 1, 'cursor:error', '01KRZ3NDEKTSV4RRFFQ69K5FAV', 'owner', 'qa-allowed', 'error reject'));

  getJson('session-before-controls', 200, ownerToken, '/v1/sessions/' + sessionActive + '?workspace_id=' + workspace);
  const controlStartRevision = jsonBody('session-before-controls').session.revision;
  const pausePayload = commandPayload(sessionActive, 'pause', 'qa:session:pause', controlStartRevision, 'cursor:2', null, '01PMZ3NDEKTSV4RRFFQ69G5FAV');
  postJson('session-pause', 202, ownerToken, 'qa:session:pause', String(controlStartRevision), '/v1/sessions/' + sessionActive + '/pause', pausePayload);
  postJson('session-pause-exact-replay-after-revision-change', 202, ownerToken, 'qa:session:pause', String(controlStartRevision), '/v1/sessions/' + sessionActive + '/pause', pausePayload);
  postJson('session-resume-stale-if-match', 409, ownerToken, 'qa:session:resume:stale', String(controlStartRevision), '/v1/sessions/' + sessionActive + '/resume', commandPayload(sessionActive, 'resume', 'qa:session:resume:stale', controlStartRevision, 'cursor:2', null, '01RMZ3NDEKTSV4RRFFQ69G5FAV'));
  postJson('session-resume', 202, ownerToken, 'qa:session:resume', String(controlStartRevision + 1), '/v1/sessions/' + sessionActive + '/resume', commandPayload(sessionActive, 'resume', 'qa:session:resume', controlStartRevision + 1, 'cursor:2', null, '01RMZ3NDEKTSV4RRFFQ69H5FAV'));
  postJson('session-steer', 202, ownerToken, 'qa:session:steer', String(controlStartRevision + 2), '/v1/sessions/' + sessionActive + '/steer', commandPayload(sessionActive, 'steer', 'qa:session:steer', controlStartRevision + 2, 'cursor:2', 'Continue from cursor 2', '01SMZ3NDEKTSV4RRFFQ69G5FAV'));
  postJson('session-active-resume-invalid-state', 409, ownerToken, 'qa:session:resume:active', String(controlStartRevision + 3), '/v1/sessions/' + sessionActive + '/resume', commandPayload(sessionActive, 'resume', 'qa:session:resume:active', controlStartRevision + 3, 'cursor:2', null, '01RMZ3NDEKTSV4RRFFQ69J5FAV'));
  getJson('session-after-controls', 200, ownerToken, '/v1/sessions/' + sessionActive + '?workspace_id=' + workspace);
  assertEqual(jsonBody('session-after-controls').session.status, 'active', 'Session should be active after pause/resume/steer');
  assertEqual(jsonBody('session-after-controls').session.revision, controlStartRevision + 3, 'Session revision should increment once per non-replayed accepted command');

  postJson('delivery-ack-append', 202, ownerToken, 'qa:delivery:ack:1', null, '/v1/deliveries', deliveryPayload('01DMV3NDEKTSV4RRFFQ69G5FAV', sessionActive, message1, 'qa:delivery:ack:1', 'delivered', 'mission-control:manual-ack', nowIso, null, '01MRZ3NDEKTSV4RRFFQ69M5FAV'));
  postJson('delivery-ack-exact-replay', 202, ownerToken, 'qa:delivery:ack:1', null, '/v1/deliveries', deliveryPayload('01DMV3NDEKTSV4RRFFQ69G5FAV', sessionActive, message1, 'qa:delivery:ack:1', 'delivered', 'mission-control:manual-ack', nowIso, null, '01MRZ3NDEKTSV4RRFFQ69M5FAV'));
  postJson('delivery-mismatched-session-rejected', 404, ownerToken, 'qa:delivery:mismatch', null, '/v1/deliveries', deliveryPayload('01ENV3NDEKTSV4RRFFQ69G5FAV', sessionBg, message1, 'qa:delivery:mismatch', 'delivered', 'mission-control:manual-ack', nowIso, null, '01NRZ3NDEKTSV4RRFFQ69N5FAV'));
  getJson('deliveries-final', 200, ownerToken, '/v1/deliveries?workspace_id=' + workspace);
  getJson('closed-messages-final', 200, ownerToken, '/v1/sessions/' + sessionClosed + '/messages?workspace_id=' + workspace);
  getJson('error-messages-final', 200, ownerToken, '/v1/sessions/' + sessionError + '/messages?workspace_id=' + workspace);
  assertEqual(jsonBody('closed-messages-final').messages.length, 0, 'Closed session must have no messages');
  assertEqual(jsonBody('error-messages-final').messages.length, 0, 'Error session must have no messages');

  stopApi();
  startApi();
  getJson('post-restart-cursor-recovery', 200, ownerToken, '/v1/sessions/' + sessionActive + '/cursor?workspace_id=' + workspace);
  getJson('post-restart-messages-recovery', 200, ownerToken, '/v1/sessions/' + sessionActive + '/messages?workspace_id=' + workspace + '&limit=10');
  getJson('post-restart-deliveries-recovery', 200, ownerToken, '/v1/deliveries?workspace_id=' + workspace);
  assertEqual(jsonBody('post-restart-cursor-recovery').checkpoint.cursor, 'cursor:2', 'Cursor must survive API restart');
  assertEqual(jsonBody('post-restart-messages-recovery').messages.length, 2, 'Messages must survive API restart');

  await runBrowser();
  getJson('post-ui-session-state', 200, ownerToken, '/v1/sessions/' + sessionActive + '?workspace_id=' + workspace);
  getJson('post-ui-deliveries', 200, ownerToken, '/v1/deliveries?workspace_id=' + workspace + '&session_id=' + sessionActive);

  const ui = JSON.parse(readFileSync(uiLog, 'utf8'));
  const summary = {
    stamp: stamp,
    verdict: 'PASS',
    apiLog: apiLog,
    uiLog: uiLog,
    serverLog: serverLog,
    diffLog: diffLog,
    runner: join(attemptDir, 'c19-manual-qa-runner.mjs'),
    screenshots: [desktopPng, postPng, mobilePng, invalidPng],
    message1: message1,
    message1Replay: message1Replay,
    message2: message2,
    cursorAfterRestart: jsonBody('post-restart-cursor-recovery').checkpoint,
    messagesAfterRestart: jsonBody('post-restart-messages-recovery').messages.length,
    deliveriesFinal: jsonBody('deliveries-final').deliveries.map(function(d) { return { receipt_id: d.receipt_id, session_id: d.session_id, message_id: d.message_id, status: d.status, provider_receipt_ref: d.provider_receipt_ref }; }),
    deliveriesAfterUi: jsonBody('post-ui-deliveries').deliveries.map(function(d) { return { receipt_id: d.receipt_id, message_id: d.message_id, status: d.status, provider_receipt_ref: d.provider_receipt_ref }; }),
    sessionAfterControls: jsonBody('session-after-controls').session,
    sessionAfterUi: jsonBody('post-ui-session-state').session,
    closedMessages: jsonBody('closed-messages-final').messages.length,
    errorMessages: jsonBody('error-messages-final').messages.length,
    uiExternalRequests: ui.externalRequests,
    uiActions: ui.observations.find(function(o) { return o.actions; }).actions,
    uiDesktopLayout: ui.observations.find(function(o) { return o.viewport === 'desktop'; }).layout,
    uiMobileLayout: ui.observations.find(function(o) { return o.viewport === 'mobile'; }).layout,
    invalidWorkspaceApiRequests: ui.observations.find(function(o) { return o.invalidWorkspace; }).apiRequestsDuringInvalidWorkspace,
    httpArtifacts: Object.fromEntries(httpArtifacts),
  };
  writeFileSync(summaryJson, JSON.stringify(summary, null, 2));
  process.stdout.write(summaryJson + '\n');
} catch (error) {
  writeFileSync(summaryJson, JSON.stringify({ stamp: stamp, verdict: 'FAIL', blocker: String(error && error.stack ? error.stack : error), apiLog: apiLog, uiLog: uiLog, serverLog: serverLog, diffLog: diffLog }, null, 2));
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
} finally {
  cleanup();
}

function inspectDiff() {
  writeFileSync(diffLog, '# C19 manual QA diff inspection ' + stamp + '\nBase HEAD: 58b80300e4fce98bfeeac75998d2f5d503df3961\n');
  const diff = spawnSync('git', ['diff', '--name-status', '58b80300e4fce98bfeeac75998d2f5d503df3961', '--'], { cwd: cwd, encoding: 'utf8' });
  appendFileSync(diffLog, diff.stdout + diff.stderr + '\n# Targeted implementation anchors\n');
  const anchors = spawnSync('rg', ['-n', 'sendMessage|recordDelivery|createAllowlist|commandSession|workspace:admin|run:read|authorizationHeader|No external connection|deny_by_default', 'apps/api/src/services/gateway-service.ts', 'apps/api/src/routes/gateway.ts', 'apps/mission-control/src/pages/GatewayPage.tsx', 'apps/mission-control/src/app/gateway-api.ts', 'apps/mission-control/src/app/query-client.ts'], { cwd: cwd, encoding: 'utf8' });
  appendFileSync(diffLog, anchors.stdout + anchors.stderr);
}

function seedDatabase() {
  const seedCode = 'import { openDatabase, migrate } from "@nexora/persistence"; const db=openDatabase(process.env.NEXORA_DB_PATH); migrate(db); const now="2026-08-31T00:00:00.000Z"; db.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run("01ARZ3NDEKTSV4RRFFQ69G5FAV", "Manual C19 QA", now, now); db.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run("01BRZ3NDEKTSV4RRFFQ69G5FAV", "Manual C19 Other", now, now); db.close();';
  const result = spawnSync('pnpm', ['exec', 'tsx', '-e', seedCode], { cwd: cwd, env: { ...process.env, NEXORA_DB_PATH: dbPath }, encoding: 'utf8' });
  appendFileSync(serverLog, result.stdout + result.stderr);
  if (result.status !== 0) throw new Error('Database seed failed with exit ' + result.status);
}

function makeToken(workspaceId, actorId, role) {
  const prefix = 'nexora-local-v1';
  const payload = Buffer.from(JSON.stringify({ schema_version: 1, workspace_id: workspaceId, actor_id: actorId, role: role }), 'utf8').toString('base64url');
  const mac = createHmac('sha256', secret).update(prefix + '.' + payload).digest('base64url');
  return 'Bearer ' + prefix + '.' + payload + '.' + mac;
}

function startApi() {
  apiProcess = spawn('pnpm', ['--filter', '@nexora/api', 'start'], {
    cwd: cwd,
    env: { ...process.env, NEXORA_DATA_DIR: tmpRoot, NEXORA_DB_PATH: dbPath, NEXORA_CONTROL_TOKEN_SECRET: secret, NEXORA_ENABLE_LOCAL_SESSION_BOOTSTRAP: 'true', NEXORA_API_HOST: '127.0.0.1', NEXORA_API_PORT: String(apiPort), NEXORA_LOG_LEVEL: 'info' },
    stdio: ['ignore', serverFd, serverFd],
  });
  processes.push(apiProcess);
  waitForHttp('http://127.0.0.1:' + apiPort + '/v1/health', 200, 30000);
}

function stopApi() {
  if (!apiProcess) return;
  apiProcess.kill();
  const deadline = Date.now() + 5000;
  while (apiProcess.exitCode === null && Date.now() < deadline) spawnSync('sleep', ['0.1']);
  apiProcess = null;
}

function cleanup() {
  if (webProcess) webProcess.kill();
  if (apiProcess) apiProcess.kill();
  for (const child of processes) {
    if (child && child.exitCode === null) child.kill();
  }
}

function waitForHttp(url, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = spawnSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', url], { encoding: 'utf8' });
    if (result.stdout.trim() === String(expected)) return;
    spawnSync('sleep', ['0.25']);
  }
  throw new Error('Timed out waiting for ' + url + ' status ' + expected);
}

function curlScenario(id, expectedStatus, args) {
  const artifact = join(attemptDir, id + '-' + stamp + '.http');
  httpArtifacts.set(id, artifact);
  appendFileSync(apiLog, '\n## ' + id + '\nsurface: HTTP localhost API\ninvocation: curl -i ' + displayArgs(args).map(shellQuote).join(' ') + '\n');
  const result = spawnSync('curl', ['-sS', '-i', '-w', '\n__HTTP_STATUS__:%{http_code}', ...args], { cwd: cwd, encoding: 'utf8' });
  const raw = result.stdout + result.stderr;
  const marker = '\n__HTTP_STATUS__:';
  const index = raw.lastIndexOf(marker);
  if (index === -1) throw new Error('curl did not report HTTP status for ' + id + ': ' + raw);
  const http = raw.slice(0, index);
  const status = Number(raw.slice(index + marker.length).trim());
  writeFileSync(artifact, http);
  appendFileSync(apiLog, http + '\nobserved_status: ' + status + ' expected_status: ' + expectedStatus + ' artifact: ' + artifact + '\n');
  if (status !== expectedStatus) throw new Error('Scenario ' + id + ' expected ' + expectedStatus + ' got ' + status);
  assertNonEmpty(artifact);
}

function displayArgs(args) {
  const displayed = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '-H' && String(args[i + 1] || '').startsWith('Authorization: Bearer ')) {
      displayed.push('-H', 'Authorization: Bearer [REDACTED]');
      i += 1;
    } else {
      displayed.push(args[i]);
    }
  }
  return displayed;
}

function postJson(id, expected, token, idem, ifMatch, path, payload) {
  const args = ['-X', 'POST', 'http://127.0.0.1:' + apiPort + path, '-H', 'Authorization: ' + token, '-H', 'Content-Type: application/json', '-H', 'Idempotency-Key: ' + idem];
  if (ifMatch !== null) args.push('-H', 'If-Match: ' + ifMatch);
  args.push('--data-binary', JSON.stringify(payload));
  curlScenario(id, expected, args);
}

function getJson(id, expected, token, path) {
  curlScenario(id, expected, ['http://127.0.0.1:' + apiPort + path, '-H', 'Authorization: ' + token]);
}

function jsonBody(id) {
  const artifact = httpArtifacts.get(id);
  const raw = readFileSync(artifact, 'utf8');
  const matches = Array.from(raw.matchAll(/\r?\n\r?\n/g));
  if (matches.length === 0) throw new Error('HTTP artifact has no body split: ' + artifact);
  const last = matches[matches.length - 1];
  return JSON.parse(raw.slice(last.index + last[0].length).trim());
}

function sessionPayload(id, mode, status, cursor) {
  return { schema_version: 1, id: id, workspace_id: workspace, created_at: nowIso, updated_at: nowIso, gateway_id: gatewayId, channel_id: channelId, agent_id: null, run_id: null, external_session_ref: null, mode: mode, status: status, cursor: cursor, last_message_id: null, last_event_at: null, revision: 1 };
}

function allowPayload(id, subject, decision, expiresAt) {
  return { schema_version: 1, id: id, workspace_id: workspace, created_at: nowIso, updated_at: nowIso, channel_id: channelId, subject_type: 'user', subject_ref: subject, decision: decision, reason: 'manual qa fixture', expires_at: expiresAt, created_by: owner, revision: 1 };
}

function messagePayload(direction, status, sequence, cursor, traceId, senderRef, recipientRef, content) {
  return { schema_version: 1, workspace_id: workspace, channel_id: channelId, direction: direction, status: status, sequence: sequence, cursor: cursor, trace_id: traceId, sender_ref: senderRef, recipient_ref: recipientRef, content: content, content_type: 'text', content_hash: 'sha256:' + sequence + ':' + recipientRef };
}

function commandPayload(sessionId, kind, idempotencyKey, expectedRevision, cursor, instruction, commandId) {
  return { schema_version: 1, command_id: commandId, workspace_id: workspace, session_id: sessionId, kind: kind, idempotency_key: idempotencyKey, expected_revision: expectedRevision, cursor: cursor, instruction: instruction, created_at: nowIso };
}

function deliveryPayload(receiptId, sessionId, messageId, idempotencyKey, status, providerRef, deliveredAt, errorCode, traceId) {
  return { schema_version: 1, receipt_id: receiptId, workspace_id: workspace, session_id: sessionId, message_id: messageId, idempotency_key: idempotencyKey, status: status, provider_receipt_ref: providerRef, delivered_at: deliveredAt, error_code: errorCode, error_message: errorCode === null ? null : 'manual qa error', created_at: nowIso, trace_id: traceId };
}

async function runBrowser() {
  webProcess = spawn('pnpm', ['--filter', '@nexora/mission-control', 'exec', 'vite', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    cwd: cwd,
    env: { ...process.env, VITE_NEXORA_API_BASE_URL: 'http://127.0.0.1:' + apiPort },
    stdio: ['ignore', serverFd, serverFd],
  });
  processes.push(webProcess);
  waitForHttp('http://127.0.0.1:' + webPort + '/gateway?workspace=ws-demo', 200, 30000);
  const playwright = await import('@playwright/test');
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const apiBase = 'http://127.0.0.1:' + apiPort;
  const webBase = 'http://127.0.0.1:' + webPort;
  const apiResponses = [];
  const externalRequests = [];
  const actionResponses = [];
  const allowedHostnames = new Set(['127.0.0.1', 'localhost']);
  await page.route('**/*', function(route) {
    let parsed = null;
    try { parsed = new URL(route.request().url()); } catch {}
    if (parsed && ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol) && !allowedHostnames.has(parsed.hostname)) {
      externalRequests.push({ method: route.request().method(), url: route.request().url() });
      return route.abort();
    }
    return route.continue();
  });
  page.on('websocket', function(ws) {
    const url = new URL(ws.url());
    if (!allowedHostnames.has(url.hostname)) externalRequests.push({ method: 'WEBSOCKET', url: ws.url() });
  });
  page.on('response', function(response) {
    if (response.url().startsWith(apiBase)) {
      const u = new URL(response.url());
      apiResponses.push({ method: response.request().method(), status: response.status(), path: u.pathname });
    }
  });
  const observations = [];
  await page.goto(webBase + '/gateway?workspace=ws-demo', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Gateway, Channels & Sessions' }).waitFor({ timeout: 10000 });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: desktopPng, fullPage: true });
  const initialText = await page.locator('body').innerText();
  const buttonsBefore = await page.locator('button.row-action').evaluateAll(function(buttons) { return buttons.map(function(button) { return { text: button.textContent ? button.textContent.trim() : '', disabled: button.hasAttribute('disabled') }; }); });
  const desktopSections = sectionSnapshot(initialText, buttonsBefore);
  observations.push({ viewport: 'desktop', titleVisible: await page.getByRole('heading', { name: 'Gateway, Channels & Sessions' }).isVisible(), hasBoundaryCopy: initialText.includes('Descriptor and control-plane state only') && initialText.includes('No external connection'), hasDefaultDenyCopy: initialText.includes('Outbound messages default to deny'), visibleSections: desktopSections, buttonsBefore: buttonsBefore, layout: await layoutSnapshot(page, 'desktop') });
  assertEqual(desktopSections.allRequiredLabelsVisible, true, 'Desktop Gateway sections and controls must be visible');
  const activeSessionRow = function() { return page.locator('article.work-row').filter({ hasText: sessionActive }).first(); };
  const pausePromise = page.waitForResponse(function(r) { return r.url().includes('/v1/sessions/' + sessionActive + '/pause') && r.request().method() === 'POST'; });
  await activeSessionRow().getByRole('button', { name: /^Pause$/ }).click();
  const pauseResp = await pausePromise;
  actionResponses.push({ action: 'pause', status: pauseResp.status(), path: new URL(pauseResp.url()).pathname });
  await page.getByText('pause accepted; rereading session projection.').waitFor({ timeout: 10000 });
  await page.waitForLoadState('networkidle');
  const resumePromise = page.waitForResponse(function(r) { return r.url().includes('/v1/sessions/' + sessionActive + '/resume') && r.request().method() === 'POST'; });
  await activeSessionRow().getByRole('button', { name: /^Resume$/ }).click();
  const resumeResp = await resumePromise;
  actionResponses.push({ action: 'resume', status: resumeResp.status(), path: new URL(resumeResp.url()).pathname });
  await page.getByText('resume accepted; rereading session projection.').waitFor({ timeout: 10000 });
  await page.waitForLoadState('networkidle');
  const ackPromise = page.waitForResponse(function(r) { return r.url().includes('/v1/deliveries') && r.request().method() === 'POST'; });
  await activeSessionRow().getByRole('button', { name: /^Acknowledge$/ }).click();
  const ackResp = await ackPromise;
  actionResponses.push({ action: 'acknowledge', status: ackResp.status(), path: new URL(ackResp.url()).pathname });
  await page.getByText('Acknowledgement accepted; rereading delivery receipts.').waitFor({ timeout: 10000 });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: postPng, fullPage: true });
  observations.push({ actions: actionResponses, feedback: await page.locator('[role="status"]').last().innerText().catch(function() { return null; }), apiResponsesAfterActions: apiResponses.slice() });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(webBase + '/gateway?workspace=ws-demo', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Gateway, Channels & Sessions' }).waitFor({ timeout: 10000 });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: mobilePng, fullPage: true });
  const mobileText = await page.locator('body').innerText();
  const mobileSections = sectionSnapshot(mobileText, await page.locator('button.row-action').evaluateAll(function(buttons) { return buttons.map(function(button) { return { text: button.textContent ? button.textContent.trim() : '', disabled: button.hasAttribute('disabled') }; }); }));
  observations.push({ viewport: 'mobile', titleVisible: await page.getByRole('heading', { name: 'Gateway, Channels & Sessions' }).isVisible(), mobileNavCount: await page.locator('.mobile-nav a').count(), hasBoundaryCopy: mobileText.includes('No external connection'), visibleSections: mobileSections, layout: await layoutSnapshot(page, 'mobile') });
  assertEqual(mobileSections.allRequiredLabelsVisible, true, 'Mobile Gateway sections and controls must be visible');
  const beforeInvalidCount = apiResponses.length;
  await page.goto(webBase + '/gateway?workspace=not-a-workspace', { waitUntil: 'domcontentloaded' });
  await page.getByText('Invalid Gateway workspace scope').waitFor({ timeout: 10000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: invalidPng, fullPage: true });
  observations.push({ invalidWorkspace: true, apiRequestsDuringInvalidWorkspace: apiResponses.length - beforeInvalidCount, message: await page.locator('body').innerText() });
  await browser.close();
  writeFileSync(uiLog, JSON.stringify({ surface: 'Browser UI localhost /gateway', invocation: 'Playwright chromium.goto(' + webBase + '/gateway?workspace=ws-demo); API base ' + apiBase + '; external http(s)/ws hosts logged and aborted', observations: observations, apiResponses: apiResponses, externalRequests: externalRequests, screenshots: [desktopPng, postPng, mobilePng, invalidPng] }, null, 2));
  assertEqual(externalRequests.length, 0, 'Browser must not request external hosts');
  assertEqual(actionResponses.every(function(r) { return r.status === 202; }), true, 'Browser controls must receive 202 API responses');
  assertNonEmpty(desktopPng);
  assertNonEmpty(postPng);
  assertNonEmpty(mobilePng);
  assertNonEmpty(invalidPng);
}

async function layoutSnapshot(page, label) {
  return await page.evaluate(function(label) {
    const invalidAriaReferences = [];
    document.querySelectorAll('[aria-labelledby]').forEach(function(node) {
      const attr = node.getAttribute('aria-labelledby') || '';
      const ids = attr.split(/\s+/).filter(Boolean);
      for (const id of ids) if (document.getElementById(id) === null) invalidAriaReferences.push(node.tagName.toLowerCase() + '#' + id);
    });
    const overflowing = [];
    document.querySelectorAll('body *').forEach(function(node) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && (rect.right > document.documentElement.clientWidth + 1 || rect.left < -1)) overflowing.push(node.tagName.toLowerCase());
    });
    return { label: label, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, tableCount: document.querySelectorAll('table').length, cjkTextPresent: /[\u3400-\u9fff]/.test(document.body.innerText), invalidAriaReferences: invalidAriaReferences, overflowing: Array.from(new Set(overflowing)).slice(0, 20) };
  }, label);
}

function sectionSnapshot(text, buttons) {
  const labels = ['Gateway health', 'Channels', 'Session queue', 'cursor', 'Delivery receipts', 'Allowlist', 'Pause', 'Steer', 'Acknowledge', 'No external connection'];
  const visible = Object.fromEntries(labels.map(function(label) { return [label, text.includes(label)]; }));
  const buttonLabels = buttons.map(function(button) { return button.text; });
  return {
    visible: visible,
    enabledButtons: buttons.filter(function(button) { return !button.disabled; }),
    buttonLabels: buttonLabels,
    allRequiredLabelsVisible: labels.every(function(label) { return visible[label] === true; }),
  };
}

function portInUse(port) {
  return spawnSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' }).status === 0;
}

function shellQuote(value) {
  const s = String(value);
  if (/^[A-Za-z0-9_./:=?&,%+@-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\"'\"'") + "'";
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message + ' expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
}

function assertNonEmpty(path) {
  if (statSync(path).size <= 0) throw new Error('Artifact is empty: ' + path);
}

function failEarly(value) {
  writeFileSync(summaryJson, JSON.stringify({ stamp: stamp, verdict: 'FAIL', ...value }, null, 2));
  console.error(value.blocker || JSON.stringify(value));
  process.exit(2);
}

function timeStamp() {
  const d = new Date();
  const pad = function(n) { return String(n).padStart(2, '0'); };
  return pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}
