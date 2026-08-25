import { z } from "zod";
import { MetadataSchema } from "./common.js";
import { UlidSchema } from "./ids.js";
export const ArtifactSchema = MetadataSchema.extend({ type: z.string().min(1), status: z.enum(["draft", "verified", "approved", "published", "superseded", "side_effect_unknown"]), source_ticket: UlidSchema, source_run: UlidSchema, version: z.number().int().positive(), visibility: z.enum(["private", "workspace", "public"]), content_ref: z.string().min(1), evidence_refs: z.array(z.string().min(1)) }).strict();
export const ReceiptSchema = MetadataSchema.extend({ run_id: UlidSchema, inputs: z.array(z.string().min(1)), tool_calls: z.array(z.object({ tool: z.string().min(1), status: z.string().min(1) }).strict()), validation_results: z.array(z.object({ gate: z.string().min(1), passed: z.boolean() }).strict()), unverified_items: z.array(z.string()), side_effects: z.array(z.object({ kind: z.string().min(1), reference: z.string().min(1) }).strict()) }).strict();
export type Artifact = z.infer<typeof ArtifactSchema>;
export type Receipt = z.infer<typeof ReceiptSchema>;
