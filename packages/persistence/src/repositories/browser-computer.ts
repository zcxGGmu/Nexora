import type { SQLInputValue } from "node:sqlite";
import { z } from "zod";
import {
  ActionIntentSchema,
  ActionReceiptSchema,
  BrowserSessionDescriptorSchema,
  ComputerUseSessionDescriptorSchema,
  HumanApprovalSchema,
  SandboxPolicySchema,
  ScreenshotReceiptSchema,
  TargetAllowlistEntrySchema,
  browserComputerActionPayloadHash,
  canExecuteActionIntent,
  canTransitionBrowserComputerSession,
  type ActionIntent,
  type ActionReceipt,
  type BrowserComputerExecutionDecision,
  type BrowserComputerSessionDescriptor,
  type BrowserSessionDescriptor,
  type ComputerUseSessionDescriptor,
  type HumanApproval,
  type SandboxPolicy,
  type ScreenshotReceipt,
  type TargetAllowlistEntry,
} from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { PersistenceError, json, readJson, sqliteError, updateChanged } from "./utils.js";

const StoredPayloadSchema = z.record(z.string(), z.unknown());

export type BrowserComputerActionIntentResult = {
  readonly intent: ActionIntent;
  readonly policy: BrowserComputerExecutionDecision;
  readonly replayed: boolean;
};

export class SandboxPolicyRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): SandboxPolicy {
    const parsed = SandboxPolicySchema.parse(record);
    try {
      this.database.prepare("INSERT INTO browser_computer_sandbox_policies(id, workspace_id, name, network_mode, filesystem_mode, clipboard_mode, credential_mode, automation_mode, allowed_target_kinds_json, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.name, parsed.network_mode, parsed.filesystem_mode, parsed.clipboard_mode, parsed.credential_mode, parsed.automation_mode, json(parsed.allowed_target_kinds), json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): SandboxPolicy | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM browser_computer_sandbox_policies WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : SandboxPolicySchema.parse({ ...readJson(row["payload_json"], SandboxPolicySchema), revision: readVersion(row["version"], "SandboxPolicy") });
  }

  list(workspaceId: string): readonly SandboxPolicy[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM browser_computer_sandbox_policies WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId);
    return rows.map((row) => SandboxPolicySchema.parse({ ...readJson(row["payload_json"], SandboxPolicySchema), revision: readVersion(row["version"], "SandboxPolicy") }));
  }
}

export class BrowserComputerSessionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  createBrowserSession(record: unknown): BrowserSessionDescriptor {
    const parsed = BrowserSessionDescriptorSchema.parse(record);
    this.insert(parsed);
    return parsed;
  }

  createComputerSession(record: unknown): ComputerUseSessionDescriptor {
    const parsed = ComputerUseSessionDescriptorSchema.parse(record);
    this.insert(parsed);
    return parsed;
  }

  get(workspaceId: string, id: string): BrowserComputerSessionDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM browser_computer_sessions WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readSession(row);
  }

  list(workspaceId: string): readonly BrowserComputerSessionDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM browser_computer_sessions WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId);
    return rows.map(readSession);
  }

  update(record: BrowserComputerSessionDescriptor, expectedVersion: number): BrowserComputerSessionDescriptor {
    const current = this.get(record.workspace_id, record.id);
    if (current === undefined) throw new PersistenceError("NOT_FOUND", "Browser computer session not found");
    requireImmutableSessionFacts(current, record);
    if (!canTransitionBrowserComputerSession(current.status, record.status) && current.status !== record.status) throw new PersistenceError("CONSTRAINT_VIOLATION", "Browser computer session state transition is invalid");
    const updated = parseSessionPayload({ ...record, revision: expectedVersion + 1 });
    const result = this.database.prepare(`UPDATE browser_computer_sessions SET status = ?, current_target_ref = ?, display_ref = ?, active_app_ref = ?, last_screenshot_id = ?, takeover_by = ?, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?`).run(updated.status, browserTarget(updated), displayRef(updated), activeAppRef(updated), updated.last_screenshot_id, updated.takeover_by, json(updated), updated.schema_version, updated.updated_at, updated.workspace_id, updated.id, expectedVersion);
    updateChanged(result, "BrowserComputerSession");
    return updated;
  }

  private insert(record: BrowserComputerSessionDescriptor): void {
    try {
      this.database.prepare("INSERT INTO browser_computer_sessions(id, workspace_id, run_id, gateway_session_id, sandbox_policy_id, name, kind, platform, mode, status, current_target_ref, display_ref, active_app_ref, last_screenshot_id, takeover_by, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(record.id, record.workspace_id, record.run_id, record.gateway_session_id, record.sandbox_policy_id, record.name, record.kind, platform(record), record.mode, record.status, browserTarget(record), displayRef(record), activeAppRef(record), record.last_screenshot_id, record.takeover_by, json(record), record.schema_version, record.created_at, record.updated_at);
    } catch (error) {
      throw sqliteError(error);
    }
  }
}

export class BrowserComputerAllowlistRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): TargetAllowlistEntry {
    const parsed = TargetAllowlistEntrySchema.parse(record);
    const session = new BrowserComputerSessionRepository(this.database).get(parsed.workspace_id, parsed.session_id);
    if (session === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Browser computer allowlist must reference a session");
    requireSandboxTargetKind(this.database, session, parsed.target_kind);
    try {
      this.database.prepare("INSERT INTO browser_computer_allowlist(id, workspace_id, session_id, target_kind, target_ref, decision, reason, expires_at, created_by, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.session_id, parsed.target_kind, parsed.target_ref, parsed.decision, parsed.reason, parsed.expires_at, parsed.created_by, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listBySession(workspaceId: string, sessionId: string): readonly TargetAllowlistEntry[] {
    const rows = this.database.prepare("SELECT payload_json FROM browser_computer_allowlist WHERE workspace_id = ? AND session_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, sessionId);
    return rows.map((row) => readJson(row["payload_json"], TargetAllowlistEntrySchema));
  }

  get(workspaceId: string, id: string): TargetAllowlistEntry | undefined {
    const row = this.database.prepare("SELECT payload_json FROM browser_computer_allowlist WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], TargetAllowlistEntrySchema);
  }
}

export class BrowserComputerApprovalRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): HumanApproval {
    const parsed = HumanApprovalSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO browser_computer_human_approvals(id, workspace_id, session_id, action_intent_id, action_payload_hash, decision, decided_by, decided_at, reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.session_id, parsed.action_intent_id, parsed.action_payload_hash, parsed.decision, parsed.decided_by, parsed.decided_at, parsed.reason, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): HumanApproval | undefined {
    const row = this.database.prepare("SELECT payload_json FROM browser_computer_human_approvals WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], HumanApprovalSchema);
  }

  getByAction(workspaceId: string, sessionId: string, actionIntentId: string): HumanApproval | undefined {
    const row = this.database.prepare("SELECT payload_json FROM browser_computer_human_approvals WHERE workspace_id = ? AND session_id = ? AND action_intent_id = ? ORDER BY decided_at DESC, id DESC LIMIT 1").get(workspaceId, sessionId, actionIntentId);
    return row === undefined ? undefined : readJson(row["payload_json"], HumanApprovalSchema);
  }

  listBySession(workspaceId: string, sessionId: string): readonly HumanApproval[] {
    const rows = this.database.prepare("SELECT payload_json FROM browser_computer_human_approvals WHERE workspace_id = ? AND session_id = ? ORDER BY decided_at DESC, id ASC").all(workspaceId, sessionId);
    return rows.map((row) => readJson(row["payload_json"], HumanApprovalSchema));
  }
}

export class BrowserComputerActionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  recordIntent(record: unknown): BrowserComputerActionIntentResult {
    const parsed = ActionIntentSchema.parse(record);
    const session = new BrowserComputerSessionRepository(this.database).get(parsed.workspace_id, parsed.session_id);
    if (session === undefined || session.run_id !== parsed.run_id) throw new PersistenceError("CONSTRAINT_VIOLATION", "Browser computer action must match session scope");
    if (session.status !== "active") throw new PersistenceError("CONSTRAINT_VIOLATION", "Browser computer action requires an active session");
    requireSandboxTargetKind(this.database, session, actionTargetKind(parsed.target_ref));
    const approvals = new BrowserComputerApprovalRepository(this.database);
    const approval = approvals.getByAction(parsed.workspace_id, parsed.session_id, parsed.id);
    const allowlist = new BrowserComputerAllowlistRepository(this.database).listBySession(parsed.workspace_id, parsed.session_id);
    const policy = canExecuteActionIntent(parsed, allowlist, approval ?? null, parsed.created_at);
    const existing = this.getByIdempotencyKey(parsed.workspace_id, parsed.session_id, parsed.idempotency_key);
    if (existing !== undefined) {
      if (browserComputerActionPayloadHash(existing) !== browserComputerActionPayloadHash(parsed)) throw new PersistenceError("IDEMPOTENCY_KEY_REUSED", "Browser computer action idempotency key was reused with a different payload");
      return { intent: existing, policy: policyForStoredActionStatus(existing), replayed: true };
    }
    const stored = ActionIntentSchema.parse({ ...parsed, status: actionStatusForPolicy(policy) });
    try {
      this.database.prepare("INSERT INTO browser_computer_action_intents(id, workspace_id, session_id, run_id, action_kind, target_ref, input_summary, risk_level, approval_id, idempotency_key, status, payload_hash, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(stored.id, stored.workspace_id, stored.session_id, stored.run_id, stored.action_kind, stored.target_ref, stored.input_summary, stored.risk_level, stored.approval_id, stored.idempotency_key, stored.status, browserComputerActionPayloadHash(stored), json(stored), stored.schema_version, stored.created_at, stored.updated_at);
      if (policy.allowed) new BrowserComputerReceiptRepository(this.database).recordActionReceipt(autoReceipt(stored));
      return { intent: stored, policy, replayed: false };
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): ActionIntent | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM browser_computer_action_intents WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : ActionIntentSchema.parse({ ...readJson(row["payload_json"], ActionIntentSchema), revision: readVersion(row["version"], "ActionIntent") });
  }

  listBySession(workspaceId: string, sessionId: string): readonly ActionIntent[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM browser_computer_action_intents WHERE workspace_id = ? AND session_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, sessionId);
    return rows.map((row) => ActionIntentSchema.parse({ ...readJson(row["payload_json"], ActionIntentSchema), revision: readVersion(row["version"], "ActionIntent") }));
  }

  private getByIdempotencyKey(workspaceId: string, sessionId: string, idempotencyKey: string): ActionIntent | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM browser_computer_action_intents WHERE workspace_id = ? AND session_id = ? AND idempotency_key = ?").get(workspaceId, sessionId, idempotencyKey);
    return row === undefined ? undefined : ActionIntentSchema.parse({ ...readJson(row["payload_json"], ActionIntentSchema), revision: readVersion(row["version"], "ActionIntent") });
  }
}

function actionStatusForPolicy(policy: BrowserComputerExecutionDecision): ActionIntent["status"] {
  if (policy.allowed) return "completed";
  return policy.code === "APPROVAL_REQUIRED" ? "pending_approval" : "policy_denied";
}

function policyForStoredActionStatus(action: ActionIntent): BrowserComputerExecutionDecision {
  if (action.status === "completed") return { allowed: true, code: "POLICY_ALLOWED", required_action: "record_descriptor_receipt" };
  if (action.status === "pending_approval" || action.status === "approved") return { allowed: false, code: "APPROVAL_REQUIRED", required_action: "approve_action" };
  return { allowed: false, code: "POLICY_DENIED", required_action: "approve_browser_target" };
}

export class BrowserComputerReceiptRepository {
  constructor(private readonly database: SqliteDatabase) {}

  recordActionReceipt(record: unknown): ActionReceipt {
    const parsed = ActionReceiptSchema.parse(record);
    requireExecutableActionForReceipt(this.database, parsed);
    requireScreenshotReceiptScope(this.database, parsed);
    try {
      this.database.prepare("INSERT INTO browser_computer_action_receipts(id, workspace_id, session_id, action_intent_id, status, result_ref, screenshot_id, error_code, error_message, external_effect, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.session_id, parsed.action_intent_id, parsed.status, parsed.result_ref, parsed.screenshot_id, parsed.error_code, parsed.error_message, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  recordScreenshotReceipt(record: unknown): ScreenshotReceipt {
    const parsed = ScreenshotReceiptSchema.parse(record);
    requireExecutableActionForReceipt(this.database, parsed);
    try {
      this.database.prepare("INSERT INTO browser_computer_screenshot_receipts(id, workspace_id, session_id, action_intent_id, image_ref, viewport_width, viewport_height, image_hash, redacted, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.session_id, parsed.action_intent_id, parsed.image_ref, parsed.viewport_width, parsed.viewport_height, parsed.image_hash, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listBySession(workspaceId: string, sessionId: string): readonly ActionReceipt[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM browser_computer_action_receipts WHERE workspace_id = ? AND session_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, sessionId);
    return rows.map(readActionReceipt);
  }

  getActionReceipt(workspaceId: string, id: string): ActionReceipt | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM browser_computer_action_receipts WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readActionReceipt(row);
  }

  listScreenshotsBySession(workspaceId: string, sessionId: string): readonly ScreenshotReceipt[] {
    const rows = this.database.prepare("SELECT payload_json FROM browser_computer_screenshot_receipts WHERE workspace_id = ? AND session_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, sessionId);
    return rows.map((row) => readJson(row["payload_json"], ScreenshotReceiptSchema));
  }
}

function autoReceipt(action: ActionIntent): ActionReceipt {
  return ActionReceiptSchema.parse({
    id: action.id,
    workspace_id: action.workspace_id,
    schema_version: 1,
    created_at: action.created_at,
    updated_at: action.updated_at,
    session_id: action.session_id,
    action_intent_id: action.id,
    status: "completed",
    result_ref: "artifact://receipts/browser-computer/descriptor-action.json",
    screenshot_id: null,
    error_code: null,
    error_message: null,
    external_effect: false,
    descriptor_only: true,
  });
}

function readSession(row: Record<string, unknown>): BrowserComputerSessionDescriptor {
  return parseSessionPayload({ ...StoredPayloadSchema.parse(JSON.parse(readTextForRepository(row["payload_json"]))), revision: readVersion(row["version"], "BrowserComputerSession") });
}

function readActionReceipt(row: Record<string, unknown>): ActionReceipt {
  return ActionReceiptSchema.parse({ ...readJson(row["payload_json"], ActionReceiptSchema), revision: readVersion(row["version"], "ActionReceipt") });
}

function requireExecutableActionForReceipt(database: SqliteDatabase, receipt: { readonly workspace_id: string; readonly session_id: string; readonly action_intent_id: string; readonly created_at: string }): void {
  const action = new BrowserComputerActionRepository(database).get(receipt.workspace_id, receipt.action_intent_id);
  if (action === undefined || action.session_id !== receipt.session_id) throw new PersistenceError("CONSTRAINT_VIOLATION", "Browser computer action receipt scope constraint failed");
  const approval = new BrowserComputerApprovalRepository(database).getByAction(action.workspace_id, action.session_id, action.id);
  const allowlist = new BrowserComputerAllowlistRepository(database).listBySession(action.workspace_id, action.session_id);
  const policy = canExecuteActionIntent(action, allowlist, approval ?? null, receipt.created_at);
  if (!policy.allowed) throw new PersistenceError("CONSTRAINT_VIOLATION", "Browser computer action receipt requires executable approved policy");
}

function requireScreenshotReceiptScope(database: SqliteDatabase, receipt: ActionReceipt): void {
  if (receipt.screenshot_id === null) return;
  const row = database.prepare("SELECT id FROM browser_computer_screenshot_receipts WHERE workspace_id = ? AND session_id = ? AND action_intent_id = ? AND id = ?").get(receipt.workspace_id, receipt.session_id, receipt.action_intent_id, receipt.screenshot_id);
  if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Browser computer action receipt screenshot scope constraint failed");
}

function requireSandboxTargetKind(database: SqliteDatabase, session: BrowserComputerSessionDescriptor, targetKind: TargetAllowlistEntry["target_kind"]): void {
  const policy = new SandboxPolicyRepository(database).get(session.workspace_id, session.sandbox_policy_id);
  if (policy === undefined || !policy.allowed_target_kinds.includes(targetKind)) throw new PersistenceError("CONSTRAINT_VIOLATION", "Browser computer target kind is not allowed by sandbox policy");
}

function actionTargetKind(targetRef: string): TargetAllowlistEntry["target_kind"] {
  return targetRef.startsWith("computer://app/") ? "computer_app" : "browser_url";
}

function parseSessionPayload(value: unknown): BrowserComputerSessionDescriptor {
  const kind = z.object({ kind: z.enum(["browser", "computer"]) }).passthrough().parse(value).kind;
  return kind === "browser" ? BrowserSessionDescriptorSchema.parse(value) : ComputerUseSessionDescriptorSchema.parse(value);
}

function requireImmutableSessionFacts(current: BrowserComputerSessionDescriptor, next: BrowserComputerSessionDescriptor): void {
  if (current.kind !== next.kind || current.run_id !== next.run_id || current.gateway_session_id !== next.gateway_session_id || current.sandbox_policy_id !== next.sandbox_policy_id || current.mode !== next.mode || current.created_at !== next.created_at) {
    throw new PersistenceError("VERSION_CONFLICT", "Browser computer session immutable facts changed");
  }
}

function platform(record: BrowserComputerSessionDescriptor): SQLInputValue {
  return record.kind === "computer" ? record.platform : null;
}

function browserTarget(record: BrowserComputerSessionDescriptor): SQLInputValue {
  return record.kind === "browser" ? record.current_target_ref : null;
}

function displayRef(record: BrowserComputerSessionDescriptor): SQLInputValue {
  return record.kind === "computer" ? record.display_ref : null;
}

function activeAppRef(record: BrowserComputerSessionDescriptor): SQLInputValue {
  return record.kind === "computer" ? record.active_app_ref : null;
}

function readVersion(value: unknown, entity: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "bigint" && value > 0n) return Number(value);
  throw new PersistenceError("CONSTRAINT_VIOLATION", `${entity} version column is invalid`);
}

function readTextForRepository(value: unknown): string {
  if (typeof value !== "string") throw new PersistenceError("CONSTRAINT_VIOLATION", "Expected text column");
  return value;
}
