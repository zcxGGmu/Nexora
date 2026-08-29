import { CronExpressionParser } from "cron-parser";
import type { Schedule, ScheduleTimeResolution } from "@nexora/contracts";
import { OrchestrationError } from "./errors.js";

type CronTrigger = Extract<Schedule["trigger"], { readonly kind: "cron" }>;
type CronFireInput = { readonly trigger: CronTrigger; readonly timezone: string; readonly scheduledFor: string; readonly now: string };

export function nextFireAfter(schedule: Schedule, scheduledFor: string, now: string): string | null {
  let next: string | null;
  switch (schedule.trigger.kind) {
    case "manual":
      next = null;
      break;
    case "interval":
      next = nextIntervalFire(scheduledFor, now, schedule.trigger.every_seconds);
      break;
    case "cron":
      next = nextCronFire({ trigger: schedule.trigger, timezone: schedule.timezone, scheduledFor, now });
      break;
    default:
      return assertNever(schedule.trigger);
  }
  if (next === null || schedule.end_at === null) return next;
  return Date.parse(next) <= Date.parse(schedule.end_at) ? next : null;
}

export function resolveTimeResolution(schedule: Schedule, scheduledFor: string): ScheduleTimeResolution {
  const trigger = schedule.trigger;
  if (trigger.kind !== "cron") return "exact";
  const cronTime = numericCronTime(trigger.expression);
  if (cronTime === null) return "exact";
  const local = localParts(scheduledFor, schedule.timezone);
  if (local.hour !== cronTime.hour || local.minute !== cronTime.minute) return "skipped_time";
  const before = localParts(addMilliseconds(scheduledFor, -3_600_000), schedule.timezone);
  const after = localParts(addMilliseconds(scheduledFor, 3_600_000), schedule.timezone);
  return sameLocalTime(local, before) || sameLocalTime(local, after) ? "ambiguous_time" : "exact";
}

function nextIntervalFire(scheduledFor: string, now: string, everySeconds: number): string {
  let next = Date.parse(scheduledFor) + everySeconds * 1000;
  const current = Date.parse(now);
  if (!Number.isFinite(next) || !Number.isFinite(current)) throw new OrchestrationError("INVALID_QUEUE_STATE", "Schedule interval timestamp is invalid");
  while (next <= current) next += everySeconds * 1000;
  return new Date(next).toISOString();
}

function nextCronFire(input: CronFireInput): string {
  let next = CronExpressionParser.parse(input.trigger.expression, { currentDate: input.scheduledFor, tz: input.timezone }).next().toDate().toISOString();
  while (Date.parse(next) <= Date.parse(input.now)) {
    next = CronExpressionParser.parse(input.trigger.expression, { currentDate: next, tz: input.timezone }).next().toDate().toISOString();
  }
  return next;
}

type LocalParts = { readonly day: number; readonly hour: number; readonly minute: number; readonly month: number; readonly year: number };
type CronTime = { readonly hour: number; readonly minute: number };

function numericCronTime(expression: string): CronTime | null {
  const fields = expression.trim().split(/\s+/);
  const minuteIndex = fields.length === 6 ? 1 : 0;
  const hourIndex = fields.length === 6 ? 2 : 1;
  const minute = fields[minuteIndex];
  const hour = fields[hourIndex];
  if (minute === undefined || hour === undefined || !/^\d+$/.test(minute) || !/^\d+$/.test(hour)) return null;
  return { hour: Number(hour), minute: Number(minute) };
}

function localParts(timestamp: string, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone: timezone, year: "numeric" }).formatToParts(new Date(timestamp));
  return {
    day: partNumber(parts, "day"),
    hour: partNumber(parts, "hour"),
    minute: partNumber(parts, "minute"),
    month: partNumber(parts, "month"),
    year: partNumber(parts, "year"),
  };
}

function partNumber(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const part = parts.find((item) => item.type === type);
  if (part === undefined) throw new OrchestrationError("INVALID_QUEUE_STATE", "Schedule local time part is missing");
  return Number(part.value);
}

function sameLocalTime(left: LocalParts, right: LocalParts): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day && left.hour === right.hour && left.minute === right.minute;
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function assertNever(value: never): never {
  throw new OrchestrationError("INVALID_QUEUE_STATE", `Unhandled schedule trigger ${String(value)}`);
}
