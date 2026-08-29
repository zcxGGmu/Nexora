export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogRecord = {
  readonly level: LogLevel;
  readonly event: string;
  readonly trace_id: string | null;
  readonly fields: Readonly<Record<string, string | number | boolean | null>>;
};

export function createLogRecord(input: LogRecord): LogRecord {
  return input;
}
