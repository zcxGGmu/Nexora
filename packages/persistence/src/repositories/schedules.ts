import { ScheduleOccurrenceSchema, ScheduleSchema, type Schedule, type ScheduleOccurrence } from "@nexora/contracts";
import type { SqliteDatabase } from "../db.js";
import { json, readJson, sqliteError, updateChanged } from "./utils.js";

export type ScheduleOccurrenceCreateResult =
  | { readonly kind: "created"; readonly occurrence: ScheduleOccurrence }
  | { readonly kind: "duplicate"; readonly occurrence: ScheduleOccurrence };

export class ScheduleRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: Schedule): Schedule {
    const parsed = ScheduleSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO schedules(id, workspace_id, workflow_id, enabled, timezone, next_fire_at, last_fire_at, revision, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.workflow_id, parsed.enabled ? 1 : 0, parsed.timezone, parsed.next_fire_at, parsed.last_fire_at, parsed.revision, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return parsed;
    } catch (error) {
      throw sqliteError(error);
    }
  }

  get(workspaceId: string, id: string): Schedule | undefined {
    const row = this.database.prepare("SELECT payload_json FROM schedules WHERE workspace_id = ? AND id = ?").get(workspaceId, id);
    return row === undefined ? undefined : readJson(row["payload_json"], ScheduleSchema);
  }

  listDue(workspaceId: string, now: string): readonly Schedule[] {
    const rows = this.database.prepare("SELECT payload_json FROM schedules WHERE workspace_id = ? AND enabled = 1 AND next_fire_at IS NOT NULL AND next_fire_at <= ? ORDER BY next_fire_at ASC, id ASC").all(workspaceId, now);
    return rows.map((row) => readJson(row["payload_json"], ScheduleSchema));
  }

  update(record: Schedule): Schedule {
    const parsed = ScheduleSchema.parse(record);
    const result = this.database.prepare("UPDATE schedules SET workflow_id = ?, enabled = ?, timezone = ?, next_fire_at = ?, last_fire_at = ?, revision = ?, payload_json = ?, schema_version = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ?").run(parsed.workflow_id, parsed.enabled ? 1 : 0, parsed.timezone, parsed.next_fire_at, parsed.last_fire_at, parsed.revision, json(parsed), parsed.schema_version, parsed.updated_at, parsed.workspace_id, parsed.id);
    updateChanged(result, "Schedule");
    return parsed;
  }
}

export class ScheduleOccurrenceRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(record: ScheduleOccurrence): ScheduleOccurrenceCreateResult {
    const parsed = ScheduleOccurrenceSchema.parse(record);
    try {
      this.database.prepare("INSERT INTO schedule_occurrences(id, workspace_id, schedule_id, workflow_id, scheduled_for, fired_at, run_id, status, dedupe_key, schedule_revision, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(parsed.id, parsed.workspace_id, parsed.schedule_id, parsed.workflow_id, parsed.scheduled_for, parsed.fired_at, parsed.run_id, parsed.status, parsed.dedupe_key, parsed.schedule_revision, json(parsed), parsed.schema_version, parsed.created_at, parsed.updated_at);
      return { kind: "created", occurrence: parsed };
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed: schedule_occurrences\.workspace_id, schedule_occurrences\.dedupe_key/i.test(error.message)) {
        const existing = this.getByDedupeKey(parsed.workspace_id, parsed.dedupe_key);
        if (existing !== undefined) return { kind: "duplicate", occurrence: existing };
      }
      throw sqliteError(error);
    }
  }

  getByDedupeKey(workspaceId: string, dedupeKey: string): ScheduleOccurrence | undefined {
    const row = this.database.prepare("SELECT payload_json FROM schedule_occurrences WHERE workspace_id = ? AND dedupe_key = ?").get(workspaceId, dedupeKey);
    return row === undefined ? undefined : readJson(row["payload_json"], ScheduleOccurrenceSchema);
  }

  listBySchedule(workspaceId: string, scheduleId: string): readonly ScheduleOccurrence[] {
    const rows = this.database.prepare("SELECT payload_json FROM schedule_occurrences WHERE workspace_id = ? AND schedule_id = ? ORDER BY scheduled_for ASC, id ASC").all(workspaceId, scheduleId);
    return rows.map((row) => readJson(row["payload_json"], ScheduleOccurrenceSchema));
  }
}
