import { z } from "zod";
import { MetadataSchema, TimestampSchema } from "./common.js";
import { createEventEnvelopeSchema } from "./envelope.js";
import { containsSecretLikeText } from "./goal.js";
import { IdempotencyKeySchema } from "./gateway.js";
import { EventIdSchema, RunIdSchema, UlidSchema, WorkspaceIdSchema } from "./ids.js";
import { PayloadHashSchema } from "./policy.js";
import { DescriptorIdSchema } from "./registry.js";

const SkillNameSchema = secretSafeText(160);
const SkillDescriptionSchema = secretSafeText(1000);
const SkillCapabilitySchema = z.string().min(1).max(96).regex(/^[a-z][a-z0-9:._/-]*$/);
const SkillTagSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9._-]*$/);
const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
const INTERNAL_REFERENCE_SCHEMES = new Set(["artifact", "workspace", "memory", "skill", "journal"]);
const ActorRefSchema = z.string().min(1).max(160).regex(/^[a-z][a-z0-9._/-]*:[^\s]+$/)
  .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
  .refine((value) => !containsPathLikeText(value), "local paths and credential refs are not allowed");
const InternalRefSchema = z.string().min(1).max(512)
  .regex(/^(?:artifact|workspace|memory|skill):\/\/[^\s]+$/)
  .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
  .refine((value) => !containsPathLikeText(value), "local paths and credential refs are not allowed");

export const SkillStatusSchema = z.enum(["draft", "active", "quarantined", "revoked"]);
export const SkillVersionStatusSchema = z.enum(["draft", "pending_scan", "needs_review", "approved", "revoked", "quarantined"]);
export const SkillSourceKindSchema = z.enum(["workspace", "artifact", "memory", "manual"]);
export const SkillScanStatusSchema = z.enum(["passed", "failed", "quarantined"]);
export const SkillScanFindingSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const SkillReviewDecisionSchema = z.enum(["approve", "reject", "quarantine", "revoke"]);
export const SkillInstallationStatusSchema = z.enum(["installed", "revoked", "quarantined", "rolled_back"]);
export const SkillInvocationStatusSchema = z.enum(["allowed", "blocked"]);
export const LearningCandidateStatusSchema = z.enum(["draft", "needs_review", "approved", "rejected", "quarantined", "applied"]);
export const LearningCommandKindSchema = z.enum(["learn", "scan", "approve", "install", "revoke", "quarantine", "rollback"]);

const DescriptorMetadataSchema = z.object({
  id: DescriptorIdSchema,
  workspace_id: WorkspaceIdSchema,
  schema_version: z.literal(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  revision: z.number().int().positive().default(1),
}).strict();

const SkillScanFindingSchema = z.object({
  severity: SkillScanFindingSeveritySchema,
  code: z.string().min(1).max(96).regex(/^[A-Z0-9_]+$/),
  message: secretSafeText(512),
}).strict();

export const SkillDescriptorSchema = DescriptorMetadataSchema.extend({
  name: SkillNameSchema,
  description: SkillDescriptionSchema,
  status: SkillStatusSchema,
  current_version_id: UlidSchema.nullable(),
  approved_version_id: UlidSchema.nullable(),
  capabilities: z.array(SkillCapabilitySchema).min(1).max(128),
  tags: z.array(SkillTagSchema).max(64),
  quarantine_reason: secretSafeText(1000).nullable(),
  descriptor_only: z.literal(true),
}).strict().superRefine((descriptor, context) => {
  if (descriptor.status === "active" && descriptor.approved_version_id === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["approved_version_id"], message: "active skills require an approved version" });
  }
  if (descriptor.status === "quarantined" && descriptor.quarantine_reason === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["quarantine_reason"], message: "quarantined skills require a reason" });
  }
});

export const SkillVersionSchema = MetadataSchema.extend({
  skill_id: DescriptorIdSchema,
  semver: SemverSchema,
  status: SkillVersionStatusSchema,
  source_hash: PayloadHashSchema,
  snapshot_hash: PayloadHashSchema.nullable(),
  snapshot_ref: InternalRefSchema.nullable(),
  diff_hash: PayloadHashSchema,
  diff_summary: secretSafeText(2000),
  approved_at: TimestampSchema.nullable(),
  approved_by: ActorRefSchema.nullable(),
  revoked_at: TimestampSchema.nullable(),
  rollback_to_version_id: UlidSchema.nullable(),
  descriptor_only: z.literal(true),
}).strict().superRefine((version, context) => {
  if (version.status === "approved") {
    if (version.snapshot_hash === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["snapshot_hash"], message: "approved versions require a snapshot hash" });
    if (version.snapshot_ref === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["snapshot_ref"], message: "approved versions require a snapshot reference" });
    if (version.approved_at === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["approved_at"], message: "approved versions require approved_at" });
    if (version.approved_by === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["approved_by"], message: "approved versions require approved_by" });
  }
  if (version.status === "revoked" && version.revoked_at === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revoked_at"], message: "revoked versions require revoked_at" });
  }
});

