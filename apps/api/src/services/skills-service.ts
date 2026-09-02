import { z } from "zod";
import {
  LearningCandidateSchema,
  LearningCommandSchema,
  SkillDescriptorSchema,
  SkillInstallationSchema,
  UlidSchema,
  WorkspaceIdSchema,
  containsPathLikeText,
  containsSecretLikeText,
  type LearningCandidate,
  type LearningCommand,
  type SkillDescriptor,
  type SkillInstallation,
} from "@nexora/contracts";
import {
  LearningCandidateRepository,
  LearningCommandRepository,
  SkillInstallationRepository,
  SkillRepository,
  SkillVersionRepository,
  withTransaction,
  type SqliteDatabase,
} from "@nexora/persistence";
import { assertScope, type PolicyActor } from "@nexora/policy";
import { accepted } from "./command-helpers.js";
import type { AcceptedCommand, IdFactory } from "./command-service.js";
import { ApiHttpError } from "./errors.js";

export type SkillsServiceOptions = {
  readonly database: SqliteDatabase;
  readonly clock: { readonly now: () => string };
  readonly idFactory: IdFactory;
};

const LearningCandidateBodySchema = LearningCandidateSchema.omit({ id: true, created_at: true, updated_at: true, status: true }).strict();
const SkillLifecycleBodySchema = z.object({
  schema_version: z.literal(1),
  workspace_id: WorkspaceIdSchema,
  version_id: UlidSchema,
  reason: z.string().min(1).max(2000)
    .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
    .refine((value) => !containsPathLikeText(value), "local paths and credential refs are not allowed"),
  installation_revision: z.number().int().positive().optional(),
  rollback_to_version_id: UlidSchema.optional(),
}).strict();

type SkillLifecycleBody = z.infer<typeof SkillLifecycleBodySchema>;
type LearningCandidateBody = z.infer<typeof LearningCandidateBodySchema>;
type LifecycleKind = "approve" | "install" | "revoke" | "quarantine" | "rollback";

export class SkillsService {
  private readonly candidates: LearningCandidateRepository;
  private readonly commands: LearningCommandRepository;
  private readonly installations: SkillInstallationRepository;
  private readonly skills: SkillRepository;
  private readonly versions: SkillVersionRepository;

  constructor(private readonly options: SkillsServiceOptions) {
    this.candidates = new LearningCandidateRepository(options.database);
    this.commands = new LearningCommandRepository(options.database);
    this.installations = new SkillInstallationRepository(options.database);
    this.skills = new SkillRepository(options.database);
    this.versions = new SkillVersionRepository(options.database);
  }

  createLearningCandidate(input: unknown, actor: PolicyActor, idempotencyKey: string): AcceptedCommand {
    const body = LearningCandidateBodySchema.parse(input);
    this.requireAdmin(actor, body.workspace_id);
    return withTransaction(this.options.database, () => {
      const existing = this.replayLearningCandidate(body, idempotencyKey);
      if (existing !== undefined) {
        return accepted({ command_id: existing.command_id, object_type: "learning_candidate", object_id: this.requireCandidateId(existing), workspace_id: body.workspace_id });
      }
      if (this.skills.get(body.workspace_id, body.proposed_skill_id) === undefined) throw notFound();
      const candidateId = this.options.idFactory();
      const candidate = LearningCandidateSchema.parse({ ...body, id: candidateId, status: "needs_review", created_at: this.now(), updated_at: this.now() });
      this.candidates.create(candidate);
      const command = LearningCommandSchema.parse({
        schema_version: 1,
        command_id: candidateId,
        workspace_id: candidate.workspace_id,
        kind: "learn",
        idempotency_key: idempotencyKey,
        expected_revision: null,
        installation_revision: null,
        candidate_id: candidate.id,
        skill_id: null,
        version_id: null,
        reason: candidate.proposed_diff_summary,
        rollback_to_version_id: null,
        descriptor_only: true,
        created_at: this.now(),
      });
      this.commands.record(command);
      return accepted({ command_id: command.command_id, object_type: "learning_candidate", object_id: candidate.id, workspace_id: candidate.workspace_id });
    });
  }

  installSkill(input: unknown, skillId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const body = this.parseLifecycleBody(input, "install");
    return this.lifecycle(body, skillId, actor, idempotencyKey, expectedVersion, "install");
  }

  approveSkill(input: unknown, skillId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const body = this.parseLifecycleBody(input, "approve");
    return this.lifecycle(body, skillId, actor, idempotencyKey, expectedVersion, "approve");
  }

