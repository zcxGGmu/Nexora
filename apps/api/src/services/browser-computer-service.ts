import { z } from "zod";
import {
  ActionIntentSchema,
  ActionReceiptSchema,
  BrowserComputerCommandSchema,
  BrowserComputerSessionStatusSchema,
  BrowserSessionDescriptorSchema,
  ComputerUseSessionDescriptorSchema,
  HumanApprovalSchema,
  SandboxPolicySchema,
  TargetAllowlistEntrySchema,
  WorkspaceIdSchema,
  browserComputerActionPayloadHash,
  canExecuteActionIntent,
  canTransitionBrowserComputerSession,
  type ActionIntent,
  type ActionReceipt,
  type BrowserComputerExecutionDecision,
  type BrowserComputerSessionDescriptor,
  type HumanApproval,
  type SandboxPolicy,
  type ScreenshotReceipt,
  type TargetAllowlistEntry,
} from "@nexora/contracts";
import {
  BrowserComputerActionRepository,
  BrowserComputerAllowlistRepository,
  BrowserComputerApprovalRepository,
  BrowserComputerReceiptRepository,
  BrowserComputerSessionRepository,
  IdempotencyRepository,
  SandboxPolicyRepository,
  withTransaction,
  type SqliteDatabase,
} from "@nexora/persistence";
import { assertScope, type PolicyActor } from "@nexora/policy";
import { accepted, requestHash } from "./command-helpers.js";
import type { AcceptedCommand, IdFactory } from "./command-service.js";
import { ApiHttpError } from "./errors.js";

export type BrowserComputerServiceOptions = {
  readonly database: SqliteDatabase;
  readonly clock: { readonly now: () => string };
  readonly idFactory: IdFactory;
};

export type BrowserComputerSessionDetail = {
  readonly session: BrowserComputerSessionDescriptor;
  readonly sandbox_policy: SandboxPolicy | null;
  readonly allowlist: readonly TargetAllowlistEntry[];
  readonly approvals: readonly HumanApproval[];
  readonly action_intents: readonly ActionIntent[];
  readonly action_receipts: readonly ActionReceipt[];
  readonly screenshot_receipts: readonly ScreenshotReceipt[];
};

const BrowserComputerSessionInputSchema = z.discriminatedUnion("kind", [
  BrowserSessionDescriptorSchema.omit({ created_at: true, updated_at: true }).extend({ created_at: BrowserSessionDescriptorSchema.shape.created_at.optional(), updated_at: BrowserSessionDescriptorSchema.shape.updated_at.optional() }).strict(),
  ComputerUseSessionDescriptorSchema.omit({ created_at: true, updated_at: true }).extend({ created_at: ComputerUseSessionDescriptorSchema.shape.created_at.optional(), updated_at: ComputerUseSessionDescriptorSchema.shape.updated_at.optional() }).strict(),
]);

const ActionIntentInputSchema = ActionIntentSchema.omit({ created_at: true, updated_at: true, idempotency_key: true, status: true })
  .extend({
    created_at: ActionIntentSchema.shape.created_at.optional(),
    updated_at: ActionIntentSchema.shape.updated_at.optional(),
    idempotency_key: ActionIntentSchema.shape.idempotency_key.optional(),
    status: z.literal("pending_approval").optional(),
  })
  .strict();

const AllowlistInputSchema = TargetAllowlistEntrySchema.omit({ created_at: true, updated_at: true })
  .extend({ created_at: TargetAllowlistEntrySchema.shape.created_at.optional(), updated_at: TargetAllowlistEntrySchema.shape.updated_at.optional() })
  .strict();

const ApprovalInputSchema = z.object({
  schema_version: z.literal(1),
  workspace_id: WorkspaceIdSchema,
  session_id: HumanApprovalSchema.shape.session_id.optional(),
  reason: HumanApprovalSchema.shape.reason,
  descriptor_only: z.literal(true),
}).strict();

const SessionCommandInputSchema = z.object({
  schema_version: z.literal(1),
  workspace_id: WorkspaceIdSchema,
  kind: BrowserComputerCommandSchema.shape.kind,
  reason: BrowserComputerCommandSchema.shape.reason.optional(),
  descriptor_only: z.literal(true),
}).strict();

const ReceiptAcknowledgementInputSchema = z.object({
  schema_version: z.literal(1),
  workspace_id: WorkspaceIdSchema,
  reason: ActionReceiptSchema.shape.error_message.optional(),
  descriptor_only: z.literal(true),
}).strict();