export const SkillSourceSchema = MetadataSchema.extend({
  skill_id: DescriptorIdSchema,
  version_id: UlidSchema,
  source_kind: SkillSourceKindSchema,
  source_ref: InternalRefSchema,
  source_hash: PayloadHashSchema,
  diff_hash: PayloadHashSchema,
  diff_summary: secretSafeText(2000),
  descriptor_only: z.literal(true),
}).strict();

export const SkillScanSchema = MetadataSchema.extend({
  skill_id: DescriptorIdSchema,
  version_id: UlidSchema,
  source_hash: PayloadHashSchema,
  status: SkillScanStatusSchema,
  findings: z.array(SkillScanFindingSchema).max(100),
  secret_findings: z.number().int().nonnegative().max(1000),
  scanned_at: TimestampSchema,
  descriptor_only: z.literal(true),
}).strict().superRefine((scan, context) => {
  const hasBlockingFinding = scan.findings.some((finding) => finding.severity === "high" || finding.severity === "critical");
  if (scan.status === "passed" && (scan.findings.length > 0 || scan.secret_findings > 0 || hasBlockingFinding)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "passed scans cannot contain findings" });
  }
  if (scan.status === "quarantined" && scan.findings.length === 0 && scan.secret_findings === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["findings"], message: "quarantined scans require findings" });
  }
});

export const SkillReviewSchema = MetadataSchema.extend({
  skill_id: DescriptorIdSchema,
  version_id: UlidSchema,
  scan_id: UlidSchema,
  decision: SkillReviewDecisionSchema,
  reviewer_ref: ActorRefSchema,
  reason: secretSafeText(2000),
  approved_snapshot_hash: PayloadHashSchema.nullable(),
  decided_at: TimestampSchema,
  descriptor_only: z.literal(true),
}).strict().superRefine((review, context) => {
  if (review.decision === "approve" && review.approved_snapshot_hash === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["approved_snapshot_hash"], message: "approval requires approved_snapshot_hash" });
  }
});

export const SkillInstallationSchema = MetadataSchema.extend({
  revision: z.number().int().positive().default(1),
  skill_id: DescriptorIdSchema,
  version_id: UlidSchema,
  status: SkillInstallationStatusSchema,
  approved_snapshot_hash: PayloadHashSchema.nullable(),
  installed_at: TimestampSchema.nullable(),
  revoked_at: TimestampSchema.nullable(),
  quarantine_reason: secretSafeText(1000).nullable(),
  rollback_to_version_id: UlidSchema.nullable(),
  descriptor_only: z.literal(true),
}).strict().superRefine((installation, context) => {
  if (installation.status === "installed") {
    if (installation.approved_snapshot_hash === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["approved_snapshot_hash"], message: "installed skills require an approved snapshot" });
    if (installation.installed_at === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["installed_at"], message: "installed skills require installed_at" });
  }
  if (installation.status === "revoked" && installation.revoked_at === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["revoked_at"], message: "revoked installations require revoked_at" });
  }
  if (installation.status === "quarantined" && installation.quarantine_reason === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["quarantine_reason"], message: "quarantined installations require a reason" });
  }
  if (installation.status === "rolled_back" && installation.rollback_to_version_id === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["rollback_to_version_id"], message: "rolled back installations require rollback_to_version_id" });
  }
});

export const SkillInvocationFactSchema = MetadataSchema.extend({
  skill_id: DescriptorIdSchema,
  version_id: UlidSchema,
  installation_id: UlidSchema,
  run_id: RunIdSchema,
  goal_loop_id: UlidSchema,
  status: SkillInvocationStatusSchema,
  snapshot_hash: PayloadHashSchema.nullable(),
  reason: secretSafeText(1000),
  descriptor_only: z.literal(true),
}).strict().superRefine((fact, context) => {
  if (fact.status === "allowed" && fact.snapshot_hash === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["snapshot_hash"], message: "allowed skill invocations require an approved snapshot hash" });
  }
});