  revokeSkill(input: unknown, skillId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const body = this.parseLifecycleBody(input, "revoke");
    return this.lifecycle(body, skillId, actor, idempotencyKey, expectedVersion, "revoke");
  }

  quarantineSkill(input: unknown, skillId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const body = this.parseLifecycleBody(input, "quarantine");
    return this.lifecycle(body, skillId, actor, idempotencyKey, expectedVersion, "quarantine");
  }

  rollbackSkill(input: unknown, skillId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number): AcceptedCommand {
    const body = this.parseLifecycleBody(input, "rollback");
    if (body.rollback_to_version_id === undefined) {
      throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "rollback_to_version_id is required", retryable: false, required_action: "correct_request" });
    }
    return this.lifecycle(body, skillId, actor, idempotencyKey, expectedVersion, "rollback");
  }

  private parseLifecycleBody(input: unknown, kind: LifecycleKind): SkillLifecycleBody {
    const body = SkillLifecycleBodySchema.parse(input);
    if (kind !== "rollback" && body.rollback_to_version_id !== undefined) {
      throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "rollback_to_version_id is only accepted for rollback", retryable: false, required_action: "correct_request" });
    }
    if (requiresInstallationRevision(kind)) {
      if (body.installation_revision === undefined) {
        throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "installation_revision is required", retryable: false, required_action: "correct_request" });
      }
    } else if (body.installation_revision !== undefined) {
      throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "installation_revision is only accepted for revoke quarantine and rollback", retryable: false, required_action: "correct_request" });
    }
    return body;
  }

  private lifecycle(body: SkillLifecycleBody, skillId: string, actor: PolicyActor, idempotencyKey: string, expectedVersion: number, kind: LifecycleKind): AcceptedCommand {
    this.requireAdmin(actor, body.workspace_id);
    return withTransaction(this.options.database, () => {
      const existing = this.replayLifecycleCommand(body, skillId, idempotencyKey, expectedVersion, kind);
      if (existing !== undefined) return accepted({ command_id: existing.command_id, object_type: "skill", object_id: skillId, workspace_id: body.workspace_id });
      const skill = this.skills.get(body.workspace_id, skillId);
      if (skill === undefined) throw notFound();
      if (skill.revision !== expectedVersion) throw versionConflict("Skill revision does not match If-Match");
      const version = this.versions.get(body.workspace_id, body.version_id);
      if (version === undefined || version.skill_id !== skill.id) throw notFound();
      if (kind === "install" && (version.status !== "approved" || version.snapshot_hash === null)) throw approvedSnapshotRequired();
      if (kind === "approve") {
        const approvedVersion = this.versions.approve({ workspace_id: body.workspace_id, skill_id: skill.id, version_id: body.version_id, approved_by: actorRef(actor), approved_at: this.now() });
        const nextSkill = SkillDescriptorSchema.parse({ ...skill, status: "active", current_version_id: approvedVersion.id, approved_version_id: approvedVersion.id, quarantine_reason: null, updated_at: this.now() });
        this.skills.update(nextSkill, expectedVersion);
        const command = this.lifecycleCommand({ command_id: this.options.idFactory(), body, skill_id: skill.id, kind, idempotency_key: idempotencyKey, expected_revision: expectedVersion });
        this.commands.record(command);
        return accepted({ command_id: command.command_id, object_type: "skill", object_id: skill.id, workspace_id: skill.workspace_id });
      }
      const installation = kind === "install"
        ? this.installNewSkill({ skill_id: skill.id, body, snapshot_hash: this.requireSnapshotHash(version.snapshot_hash) })
        : this.updateExistingInstallation({ skill_id: skill.id, body, kind });
      if (kind === "install") {
        this.updateSkillForInstall({ skill, version_id: body.version_id });
      } else {
        this.updateSkillForInstallationLifecycle({ skill, body, kind });
      }
      const command = this.lifecycleCommand({ command_id: this.options.idFactory(), body, skill_id: skill.id, kind, idempotency_key: idempotencyKey, expected_revision: expectedVersion });
      this.commands.record(command);
      return accepted({ command_id: command.command_id, object_type: "skill", object_id: installation.skill_id, workspace_id: installation.workspace_id });
    });
  }

  private installNewSkill(input: { readonly skill_id: string; readonly body: SkillLifecycleBody; readonly snapshot_hash: string }): SkillInstallation {
    const installations = this.installations.listBySkill(input.body.workspace_id, input.skill_id);
    if (installations.some(isNonRevokedInstallation)) {
      throw versionConflict("Skill is already installed in this workspace");
    }
    if (installations.some((installation) => installation.version_id === input.body.version_id)) {
      throw versionConflict("Skill version is already installed in this workspace");
    }
    return this.installations.install(SkillInstallationSchema.parse({
      id: this.options.idFactory(),
      workspace_id: input.body.workspace_id,
      schema_version: 1,
      created_at: this.now(),
      updated_at: this.now(),
      skill_id: input.skill_id,
      version_id: input.body.version_id,
      status: "installed",
      approved_snapshot_hash: input.snapshot_hash,
      installed_at: this.now(),
      revoked_at: null,
      quarantine_reason: null,
      rollback_to_version_id: null,
      descriptor_only: true,
    }));
  }

  private updateSkillForInstall(input: { readonly skill: SkillDescriptor; readonly version_id: string }): void {
    const next = SkillDescriptorSchema.parse({
      ...input.skill,
      status: "active",
      current_version_id: input.version_id,
      approved_version_id: input.version_id,
      quarantine_reason: null,
      updated_at: this.now(),
    });
    this.skills.update(next, input.skill.revision);
  }

  private updateExistingInstallation(input: { readonly skill_id: string; readonly body: SkillLifecycleBody; readonly kind: "revoke" | "quarantine" | "rollback" }): SkillInstallation {
    const installation = this.installations.listBySkill(input.body.workspace_id, input.skill_id).find((candidate) => candidate.version_id === input.body.version_id);
    if (installation === undefined) throw notFound();
    if (input.kind === "rollback") this.requireRollbackTarget(input.body.workspace_id, input.skill_id, input.body.version_id, input.body.rollback_to_version_id ?? null);
    const next = SkillInstallationSchema.parse({
      ...installation,
      status: input.kind === "quarantine" ? "quarantined" : input.kind === "revoke" ? "revoked" : "rolled_back",
      revoked_at: input.kind === "revoke" ? this.now() : installation.revoked_at,
      quarantine_reason: input.kind === "quarantine" ? input.body.reason : installation.quarantine_reason,
      rollback_to_version_id: input.kind === "rollback" ? input.body.rollback_to_version_id ?? null : installation.rollback_to_version_id,
      updated_at: this.now(),
    });
    return this.installations.update(next, this.requireInstallationRevision(input.body));
  }

  private updateSkillForInstallationLifecycle(input: { readonly skill: SkillDescriptor; readonly body: SkillLifecycleBody; readonly kind: "revoke" | "quarantine" | "rollback" }): void {
    const next = SkillDescriptorSchema.parse({
      ...input.skill,
      status: input.kind === "quarantine" ? "quarantined" : input.kind === "revoke" ? "revoked" : "active",
      current_version_id: input.kind === "rollback" ? input.body.rollback_to_version_id ?? input.skill.current_version_id : input.skill.current_version_id,
      approved_version_id: input.kind === "rollback" ? input.body.rollback_to_version_id ?? input.skill.approved_version_id : input.skill.approved_version_id,
      quarantine_reason: input.kind === "quarantine" ? input.body.reason : null,
      updated_at: this.now(),
    });
    this.skills.update(next, input.skill.revision);
  }

  private lifecycleCommand(input: { readonly command_id: string; readonly body: SkillLifecycleBody; readonly skill_id: string; readonly kind: LifecycleKind; readonly idempotency_key: string; readonly expected_revision: number }): LearningCommand {
    return LearningCommandSchema.parse({
      schema_version: 1,
      command_id: input.command_id,
      workspace_id: input.body.workspace_id,
      kind: input.kind,
      idempotency_key: input.idempotency_key,
      expected_revision: input.expected_revision,
      installation_revision: requiresInstallationRevision(input.kind) ? this.requireInstallationRevision(input.body) : null,
      candidate_id: null,
      skill_id: input.skill_id,
      version_id: input.body.version_id,
      reason: input.body.reason,
      rollback_to_version_id: input.kind === "rollback" ? input.body.rollback_to_version_id ?? null : null,
      descriptor_only: true,
      created_at: this.now(),
    });
  }

  private replayLearningCandidate(body: LearningCandidateBody, idempotencyKey: string): LearningCommand | undefined {
    const existing = this.commands.getByIdempotency(body.workspace_id, idempotencyKey);
    if (existing === undefined) return undefined;
    if (existing.kind !== "learn") throw idempotencyConflict();
    const candidateId = this.requireCandidateId(existing);
    const candidate = this.candidates.get(body.workspace_id, candidateId);
    if (candidate === undefined || !sameLearningCandidateRequest(candidate, body)) throw idempotencyConflict();
    return this.commands.record(LearningCommandSchema.parse({
      schema_version: 1,
      command_id: existing.command_id,
      workspace_id: body.workspace_id,
      kind: "learn",
      idempotency_key: idempotencyKey,
      expected_revision: null,
      installation_revision: null,
      candidate_id: candidateId,
      skill_id: null,
      version_id: null,
      reason: body.proposed_diff_summary,
      rollback_to_version_id: null,
      descriptor_only: true,
      created_at: this.now(),
    }));
  }

  private replayLifecycleCommand(body: SkillLifecycleBody, skillId: string, idempotencyKey: string, expectedVersion: number, kind: LifecycleKind): LearningCommand | undefined {
    const existing = this.commands.getByIdempotency(body.workspace_id, idempotencyKey);
    if (existing === undefined) return undefined;
    return this.commands.record(this.lifecycleCommand({ command_id: existing.command_id, body, skill_id: skillId, kind, idempotency_key: idempotencyKey, expected_revision: expectedVersion }));
  }

  private requireCandidateId(command: LearningCommand): string {
    if (command.candidate_id === null) throw idempotencyConflict();
    return command.candidate_id;
  }

  private requireInstallationRevision(body: SkillLifecycleBody): number {
    if (body.installation_revision === undefined) throw new ApiHttpError({ status_code: 400, code: "SCHEMA_INVALID", message: "installation_revision is required", retryable: false, required_action: "correct_request" });
    return body.installation_revision;
  }

  private requireRollbackTarget(workspaceId: string, skillId: string, currentVersionId: string, rollbackToVersionId: string | null): void {
    if (rollbackToVersionId === null) throw approvedSnapshotRequired();
    if (rollbackToVersionId === currentVersionId) throw approvedSnapshotRequired();
    const target = this.versions.get(workspaceId, rollbackToVersionId);
    if (target === undefined || target.skill_id !== skillId || target.status !== "approved" || target.snapshot_hash === null) throw approvedSnapshotRequired();
  }

  private requireSnapshotHash(value: string | null): string {
    if (value === null) throw approvedSnapshotRequired();
    return value;
  }

  private requireAdmin(actor: PolicyActor, workspaceId: string): void {
    const decision = assertScope({ actor, action: "workspace:admin", enforcement_point: "api", requested_scope: { kind: "workspace", id: WorkspaceIdSchema.parse(workspaceId) } });
    if (!decision.allowed) throw new ApiHttpError({ status_code: 403, code: decision.code, message: decision.reason, retryable: false, required_action: decision.required_action });
  }

  private now(): string { return this.options.clock.now(); }
}