const WorkspaceOnlyInputSchema = z.object({ workspace_id: WorkspaceIdSchema }).passthrough();

type BrowserComputerCommandKind = "pause" | "resume" | "stop" | "takeover";
type BrowserComputerActionOutcome = { readonly command: AcceptedCommand; readonly policy: BrowserComputerExecutionDecision };

export class BrowserComputerService {
  private readonly idempotency: IdempotencyRepository;
  private readonly policies: SandboxPolicyRepository;
  private readonly sessions: BrowserComputerSessionRepository;
  private readonly allowlist: BrowserComputerAllowlistRepository;
  private readonly approvals: BrowserComputerApprovalRepository;
  private readonly actions: BrowserComputerActionRepository;
  private readonly receipts: BrowserComputerReceiptRepository;

  constructor(private readonly options: BrowserComputerServiceOptions) {
    this.idempotency = new IdempotencyRepository(options.database);
    this.policies = new SandboxPolicyRepository(options.database);
    this.sessions = new BrowserComputerSessionRepository(options.database);
    this.allowlist = new BrowserComputerAllowlistRepository(options.database);
    this.approvals = new BrowserComputerApprovalRepository(options.database);
    this.actions = new BrowserComputerActionRepository(options.database);
    this.receipts = new BrowserComputerReceiptRepository(options.database);
  }

  listSessions(workspaceId: string): readonly BrowserComputerSessionDescriptor[] {
    return this.sessions.list(WorkspaceIdSchema.parse(workspaceId));
  }

  getAction(workspaceId: string, actionId: string): ActionIntent {
    return requireBrowserComputerFact(this.actions.get(WorkspaceIdSchema.parse(workspaceId), actionId));
  }

  getAllowlistEntry(workspaceId: string, allowlistId: string): TargetAllowlistEntry {
    return requireBrowserComputerFact(this.allowlist.get(WorkspaceIdSchema.parse(workspaceId), allowlistId));
  }

  getApproval(workspaceId: string, approvalId: string): HumanApproval {
    return requireBrowserComputerFact(this.approvals.get(WorkspaceIdSchema.parse(workspaceId), approvalId));
  }

  getActionReceipt(workspaceId: string, receiptId: string): ActionReceipt {
    return requireBrowserComputerFact(this.receipts.getActionReceipt(WorkspaceIdSchema.parse(workspaceId), receiptId));
  }

  getSessionDetail(workspaceId: string, sessionId: string): BrowserComputerSessionDetail {
    const session = this.requireSession(workspaceId, sessionId);
    return {
      session,
      sandbox_policy: this.policies.get(session.workspace_id, session.sandbox_policy_id) ?? null,
      allowlist: this.allowlist.listBySession(session.workspace_id, session.id),
      approvals: this.approvals.listBySession(session.workspace_id, session.id),
      action_intents: this.actions.listBySession(session.workspace_id, session.id),
      action_receipts: this.receipts.listBySession(session.workspace_id, session.id),
      screenshot_receipts: this.receipts.listScreenshotsBySession(session.workspace_id, session.id),
    };
  }

  registerSession(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const workspaceId = this.requireAdminForInput(input, actor);
    const parsed = BrowserComputerSessionInputSchema.parse(fillMissingTimestamps(input, now));
    const session = parseSessionDescriptor({ ...parsed, created_at: now, updated_at: now });
    if (session.workspace_id !== workspaceId) throw invalidScope();
    return withTransaction(this.options.database, () => {
      const reservation = this.idempotency.reserveOrGet({ workspace_id: session.workspace_id, idempotency_key: idempotencyKey, request_hash: requestHash(stripMetadataTimestamps(session)), resource_type: "browser_session", resource_id: session.id, created_at: now });
      if (reservation.kind === "existing") return accepted({ command_id: idempotencyKey, object_type: "browser_session", object_id: reservation.record.resource_id, workspace_id: session.workspace_id });
      this.ensureSandboxPolicy(session.workspace_id, session.sandbox_policy_id, now);
      if (session.kind === "browser") this.sessions.createBrowserSession(session);
      if (session.kind === "computer") this.sessions.createComputerSession(session);
      return accepted({ command_id: idempotencyKey, object_type: "browser_session", object_id: session.id, workspace_id: session.workspace_id });
    });
  }

