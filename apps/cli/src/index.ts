import { parseBrowserComputerCommand, type BrowserComputerControlRequest } from "./browser-computer.js";
import { parseVoiceJarvisCommand, type VoiceJarvisControlRequest } from "./voice-jarvis.js";
import { parseStudioMediaCommand, type StudioMediaControlRequest } from "./studio-media.js";
import { parseGoalModeCommand, type GoalModeRequest } from "./goal-mode.js";
import { parseJournalCommand, type JournalControlRequest } from "./journal.js";
import { parseLearningCommand, type LearningControlRequest } from "./skills-learning.js";

export { parseBrowserComputerCommand, type BrowserComputerControlRequest } from "./browser-computer.js";
export { parseVoiceJarvisCommand, type VoiceJarvisControlRequest } from "./voice-jarvis.js";
export { parseStudioMediaCommand, type StudioMediaControlRequest } from "./studio-media.js";
export { parseGoalModeCommand, type GoalModeRequest } from "./goal-mode.js";
export { parseJournalCommand, type JournalControlRequest } from "./journal.js";
export { parseLearningCommand, type LearningControlRequest } from "./skills-learning.js";

export type NexoraCliControlRequest = BrowserComputerControlRequest | VoiceJarvisControlRequest | StudioMediaControlRequest | GoalModeRequest | JournalControlRequest | LearningControlRequest;

export function parseNexoraCliCommand(input: string): NexoraCliControlRequest {
  const command = firstCommandToken(input);
  if (command === "/browser" || command === "/computer") return parseBrowserComputerCommand(input);
  if (command === "/voice" || command === "/jarvis") return parseVoiceJarvisCommand(input);
  if (command === "/studio" || command === "/notebook" || command === "/avatar") return parseStudioMediaCommand(input);
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
