import { z } from "zod";
import { MetadataSchema } from "./common.js";
export const GoalSchema = MetadataSchema.extend({ title: z.string().min(1), objective: z.string().min(1), definition_of_done: z.array(z.string().min(1)) }).strict();
export type Goal = z.infer<typeof GoalSchema>;
