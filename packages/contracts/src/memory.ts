import { z } from "zod";
import { MetadataSchema } from "./common.js";
import { UlidSchema } from "./ids.js";
import { PayloadHashSchema, PolicyScopeSchema } from "./policy.js";

export const MemoryTrustStateSchema = z.enum(["trusted", "unverified", "conflict", "superseded"]);
export const MemorySourceRefSchema = z
  .object({ kind: z.enum(["artifact", "receipt", "run", "file", "external", "manual"]), ref: z.string().min(1), verified: z.boolean() })
  .strict();
export const MemoryProvenanceSchema = z
  .object({
    created_by: z.object({ type: z.enum(["system", "agent", "human", "connector"]), id: UlidSchema.nullable() }).strict(),
    run_id: UlidSchema.nullable(),
    artifact_refs: z.array(z.string().min(1)),
    receipt_refs: z.array(z.string().min(1)),
  })
  .strict();
export const MemoryNoteSchema = MetadataSchema.extend({
  path: z.string().min(1),
  scope: PolicyScopeSchema,
  current_version: z.number().int().positive(),
  trust_state: MemoryTrustStateSchema,
  source_refs: z.array(MemorySourceRefSchema),
  provenance: MemoryProvenanceSchema,
}).strict();
export const MemoryVersionSchema = MetadataSchema.extend({
  note_id: UlidSchema,
  path: z.string().min(1),
  note_version: z.number().int().positive(),
  content_hash: PayloadHashSchema,
  content_ref: z.string().min(1),
  source_refs: z.array(MemorySourceRefSchema),
  trust_state: MemoryTrustStateSchema,
  provenance: MemoryProvenanceSchema,
  status: z.enum(["active", "candidate", "rolled_back"]),
  conflict_group_id: UlidSchema.nullable(),
  review_id: UlidSchema.nullable(),
}).strict();
export const MemorySnapshotSchema = MetadataSchema.extend({
  snapshot_version: z.number().int().positive(),
  notes: z.array(
    z
      .object({ note_id: UlidSchema, path: z.string().min(1), version: z.number().int().positive(), content_hash: PayloadHashSchema })
      .strict(),
  ),
}).strict();

export type MemoryTrustState = z.infer<typeof MemoryTrustStateSchema>;
export type MemorySourceRef = z.infer<typeof MemorySourceRefSchema>;
export type MemoryProvenance = z.infer<typeof MemoryProvenanceSchema>;
export type MemoryNote = z.infer<typeof MemoryNoteSchema>;
export type MemoryVersion = z.infer<typeof MemoryVersionSchema>;
export type MemorySnapshot = z.infer<typeof MemorySnapshotSchema>;