  createAllowlist(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const workspaceId = this.requireAdminForInput(input, actor);
    const body = AllowlistInputSchema.parse(fillMissingTimestamps(input, now));
    const entry = TargetAllowlistEntrySchema.parse({ ...body, created_at: now, updated_at: now });
    if (entry.workspace_id !== workspaceId) throw invalidScope();
    return this.register(entry, idempotencyKey, "browser_allowlist", () => this.allowlist.create(entry));
  }

  approveAction(actionId: string, input: unknown, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const workspaceId = this.requireAdminForInput(input, actor);
    const body = ApprovalInputSchema.parse(input);
    if (body.workspace_id !== workspaceId) throw invalidScope();
    return withTransaction(this.options.database, () => {
      const action = this.getAction(body.workspace_id, actionId);
      if (action.revision !== expectedVersion) throw versionConflict();
      const session = body.session_id === undefined ? this.requireSession(body.workspace_id, action.session_id) : this.requireSession(body.workspace_id, body.session_id);
      if (action.session_id !== session.id) throw invalidScope();
      const actionPayloadHash = browserComputerActionPayloadHash(action);
      const reservation = this.idempotency.reserveOrGet({ workspace_id: body.workspace_id, idempotency_key: idempotencyKey, request_hash: requestHash({ ...body, session_id: session.id, action_id: actionId, action_payload_hash: actionPayloadHash, expected_version: expectedVersion }), resource_type: "browser_approval", resource_id: this.options.idFactory(), created_at: this.now() });
      if (reservation.kind === "existing") return accepted({ command_id: idempotencyKey, object_type: "browser_approval", object_id: reservation.record.resource_id, workspace_id: body.workspace_id });
      const approval = HumanApprovalSchema.parse({
        id: reservation.record.resource_id,
        workspace_id: body.workspace_id,
        schema_version: 1,
        created_at: this.now(),
        updated_at: this.now(),
        session_id: session.id,
        action_intent_id: actionId,
        action_payload_hash: actionPayloadHash,
        decision: "approved",
        decided_by: actorRef(actor),
        decided_at: this.now(),
        reason: body.reason,
        descriptor_only: true,
      });
      this.approvals.record(approval);
      return accepted({ command_id: idempotencyKey, object_type: "browser_approval", object_id: approval.id, workspace_id: approval.workspace_id });
    });
  }

  recordAction(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const now = this.now();
    const workspaceId = this.requireAdminForInput(input, actor);
    const body = ActionIntentInputSchema.parse(fillMissingTimestamps(input, now));
    const action = ActionIntentSchema.parse({ ...body, idempotency_key: idempotencyKey, status: "pending_approval", created_at: now, updated_at: now });
    if (action.workspace_id !== workspaceId) throw invalidScope();
    const outcome: BrowserComputerActionOutcome = withTransaction(this.options.database, () => {
      const requestDigest = actionRequestHash(action);
      const existingReservation = this.idempotency.get(action.workspace_id, idempotencyKey);
      if (existingReservation !== undefined) {
        if (existingReservation.request_hash !== requestDigest || !isBrowserActionOutcomeResourceType(existingReservation.resource_type)) throw idempotencyConflict();
        const stored = this.actions.get(action.workspace_id, existingReservation.resource_id);
        return { command: accepted({ command_id: idempotencyKey, object_type: "browser_action", object_id: existingReservation.resource_id, workspace_id: action.workspace_id }), policy: policyForRecordedActionOutcome(existingReservation.resource_type, stored) };
      }
      const existingAction = this.actions.get(action.workspace_id, action.id);
      if (existingAction !== undefined) {
        if (browserComputerActionPayloadHash(existingAction) !== browserComputerActionPayloadHash(action)) throw idempotencyConflict();
        const session = this.requireSession(existingAction.workspace_id, existingAction.session_id);
        if (session.status !== "active") throw invalidState();
        const policy = this.policyForStoredAction(existingAction);
        const reservation = this.idempotency.reserveOrGet({ workspace_id: action.workspace_id, idempotency_key: idempotencyKey, request_hash: requestDigest, resource_type: actionOutcomeResourceType(policy), resource_id: existingAction.id, created_at: now });
        if (policy.allowed) this.ensureCompletedReceipt(existingAction);
        return { command: accepted({ command_id: idempotencyKey, object_type: "browser_action", object_id: reservation.record.resource_id, workspace_id: action.workspace_id }), policy };
      }
      const initialPolicy = this.policyForStoredAction(action);
      this.idempotency.reserveOrGet({ workspace_id: action.workspace_id, idempotency_key: idempotencyKey, request_hash: requestDigest, resource_type: actionOutcomeResourceType(initialPolicy), resource_id: action.id, created_at: now });
      const result = this.actions.recordIntent(action);
      return { command: accepted({ command_id: idempotencyKey, object_type: "browser_action", object_id: result.intent.id, workspace_id: result.intent.workspace_id }), policy: result.policy };
    });
    if (!outcome.policy.allowed) throw policyDenied(outcome.policy);
    return outcome.command;
  }

