import { describe, expect, it } from "vitest";
import { CORE_MIGRATION_VERSION, CORE_TABLES, migrate, openDatabase, rollback } from "./index.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("orchestration SQLite migration", () => {
  it("Given a migrated database When C05 starts Then queue and lease tables enforce scoped durable claims", () => {
    const database = openDatabase(":memory:");
    migrate(database);

    expect(CORE_MIGRATION_VERSION).toBe(15);
    expect(CORE_TABLES).toEqual(expect.arrayContaining(["queue_jobs", "leases"]));
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row["name"]);
    expect(tables).toEqual(expect.arrayContaining(["queue_jobs", "leases"]));

    const time = "2026-08-26T04:00:00.000Z";
    database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(WORKSPACE_ID, "Demo", time, time);
    database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run("01ERZ3NDEKTSV4RRFFQ69G5FAV", WORKSPACE_ID, "{}", time, time);
    database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run("01FRZ3NDEKTSV4RRFFQ69G5FAV", WORKSPACE_ID, "Goal", "Objective", "[]", "{}", time, time);
    database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run("01GRZ3NDEKTSV4RRFFQ69F5FAV", WORKSPACE_ID, "01FRZ3NDEKTSV4RRFFQ69G5FAV", "ready", "ticket:c05", "{}", time, time);
    database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run("01HRZ3NDEKTSV4RRFFQ69H5FAV", WORKSPACE_ID, "01GRZ3NDEKTSV4RRFFQ69F5FAV", "queued", "{}", time, time);
    database.prepare("INSERT INTO attempts(id, workspace_id, run_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run("01JRZ3NDEKTSV4RRFFQ69J5FAV", WORKSPACE_ID, "01HRZ3NDEKTSV4RRFFQ69H5FAV", "queued", "{}", time, time);
    database.prepare("INSERT INTO steps(id, workspace_id, run_id, attempt_id, agent_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)").run("01KRZ3NDEKTSV4RRFFQ69K5FAV", WORKSPACE_ID, "01HRZ3NDEKTSV4RRFFQ69H5FAV", "01JRZ3NDEKTSV4RRFFQ69J5FAV", "01ERZ3NDEKTSV4RRFFQ69G5FAV", "pending", "{}", time, time);
    expect(() => database.prepare("INSERT INTO queue_jobs(id, workspace_id, run_id, step_id, idempotency_key, request_hash, status, available_at, attempts, max_attempts, fencing_token, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("01BRZ3NDEKTSV4RRFFQ69B5FAV", WORKSPACE_ID, "01HRZ3NDEKTSV4RRFFQ69H5FAV", "01KRZ3NDEKTSV4RRFFQ69K5FAV", "run:1", "sha256:1", "queued", time, 0, 3, 0, "{}", time, time)).not.toThrow();

    rollback(database);
    database.close();
  });
});
