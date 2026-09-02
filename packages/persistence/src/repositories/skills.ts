import type { SQLInputValue } from "node:sqlite";
import {
  LearningCandidateSchema,
  LearningCommandSchema,
  SkillDescriptorSchema,
  SkillInstallationSchema,
  SkillInvocationFactSchema,
  SkillReviewSchema,
  SkillScanSchema,
  SkillSourceSchema,
  SkillVersionSchema,
  canInvokeSkillSnapshot,
  canTransitionSkillInstallation,
  type LearningCandidate,
  type LearningCommand,
  type SkillDescriptor,
  type SkillInstallation,
  type SkillInvocationFact,
  type SkillReview,
  type SkillScan,
  type SkillSource,
  type SkillVersion,
} from "@nexora/contracts";
import { withTransaction, type SqliteDatabase } from "../db.js";
import { PersistenceError, json, readJson, sqliteError, updateChanged } from "./utils.js";

export class SkillRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): SkillDescriptor {
    const parsed = SkillDescriptorSchema.parse(record);
    requireSkillPointerIntegrity(this.database, parsed);
    try {
      this.database.prepare("INSERT INTO skills(id, workspace_id, name, description, status, current_version_id, approved_version_id, capabilities_json, tags_json, quarantine_reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.name, parsed.description, parsed.status, parsed.current_version_id, parsed.approved_version_id, json(parsed.capabilities), json(parsed.tags), parsed.quarantine_reason, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): SkillDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM skills WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : SkillDescriptorSchema.parse({ ...readJson(row["payload_json"], SkillDescriptorSchema), revision: readVersion(row["version"], "Skill") });
  }

  list(workspaceId: string): readonly SkillDescriptor[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM skills WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId);
    return rows.map((row) => SkillDescriptorSchema.parse({ ...readJson(row["payload_json"], SkillDescriptorSchema), revision: readVersion(row["version"], "Skill") }));
  }

  update(record: unknown, expectedVersion: number): SkillDescriptor {
    const parsed = SkillDescriptorSchema.parse(record);
    requireSkillPointerIntegrity(this.database, parsed);
    const updated = SkillDescriptorSchema.parse({ ...parsed, revision: expectedVersion + 1 });
    const result = this.database.prepare("UPDATE skills SET name = ?, description = ?, status = ?, current_version_id = ?, approved_version_id = ?, capabilities_json = ?, tags_json = ?, quarantine_reason = ?, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?").run(updated.name, updated.description, updated.status, updated.current_version_id, updated.approved_version_id, json(updated.capabilities), json(updated.tags), updated.quarantine_reason, json(updated), updated.schema_version, updated.updated_at, updated.workspace_id, updated.id, expectedVersion);
    updateChanged(result, "Skill");
    return updated;
  }
}

