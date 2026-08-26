import { EventEnvelopeSchema, systemClock, type Clock, type EventEnvelope } from "@nexora/contracts";
import { withTransaction, type SqliteDatabase } from "@nexora/persistence";

export const PROJECTION_NAMES = ["runs", "steps", "artifacts", "reviews"] as const;
export type ProjectionName = (typeof PROJECTION_NAMES)[number];

export type ProjectionCheckpoint = {
  readonly workspace_id: string;
  readonly run_id: string;
  readonly projection_name: ProjectionName;
  readonly last_sequence: number;
  readonly last_event_id: string | null;
  readonly status: "ready" | "degraded";
  readonly error_code: string | null;
  readonly updated_at: string;
};

export type ProjectionHealth = {
  readonly status: "ok" | "degraded";
  readonly projection_lag: number;
};

type ProjectionInput = {
  readonly workspaceId: string;
  readonly runId: string;
};

type ReducerOutcome =
  | { readonly status: "ready"; readonly error_code?: null }
  | { readonly status: "degraded"; readonly error_code: string };

type ProjectionReducer = (events: readonly EventEnvelope[], projectionName: ProjectionName) => ReducerOutcome;
export type ProjectionReducers = Partial<Record<ProjectionName, ProjectionReducer>>;

type ReducerRun = {
  readonly outcome: ReducerOutcome;
  readonly last_sequence: number;
  readonly last_event_id: string | null;
};

export class ProjectionStore {
  constructor(private readonly database: SqliteDatabase, private readonly reducers: ProjectionReducers = {}, private readonly clock: Clock = systemClock) {}

  rebuildProjection(input: ProjectionInput): ProjectionCheckpoint[] {
    return withTransaction(this.database, () => {
      const events = this.readEvents(input);
      const lastEvent = events.at(-1);
      const updatedAt = lastEvent?.occurred_at ?? this.clock.now();

      for (const projectionName of PROJECTION_NAMES) {
        const reducer = this.reducers[projectionName] ?? defaultReducer;
        const reducerRun = runReducer(reducer, events, projectionName);
        const checkpoint = buildCheckpoint(input, projectionName, updatedAt, reducerRun);
        this.writeCheckpoint(checkpoint);
      }

      return this.getCheckpoints(input);
    });
  }

  getHealth(input: ProjectionInput): ProjectionHealth {
    const maxSequence = this.maxEventSequence(input);
    if (maxSequence === -1) return { status: "ok", projection_lag: 0 };

    const checkpoints = this.getCheckpoints(input);
    if (checkpoints.length !== PROJECTION_NAMES.length) return { status: "degraded", projection_lag: maxSequence + 1 };

    const minSequence = checkpoints.reduce((lowest, checkpoint) => Math.min(lowest, checkpoint.last_sequence), maxSequence);
    const degraded = checkpoints.some((checkpoint) => checkpoint.status === "degraded");
    return { status: degraded || minSequence < maxSequence ? "degraded" : "ok", projection_lag: Math.max(0, maxSequence - minSequence) };
  }

  private readEvents(input: ProjectionInput): EventEnvelope[] {
    return this.database.prepare("SELECT payload_json FROM events WHERE workspace_id = ? AND run_id = ? ORDER BY sequence ASC").all(input.workspaceId, input.runId).map((row) => EventEnvelopeSchema.parse(JSON.parse(readText(row["payload_json"]))));
  }

  private writeCheckpoint(checkpoint: ProjectionCheckpoint): void {
    this.database.prepare("INSERT INTO projection_checkpoints(workspace_id, run_id, projection_name, last_sequence, last_event_id, status, error_code, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, run_id, projection_name) DO UPDATE SET last_sequence = excluded.last_sequence, last_event_id = excluded.last_event_id, status = excluded.status, error_code = excluded.error_code, updated_at = excluded.updated_at").run(checkpoint.workspace_id, checkpoint.run_id, checkpoint.projection_name, checkpoint.last_sequence, checkpoint.last_event_id, checkpoint.status, checkpoint.error_code, checkpoint.updated_at);
  }