export const LearningCandidateSchema = MetadataSchema.extend({
  run_id: RunIdSchema,
  goal_loop_id: UlidSchema,
  source_event_id: EventIdSchema,
  proposed_skill_id: DescriptorIdSchema,
  lesson: secretSafeText(4000),
  proposed_diff_summary: secretSafeText(2000),
  evidence_refs: z.array(InternalRefSchema).min(1).max(32),
  status: LearningCandidateStatusSchema,
  descriptor_only: z.literal(true),
}).strict();

export const LearningSourceEventPayloadSchema = z.object({
  descriptor_only: z.literal(true),
  proposed_skill_id: DescriptorIdSchema,
  goal_loop_id: UlidSchema,
  continuation_cursor: z.string().min(1).max(512).nullable(),
}).strict();

export const LearningSourceEventSchema = createEventEnvelopeSchema(LearningSourceEventPayloadSchema).superRefine((event, context) => {
  if (event.event_type !== "learning.source") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["event_type"], message: "event type must be learning.source" });
  }
  if (event.scope.kind !== "run") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scope", "kind"], message: "learning.source scope must be run" });
  }
  if (event.run_id === null || event.scope.id !== event.run_id) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scope", "id"], message: "learning.source scope id must match run_id" });
  }
});

export const LearningCommandSchema = z.object({
  schema_version: z.literal(1),
  command_id: UlidSchema,
  workspace_id: WorkspaceIdSchema,
  kind: LearningCommandKindSchema,
  idempotency_key: IdempotencyKeySchema,
  expected_revision: z.number().int().positive().nullable(),
  installation_revision: z.number().int().positive().nullable(),
  candidate_id: UlidSchema.nullable(),
  skill_id: DescriptorIdSchema.nullable(),
  version_id: UlidSchema.nullable(),
  reason: secretSafeText(2000).nullable(),
  rollback_to_version_id: UlidSchema.nullable(),
  descriptor_only: z.literal(true),
  created_at: TimestampSchema,
}).strict().superRefine((command, context) => {
  if (command.kind === "learn" && command.candidate_id === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidate_id"], message: "learn commands require a candidate" });
  }
  if (command.kind === "learn" && (command.skill_id !== null || command.version_id !== null || command.rollback_to_version_id !== null || command.installation_revision !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["kind"], message: "learn commands cannot carry lifecycle fields" });
  }
  if (command.kind !== "learn" && command.skill_id === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["skill_id"], message: "skill lifecycle commands require a skill" });
  }
  if (command.kind !== "learn" && command.candidate_id !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidate_id"], message: "skill lifecycle commands cannot carry a learning candidate" });
  }
  if (command.kind !== "learn" && command.version_id === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["version_id"], message: "version lifecycle commands require a version" });
  }
  if ((command.kind === "approve" || command.kind === "install" || command.kind === "scan") && command.installation_revision !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["installation_revision"], message: "installation revision is only accepted for installation lifecycle updates" });
  }
  if ((command.kind === "revoke" || command.kind === "quarantine" || command.kind === "rollback") && command.installation_revision === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["installation_revision"], message: "installation lifecycle commands require installation_revision" });
  }
  if (command.kind !== "rollback" && command.rollback_to_version_id !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["rollback_to_version_id"], message: "rollback_to_version_id is only accepted for rollback commands" });
  }
  if (command.kind === "rollback" && command.rollback_to_version_id === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["rollback_to_version_id"], message: "rollback commands require a target version" });
  }
});