  commandSession(input: unknown, sessionId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number, kind: BrowserComputerCommandKind): AcceptedCommand {
    const workspaceId = this.requireAdminForInput(input, actor);
    const body = SessionCommandInputSchema.parse(input);
    if (body.kind !== kind) throw invalidScope();
    if (body.workspace_id !== workspaceId) throw invalidScope();
    return withTransaction(this.options.database, () => {
      const current = this.requireSession(body.workspace_id, sessionId);
      const command = BrowserComputerCommandSchema.parse({ schema_version: 1, command_id: current.id, workspace_id: body.workspace_id, session_id: sessionId, kind, idempotency_key: idempotencyKey, expected_revision: expectedVersion, reason: body.reason ?? null, descriptor_only: true, created_at: this.now() });
      const reservation = this.idempotency.reserveOrGet({ workspace_id: body.workspace_id, idempotency_key: idempotencyKey, request_hash: requestHash({ ...command, command_id: null, created_at: null }), resource_type: `browser_session.${kind}`, resource_id: sessionId, created_at: this.now() });
      if (reservation.kind === "existing") return accepted({ command_id: idempotencyKey, object_type: "browser_session", object_id: sessionId, workspace_id: body.workspace_id });
      if (current.revision !== expectedVersion) throw versionConflict();
      const nextStatus = statusAfterCommand(current.status, kind);
      if (!canTransitionBrowserComputerSession(current.status, nextStatus)) throw invalidState();
      const next = parseSessionDescriptor({ ...current, status: nextStatus, takeover_by: kind === "takeover" ? actorRef(actor) : current.takeover_by, updated_at: this.now() });
      this.sessions.update(next, expectedVersion);
      return accepted({ command_id: idempotencyKey, object_type: "browser_session", object_id: sessionId, workspace_id: body.workspace_id });
    });
  }

  acknowledgeReceipt(input: unknown, receiptId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const workspaceId = this.requireAdminForInput(input, actor);
    const body = ReceiptAcknowledgementInputSchema.parse(input);
    if (body.workspace_id !== workspaceId) throw invalidScope();
    return withTransaction(this.options.database, () => {
      const receipt = this.getActionReceipt(body.workspace_id, receiptId);
      if (receipt.revision !== expectedVersion) throw versionConflict();
      const requestDigest = requestHash({ ...body, receipt_id: receiptId, expected_version: expectedVersion });
      const existingReservation = this.idempotency.get(body.workspace_id, idempotencyKey);
      if (existingReservation !== undefined) {
        if (existingReservation.request_hash !== requestDigest || existingReservation.resource_type !== "browser_action_receipt") throw idempotencyConflict();
        return accepted({ command_id: idempotencyKey, object_type: "browser_action_receipt", object_id: existingReservation.resource_id, workspace_id: body.workspace_id });
      }
      if (receipt.status === "acknowledged") throw invalidState();
      const acknowledgedReceipt = this.receipts.listBySession(receipt.workspace_id, receipt.session_id).find((stored) => stored.action_intent_id === receipt.action_intent_id && stored.status === "acknowledged");
      if (acknowledgedReceipt !== undefined) throw invalidState();
      const resourceId = this.options.idFactory();
      const reservation = this.idempotency.reserveOrGet({ workspace_id: body.workspace_id, idempotency_key: idempotencyKey, request_hash: requestDigest, resource_type: "browser_action_receipt", resource_id: resourceId, created_at: this.now() });
      const acknowledged = ActionReceiptSchema.parse({
        id: reservation.record.resource_id,
        workspace_id: receipt.workspace_id,
        schema_version: 1,
        created_at: this.now(),
        updated_at: this.now(),
        session_id: receipt.session_id,
        action_intent_id: receipt.action_intent_id,
        status: "acknowledged",
        result_ref: receipt.result_ref,
        screenshot_id: receipt.screenshot_id,
        error_code: null,
        error_message: body.reason ?? null,
        external_effect: false,
        descriptor_only: true,
      });
      this.receipts.recordActionReceipt(acknowledged);
      return accepted({ command_id: idempotencyKey, object_type: "browser_action_receipt", object_id: acknowledged.id, workspace_id: acknowledged.workspace_id });
    });
  }

