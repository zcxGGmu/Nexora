import { AttemptIdSchema, LeaseIdSchema, RunIdSchema, RuntimePayloadSchema, StepIdSchema, TimestampSchema, TraceIdSchema, z } from "@nexora/contracts";
import type { AttemptId, LeaseId, RunId, RuntimeEnvelope, StepId, TraceId } from "@nexora/contracts";

export const RUNTIME_EVENT_TYPES = [
  "started",
  "tool_called",
  "artifact_created",
  "judge_completed",
  "progress",
  "completed",
  "failed",
  "timeout",
  "partial",
  "judge_failed",
  "review_needed",
  "heartbeat",
  "cancelled",
  "cancel_unknown",
  "runtime_crashed",
  "unmapped_event",
] as const;
export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

export type RuntimeScalar = string | number | boolean | null;
export type RuntimeValue = RuntimeScalar | readonly RuntimeValue[] | { readonly [key: string]: RuntimeValue };
export type RuntimePayload = Readonly<Record<string, RuntimeValue>>;

export const StartInputSchema = z.object({ run_id: RunIdSchema, attempt_id: AttemptIdSchema, step_id: StepIdSchema, trace_id: TraceIdSchema, deadline_at: TimestampSchema, lease_id: LeaseIdSchema, fencing_token: z.number().int().positive(), input: RuntimePayloadSchema }).strict();

export type CapabilityDescriptor = {
  readonly adapter_id: string;
  readonly protocol_version: 1;
  readonly execution_location: "local";
  readonly supports_resume: boolean;
  readonly supports_cancel: boolean;
  readonly supports_streaming: boolean;
};

export type StartInput = z.infer<typeof StartInputSchema>;

export type AttemptHandle = {
  readonly adapter_id: string;
  readonly session_id: string;
  readonly run_id: RunId;
  readonly attempt_id: AttemptId;
  readonly step_id: StepId;
  readonly trace_id: TraceId;
  readonly lease_id: LeaseId;
  readonly fencing_token: number;
  readonly deadline_at: string;
  readonly cursor: string | null;
};

export type RuntimeCommand =
  | { readonly type: "heartbeat" }
  | { readonly type: "resume"; readonly cursor: string | null }
  | { readonly type: "cancel"; readonly reason: string };

export type CancelResult =
  | { readonly state: "cancelled"; readonly reason: string }
  | { readonly state: "cancel_unknown"; readonly reason: string };

export type HealthReport = {
  readonly status: "healthy" | "degraded" | "unavailable";
  readonly checked_at: string;
  readonly details: Readonly<Record<string, string>>;
};

export type RuntimeEvent = {
  readonly type: RuntimeEventType;
  readonly envelope: RuntimeEnvelope;
  readonly data: RuntimePayload;
};

export interface RuntimeAdapter {
  readonly id: string;
  capabilities(): Promise<CapabilityDescriptor>;
  start(input: StartInput): Promise<AttemptHandle>;
  send(handle: AttemptHandle, command: RuntimeCommand): Promise<void>;
  cancel(handle: AttemptHandle): Promise<CancelResult>;
  health(): Promise<HealthReport>;
  collect(handle: AttemptHandle): AsyncIterable<RuntimeEvent>;
}
