import { z } from "zod";
import { MetadataSchema, TimestampSchema } from "./common.js";
import { containsSecretLikeText } from "./goal.js";
import { UlidSchema, WorkspaceIdSchema } from "./ids.js";
import { PayloadHashSchema, RiskLevelSchema } from "./policy.js";
import { DescriptorIdSchema } from "./registry.js";
import { containsPathLikeText } from "./skills.js";

const JOURNAL_REFERENCE_SCHEMES = new Set(["artifact", "workspace", "memory", "journal"]);
const JOURNAL_REFERENCE_FORMAT_CHARACTER_PATTERN = /\p{Default_Ignorable_Code_Point}/u;

const DescriptorMetadataSchema = z.object({
  id: DescriptorIdSchema,
  workspace_id: WorkspaceIdSchema,
  schema_version: z.literal(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  revision: z.number().int().positive().default(1),
}).strict();

const JournalTextSchema = (maximumLength: number): z.ZodType<string> => z.string().min(1).max(maximumLength)
  .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
  .refine((value) => !containsPathLikeText(value), "local paths and credential refs are not allowed");

const JournalRefSchema = z.string().min(1).max(512)
  .regex(/^(?:artifact|workspace|memory|journal):\/\/[A-Za-z0-9._~/-]+$/)
  .refine((value) => !JOURNAL_REFERENCE_FORMAT_CHARACTER_PATTERN.test(value), "journal references must not include zero-width format characters")
  .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
  .refine((value) => !containsPathLikeText(value), "local paths and credential refs are not allowed")
  .refine((value) => isSafeJournalReference(value), "journal references must stay inside descriptor namespaces");

const ActorRefSchema = z.string().min(1).max(160).regex(/^[a-z][a-z0-9._/-]*:[^\s]+$/)
  .refine((value) => !containsSecretLikeText(value), "secret-shaped text is not allowed")
  .refine((value) => !containsPathLikeText(value), "local paths and credential refs are not allowed");

const JournalTagSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9._-]*$/);
const JournalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().startsWith(value);
}, "invalid journal date");

export const VaultBridgeKindSchema = z.enum(["obsidian", "omi", "markdown_vault", "manual"]);
export const VaultAccessModeSchema = z.enum(["read_only"]);
export const VaultSyncStatusSchema = z.enum(["not_indexed", "indexed", "stale", "error"]);
export const JournalSourceKindSchema = z.enum(["manual", "omi", "obsidian", "memory", "artifact"]);
export const GraphIndexKindSchema = z.enum(["graph", "fts", "graph_fts"]);
export const MemoryCandidateKindSchema = z.enum(["lesson", "preference", "decision", "summary", "sop"]);
export const MemoryCandidateStatusSchema = z.enum(["needs_review", "approved", "rejected", "writeback_pending", "applied"]);
export const WritebackRequestStatusSchema = z.enum(["pending_review", "approved", "rejected", "cancelled"]);
export const WritebackDecisionSchemaValue = z.enum(["approve", "reject"]);

export const VaultBridgeDescriptorSchema = DescriptorMetadataSchema.extend({
  name: JournalTextSchema(160),
  kind: VaultBridgeKindSchema,
  root_ref: JournalRefSchema,
  access_mode: VaultAccessModeSchema,
  sync_status: VaultSyncStatusSchema,
  graph_enabled: z.boolean(),
  fts_enabled: z.boolean(),
  allowed_source_kinds: z.array(JournalSourceKindSchema).min(1).max(16),
  last_indexed_at: TimestampSchema.nullable(),
  descriptor_only: z.literal(true),
}).strict();

export const JournalSourceSchema = MetadataSchema.extend({
  vault_id: DescriptorIdSchema,
  journal_entry_id: UlidSchema,
  source_kind: JournalSourceKindSchema,
  source_ref: JournalRefSchema,
  source_hash: PayloadHashSchema,
  captured_at: TimestampSchema,
  descriptor_only: z.literal(true),
}).strict();

export const JournalEntryDescriptorSchema = MetadataSchema.extend({
  vault_id: DescriptorIdSchema,
  entry_date: JournalDateSchema,
  title: JournalTextSchema(160),
  summary: JournalTextSchema(4000),
  source_ids: z.array(UlidSchema).min(1).max(128),
  memory_candidate_ids: z.array(UlidSchema).max(128),
  run_id: UlidSchema.nullable(),
  goal_loop_id: UlidSchema.nullable(),
  tags: z.array(JournalTagSchema).max(64),
  descriptor_only: z.literal(true),
}).strict().superRefine((entry, context) => {
  if (entry.goal_loop_id !== null && entry.run_id === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["run_id"], message: "journal entries with goal_loop_id require run_id" });
  }
});