export class SkillVersionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): SkillVersion {
    const parsed = SkillVersionSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO skill_versions(id, workspace_id, skill_id, semver, status, source_hash, snapshot_hash, snapshot_ref, diff_hash, diff_summary, approved_at, approved_by, revoked_at, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(...skillVersionValues(parsed));
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): SkillVersion | undefined {
    const row = this.database.prepare("SELECT payload_json FROM skill_versions WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], SkillVersionSchema);
  }

  approve(input: { readonly workspace_id: string; readonly skill_id: string; readonly version_id: string; readonly approved_by: string; readonly approved_at: string }): SkillVersion {
    const current = this.get(input.workspace_id, input.version_id);
    if (current === undefined || current.skill_id !== input.skill_id) throw new PersistenceError("NOT_FOUND", "Skill version not found");
    const approvedSnapshotHash = requireApprovedReviewSnapshot(this.database, input.workspace_id, input.skill_id, input.version_id);
    if (current.status === "approved") {
      if (current.snapshot_hash === null || current.snapshot_ref === null) throw new PersistenceError("CONSTRAINT_VIOLATION", "Skill approval requires an approved snapshot");
      if (current.snapshot_hash !== approvedSnapshotHash) throw new PersistenceError("CONSTRAINT_VIOLATION", "Skill approval snapshot must match the approved review snapshot");
      return current;
    }
    if (current.snapshot_ref === null) throw new PersistenceError("CONSTRAINT_VIOLATION", "Skill approval requires a snapshot reference");
    const approved = SkillVersionSchema.parse({ ...current, status: "approved", snapshot_hash: approvedSnapshotHash, approved_at: input.approved_at, approved_by: input.approved_by, updated_at: input.approved_at });
    try {
      const result = this.database.prepare("UPDATE skill_versions SET status = ?, snapshot_hash = ?, snapshot_ref = ?, approved_at = ?, approved_by = ?, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND skill_id = ?").run(approved.status, approved.snapshot_hash, approved.snapshot_ref, approved.approved_at, approved.approved_by, json(approved), approved.schema_version, approved.updated_at, approved.workspace_id, approved.id, approved.skill_id);
      updateChanged(result, "SkillVersion");
      return approved;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listBySkill(workspaceId: string, skillId: string): readonly SkillVersion[] {
    const rows = this.database.prepare("SELECT payload_json FROM skill_versions WHERE workspace_id = ? AND skill_id = ? ORDER BY created_at DESC, id ASC").all(workspaceId, skillId);
    return rows.map((row) => readJson(row["payload_json"], SkillVersionSchema));
  }

}

export class SkillSourceRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): SkillSource {
    const parsed = SkillSourceSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO skill_sources(id, workspace_id, skill_id, version_id, source_kind, source_ref, source_hash, diff_hash, diff_summary, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.skill_id, parsed.version_id, parsed.source_kind, parsed.source_ref, parsed.source_hash, parsed.diff_hash, parsed.diff_summary, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listByVersion(workspaceId: string, versionId: string): readonly SkillSource[] {
    const rows = this.database.prepare("SELECT payload_json FROM skill_sources WHERE workspace_id = ? AND version_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, versionId);
    return rows.map((row) => readJson(row["payload_json"], SkillSourceSchema));
  }

  listBySkill(workspaceId: string, skillId: string): readonly SkillSource[] {
    const rows = this.database.prepare("SELECT payload_json FROM skill_sources WHERE workspace_id = ? AND skill_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, skillId);
    return rows.map((row) => readJson(row["payload_json"], SkillSourceSchema));
  }
}

export class SkillScanRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): SkillScan {
    const parsed = SkillScanSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO skill_scans(id, workspace_id, skill_id, version_id, source_hash, status, findings_json, secret_findings, scanned_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.skill_id, parsed.version_id, parsed.source_hash, parsed.status, json(parsed.findings), parsed.secret_findings, parsed.scanned_at, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listByVersion(workspaceId: string, versionId: string): readonly SkillScan[] {
    const rows = this.database.prepare("SELECT payload_json FROM skill_scans WHERE workspace_id = ? AND version_id = ? ORDER BY scanned_at ASC, id ASC").all(workspaceId, versionId);
    return rows.map((row) => readJson(row["payload_json"], SkillScanSchema));
  }

  listBySkill(workspaceId: string, skillId: string): readonly SkillScan[] {
    const rows = this.database.prepare("SELECT payload_json FROM skill_scans WHERE workspace_id = ? AND skill_id = ? ORDER BY scanned_at ASC, id ASC").all(workspaceId, skillId);
    return rows.map((row) => readJson(row["payload_json"], SkillScanSchema));
  }
}

export class SkillReviewRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): SkillReview {
    const parsed = SkillReviewSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO skill_reviews(id, workspace_id, skill_id, version_id, scan_id, decision, reviewer_ref, reason, approved_snapshot_hash, decided_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.skill_id, parsed.version_id, parsed.scan_id, parsed.decision, parsed.reviewer_ref, parsed.reason, parsed.approved_snapshot_hash, parsed.decided_at, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listByVersion(workspaceId: string, versionId: string): readonly SkillReview[] {
    const rows = this.database.prepare("SELECT payload_json FROM skill_reviews WHERE workspace_id = ? AND version_id = ? ORDER BY decided_at ASC, id ASC").all(workspaceId, versionId);
    return rows.map((row) => readJson(row["payload_json"], SkillReviewSchema));
  }

  listBySkill(workspaceId: string, skillId: string): readonly SkillReview[] {
    const rows = this.database.prepare("SELECT payload_json FROM skill_reviews WHERE workspace_id = ? AND skill_id = ? ORDER BY decided_at ASC, id ASC").all(workspaceId, skillId);
    return rows.map((row) => readJson(row["payload_json"], SkillReviewSchema));
  }
}

export class SkillInstallationRepository {
  constructor(private readonly database: SqliteDatabase) {}

  install(record: unknown): SkillInstallation {
    const parsed = SkillInstallationSchema.parse(record);
    if (!canInvokeSkillSnapshot(parsed)) throw new PersistenceError("CONSTRAINT_VIOLATION", "Skill installation requires an approved snapshot");
    this.requireApprovedVersion(parsed);
    if (this.hasActiveInstallationForSkill(parsed)) throw new PersistenceError("VERSION_CONFLICT", "Skill is already installed in this workspace");
    if (this.hasInstallationForVersion(parsed)) throw new PersistenceError("VERSION_CONFLICT", "Skill version is already installed in this workspace");
    try {
      this.database.prepare("INSERT INTO skill_installations(id, workspace_id, skill_id, version_id, status, approved_snapshot_hash, installed_at, revoked_at, quarantine_reason, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(...skillInstallationValues(parsed));
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): SkillInstallation | undefined {
    const row = this.database.prepare("SELECT payload_json, version FROM skill_installations WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readInstallation(row);
  }

  list(workspaceId: string): readonly SkillInstallation[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM skill_installations WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId);
    return rows.map(readInstallation);
  }

  listBySkill(workspaceId: string, skillId: string): readonly SkillInstallation[] {
    const rows = this.database.prepare("SELECT payload_json, version FROM skill_installations WHERE workspace_id = ? AND skill_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId, skillId);
    return rows.map(readInstallation);
  }

  update(record: unknown, expectedVersion: number): SkillInstallation {
    const parsed = SkillInstallationSchema.parse(record);
    const current = this.get(parsed.workspace_id, parsed.id);
    if (current === undefined) throw new PersistenceError("NOT_FOUND", "Skill installation not found");
    if (current.skill_id !== parsed.skill_id || current.version_id !== parsed.version_id) throw new PersistenceError("VERSION_CONFLICT", "Skill installation scope is immutable");
    if (current.status !== parsed.status && !canTransitionSkillInstallation(current.status, parsed.status)) throw new PersistenceError("VERSION_CONFLICT", "Skill installation status transition is invalid");
    if (parsed.status === "rolled_back") this.requireRollbackTarget(parsed);
    const updated = SkillInstallationSchema.parse({ ...parsed, revision: expectedVersion + 1 });
    const result = this.database.prepare("UPDATE skill_installations SET status = ?, approved_snapshot_hash = ?, installed_at = ?, revoked_at = ?, quarantine_reason = ?, rollback_to_version_id = ?, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?").run(updated.status, updated.approved_snapshot_hash, updated.installed_at, updated.revoked_at, updated.quarantine_reason, updated.rollback_to_version_id, json(updated), updated.schema_version, updated.updated_at, updated.workspace_id, updated.id, expectedVersion);
    updateChanged(result, "SkillInstallation");
    return updated;
  }

  private requireApprovedVersion(installation: SkillInstallation): void {
    const row = this.database.prepare("SELECT snapshot_hash FROM skill_versions WHERE workspace_id = ? AND id = ? AND skill_id = ? AND status = 'approved' AND snapshot_ref IS NOT NULL").get(installation.workspace_id, installation.version_id, installation.skill_id);
    if (row === undefined || row["snapshot_hash"] !== installation.approved_snapshot_hash) throw new PersistenceError("CONSTRAINT_VIOLATION", "Skill installation requires approved version snapshot");
  }

  private hasInstallationForVersion(installation: SkillInstallation): boolean {
    return this.database.prepare("SELECT 1 AS present FROM skill_installations WHERE workspace_id = ? AND skill_id = ? AND version_id = ?").get(installation.workspace_id, installation.skill_id, installation.version_id) !== undefined;
  }

  private hasActiveInstallationForSkill(installation: SkillInstallation): boolean {
    return this.database.prepare("SELECT 1 AS present FROM skill_installations WHERE workspace_id = ? AND skill_id = ? AND status IN ('installed', 'quarantined', 'rolled_back')").get(installation.workspace_id, installation.skill_id) !== undefined;
  }

  private requireRollbackTarget(installation: SkillInstallation): void {
    const target = installation.rollback_to_version_id;
    if (target === null) throw new PersistenceError("CONSTRAINT_VIOLATION", "Skill rollback target is required");
    if (target === installation.version_id) throw new PersistenceError("CONSTRAINT_VIOLATION", "Skill rollback target must differ from current version");
    const row = this.database.prepare("SELECT 1 AS present FROM skill_versions WHERE workspace_id = ? AND id = ? AND skill_id = ? AND status = 'approved' AND snapshot_hash IS NOT NULL AND snapshot_ref IS NOT NULL").get(installation.workspace_id, target, installation.skill_id);
    if (row === undefined) throw new PersistenceError("CONSTRAINT_VIOLATION", "Skill rollback target requires same skill approved snapshot");
  }
}

export class SkillInvocationFactRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): SkillInvocationFact {
    const parsed = SkillInvocationFactSchema.parse(record);
    this.requireGoalRunScope(parsed.workspace_id, parsed.goal_loop_id, parsed.run_id);
    if (parsed.status === "allowed" && !this.hasInstalledSnapshot(parsed)) throw new PersistenceError("CONSTRAINT_VIOLATION", "Skill invocation requires approved installed snapshot");
    try {
      this.database.prepare("INSERT INTO skill_invocation_facts(id, workspace_id, skill_id, version_id, installation_id, run_id, goal_loop_id, status, snapshot_hash, reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.skill_id, parsed.version_id, parsed.installation_id, parsed.run_id, parsed.goal_loop_id, parsed.status, parsed.snapshot_hash, parsed.reason, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  listByRun(workspaceId: string, runId: string): readonly SkillInvocationFact[] {
    const rows = this.database.prepare("SELECT payload_json FROM skill_invocation_facts WHERE workspace_id = ? AND run_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, runId);
    return rows.map((row) => readJson(row["payload_json"], SkillInvocationFactSchema));
  }

  listBySkill(workspaceId: string, skillId: string): readonly SkillInvocationFact[] {
    const rows = this.database.prepare("SELECT payload_json FROM skill_invocation_facts WHERE workspace_id = ? AND skill_id = ? ORDER BY created_at ASC, id ASC").all(workspaceId, skillId);
    return rows.map((row) => readJson(row["payload_json"], SkillInvocationFactSchema));
  }

  private hasInstalledSnapshot(fact: SkillInvocationFact): boolean {
    const row = this.database.prepare("SELECT 1 AS present FROM skill_installations WHERE workspace_id = ? AND id = ? AND skill_id = ? AND version_id = ? AND status = 'installed' AND approved_snapshot_hash = ?").get(fact.workspace_id, fact.installation_id, fact.skill_id, fact.version_id, fact.snapshot_hash);
    return row !== undefined;
  }

  private requireGoalRunScope(workspaceId: string, goalLoopId: string, runId: string): void {
    const row = this.database.prepare("SELECT 1 AS present FROM goal_loops WHERE workspace_id = ? AND id = ? AND run_id = ?").get(workspaceId, goalLoopId, runId);
    if (row === undefined) throw new PersistenceError("NOT_FOUND", "Skill invocation run/goal scope mismatch");
  }
}

export class LearningCandidateRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: unknown): LearningCandidate {
    const parsed = LearningCandidateSchema.parse(record);
    this.requireGoalRunScope(parsed.workspace_id, parsed.goal_loop_id, parsed.run_id);
    this.requireProposedSkillScope(parsed.workspace_id, parsed.proposed_skill_id);
    this.requireSourceEventScope(parsed.workspace_id, parsed.run_id, parsed.goal_loop_id, parsed.source_event_id, parsed.proposed_skill_id);
    try {
      this.database.prepare("INSERT INTO learning_candidates(id, workspace_id, run_id, goal_loop_id, source_event_id, proposed_skill_id, lesson, proposed_diff_summary, evidence_refs_json, status, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.run_id, parsed.goal_loop_id, parsed.source_event_id, parsed.proposed_skill_id, parsed.lesson, parsed.proposed_diff_summary, json(parsed.evidence_refs), parsed.status, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): LearningCandidate | undefined {
    const row = this.database.prepare("SELECT payload_json FROM learning_candidates WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], LearningCandidateSchema);
  }

  list(workspaceId: string): readonly LearningCandidate[] {
    const rows = this.database.prepare("SELECT payload_json FROM learning_candidates WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId);
    return rows.map((row) => readJson(row["payload_json"], LearningCandidateSchema));
  }

  listBySkill(workspaceId: string, skillId: string): readonly LearningCandidate[] {
    const rows = this.database.prepare("SELECT payload_json FROM learning_candidates WHERE workspace_id = ? AND proposed_skill_id = ? ORDER BY updated_at DESC, id ASC").all(workspaceId, skillId);
    return rows.map((row) => readJson(row["payload_json"], LearningCandidateSchema));
  }

  private requireGoalRunScope(workspaceId: string, goalLoopId: string, runId: string): void {
    const row = this.database.prepare("SELECT 1 AS present FROM goal_loops WHERE workspace_id = ? AND id = ? AND run_id = ?").get(workspaceId, goalLoopId, runId);
    if (row === undefined) throw new PersistenceError("NOT_FOUND", "Learning candidate run/goal scope mismatch");
  }

  private requireProposedSkillScope(workspaceId: string, proposedSkillId: string): void {
    const row = this.database.prepare("SELECT 1 AS present FROM skills WHERE workspace_id = ? AND id = ?").get(workspaceId, proposedSkillId);
    if (row === undefined) throw new PersistenceError("NOT_FOUND", "Learning candidate proposed skill scope mismatch");
  }

  private requireSourceEventScope(workspaceId: string, runId: string, goalLoopId: string, sourceEventId: string, proposedSkillId: string): void {
    const row = this.database.prepare(`SELECT 1 AS present FROM events event
      JOIN goal_loops goal_loop ON goal_loop.workspace_id = event.workspace_id
        AND goal_loop.id = ?
        AND goal_loop.id = json_extract(event.payload_json, '$.payload.goal_loop_id')
        AND goal_loop.run_id = event.run_id
        AND goal_loop.continuation_cursor IS json_extract(event.payload_json, '$.payload.continuation_cursor')
      WHERE event.workspace_id = ?
        AND event.run_id = ?
        AND event.event_id = ?
        AND event.event_type = 'learning.source'
        AND json_extract(event.payload_json, '$.payload.proposed_skill_id') = ?`).get(goalLoopId, workspaceId, runId, sourceEventId, proposedSkillId);
    if (row === undefined) throw new PersistenceError("NOT_FOUND", "Learning candidate source event skill loop scope mismatch");
  }
}

export class LearningCommandRepository {
  constructor(private readonly database: SqliteDatabase) {}

  record(record: unknown): LearningCommand {
    const parsed = LearningCommandSchema.parse(record);
    return withTransaction(this.database, () => {
      const existing = this.getByIdempotency(parsed.workspace_id, parsed.idempotency_key);
      if (existing !== undefined) {
        if (!sameLearningCommandRequest(existing, parsed)) throw new PersistenceError("IDEMPOTENCY_KEY_REUSED", "Learning command idempotency key conflict");
        return existing;
      }
      try {
        this.database.prepare("INSERT INTO learning_commands(command_id, workspace_id, kind, idempotency_key, expected_revision, installation_revision, candidate_id, skill_id, version_id, reason, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)").run(parsed.command_id, parsed.workspace_id, parsed.kind, parsed.idempotency_key, parsed.expected_revision, parsed.installation_revision, parsed.candidate_id, parsed.skill_id, parsed.version_id, parsed.reason, parsed.rollback_to_version_id, json(parsed), parsed.schema_version, parsed.created_at);
        return parsed;
      } catch (error) {
        throw sqliteError(error);
      }
    });
  }

  list(workspaceId: string): readonly LearningCommand[] {
    const rows = this.database.prepare("SELECT payload_json FROM learning_commands WHERE workspace_id = ? ORDER BY created_at ASC, command_id ASC").all(workspaceId);
    return rows.map((row) => readJson(row["payload_json"], LearningCommandSchema));
  }

  getByIdempotency(workspaceId: string, idempotencyKey: string): LearningCommand | undefined {
    const row = this.database.prepare("SELECT payload_json FROM learning_commands WHERE workspace_id = ? AND idempotency_key = ?").get(workspaceId, idempotencyKey);
    return row === undefined ? undefined : readJson(row["payload_json"], LearningCommandSchema);
  }
}

function skillVersionValues(record: SkillVersion): readonly SQLInputValue[] {
  return [record.id, record.workspace_id, record.skill_id, record.semver, record.status, record.source_hash, record.snapshot_hash, record.snapshot_ref, record.diff_hash, record.diff_summary, record.approved_at, record.approved_by, record.revoked_at, record.rollback_to_version_id, json(record), record.schema_version, record.created_at, record.updated_at];
}

function skillInstallationValues(record: SkillInstallation): readonly SQLInputValue[] {
  return [record.id, record.workspace_id, record.skill_id, record.version_id, record.status, record.approved_snapshot_hash, record.installed_at, record.revoked_at, record.quarantine_reason, record.rollback_to_version_id, json(record), record.schema_version, record.created_at, record.updated_at];
}

function sameLearningCommandRequest(left: LearningCommand, right: LearningCommand): boolean {
  return left.workspace_id === right.workspace_id
    && left.schema_version === right.schema_version
    && left.kind === right.kind
    && left.idempotency_key === right.idempotency_key
    && left.expected_revision === right.expected_revision
    && left.installation_revision === right.installation_revision
    && left.candidate_id === right.candidate_id
    && left.skill_id === right.skill_id
    && left.version_id === right.version_id
    && left.reason === right.reason
    && left.rollback_to_version_id === right.rollback_to_version_id
    && left.descriptor_only === right.descriptor_only;
}

function readVersion(value: unknown, entity: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "bigint") return Number(value);
  throw new PersistenceError("CONSTRAINT_VIOLATION", `${entity} version is invalid`);
}

function readInstallation(row: Record<string, unknown>): SkillInstallation {
  return SkillInstallationSchema.parse({ ...readJson(row["payload_json"], SkillInstallationSchema), revision: readVersion(row["version"], "SkillInstallation") });
}

function requireSkillPointerIntegrity(database: SqliteDatabase, skill: SkillDescriptor): void {
  if (skill.status === "active" && skill.approved_version_id === null) {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Active skill requires an approved version pointer");
  }
  if (skill.current_version_id !== null && !hasSkillVersion(database, skill.workspace_id, skill.id, skill.current_version_id)) {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Skill current version pointer must reference the same skill workspace");
  }
  if (skill.status === "active" && skill.current_version_id !== null) {
    requireApprovedSkillPointer(database, skill.workspace_id, skill.id, skill.current_version_id);
  }
  if (skill.approved_version_id !== null) {
    requireApprovedSkillPointer(database, skill.workspace_id, skill.id, skill.approved_version_id);
  }
}

function hasSkillVersion(database: SqliteDatabase, workspaceId: string, skillId: string, versionId: string): boolean {
  return database.prepare("SELECT 1 AS present FROM skill_versions WHERE workspace_id = ? AND skill_id = ? AND id = ?").get(workspaceId, skillId, versionId) !== undefined;
}

function requireApprovedSkillPointer(database: SqliteDatabase, workspaceId: string, skillId: string, versionId: string): void {
  const approvedSnapshotHash = requireApprovedReviewSnapshot(database, workspaceId, skillId, versionId);
  const row = database.prepare("SELECT status, snapshot_hash, snapshot_ref FROM skill_versions WHERE workspace_id = ? AND skill_id = ? AND id = ?").get(workspaceId, skillId, versionId);
  if (row === undefined || row["status"] !== "approved" || row["snapshot_hash"] !== approvedSnapshotHash || typeof row["snapshot_ref"] !== "string") {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Skill approved version pointer requires an approved snapshot and clean review scan");
  }
}

function requireApprovedReviewSnapshot(database: SqliteDatabase, workspaceId: string, skillId: string, versionId: string): string {
  const row = database.prepare(`SELECT review.approved_snapshot_hash FROM skill_reviews review
    JOIN skill_scans scan ON scan.workspace_id = review.workspace_id AND scan.id = review.scan_id AND scan.skill_id = review.skill_id AND scan.version_id = review.version_id
    JOIN skill_versions version ON version.workspace_id = review.workspace_id AND version.id = review.version_id AND version.skill_id = review.skill_id
    WHERE review.workspace_id = ?
      AND review.skill_id = ?
      AND review.version_id = ?
      AND review.decision = 'approve'
      AND review.approved_snapshot_hash IS NOT NULL
      AND scan.status = 'passed'
      AND scan.source_hash = version.source_hash
      AND scan.secret_findings = 0
      AND json_type(scan.findings_json) = 'array'
      AND json_array_length(scan.findings_json) = 0
    ORDER BY review.decided_at DESC, review.id DESC LIMIT 1`).get(workspaceId, skillId, versionId);
  const value = row?.["approved_snapshot_hash"];
  if (typeof value !== "string") throw new PersistenceError("CONSTRAINT_VIOLATION", "Skill approval requires an approved review snapshot and clean passed scan");
  return value;
}
