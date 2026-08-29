import { randomBytes } from "node:crypto";
import { CommandService, type IdFactory } from "./services/command-service.js";
import { QueryService } from "./services/query-service.js";
import { ScheduleCommandService } from "./services/schedule-service.js";
import { SseService } from "./services/sse-service.js";
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
  readonly sse: SseService;
} {
  const idFactory = input.idFactory ?? createUlidFactory();
  return {
    commands: new CommandService({ database: input.database, clock: input.clock, idFactory }),
    queries: new QueryService(input.database),
    scheduleCommands: new ScheduleCommandService({ database: input.database, clock: input.clock, idFactory }),
    sse: new SseService(input.database),
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