function sameLearningCandidateRequest(candidate: LearningCandidate, body: LearningCandidateBody): boolean {
  return candidate.workspace_id === body.workspace_id
    && candidate.schema_version === body.schema_version
    && candidate.run_id === body.run_id
    && candidate.goal_loop_id === body.goal_loop_id
    && candidate.source_event_id === body.source_event_id
    && candidate.proposed_skill_id === body.proposed_skill_id
    && candidate.lesson === body.lesson
    && candidate.proposed_diff_summary === body.proposed_diff_summary
    && candidate.descriptor_only === body.descriptor_only
    && sameStringArray(candidate.evidence_refs, body.evidence_refs);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isNonRevokedInstallation(installation: SkillInstallation): boolean {
  return installation.status === "installed" || installation.status === "quarantined" || installation.status === "rolled_back";
}

function requiresInstallationRevision(kind: LifecycleKind): boolean {
  return kind === "revoke" || kind === "quarantine" || kind === "rollback";
}

function actorRef(actor: PolicyActor): string {
  return `${actor.role.toLowerCase()}:${actor.id}`;
}

function idempotencyConflict(): ApiHttpError {
  return new ApiHttpError({ status_code: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Idempotency key was reused with a different learning request", retryable: false, required_action: "use_new_idempotency_key" });
}

function notFound(): ApiHttpError {
  return new ApiHttpError({ status_code: 404, code: "SCOPE_DENIED", message: "Resource not found", retryable: false, required_action: "check_scope" });
}

function versionConflict(message: string): ApiHttpError {
  return new ApiHttpError({ status_code: 409, code: "VERSION_CONFLICT", message, retryable: true, required_action: "refresh_state" });
}

function approvedSnapshotRequired(): ApiHttpError {
  return new ApiHttpError({ status_code: 409, code: "VERSION_CONFLICT", message: "Skill installation requires an approved snapshot", retryable: false, required_action: "inspect_constraint" });
}
