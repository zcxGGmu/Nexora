import { z } from "zod";
import { MetadataSchema, NonNegativeInt } from "./common.js";
import { UlidSchema } from "./ids.js";
import { PayloadHashSchema } from "./policy.js";

const MetadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const ArtifactSchema = MetadataSchema.extend({ type: z.string().min(1), status: z.enum(["draft", "verified", "approved", "published", "superseded", "side_effect_unknown"]), source_ticket: UlidSchema, source_run: UlidSchema, version: z.number().int().positive(), visibility: z.enum(["private", "workspace", "public"]), content_ref: z.string().min(1), evidence_refs: z.array(z.string().min(1)) }).strict();
export const ReceiptSchema = MetadataSchema.extend({ run_id: UlidSchema, inputs: z.array(z.string().min(1)), tool_calls: z.array(z.object({ tool: z.string().min(1), status: z.string().min(1) }).strict()), validation_results: z.array(z.object({ gate: z.string().min(1), passed: z.boolean() }).strict()), unverified_items: z.array(z.string()), side_effects: z.array(z.object({ kind: z.string().min(1), reference: z.string().min(1) }).strict()) }).strict();
export const ArtifactContentTypeSchema = z.enum(["markdown", "json", "html", "text", "image", "video", "binary"]);
export const ArtifactPreviewSchema = z
  .object({ kind: ArtifactContentTypeSchema, preview: z.string(), truncated: z.boolean(), redactions: z.array(z.string()) })
  .strict();
export const ArtifactVersionSchema = MetadataSchema.extend({
  artifact_id: UlidSchema,
  artifact_version: z.number().int().positive(),
  content_type: ArtifactContentTypeSchema,
  content_hash: PayloadHashSchema,
  content_ref: z.string().min(1),
  byte_size: NonNegativeInt,
  source_ticket: UlidSchema,
  source_run: UlidSchema,
  source_agent: UlidSchema,
  model: z.string().min(1),
  receipt_refs: z.array(z.string().min(1)),
  judge_ref: z.string().min(1).nullable(),
  review_ref: z.string().min(1).nullable(),
  parent_artifact_refs: z.array(z.string().min(1)),
  metadata: z.record(MetadataValueSchema),
  preview: ArtifactPreviewSchema,
}).strict();
export type Artifact = z.infer<typeof ArtifactSchema>;
export type Receipt = z.infer<typeof ReceiptSchema>;
export type ArtifactContentType = z.infer<typeof ArtifactContentTypeSchema>;
export type ArtifactPreview = z.infer<typeof ArtifactPreviewSchema>;
export type ArtifactVersion = z.infer<typeof ArtifactVersionSchema>;
