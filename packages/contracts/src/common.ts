import { z } from "zod";
import { UlidSchema } from "./ids.js";

export const TimestampSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
}, "invalid UTC timestamp");
export const MetadataSchema = z.object({ id: UlidSchema, workspace_id: UlidSchema, schema_version: z.literal(1), created_at: TimestampSchema, updated_at: TimestampSchema }).strict();
export const NonNegativeInt = z.number().int().nonnegative();
export const RetryPolicySchema = z.object({ max_attempts: z.number().int().positive(), backoff_ms: NonNegativeInt }).strict();
