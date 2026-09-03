import { describe, expect, it } from "vitest";
import { ActionIntentSchema, HumanApprovalSchema, browserComputerActionPayloadHash } from "@nexora/contracts";
import { CORE_TABLES, CORE_MIGRATION_VERSION, migrate, openDatabase, type SqliteDatabase } from "./index.js";
import {
  BrowserComputerActionRepository,
  BrowserComputerAllowlistRepository,
  BrowserComputerApprovalRepository,
  BrowserComputerReceiptRepository,
  BrowserComputerSessionRepository,
  SandboxPolicyRepository,
} from "./repositories/index.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  otherWorkspace: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01MRZ3NDEKTSV4RRFFQ69M5FAV",
  ticket: "01NRZ3NDEKTSV4RRFFQ69N5FAV",
  run: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  gatewaySession: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  browserSession: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  policy: "sandbox-c23-browser",
  allowlist: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  approval: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  intent: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  receipt: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
};

const TIME = "2026-09-02T04:00:00.000Z";
const LATER = "2026-09-02T04:05:00.000Z";
const AFTER_ALLOWLIST_EXPIRY = "2026-09-02T04:10:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("C23 browser and computer use persistence", () => {
  it("Given migrations run When schema is validated Then C23 tables and migration version 14 exist", () => {
    const database = openDatabase(":memory:");
    try {
      migrate(database, { now: () => TIME });
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row["name"]);
      const triggers = database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all().map((row) => row["name"]);

      expect(CORE_MIGRATION_VERSION).toBe(14);
      expect(CORE_TABLES).toEqual(expect.arrayContaining(["browser_computer_sessions", "browser_computer_sandbox_policies", "browser_computer_allowlist", "browser_computer_action_intents", "browser_computer_action_receipts", "browser_computer_screenshot_receipts", "browser_computer_human_approvals"]));
      expect(tables).toEqual(expect.arrayContaining(["browser_computer_sessions", "browser_computer_sandbox_policies", "browser_computer_allowlist", "browser_computer_action_intents", "browser_computer_action_receipts", "browser_computer_screenshot_receipts", "browser_computer_human_approvals"]));
      expect(triggers).toEqual(expect.arrayContaining(["c23_action_receipts_no_update", "c23_screenshot_receipts_no_update", "c23_action_intents_target_allowlist_insert", "c23_human_approvals_no_update"]));
      expect(triggers).toEqual(expect.arrayContaining(["c23_human_approvals_action_scope_insert", "c23_action_receipts_ref_safe_insert", "c23_screenshot_receipts_ref_safe_insert"]));
      expect(triggers).toEqual(expect.arrayContaining(["c23_sandbox_policies_no_update", "c23_allowlist_no_update", "c23_action_intents_no_update", "c23_sessions_guarded_update"]));
      expect(triggers).toEqual(expect.arrayContaining(["c23_sessions_payload_json_insert", "c23_action_receipts_executable_insert", "c23_screenshot_receipts_executable_insert", "c23_action_intents_secret_safe_text_insert"]));
      expect(triggers).toEqual(expect.arrayContaining(["c23_action_receipts_screenshot_scope_insert"]));
    } finally {
      database.close();
    }
  });

  it("Given no allowlist When recording an action intent Then policy denial is stored without receipt side effects", () => {
    withDatabase((database) => {
      const sessions = new BrowserComputerSessionRepository(database);
      const actions = new BrowserComputerActionRepository(database);
      const receipts = new BrowserComputerReceiptRepository(database);
      new SandboxPolicyRepository(database).create(sandboxPolicy());
      sessions.createBrowserSession(browserSession());

      const result = actions.recordIntent(actionIntent());

      expect(result.policy.allowed).toBe(false);
      expect(result.policy.code).toBe("POLICY_DENIED");
      expect(receipts.listBySession(IDS.workspace, IDS.browserSession)).toEqual([]);
      expect(receipts.listScreenshotsBySession(IDS.workspace, IDS.browserSession)).toEqual([]);
    });
  });

  it("Given active allowlist and approval When recording receipts Then scope and append-only constraints are enforced", () => {
    withDatabase((database) => {
      seedApprovedBrowserAction(database);
      const receipts = new BrowserComputerReceiptRepository(database);
      const receipt = receipts.recordActionReceipt(actionReceipt());
      const screenshot = receipts.recordScreenshotReceipt(screenshotReceipt());

      expect(receipt).toMatchObject({ id: IDS.receipt, action_intent_id: IDS.intent, descriptor_only: true, external_effect: false });
      expect(screenshot).toMatchObject({ action_intent_id: IDS.intent, image_hash: HASH, descriptor_only: true });
      expect(() => database.prepare("UPDATE browser_computer_action_receipts SET status = 'completed' WHERE id = ?").run(IDS.receipt)).toThrow(/append|update|abort|constraint/i);
      expect(() => database.prepare("DELETE FROM browser_computer_screenshot_receipts WHERE id = ?").run(IDS.receipt)).toThrow(/append|delete|abort|constraint/i);
      expect(() => receipts.recordActionReceipt({ ...actionReceipt(), id: IDS.allowlist, workspace_id: IDS.otherWorkspace })).toThrow(/scope|workspace|constraint/i);
    });
  });

  it("Given action receipt references a screenshot Then screenshot scope must match the same action", () => {
    withDatabase((database) => {
      seedApprovedBrowserAction(database);
      const receipts = new BrowserComputerReceiptRepository(database);
      const screenshotId = "01KRZ3NDEKTSV4RRFFQ69K5FAV";
      const otherActionId = "01VRZ3NDEKTSV4RRFFQ69V5FAV";

      expect(() => receipts.recordActionReceipt({ ...actionReceipt(), screenshot_id: screenshotId })).toThrow(/screenshot|scope|constraint/i);
      expect(() => insertRawActionReceipt(database, { ...actionReceipt(), screenshot_id: screenshotId })).toThrow(/screenshot|scope|constraint|abort/i);

      insertRawApprovedActionIntent(database, {
        ...actionIntent(),
        id: otherActionId,
        approval_id: "01WRZ3NDEKTSV4RRFFQ69W5FAV",
        input_summary: "Open approved host for a second descriptor-only intent.",
        idempotency_key: "browser:action:c23:second",
      });
      receipts.recordScreenshotReceipt({ ...screenshotReceipt(), id: screenshotId, action_intent_id: otherActionId });

      expect(() => receipts.recordActionReceipt({ ...actionReceipt(), screenshot_id: screenshotId })).toThrow(/screenshot|scope|constraint/i);
      expect(() => insertRawActionReceipt(database, { ...actionReceipt(), id: "01MRZ3NDEKTSV4RRFFQ69M5FAV", screenshot_id: screenshotId })).toThrow(/screenshot|scope|constraint|abort/i);

      const matchingScreenshotId = "01NRZ3NDEKTSV4RRFFQ69N5FAV";
      receipts.recordScreenshotReceipt({ ...screenshotReceipt(), id: matchingScreenshotId });

      expect(() => receipts.recordActionReceipt({ ...actionReceipt(), id: "01PRZ3NDEKTSV4RRFFQ69P5FAV", screenshot_id: matchingScreenshotId })).not.toThrow();
      expect(() => insertRawActionReceipt(database, { ...actionReceipt(), id: "01QRZ3NDEKTSV4RRFFQ69Q5FAV", screenshot_id: matchingScreenshotId })).not.toThrow();
    });
  });

  it("Given unsafe raw SQL targets Then database constraints reject SSRF paths secrets and external-effect claims", () => {
    withDatabase((database) => {
      new SandboxPolicyRepository(database).create(sandboxPolicy());
      new BrowserComputerSessionRepository(database).createBrowserSession(browserSession());

      expect(() => insertRawActionIntent(database, { ...actionIntent(), target_ref: "browser://url/http/169.254.169.254/latest/meta-data" })).toThrow(/target|policy|ssrf|abort|constraint/i);
      expect(() => insertRawActionIntent(database, { ...actionIntent(), target_ref: "browser://url/https/user:pass@example.com/docs" })).toThrow(/target|policy|credential|userinfo|abort|constraint/i);
      expect(() => insertRawActionIntent(database, { ...actionIntent(), target_ref: "browser://url/http/2130706433/latest/meta-data" })).toThrow(/target|policy|private|abort|constraint/i);
      expect(() => insertRawActionIntent(database, { ...actionIntent(), target_ref: "browser://url/http/2130706433/latest.meta-data" })).toThrow(/target|policy|private|abort|constraint/i);
      expect(() => insertRawBrowserSession(database, { ...browserSession(), id: "01SRZ3NDEKTSV4RRFFQ69S5FAV", current_target_ref: "browser://url/http/2130706433/latest.meta-data" })).toThrow(/target|policy|private|abort|constraint/i);
      expect(() => insertRawActionIntent(database, { ...actionIntent(), target_ref: "browser://url/https/example.com/docs?token%3Dabcd1234" })).toThrow(/target|policy|secret|abort|constraint/i);
      expect(() => insertRawActionIntent(database, { ...actionIntent(), target_ref: "browser://url/https/exam\u200bple.com/docs" })).toThrow(/target|policy|secret|normalized|abort|constraint/i);
      expect(() => insertRawActionIntent(database, { ...actionIntent(), target_ref: "file:///Users/zq/private.txt" })).toThrow(/target|path|abort|constraint/i);
      new BrowserComputerActionRepository(database).recordIntent(actionIntent());
      new BrowserComputerAllowlistRepository(database).create(allowlistEntry());
      new BrowserComputerApprovalRepository(database).record(approval());
      expect(() => insertRawActionReceipt(database, { ...actionReceipt(), external_effect: true })).toThrow(/descriptor|external|abort|constraint/i);
      expect(() => insertRawActionReceipt(database, { ...actionReceipt(), result_ref: "artifact://receipts/c23/token%3Dabcd1234.json" })).toThrow(/ref|sandbox|abort|constraint/i);
      expect(() => insertRawScreenshotReceipt(database, { ...screenshotReceipt(), image_ref: "secret://screenshots/raw-token" })).toThrow(/ref|sandbox|abort|constraint/i);
    });
  });

  it("Given pending or denied actions When receipts are inserted Then repository and raw SQL reject them", () => {
    withDatabase((database) => {
      new SandboxPolicyRepository(database).create(sandboxPolicy());
      new BrowserComputerSessionRepository(database).createBrowserSession(browserSession());
      const receipts = new BrowserComputerReceiptRepository(database);

      new BrowserComputerActionRepository(database).recordIntent(actionIntent());

      expect(() => receipts.recordActionReceipt(actionReceipt())).toThrow(/approval|policy|executable|constraint/i);
      expect(() => insertRawActionReceipt(database, actionReceipt())).toThrow(/approval|policy|executable|constraint|abort/i);
      expect(() => insertRawScreenshotReceipt(database, screenshotReceipt())).toThrow(/approval|policy|executable|constraint|abort/i);
    });
  });

  it("Given an allowlisted domain and explicit URL port When raw SQL inserts receipts Then SQL matches the canonical host", () => {
    withDatabase((database) => {
      new SandboxPolicyRepository(database).create(sandboxPolicy());
      new BrowserComputerSessionRepository(database).createBrowserSession(browserSession());
      new BrowserComputerAllowlistRepository(database).create(allowlistEntry());
      insertRawApprovedActionIntent(database, {
        ...actionIntent(),
        target_ref: "browser://url/https/example.com:443/docs",
        input_summary: "Open approved host with an explicit port as a descriptor-only intent.",
        approval_id: null,
        idempotency_key: "browser:raw:explicit-port",
      });

      expect(() => insertRawActionReceipt(database, actionReceipt())).not.toThrow();
      expect(() => insertRawScreenshotReceipt(database, { ...screenshotReceipt(), id: "01TRZ3NDEKTSV4RRFFQ69T5FAV" })).not.toThrow();
    });
  });

  it("Given an allowlisted domain appears only in a URL path When raw SQL inserts receipts Then SQL rejects the forged host match", () => {
    withDatabase((database) => {
      new SandboxPolicyRepository(database).create(sandboxPolicy());
      new BrowserComputerSessionRepository(database).createBrowserSession(browserSession());
      new BrowserComputerAllowlistRepository(database).create(allowlistEntry());
      insertRawApprovedActionIntent(database, {
        ...actionIntent(),
        target_ref: "browser://url/https/evil.test/path.example.com/capture",
        input_summary: "Open unapproved host while the allowlisted domain appears only in the path.",
        approval_id: null,
        idempotency_key: "browser:raw:domain-path",
      });

      expect(() => insertRawActionReceipt(database, actionReceipt())).toThrow(/approval|policy|executable|constraint|abort/i);
      expect(() => insertRawScreenshotReceipt(database, screenshotReceipt())).toThrow(/approval|policy|executable|constraint|abort/i);
    });
  });

  it("Given raw SQL allowlist uses glob metacharacters When receipts are inserted Then SQL rejects wildcard domain bypass", () => {
    withDatabase((database) => {
      new SandboxPolicyRepository(database).create(sandboxPolicy());
      new BrowserComputerSessionRepository(database).createBrowserSession(browserSession());

      expect(() => insertRawAllowlistEntry(database, { ...allowlistEntry(), target_ref: "browser://domain/*.com" })).toThrow(/target|sandbox|policy|constraint|abort/i);
    });
  });

  it("Given allowlist expired before receipt time When receipts are inserted Then executable policy is rechecked at receipt time", () => {
    withDatabase((database) => {
      seedApprovedBrowserAction(database);
      const receipts = new BrowserComputerReceiptRepository(database);
      const expiredReceipt = { ...actionReceipt(), created_at: AFTER_ALLOWLIST_EXPIRY, updated_at: AFTER_ALLOWLIST_EXPIRY };
      const expiredScreenshot = { ...screenshotReceipt(), created_at: AFTER_ALLOWLIST_EXPIRY, updated_at: AFTER_ALLOWLIST_EXPIRY };

      expect(() => receipts.recordActionReceipt(expiredReceipt)).toThrow(/approval|policy|executable|constraint/i);
      expect(() => receipts.recordScreenshotReceipt(expiredScreenshot)).toThrow(/approval|policy|executable|constraint/i);
      expect(() => insertRawActionReceipt(database, expiredReceipt)).toThrow(/approval|policy|executable|constraint|abort/i);
      expect(() => insertRawScreenshotReceipt(database, expiredScreenshot)).toThrow(/approval|policy|executable|constraint|abort/i);
    });
  });

  it("Given raw approvals and sandbox target kinds Then SQL enforces action scope and policy parity", () => {
    withDatabase((database) => {
      new SandboxPolicyRepository(database).create({ ...sandboxPolicy(), id: "sandbox-c23-computer-only", allowed_target_kinds: ["computer_app"] });
      new BrowserComputerSessionRepository(database).createBrowserSession({ ...browserSession(), sandbox_policy_id: "sandbox-c23-computer-only" });

      expect(() => new BrowserComputerApprovalRepository(database).record(approval())).toThrow(/SQLite operation failed|scope|foreign|constraint|action/i);
      expect(() => new BrowserComputerAllowlistRepository(database).create(allowlistEntry())).toThrow(/target kind|sandbox|constraint|policy/i);
      expect(() => insertRawActionIntent(database, actionIntent())).toThrow(/target|policy|sandbox|constraint/i);
    });
  });

  it("Given raw SQL mutation attempts Then Browser/Computer control facts remain append-only or transition-guarded", () => {
    withDatabase((database) => {
      new SandboxPolicyRepository(database).create(sandboxPolicy());
      new BrowserComputerSessionRepository(database).createBrowserSession(browserSession());
      new BrowserComputerAllowlistRepository(database).create(allowlistEntry());
      new BrowserComputerActionRepository(database).recordIntent(actionIntent());

      expect(() => database.prepare("UPDATE browser_computer_sandbox_policies SET network_mode = 'deny_by_default', name = 'mutated' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.policy)).toThrow(/append|immutable|update|abort|constraint/i);
      expect(() => database.prepare("DELETE FROM browser_computer_allowlist WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.allowlist)).toThrow(/append|delete|abort|constraint/i);
      expect(() => database.prepare("UPDATE browser_computer_action_intents SET target_ref = 'browser://url/https/evil.example/docs' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.intent)).toThrow(/append|immutable|update|abort|constraint/i);
      expect(() => database.prepare("UPDATE browser_computer_sessions SET run_id = ?, version = version + 1 WHERE workspace_id = ? AND id = ?").run(IDS.goal, IDS.workspace, IDS.browserSession)).toThrow(/transition|immutable|scope|abort|constraint/i);
      expect(() => database.prepare("UPDATE browser_computer_sessions SET payload_json = json_set(payload_json, '$.run_id', ?), version = version + 1 WHERE workspace_id = ? AND id = ?").run(IDS.goal, IDS.workspace, IDS.browserSession)).toThrow(/payload|scope|parity|abort|constraint/i);
      expect(() => updateRawSessionStatus(database, "active")).not.toThrow();
      expect(() => updateRawSessionStatus(database, "active")).not.toThrow();
      expect(() => updateRawSessionStatus(database, "stopped")).not.toThrow();
      expect(() => database.prepare("UPDATE browser_computer_sessions SET status = 'active', version = version + 1 WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.browserSession)).toThrow(/transition|state|abort|constraint/i);
    });
  });

  it("Given raw SQL inserts contain secret-shaped text Then database constraints mirror contract redaction rules", () => {
    withDatabase((database) => {
      new SandboxPolicyRepository(database).create(sandboxPolicy());
      new BrowserComputerSessionRepository(database).createBrowserSession(browserSession());

      expect(() => insertRawActionIntent(database, { ...actionIntent(), input_summary: "Authorization: Bearer abcdefgh" })).toThrow(/secret|credential|abort|constraint/i);
      expect(() => insertRawActionIntent(database, { ...actionIntent(), input_summary: "Use sk-test-abcdefghijkl during browser approval." })).toThrow(/secret|credential|abort|constraint/i);
      expect(() => insertRawActionIntent(database, { ...actionIntent(), input_summary: "Copy ghp_1234567890abcdef into the form." })).toThrow(/secret|credential|abort|constraint/i);
      expect(() => insertRawActionIntent(database, { ...actionIntent(), input_summary: "Use AWS key AKIAIOSFODNN7EXAMPLE for login." })).toThrow(/secret|credential|abort|constraint/i);
      expect(() => insertRawActionIntent(database, { ...actionIntent(), input_summary: "Paste eyJhbGciOiJIUzI1NiJ9.payload.signature into browser state." })).toThrow(/secret|credential|abort|constraint/i);
      expect(() => insertRawActionIntent(database, rawActionIntent({ input_summary: "Do not persist t%6fken=abcd1234 in browser facts." }))).toThrow(/secret|credential|normalized|abort|constraint/i);
      expect(() => insertRawActionIntent(database, rawActionIntent({ input_summary: "Use sk%2dtest%2dabcdefghijkl during browser approval." }))).toThrow(/secret|credential|normalized|abort|constraint/i);
      expect(() => insertRawActionIntent(database, rawActionIntent({ input_summary: "Copy ghp%5f1234567890abcdef into the form." }))).toThrow(/secret|credential|normalized|abort|constraint/i);
      expect(() => insertRawActionIntent(database, rawActionIntent({ input_summary: "Use api\u200b_key=abcd1234 during browser approval." }))).toThrow(/secret|credential|normalized|abort|constraint/i);
      expect(() => database.prepare("INSERT INTO browser_computer_allowlist(id, workspace_id, session_id, target_kind, target_ref, decision, reason, expires_at, created_by, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'browser_url', 'browser://domain/example.com', 'allow', ?, NULL, NULL, 1, ?, 1, ?, ?)").run(IDS.allowlist, IDS.workspace, IDS.browserSession, "api_key=abcd1234", JSON.stringify({ ...allowlistEntry(), reason: "api_key=abcd1234" }), TIME, TIME)).toThrow(/secret|credential|abort|constraint/i);
      expect(() => database.prepare("INSERT INTO browser_computer_allowlist(id, workspace_id, session_id, target_kind, target_ref, decision, reason, expires_at, created_by, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'browser_url', 'browser://domain/example.com', 'allow', ?, NULL, NULL, 1, ?, 1, ?, ?)").run(IDS.allowlist, IDS.workspace, IDS.browserSession, "Allow xoxb-12345678-abcdefghi during QA.", JSON.stringify({ ...allowlistEntry(), reason: "Allow xoxb-12345678-abcdefghi during QA." }), TIME, TIME)).toThrow(/secret|credential|abort|constraint/i);
      expect(() => database.prepare("INSERT INTO browser_computer_allowlist(id, workspace_id, session_id, target_kind, target_ref, decision, reason, expires_at, created_by, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'browser_url', 'browser://domain/example.com', 'allow', ?, NULL, NULL, 1, ?, 1, ?, ?)").run(IDS.allowlist, IDS.workspace, IDS.browserSession, "Allow t%6fken=abcd1234 during QA.", JSON.stringify({ ...allowlistEntry(), reason: "Allow t%6fken=abcd1234 during QA." }), TIME, TIME)).toThrow(/secret|credential|normalized|abort|constraint/i);
      new BrowserComputerActionRepository(database).recordIntent(actionIntent());
      expect(() => database.prepare("INSERT INTO browser_computer_human_approvals(id, workspace_id, session_id, action_intent_id, action_payload_hash, decision, decided_by, decided_at, reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?, 1, ?, 1, ?, ?)").run(IDS.approval, IDS.workspace, IDS.browserSession, IDS.intent, HASH, "owner:credential:live", TIME, "Looks fine", JSON.stringify({ ...approval(), decided_by: "owner:credential:live" }), TIME, TIME)).toThrow(/secret|credential|abort|constraint/i);
      expect(() => database.prepare("INSERT INTO browser_computer_human_approvals(id, workspace_id, session_id, action_intent_id, action_payload_hash, decision, decided_by, decided_at, reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?, 1, ?, 1, ?, ?)").run(IDS.approval, IDS.workspace, IDS.browserSession, IDS.intent, HASH, "owner:c23", TIME, "Approve sk%2dtest%2dabcdefghijkl", JSON.stringify({ ...approval(), reason: "Approve sk%2dtest%2dabcdefghijkl" }), TIME, TIME)).toThrow(/secret|credential|normalized|abort|constraint/i);
    });
  });

  it("Given raw SQL inserts drifted Browser/Computer payloads Then database constraints reject payload_json scope drift", () => {
    withDatabase((database) => {
      new SandboxPolicyRepository(database).create(sandboxPolicy());
      new BrowserComputerSessionRepository(database).createBrowserSession(browserSession());
      new BrowserComputerAllowlistRepository(database).create(allowlistEntry());
      new BrowserComputerActionRepository(database).recordIntent(actionIntent());

      expect(() => insertRawSandboxPolicy(database, { ...sandboxPolicy(), id: "sandbox-c23-drift", workspace_id: IDS.otherWorkspace })).toThrow(/payload|parity|scope|constraint|abort/i);
      expect(() => insertRawAllowlistEntry(database, { ...allowlistEntry(), id: "01KRZ3NDEKTSV4RRFFQ69K5FAV", workspace_id: IDS.otherWorkspace })).toThrow(/payload|parity|scope|constraint|abort/i);
      expect(() => insertRawActionIntent(database, { ...actionIntent(), id: "01LRZ3NDEKTSV4RRFFQ69L5FAV", workspace_id: IDS.otherWorkspace })).toThrow(/payload|parity|scope|constraint|abort/i);
      expect(() => insertRawApproval(database, { ...approval(), id: "01MRZ3NDEKTSV4RRFFQ69P5FAV", workspace_id: IDS.otherWorkspace })).toThrow(/payload|parity|scope|constraint|abort/i);
      new BrowserComputerApprovalRepository(database).record(approval());
      expect(() => insertRawActionReceipt(database, { ...actionReceipt(), id: "01QRZ3NDEKTSV4RRFFQ69Q5FAV", workspace_id: IDS.otherWorkspace })).toThrow(/payload|parity|scope|constraint|abort/i);
      expect(() => insertRawScreenshotReceipt(database, { ...screenshotReceipt(), id: "01RRZ3NDEKTSV4RRFFQ69R5FAV", workspace_id: IDS.otherWorkspace })).toThrow(/payload|parity|scope|constraint|abort/i);
    });
  });
});

function withDatabase(callback: (database: SqliteDatabase) => void): void {
  const database = openDatabase(":memory:");
  try {
    migrate(database, { now: () => TIME });
    seedRunAndGatewaySession(database);
    callback(database);
  } finally {
    database.close();
  }
}

function seedApprovedBrowserAction(database: SqliteDatabase): void {
  new SandboxPolicyRepository(database).create(sandboxPolicy());
  new BrowserComputerSessionRepository(database).createBrowserSession(browserSession());
  new BrowserComputerAllowlistRepository(database).create(allowlistEntry());
  new BrowserComputerActionRepository(database).recordIntent(actionIntent());
  new BrowserComputerApprovalRepository(database).record(approval());
  new BrowserComputerActionRepository(database).recordIntent(actionIntent());
}

function seedRunAndGatewaySession(database: SqliteDatabase): void {
  const goal = { id: IDS.goal, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, title: "C23 goal", objective: "Validate Browser/Computer control-plane", definition_of_done: ["done"] };
  const ticket = { id: IDS.ticket, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, status: "ready", definition_of_done: ["done"], assigned_agents: [], approval_policy: { mode: "required" }, idempotency_key: "ticket:c23" };
  const run = { id: IDS.run, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, ticket_id: IDS.ticket, execution_location: "local", status: "running", budget: { max_tokens: 10_000, max_cost_usd: 10 }, memory_snapshot: { snapshot_id: IDS.workspace, version: 1 }, connector_versions: { deterministic: "1.0.0" } };
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'C23 workspace', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'C23 other workspace', 1, ?, ?)").run(IDS.otherWorkspace, TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.goal, IDS.workspace, goal.title, goal.objective, JSON.stringify(goal.definition_of_done), JSON.stringify(goal), TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'ready', ?, ?, 1, ?, ?)").run(IDS.ticket, IDS.workspace, IDS.goal, ticket.idempotency_key, JSON.stringify(ticket), TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.ticket, JSON.stringify(run), TIME, TIME);
  database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES ('gateway-c23-browser', ?, 'Gateway C23 Browser', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME, TIME);
  database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES ('channel-c23-browser', ?, 'gateway-c23-browser', 'Channel C23 Browser', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'gateway-c23-browser', 'channel-c23-browser', NULL, ?, NULL, 'foreground', 'active', 'turn-1', NULL, ?, '{}', 1, ?, ?)").run(IDS.gatewaySession, IDS.workspace, IDS.run, TIME, TIME, TIME);
}

function sandboxPolicy(): object {
  return { id: IDS.policy, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, name: "C23 browser sandbox", network_mode: "deny_by_default", filesystem_mode: "deny", clipboard_mode: "deny", credential_mode: "deny", automation_mode: "approval_required", allowed_target_kinds: ["browser_url", "computer_app"], descriptor_only: true };
}

function browserSession(): object {
  return { id: IDS.browserSession, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, run_id: IDS.run, gateway_session_id: IDS.gatewaySession, sandbox_policy_id: IDS.policy, name: "Browser QA control session", kind: "browser", mode: "foreground", status: "active", current_target_ref: "browser://url/https/example.com/docs", last_screenshot_id: null, takeover_by: null, descriptor_only: true };
}

function allowlistEntry(): object {
  return { id: IDS.allowlist, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, session_id: IDS.browserSession, target_kind: "browser_url", target_ref: "browser://domain/example.com", decision: "allow", reason: "Local QA target approved by owner.", expires_at: LATER, created_by: null, descriptor_only: true };
}

function approval(): object {
  return { id: IDS.approval, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, session_id: IDS.browserSession, action_intent_id: IDS.intent, action_payload_hash: browserComputerActionPayloadHash(ActionIntentSchema.parse(actionIntent())), decision: "approved", decided_by: "owner:c23", decided_at: TIME, reason: "Operator approved descriptor-only browser intent.", descriptor_only: true };
}

function actionIntent(): object {
  return { id: IDS.intent, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, session_id: IDS.browserSession, run_id: IDS.run, action_kind: "navigate", target_ref: "browser://url/https/example.com/docs", input_summary: "Open docs landing page for local QA.", risk_level: "R2", approval_id: IDS.approval, idempotency_key: "browser:action:c23", status: "pending_approval", descriptor_only: true };
}

function rawActionIntent(overrides: { readonly input_summary: string }): object {
  return { ...actionIntent(), approval_id: null, idempotency_key: "browser:raw:c23", input_summary: overrides.input_summary };
}

function actionReceipt(): object {
  return { id: IDS.receipt, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, session_id: IDS.browserSession, action_intent_id: IDS.intent, status: "completed", result_ref: "artifact://receipts/c23/action.json", screenshot_id: null, error_code: null, error_message: null, external_effect: false, descriptor_only: true };
}

function screenshotReceipt(): object {
  return { id: IDS.receipt, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, session_id: IDS.browserSession, action_intent_id: IDS.intent, image_ref: "artifact://screenshots/c23/browser-qa.png", viewport_width: 1440, viewport_height: 900, image_hash: HASH, redacted: true, descriptor_only: true };
}

function insertRawActionIntent(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO browser_computer_action_intents(id, workspace_id, session_id, run_id, action_kind, target_ref, input_summary, risk_level, approval_id, idempotency_key, status, payload_hash, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)").run(textProperty(payload, "id", IDS.intent), IDS.workspace, IDS.browserSession, IDS.run, textProperty(payload, "action_kind", "navigate"), targetRef(payload), inputSummary(payload), textProperty(payload, "risk_level", "R2"), nullableTextProperty(payload, "approval_id"), textProperty(payload, "idempotency_key", "browser:raw:c23"), textProperty(payload, "status", "pending_approval"), HASH, JSON.stringify(payload), TIME, TIME);
}

function insertRawBrowserSession(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO browser_computer_sessions(id, workspace_id, run_id, gateway_session_id, sandbox_policy_id, name, kind, platform, mode, status, current_target_ref, display_ref, active_app_ref, last_screenshot_id, takeover_by, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'browser', NULL, ?, ?, ?, NULL, NULL, NULL, NULL, 1, ?, 1, ?, ?)").run(textProperty(payload, "id", "01SRZ3NDEKTSV4RRFFQ69S5FAV"), IDS.workspace, IDS.run, IDS.gatewaySession, IDS.policy, textProperty(payload, "name", "Raw browser session"), textProperty(payload, "mode", "foreground"), textProperty(payload, "status", "active"), currentTargetRef(payload), JSON.stringify(payload), TIME, TIME);
}

function insertRawApprovedActionIntent(database: SqliteDatabase, payload: object): void {
  const parsed = ActionIntentSchema.parse(payload);
  const payloadHash = browserComputerActionPayloadHash(parsed);
  database.prepare("INSERT INTO browser_computer_action_intents(id, workspace_id, session_id, run_id, action_kind, target_ref, input_summary, risk_level, approval_id, idempotency_key, status, payload_hash, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.session_id, parsed.run_id, parsed.action_kind, parsed.target_ref, parsed.input_summary, parsed.risk_level, parsed.approval_id, parsed.idempotency_key, parsed.status, payloadHash, JSON.stringify(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
  const approvalPayload = HumanApprovalSchema.parse({ ...approval(), id: parsed.approval_id ?? IDS.approval, action_intent_id: parsed.id, action_payload_hash: payloadHash });
  database.prepare("INSERT INTO browser_computer_human_approvals(id, workspace_id, session_id, action_intent_id, action_payload_hash, decision, decided_by, decided_at, reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(approvalPayload.id, approvalPayload.workspace_id, approvalPayload.session_id, approvalPayload.action_intent_id, approvalPayload.action_payload_hash, approvalPayload.decision, approvalPayload.decided_by, approvalPayload.decided_at, approvalPayload.reason, JSON.stringify(approvalPayload), approvalPayload.schema_version, approvalPayload.created_at, approvalPayload.updated_at);
}

function insertRawActionReceipt(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO browser_computer_action_receipts(id, workspace_id, session_id, action_intent_id, status, result_ref, screenshot_id, error_code, error_message, external_effect, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'completed', ?, ?, NULL, NULL, ?, 1, ?, 1, ?, ?)").run(textProperty(payload, "id", IDS.receipt), IDS.workspace, IDS.browserSession, IDS.intent, actionResultRef(payload), nullableTextProperty(payload, "screenshot_id"), externalEffect(payload), JSON.stringify(payload), textProperty(payload, "created_at", TIME), textProperty(payload, "updated_at", TIME));
}

function insertRawScreenshotReceipt(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO browser_computer_screenshot_receipts(id, workspace_id, session_id, action_intent_id, image_ref, viewport_width, viewport_height, image_hash, redacted, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1440, 900, ?, 1, 1, ?, 1, ?, ?)").run(textProperty(payload, "id", IDS.receipt), IDS.workspace, IDS.browserSession, IDS.intent, screenshotImageRef(payload), HASH, JSON.stringify(payload), textProperty(payload, "created_at", TIME), textProperty(payload, "updated_at", TIME));
}

function insertRawSandboxPolicy(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO browser_computer_sandbox_policies(id, workspace_id, name, network_mode, filesystem_mode, clipboard_mode, credential_mode, automation_mode, allowed_target_kinds_json, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'Raw drift sandbox', 'deny_by_default', 'deny', 'deny', 'deny', 'approval_required', ?, 1, ?, 1, ?, ?)").run(textProperty(payload, "id", "sandbox-c23-drift"), IDS.workspace, JSON.stringify(["browser_url"]), JSON.stringify(payload), TIME, TIME);
}

function insertRawAllowlistEntry(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO browser_computer_allowlist(id, workspace_id, session_id, target_kind, target_ref, decision, reason, expires_at, created_by, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)").run(textProperty(payload, "id", "01KRZ3NDEKTSV4RRFFQ69K5FAV"), IDS.workspace, IDS.browserSession, textProperty(payload, "target_kind", "browser_url"), targetRef(payload), textProperty(payload, "decision", "allow"), textProperty(payload, "reason", "Raw allowlist entry."), nullableTextProperty(payload, "expires_at"), nullableTextProperty(payload, "created_by"), JSON.stringify(payload), TIME, TIME);
}

function insertRawApproval(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO browser_computer_human_approvals(id, workspace_id, session_id, action_intent_id, action_payload_hash, decision, decided_by, decided_at, reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'approved', 'owner:c23', ?, 'Raw approval.', 1, ?, 1, ?, ?)").run(textProperty(payload, "id", "01MRZ3NDEKTSV4RRFFQ69P5FAV"), IDS.workspace, IDS.browserSession, IDS.intent, browserComputerActionPayloadHash(ActionIntentSchema.parse(actionIntent())), TIME, JSON.stringify(payload), TIME, TIME);
}

function updateRawSessionStatus(database: SqliteDatabase, status: string): void {
  database.prepare("UPDATE browser_computer_sessions SET status = ?, payload_json = json_set(payload_json, '$.status', ?, '$.revision', version + 1), version = version + 1 WHERE workspace_id = ? AND id = ?").run(status, status, IDS.workspace, IDS.browserSession);
}

function targetRef(payload: object): string {
  return textProperty(payload, "target_ref", "browser://url/https/example.com/docs");
}

function currentTargetRef(payload: object): string {
  return textProperty(payload, "current_target_ref", "browser://url/https/example.com/docs");
}

function inputSummary(payload: object): string {
  return textProperty(payload, "input_summary", "raw");
}

function screenshotImageRef(payload: object): string {
  return "image_ref" in payload && typeof payload.image_ref === "string" ? payload.image_ref : "artifact://screenshots/c23/browser-qa.png";
}

function actionResultRef(payload: object): string {
  return "result_ref" in payload && typeof payload.result_ref === "string" ? payload.result_ref : "artifact://receipts/c23/action.json";
}

function externalEffect(payload: object): number {
  return "external_effect" in payload && payload.external_effect === true ? 1 : 0;
}

function textProperty(payload: object, key: string, fallback: string): string {
  const entry = Object.entries(payload).find(([entryKey]) => entryKey === key);
  if (entry === undefined) return fallback;
  const value = entry[1];
  return typeof value === "string" ? value : fallback;
}

function nullableTextProperty(payload: object, key: string): string | null {
  const entry = Object.entries(payload).find(([entryKey]) => entryKey === key);
  if (entry === undefined) return null;
  const value = entry[1];
  return typeof value === "string" ? value : null;
}
