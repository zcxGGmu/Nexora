import { CronExpressionParser } from "cron-parser";
import { z } from "zod";
import { MetadataSchema, TimestampSchema } from "./common.js";
import { createEventEnvelopeSchema } from "./envelope.js";
import { AgentIdSchema, RunIdSchema, TicketIdSchema, UlidSchema } from "./ids.js";

export const ScheduleTriggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }).strict(),
  z.object({ kind: z.literal("interval"), every_seconds: z.number().int().positive().max(31_536_000) }).strict(),
  z.object({ kind: z.literal("cron"), expression: z.string().min(1).max(128).refine(isValidCronExpression, "invalid cron expression") }).strict(),
]);

export const MisfirePolicySchema = z.enum(["run_once_after_recovery", "skip_missed"]);
export const OverlapPolicySchema = z.enum(["skip_if_active", "queue_after_active", "cancel_previous"]);
export const ScheduleOccurrenceStatusSchema = z.enum(["enqueued", "skipped_overlap", "blocked_policy", "failed_enqueue"]);
export const ScheduleTimeResolutionSchema = z.enum(["exact", "ambiguous_time", "skipped_time"]);

export const ScheduleSchema = MetadataSchema.extend({
  workflow_id: z.string().min(1),
  enabled: z.boolean(),
  trigger: ScheduleTriggerSchema,
  timezone: z.string().min(1).refine(isSupportedTimeZone, "invalid IANA timezone"),
  start_at: TimestampSchema,
  end_at: TimestampSchema.nullable(),
  misfire_policy: MisfirePolicySchema,
  max_catch_up: z.number().int().positive().max(24),
  overlap_policy: OverlapPolicySchema,
  next_fire_at: TimestampSchema.nullable(),
  last_fire_at: TimestampSchema.nullable(),
  revision: z.number().int().positive(),
  run_template: z.object({ ticket_id: TicketIdSchema, agent_id: AgentIdSchema, execution_location: z.enum(["local", "remote"]) }).strict(),
}).strict();

const ScheduleOccurrenceBaseSchema = MetadataSchema.extend({
  schedule_id: UlidSchema,
  workflow_id: z.string().min(1),
  scheduled_for: TimestampSchema,
  fired_at: TimestampSchema,
  run_id: RunIdSchema.nullable(),
  status: ScheduleOccurrenceStatusSchema,
  dedupe_key: z.string().min(1).max(256),
  schedule_revision: z.number().int().positive(),
  misfire_policy: MisfirePolicySchema,
  overlap_policy: OverlapPolicySchema,
  timezone: z.string().min(1).refine(isSupportedTimeZone, "invalid IANA timezone"),
  time_resolution: ScheduleTimeResolutionSchema,
  fired_event_id: UlidSchema,
  reason: z.string().min(1),
}).strict();

export const ScheduleOccurrenceSchema = ScheduleOccurrenceBaseSchema.superRefine(refineScheduleOccurrenceRunBinding);

export const ScheduleFiredEventSchema = createEventEnvelopeSchema(ScheduleOccurrenceBaseSchema)
  .superRefine((event, context) => {
    const payload = ScheduleOccurrenceBaseSchema.safeParse(event.payload);
    if (!payload.success) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["payload"], message: "schedule.fired payload must be a schedule occurrence" });
      return;
    }
    refineScheduleOccurrenceRunBinding(payload.data, context);
    if (event.event_type !== "schedule.fired") context.addIssue({ code: z.ZodIssueCode.custom, path: ["event_type"], message: "event type must be schedule.fired" });
    if (event.scope.kind !== "schedule") context.addIssue({ code: z.ZodIssueCode.custom, path: ["scope"], message: "schedule.fired scope must be schedule" });
    if (event.scope.id !== payload.data.schedule_id) context.addIssue({ code: z.ZodIssueCode.custom, path: ["scope", "id"], message: "schedule.fired scope id must match schedule_id" });
    if (event.run_id !== payload.data.run_id) context.addIssue({ code: z.ZodIssueCode.custom, path: ["run_id"], message: "schedule.fired run_id must match payload" });
    if (event.attempt_id !== null || event.step_id !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["attempt_id"], message: "schedule.fired cannot bind attempt or step" });
  });

function refineScheduleOccurrenceRunBinding(occurrence: z.infer<typeof ScheduleOccurrenceBaseSchema>, context: z.RefinementCtx): void {
  switch (occurrence.status) {
    case "enqueued":
      if (occurrence.run_id === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["run_id"], message: "enqueued occurrences require a Run" });
      break;
    case "skipped_overlap":
    case "blocked_policy":
    case "failed_enqueue":
      if (occurrence.run_id !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["run_id"], message: `${occurrence.status} occurrences must not bind a Run` });
      break;
    default:
      assertNever(occurrence.status);
  }
}

export type ScheduleTrigger = z.infer<typeof ScheduleTriggerSchema>;
export type MisfirePolicy = z.infer<typeof MisfirePolicySchema>;
export type OverlapPolicy = z.infer<typeof OverlapPolicySchema>;
export type ScheduleOccurrenceStatus = z.infer<typeof ScheduleOccurrenceStatusSchema>;
export type ScheduleTimeResolution = z.infer<typeof ScheduleTimeResolutionSchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;
export type ScheduleOccurrence = z.infer<typeof ScheduleOccurrenceSchema>;
export type ScheduleFiredEvent = z.infer<typeof ScheduleFiredEventSchema>;

function isSupportedTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

function isValidCronExpression(value: string): boolean {
  try {
    CronExpressionParser.parse(value);
    return true;
  } catch (error) {
    if (error instanceof Error) return false;
    throw error;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled schedule occurrence status: ${String(value)}`);
}
