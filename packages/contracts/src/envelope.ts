import { z } from "zod";
import { EventIdSchema, LeaseIdSchema, MessageIdSchema, RunIdSchema, StepIdSchema, AttemptIdSchema, TraceIdSchema, UlidSchema, WorkspaceIdSchema } from "./ids.js";
import { NonNegativeInt, TimestampSchema } from "./common.js";
export const zod = z;
export const EVENT_TYPES = ["run.created", "run.queued", "run.started", "run.paused", "run.resumed", "run.failed", "run.completed", "step.started", "step.completed", "tool.called", "artifact.created", "judge.completed", "review.requested", "review.decided"] as const;
export const EventEnvelopeSchema = z.object({ event_id: EventIdSchema, event_type: z.enum(EVENT_TYPES), schema_version: z.literal(1), occurred_at: TimestampSchema, workspace_id: WorkspaceIdSchema, scope: z.object({ kind: z.enum(["workspace", "run", "ticket"]), id: UlidSchema }).strict(), trace_id: TraceIdSchema, run_id: RunIdSchema, attempt_id: AttemptIdSchema.nullable(), step_id: StepIdSchema.nullable(), actor: z.object({ type: z.enum(["system", "agent", "human", "connector"]), id: UlidSchema.nullable() }).strict(), payload: z.object({}).strict(), redactions: z.array(z.string()), sequence: NonNegativeInt }).strict();
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
export function createEventEnvelopeSchema<T extends z.AnyZodObject>(payload: T) { return EventEnvelopeSchema.omit({ payload: true }).extend({ payload: payload.strict() }).strict(); }
export const RUNTIME_MESSAGE_TYPES = ["hello", "hello_ack", "start", "event", "heartbeat", "resume", "cancel", "cancel_ack", "close"] as const;
export const RuntimeEnvelopeSchema = z.object({ schema_version: z.literal(1), protocol_version: z.literal(1), message_id: MessageIdSchema, message_type: z.enum(RUNTIME_MESSAGE_TYPES), run_id: RunIdSchema, attempt_id: AttemptIdSchema.nullable(), step_id: StepIdSchema.nullable(), trace_id: TraceIdSchema, sequence: NonNegativeInt, cursor: z.string().nullable(), deadline_at: TimestampSchema, lease_id: LeaseIdSchema, fencing_token: NonNegativeInt, payload: z.object({}).strict() }).strict();
export type RuntimeEnvelope = z.infer<typeof RuntimeEnvelopeSchema>;
export function createRuntimeEnvelopeSchema<T extends z.AnyZodObject>(payload: T) { return RuntimeEnvelopeSchema.omit({ payload: true }).extend({ payload: payload.strict() }).strict(); }
