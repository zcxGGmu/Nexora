import { z } from "zod";
import { MetadataSchema, NonNegativeInt } from "./common.js";
import { UlidSchema } from "./ids.js";
import { ExecutionLocationSchema } from "./policy.js";
export const RunStatusSchema = z.enum(["queued", "running", "paused", "waiting_review", "succeeded", "partial", "failed", "cancelled"]);
export const AttemptStatusSchema = z.enum(["queued", "running", "failed", "cancelled"]);
export const StepStatusSchema = z.enum(["pending", "running", "succeeded", "failed", "skipped", "cancelled"]);
export const BudgetSchema = z.object({ max_tokens: NonNegativeInt.max(1000000000), max_cost_usd: z.number().finite().nonnegative().max(1000000000) }).strict();
const ConnectorVersionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
export const RunSchema = MetadataSchema.extend({ ticket_id: UlidSchema, execution_location: z.enum(["local", "remote"]), status: RunStatusSchema, budget: BudgetSchema, memory_snapshot: z.object({ snapshot_id: UlidSchema, version: NonNegativeInt }).strict(), connector_versions: z.record(z.string().regex(/^[A-Za-z0-9_.-]+$/), ConnectorVersionSchema) }).strict();
export const AttemptSchema = MetadataSchema.extend({
  run_id: UlidSchema,
  status: AttemptStatusSchema,
  execution_location: ExecutionLocationSchema.optional(),
  previous_attempt_id: UlidSchema.optional(),
}).strict();
export const StepSchema = MetadataSchema.extend({ run_id: UlidSchema, attempt_id: UlidSchema, agent_id: UlidSchema, status: StepStatusSchema, inputs: z.array(z.string().min(1)), outputs: z.array(z.string().min(1)), retry_policy: z.object({ max_attempts: z.number().int().positive(), backoff_ms: NonNegativeInt }).strict(), requires_review: z.boolean() }).strict();
export type Run = z.infer<typeof RunSchema>;
export type Attempt = z.infer<typeof AttemptSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
