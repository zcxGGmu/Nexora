import { z } from "zod";
import { RunIdSchema, RunStatusSchema, TicketIdSchema, WorkspaceIdSchema } from "@nexora/contracts";

export const CreateRunCommandSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  ticket_id: TicketIdSchema,
  expected_ticket_version: z.number().int().positive().optional(),
  idempotency_key: z.string().min(1).max(128),
}).strict();

export const TransitionRunCommandSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  run_id: RunIdSchema,
  to_status: RunStatusSchema.refine((status) => status !== "queued", "queued is only valid when a Run is created"),
  expected_version: z.number().int().positive(),
}).strict();

export type CreateRunCommand = z.infer<typeof CreateRunCommandSchema>;
export type TransitionRunCommand = z.infer<typeof TransitionRunCommandSchema>;
