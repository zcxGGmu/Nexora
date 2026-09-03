import { randomBytes } from "node:crypto";
import { CommandService, type IdFactory } from "./services/command-service.js";
import { QueryService } from "./services/query-service.js";
import { ScheduleCommandService } from "./services/schedule-service.js";
import { RegistryCommandService } from "./services/registry-service.js";
import { SseService } from "./services/sse-service.js";
import { GatewayService } from "./services/gateway-service.js";
import { SkillsService } from "./services/skills-service.js";
import { JournalService } from "./services/journal-service.js";
import { BrowserComputerService } from "./services/browser-computer-service.js";
import { VoiceJarvisService } from "./services/voice-jarvis-service.js";
import { StudioMediaService } from "./services/studio-media-service.js";
import type { SqliteDatabase } from "@nexora/persistence";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type ControlServicesInput = {
  readonly database: SqliteDatabase;
  readonly clock: { readonly now: () => string };
  readonly idFactory?: IdFactory;
};

export function createControlServices(input: ControlServicesInput): {
  readonly commands: CommandService;
  readonly queries: QueryService;
  readonly scheduleCommands: ScheduleCommandService;
  readonly registryCommands: RegistryCommandService;
  readonly sse: SseService;
  readonly gateway: GatewayService;
  readonly skills: SkillsService;
  readonly journal: JournalService;
  readonly browserComputer: BrowserComputerService;
  readonly voiceJarvis: VoiceJarvisService;
  readonly studioMedia: StudioMediaService;
} {
  const idFactory = input.idFactory ?? createUlidFactory();
  return {
    commands: new CommandService({ database: input.database, clock: input.clock, idFactory }),
    queries: new QueryService(input.database),
    scheduleCommands: new ScheduleCommandService({ database: input.database, clock: input.clock, idFactory }),
    registryCommands: new RegistryCommandService({ database: input.database, clock: input.clock }),
    sse: new SseService(input.database),
    gateway: new GatewayService({ database: input.database, clock: input.clock, idFactory }),
    skills: new SkillsService({ database: input.database, clock: input.clock, idFactory }),
    journal: new JournalService({ database: input.database, clock: input.clock, idFactory }),
    browserComputer: new BrowserComputerService({ database: input.database, clock: input.clock, idFactory }),
    voiceJarvis: new VoiceJarvisService({ database: input.database, clock: input.clock, idFactory }),
    studioMedia: new StudioMediaService({ database: input.database, clock: input.clock, idFactory }),
  };
}

export function createUlidFactory(): IdFactory {
  return () => `${encodeTimestamp(Date.now())}${encodeRandomness()}`;
}

function encodeTimestamp(timestamp: number): string {
  let value = timestamp;
  const chars = Array.from({ length: 10 }, () => "0");
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    chars[index] = CROCKFORD[value % 32] ?? "0";
    value = Math.floor(value / 32);
  }
  return chars.join("");
}

function encodeRandomness(): string {
  const bytes = randomBytes(16);
  let output = "";
  for (let index = 0; output.length < 16; index += 1) {
    const byte = bytes[index % bytes.length];
    if (byte !== undefined) output += CROCKFORD[byte % 32] ?? "0";
  }
  return output;
}