export const GraphIndexSnapshotSchema = MetadataSchema.extend({
  vault_id: DescriptorIdSchema,
  index_kind: GraphIndexKindSchema,
  indexed_at: TimestampSchema,
  source_hash: PayloadHashSchema,
  graph_hash: PayloadHashSchema,
  fts_hash: PayloadHashSchema,
  node_count: z.number().int().nonnegative().max(10_000_000),
  edge_count: z.number().int().nonnegative().max(50_000_000),
  document_count: z.number().int().nonnegative().max(10_000_000),
  stale: z.boolean(),
  descriptor_only: z.literal(true),
}).strict();

export const MemoryCandidateSchema = MetadataSchema.extend({
  vault_id: DescriptorIdSchema,
  journal_entry_id: UlidSchema,
  source_ids: z.array(UlidSchema).min(1).max(128),
  candidate_kind: MemoryCandidateKindSchema,
  proposed_path: JournalRefSchema,
  summary: JournalTextSchema(4000),
  content_hash: PayloadHashSchema,
  risk_level: RiskLevelSchema,
  status: MemoryCandidateStatusSchema,
  descriptor_only: z.literal(true),
}).strict();

export const WritebackRequestSchema = MetadataSchema.extend({
  revision: z.number().int().positive().default(1),
  vault_id: DescriptorIdSchema,
  candidate_id: UlidSchema,
  target_ref: JournalRefSchema,
  diff_hash: PayloadHashSchema,
  reason: JournalTextSchema(2000),
  status: WritebackRequestStatusSchema,
  requested_by: ActorRefSchema,
  requested_at: TimestampSchema,
  expected_target_revision: z.number().int().positive(),
  descriptor_only: z.literal(true),
}).strict();

export const WritebackDecisionSchema = MetadataSchema.extend({
  request_id: UlidSchema,
  decision: WritebackDecisionSchemaValue,
  decided_by: ActorRefSchema,
  decided_at: TimestampSchema,
  reason: JournalTextSchema(2000),
  descriptor_only: z.literal(true),
}).strict();

export type VaultBridgeKind = z.infer<typeof VaultBridgeKindSchema>;
export type VaultAccessMode = z.infer<typeof VaultAccessModeSchema>;
export type VaultSyncStatus = z.infer<typeof VaultSyncStatusSchema>;
export type JournalSourceKind = z.infer<typeof JournalSourceKindSchema>;
export type GraphIndexKind = z.infer<typeof GraphIndexKindSchema>;
export type MemoryCandidateKind = z.infer<typeof MemoryCandidateKindSchema>;
export type MemoryCandidateStatus = z.infer<typeof MemoryCandidateStatusSchema>;
export type WritebackRequestStatus = z.infer<typeof WritebackRequestStatusSchema>;
export type WritebackDecisionValue = z.infer<typeof WritebackDecisionSchemaValue>;
export type VaultBridgeDescriptor = z.infer<typeof VaultBridgeDescriptorSchema>;
export type JournalSource = z.infer<typeof JournalSourceSchema>;
export type JournalEntryDescriptor = z.infer<typeof JournalEntryDescriptorSchema>;
export type GraphIndexSnapshot = z.infer<typeof GraphIndexSnapshotSchema>;
export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;
export type WritebackRequest = z.infer<typeof WritebackRequestSchema>;
export type WritebackDecision = z.infer<typeof WritebackDecisionSchema>;

export function canApplyWriteback(request: WritebackRequest, decision: WritebackDecision | null): boolean {
  return request.status === "pending_review" && decision?.decision === "approve" && request.workspace_id === decision.workspace_id && request.id === decision.request_id;
}

function isSafeJournalReference(reference: string): boolean {
  if (JOURNAL_REFERENCE_FORMAT_CHARACTER_PATTERN.test(reference)) return false;
  const separator = reference.indexOf("://");
  if (separator < 0) return false;
  const scheme = reference.slice(0, separator);
  if (!JOURNAL_REFERENCE_SCHEMES.has(scheme)) return false;
  const path = reference.slice(separator + 3).replace(/\\/g, "/");
  if (path.includes("://") || path.includes("//") || path.startsWith("/") || path.startsWith("~/") || /^[A-Za-z]:\//.test(path)) return false;
  return !path.split("/").some((segment) => segment === "." || segment === "..");
}
