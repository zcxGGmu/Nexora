import { parseGoalModeCommand, type GoalModeRequest } from "./goal-mode.js";
import { parseJournalCommand, type JournalControlRequest } from "./journal.js";
import { parseLearningCommand, type LearningControlRequest } from "./skills-learning.js";

export { parseGoalModeCommand, type GoalModeRequest } from "./goal-mode.js";
export { parseJournalCommand, type JournalControlRequest } from "./journal.js";
export { parseLearningCommand, type LearningControlRequest } from "./skills-learning.js";

export type NexoraCliControlRequest = GoalModeRequest | JournalControlRequest | LearningControlRequest;

export function parseNexoraCliCommand(input: string): NexoraCliControlRequest {
  const command = firstCommandToken(input);
  if (command === "/goal" || command === "/subgoal") return parseGoalModeCommand(input);
  if (command === "/learn" || command === "/skill") return parseLearningCommand(input);
  if (command === "/journal") return parseJournalCommand(input);
  throw new Error("Unsupported Nexora CLI command");
}

function firstCommandToken(input: string): string {
  const trimmed = input.trim();
  const [command] = trimmed.split(/\s+/, 1);
  if (command === undefined || command.length === 0) throw new Error("Missing Nexora CLI command");
  return command;
}