  private getCheckpoints(input: ProjectionInput): ProjectionCheckpoint[] {
    const checkpoints = this.database.prepare("SELECT workspace_id, run_id, projection_name, last_sequence, last_event_id, status, error_code, updated_at FROM projection_checkpoints WHERE workspace_id = ? AND run_id = ?").all(input.workspaceId, input.runId).map(readCheckpoint);
    return checkpoints.sort((left, right) => projectionIndex(left.projection_name) - projectionIndex(right.projection_name));
  }

  private maxEventSequence(input: ProjectionInput): number {
    const row = this.database.prepare("SELECT MAX(sequence) AS sequence FROM events WHERE workspace_id = ? AND run_id = ?").get(input.workspaceId, input.runId);
    const value = row?.["sequence"];
    if (value === null || value === undefined) return -1;
    return readInteger(value);
  }
}

function defaultReducer(): ReducerOutcome {
  return { status: "ready" };
}

function runReducer(reducer: ProjectionReducer, events: readonly EventEnvelope[], projectionName: ProjectionName): ReducerRun {
  let lastSequence = -1;
  let lastEventId: string | null = null;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined) throw new Error("Event iteration failed");
    try {
      const outcome = reducer(events.slice(0, index + 1), projectionName);
      if (outcome.status === "degraded") return { outcome, last_sequence: lastSequence, last_event_id: lastEventId };
      lastSequence = event.sequence;
      lastEventId = event.event_id;
    } catch (error) {
      if (error instanceof Error) return { outcome: { status: "degraded", error_code: "PROJECTION_DEGRADED" }, last_sequence: lastSequence, last_event_id: lastEventId };
      throw error;
    }
  }

  return { outcome: { status: "ready" }, last_sequence: lastSequence, last_event_id: lastEventId };
}

function buildCheckpoint(input: ProjectionInput, projectionName: ProjectionName, updatedAt: string, reducerRun: ReducerRun): ProjectionCheckpoint {
  if (reducerRun.outcome.status === "ready") {
    return { workspace_id: input.workspaceId, run_id: input.runId, projection_name: projectionName, last_sequence: reducerRun.last_sequence, last_event_id: reducerRun.last_event_id, status: "ready", error_code: null, updated_at: updatedAt };
  }

  return { workspace_id: input.workspaceId, run_id: input.runId, projection_name: projectionName, last_sequence: reducerRun.last_sequence, last_event_id: reducerRun.last_event_id, status: "degraded", error_code: reducerRun.outcome.error_code, updated_at: updatedAt };
}

function readCheckpoint(row: Record<string, unknown>): ProjectionCheckpoint {
  const projectionName = readProjectionName(row["projection_name"]);
  const status = readProjectionStatus(row["status"]);
  const lastEventId = row["last_event_id"];
  const errorCode = row["error_code"];
  return {
    workspace_id: readText(row["workspace_id"]),
    run_id: readText(row["run_id"]),
    projection_name: projectionName,
    last_sequence: readInteger(row["last_sequence"]),
    last_event_id: lastEventId === null ? null : readText(lastEventId),
    status,
    error_code: errorCode === null ? null : readText(errorCode),
    updated_at: readText(row["updated_at"]),
  };
}

function projectionIndex(name: ProjectionName): number {
  return PROJECTION_NAMES.indexOf(name);
}

function readProjectionName(value: unknown): ProjectionName {
  for (const projectionName of PROJECTION_NAMES) {
    if (value === projectionName) return projectionName;
  }
  throw new Error("Stored projection name is invalid");
}

function readProjectionStatus(value: unknown): "ready" | "degraded" {
  if (value === "ready" || value === "degraded") return value;
  throw new Error("Stored projection status is invalid");
}

function readText(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected text column");
  return value;
}

function readInteger(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint") return Number(value);
  throw new Error("Expected integer column");
}
