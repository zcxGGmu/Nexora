import { z } from "zod";
import { MetadataSchema } from "./common.js";
import { UlidSchema } from "./ids.js";
export const TicketStatusSchema = z.enum(["backlog", "ready", "running", "review", "done", "blocked", "paused", "failed", "cancelled"]);
export const TicketSchema = MetadataSchema.extend({ goal_id: UlidSchema, status: TicketStatusSchema, definition_of_done: z.array(z.string().min(1)), assigned_agents: z.array(UlidSchema), approval_policy: z.object({ mode: z.enum(["required", "optional", "none"]) }).strict(), idempotency_key: z.string().min(1) }).strict();
export type Ticket = z.infer<typeof TicketSchema>;