  private register<TRecord extends { readonly id: string; readonly workspace_id: string }>(record: TRecord, idempotencyKey: string, objectType: string, create: () => TRecord): AcceptedCommand {
    return withTransaction(this.options.database, () => {
      const reservation = this.idempotency.reserveOrGet({ workspace_id: record.workspace_id, idempotency_key: idempotencyKey, request_hash: requestHash(stripMetadataTimestamps(record)), resource_type: objectType, resource_id: record.id, created_at: this.now() });
      if (reservation.kind === "existing") return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: reservation.record.resource_id, workspace_id: record.workspace_id });
      create();
      return accepted({ command_id: idempotencyKey, object_type: objectType, object_id: record.id, workspace_id: record.workspace_id });
    });
  }

  private ensureSandboxPolicy(workspaceId: string, policyId: string, now: string): void {
    if (this.policies.get(workspaceId, policyId) !== undefined) return;
    this.policies.create(SandboxPolicySchema.parse({
      id: policyId,
      workspace_id: workspaceId,
      schema_version: 1,
      created_at: now,
      updated_at: now,
      revision: 1,
      name: "Browser/Computer default sandbox",
      network_mode: "deny_by_default",
      filesystem_mode: "deny",
      clipboard_mode: "deny",
      credential_mode: "deny",
      automation_mode: "approval_required",
      allowed_target_kinds: ["browser_url", "computer_app"],
      descriptor_only: true,
    }));
  }

  private requireSession(workspaceId: string, sessionId: string): BrowserComputerSessionDescriptor {
    const session = this.sessions.get(WorkspaceIdSchema.parse(workspaceId), sessionId);
    if (session === undefined) throw notFound();
    return session;
  }

  private policyForStoredAction(action: ActionIntent | undefined): BrowserComputerExecutionDecision {
    if (action === undefined) return { allowed: false, code: "POLICY_DENIED", required_action: "approve_browser_target" };
    const approval = this.approvals.getByAction(action.workspace_id, action.session_id, action.id);
    const allowlist = this.allowlist.listBySession(action.workspace_id, action.session_id);
    return canExecuteActionIntent(action, allowlist, approval ?? null, this.now());
  }

  private ensureCompletedReceipt(action: ActionIntent): void {
    const existing = this.receipts.listBySession(action.workspace_id, action.session_id).find((receipt) => receipt.action_intent_id === action.id && receipt.status === "completed");
    if (existing !== undefined) return;
    this.receipts.recordActionReceipt(ActionReceiptSchema.parse({
      id: action.id,
      workspace_id: action.workspace_id,
      schema_version: 1,
      created_at: this.now(),
      updated_at: this.now(),
      session_id: action.session_id,
      action_intent_id: action.id,
      status: "completed",
      result_ref: "artifact://receipts/browser-computer/descriptor-action.json",
      screenshot_id: null,
      error_code: null,
      error_message: null,
      external_effect: false,
      descriptor_only: true,
    }));
  }

  private requireAdmin(actor: PolicyActor, workspaceId: string): void {
    const decision = assertScope({ actor, action: "workspace:admin", enforcement_point: "api", requested_scope: { kind: "workspace", id: WorkspaceIdSchema.parse(workspaceId) } });
    if (!decision.allowed) throw new ApiHttpError({ status_code: 403, code: decision.code, message: decision.reason, retryable: false, required_action: decision.required_action });
  }

  private requireAdminForInput(input: unknown, actor: PolicyActor): string {
    const workspaceId = WorkspaceOnlyInputSchema.parse(input).workspace_id;
    this.requireAdmin(actor, workspaceId);
    return workspaceId;
  }

  private now(): string { return this.options.clock.now(); }
}

function parseSessionDescriptor(value: unknown): BrowserComputerSessionDescriptor {
  const kind = z.object({ kind: z.enum(["browser", "computer"]) }).passthrough().parse(value).kind;
  return kind === "browser" ? BrowserSessionDescriptorSchema.parse(value) : ComputerUseSessionDescriptorSchema.parse(value);
}