export type SkillStatus = z.infer<typeof SkillStatusSchema>;
export type SkillVersionStatus = z.infer<typeof SkillVersionStatusSchema>;
export type SkillSourceKind = z.infer<typeof SkillSourceKindSchema>;
export type SkillScanStatus = z.infer<typeof SkillScanStatusSchema>;
export type SkillReviewDecision = z.infer<typeof SkillReviewDecisionSchema>;
export type SkillInstallationStatus = z.infer<typeof SkillInstallationStatusSchema>;
export type SkillInvocationStatus = z.infer<typeof SkillInvocationStatusSchema>;
export type LearningCandidateStatus = z.infer<typeof LearningCandidateStatusSchema>;
export type LearningCommandKind = z.infer<typeof LearningCommandKindSchema>;
export type SkillDescriptor = z.infer<typeof SkillDescriptorSchema>;
export type SkillVersion = z.infer<typeof SkillVersionSchema>;
export type SkillSource = z.infer<typeof SkillSourceSchema>;
export type SkillScan = z.infer<typeof SkillScanSchema>;
export type SkillReview = z.infer<typeof SkillReviewSchema>;
export type SkillInstallation = z.infer<typeof SkillInstallationSchema>;
export type SkillInvocationFact = z.infer<typeof SkillInvocationFactSchema>;
export type LearningCandidate = z.infer<typeof LearningCandidateSchema>;
export type LearningSourceEventPayload = z.infer<typeof LearningSourceEventPayloadSchema>;
export type LearningSourceEvent = z.infer<typeof LearningSourceEventSchema>;
export type LearningCommand = z.infer<typeof LearningCommandSchema>;

const SKILL_INSTALLATION_TRANSITIONS: Readonly<Record<SkillInstallationStatus, readonly SkillInstallationStatus[]>> = {
  installed: ["revoked", "quarantined", "rolled_back"],
  revoked: [],
  quarantined: ["revoked", "rolled_back"],
  rolled_back: ["revoked", "quarantined"],
};

export function canInvokeSkillSnapshot(installation: SkillInstallation): boolean {
  return installation.status === "installed" && installation.approved_snapshot_hash !== null;
}

export function canTransitionSkillInstallation(from: SkillInstallationStatus, to: SkillInstallationStatus): boolean {
  SkillInstallationStatusSchema.parse(from);
  SkillInstallationStatusSchema.parse(to);
  return SKILL_INSTALLATION_TRANSITIONS[from].includes(to);
}

export function containsPathLikeText(value: string): boolean {
  let current = value;
  for (let pass = 0; pass < 10; pass += 1) {
    if (containsPathLikeVariant(current)) return true;
    const stripped = stripDefaultIgnorableCodePoints(current);
    if (stripped !== current && containsPathLikeVariant(stripped)) return true;
    const decoded = decodePercentTriplets(current);
    if (decoded === current) return false;
    current = decoded;
  }
  return true;
}

const DEFAULT_IGNORABLE_CODE_POINT_PATTERN = /\p{Default_Ignorable_Code_Point}/gu;

function stripDefaultIgnorableCodePoints(value: string): string {
  return value.replace(DEFAULT_IGNORABLE_CODE_POINT_PATTERN, "");
}

function containsPathLikeVariant(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  const schemeNeutral = normalized.replace(/:\/\/+/g, ":--");
  for (const match of normalized.matchAll(/\b([a-z][a-z0-9+.-]*):\/\/[^\s"')]+/gi)) {
    const scheme = match[1]?.toLowerCase();
    if (scheme === undefined || !INTERNAL_REFERENCE_SCHEMES.has(scheme)) return true;
  }
  if (/(?:^|[\s"'(=:])\/\/(?!\/)[^\s"')]+\/[^\s"')]+/i.test(schemeNeutral)) return true;
  if (/(?:^|[\s"'(=:])(?:~\/|\.{1,2}\/|\/(?!\/)(?:[^\s"')]+|$)|[A-Za-z]:\/)/i.test(normalized)) return true;
  for (const match of normalized.matchAll(/(?:^|[\s"'(])(?:artifact|workspace|memory|skill|journal):\/\/[^\s"')]+/gi)) {
    const reference = match[0].trim().replace(/^["'(]+/, "");
    if (isUnsafeInternalReference(reference)) return true;
  }
  return false;
}

function isUnsafeInternalReference(reference: string): boolean {
  const separator = reference.indexOf("://");
  if (separator < 0) return false;
  const path = reference.slice(separator + 3).replace(/\\/g, "/");
  if (path.includes("://")) return true;
  if (path.includes("//")) return true;
  if (path.startsWith("/") || path.startsWith("~/") || /^[A-Za-z]:\//.test(path)) return true;
  return path.split("/").some((segment) => segment === "." || segment === "..");
}

function decodePercentTriplets(value: string): string {
  return value.replace(/%([0-9a-fA-F]{2})/g, (_match: string, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function secretSafeText(maximumLength: number): z.ZodType<string> {
  return z.string().min(1).max(maximumLength)
    .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
    .refine((value) => !containsPathLikeText(value), "local paths and credential refs are not allowed");
}