function fillMissingTimestamps(input: unknown, now: string): unknown {
  if (!isPlainRecord(input)) return input;
  return { ...input, created_at: input["created_at"] ?? now, updated_at: input["updated_at"] ?? now };
}

function stripMetadataTimestamps(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => stripMetadataTimestamps(item));
  if (!isPlainRecord(input)) return input;
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "created_at" || key === "updated_at") continue;
    stripped[key] = stripMetadataTimestamps(value);
  }
  return stripped;
}

function actionRequestHash(action: ActionIntent): string {
  return requestHash({ action_payload_hash: browserComputerActionPayloadHash(action) });
}

function actionOutcomeResourceType(policy: BrowserComputerExecutionDecision): string {
  if (policy.allowed) return "browser_action.completed";
  return policy.code === "APPROVAL_REQUIRED" ? "browser_action.pending_approval" : "browser_action.policy_denied";
}

function isBrowserActionOutcomeResourceType(resourceType: string): boolean {
  return resourceType === "browser_action" || resourceType === "browser_action.completed" || resourceType === "browser_action.pending_approval" || resourceType === "browser_action.policy_denied";
}

function policyForRecordedActionOutcome(resourceType: string, action: ActionIntent | undefined): BrowserComputerExecutionDecision {
  if (resourceType === "browser_action.completed") return { allowed: true, code: "POLICY_ALLOWED", required_action: "record_descriptor_receipt" };
  if (resourceType === "browser_action.pending_approval") return { allowed: false, code: "APPROVAL_REQUIRED", required_action: "approve_action" };
  if (resourceType === "browser_action.policy_denied") return { allowed: false, code: "POLICY_DENIED", required_action: "approve_browser_target" };
  return policyForStoredActionStatus(action);
}

function policyForStoredActionStatus(action: ActionIntent | undefined): BrowserComputerExecutionDecision {
  if (action === undefined) return { allowed: false, code: "POLICY_DENIED", required_action: "approve_browser_target" };
  if (action.status === "completed") return { allowed: true, code: "POLICY_ALLOWED", required_action: "record_descriptor_receipt" };
  if (action.status === "pending_approval" || action.status === "approved") return { allowed: false, code: "APPROVAL_REQUIRED", required_action: "approve_action" };
  return { allowed: false, code: "POLICY_DENIED", required_action: "approve_browser_target" };
}

function statusAfterCommand(current: BrowserComputerSessionDescriptor["status"], kind: BrowserComputerCommandKind): BrowserComputerSessionDescriptor["status"] {
  BrowserComputerSessionStatusSchema.parse(current);
  if (kind === "pause") return "paused";
  if (kind === "resume") return "active";
  if (kind === "stop") return "stopped";
  return "takeover_requested";
}

function actorRef(actor: PolicyActor): string {
  return `${actor.role.toLowerCase()}:${actor.id}`;
}

function policyDenied(policy: BrowserComputerExecutionDecision): ApiHttpError {
  if (policy.allowed) throw new Error("Allowed policy cannot be denied");
  if (policy.code === "APPROVAL_REQUIRED") return new ApiHttpError({ status_code: 403, code: "POLICY_REVIEW_REQUIRED", message: "Browser/computer action requires human approval", retryable: false, required_action: policy.required_action });
  return new ApiHttpError({ status_code: 403, code: "POLICY_DENIED", message: "Browser/computer target is not allowlisted", retryable: false, required_action: policy.required_action });
}

function notFound(): ApiHttpError { return new ApiHttpError({ status_code: 404, code: "SCOPE_DENIED", message: "Resource not found", retryable: false, required_action: "check_scope" }); }
function invalidScope(): ApiHttpError { return new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "Request scope does not match browser/computer resource", retryable: false, required_action: "correct_request" }); }
function versionConflict(): ApiHttpError { return new ApiHttpError({ status_code: 409, code: "VERSION_CONFLICT", message: "Browser/computer revision is stale", retryable: true, required_action: "refresh_state" }); }
function idempotencyConflict(): ApiHttpError { return new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency key was reused with a different browser/computer request", retryable: false, required_action: "use_new_idempotency_key" }); }
function invalidState(): ApiHttpError { return new ApiHttpError({ status_code: 409, code: "INVALID_STATE_TRANSITION", message: "Browser/computer session state does not allow this command", retryable: false, required_action: "refresh_state" }); }

function requireBrowserComputerFact<TFact>(fact: TFact | undefined): TFact {
  if (fact === undefined) throw notFound();
  return fact;
}

function isPlainRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
