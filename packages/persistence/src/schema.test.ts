import { describe, expect, it } from "vitest";
import { openDatabase, migrate, rollback, validateMigration, CORE_TABLES } from "./index.js";

describe("core SQLite migration", () => {
  it("creates the C02 tables with foreign keys enabled and can roll back", () => {
    const database = openDatabase(":memory:");
    migrate(database, { now: () => "2026-08-26T04:00:00.000Z" });

    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row["name"]);
    expect(tables).toEqual(expect.arrayContaining(["schema_migrations", ...CORE_TABLES]));
    expect(tables).toEqual(expect.arrayContaining(["events", "projection_checkpoints"]));
    expect(database.prepare("PRAGMA foreign_keys").get()?.["foreign_keys"]).toBe(1);
    expect(database.prepare("PRAGMA recursive_triggers").get()?.["recursive_triggers"]).toBe(1);
    expect(database.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row["version"])).toEqual([1, 2]);
    expect(database.prepare("SELECT DISTINCT applied_at FROM schema_migrations").all().map((row) => row["applied_at"])).toEqual(["2026-08-26T04:00:00.000Z"]);

    migrate(database, { now: () => "2026-08-26T04:00:00.000Z" });
    expect(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()?.["count"]).toBe(2);

    rollback(database);
    const remaining = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    expect(remaining).toHaveLength(0);
    database.close();
  });

  it("validates an applied migration without applying it", () => {
    const database = openDatabase(":memory:");
    expect(() => validateMigration(database)).toThrow("migration 2 is not applied");
    migrate(database);
    expect(() => validateMigration(database)).not.toThrow();
    database.close();
  });

  it("enforces foreign keys and workspace-scoped unique indexes", () => {
    const database = openDatabase(":memory:");
    migrate(database);
    database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run("01ARZ3NDEKTSV4RRFFQ69G5FAV", "Demo", "2026-08-26T04:00:00.000Z", "2026-08-26T04:00:00.000Z");
    expect(() => database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run("01BRZ3NDEKTSV4RRFFQ69G5FAV", "01ARZ3NDEKTSV4RRFFQ69G5FAV", "Goal", "Objective", "[]", "{}", "2026-08-26T04:00:00.000Z", "2026-08-26T04:00:00.000Z")).not.toThrow();
    expect(() => database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run("01CRZ3NDEKTSV4RRFFQ69G5FAV", "01ARZ3NDEKTSV4RRFFQ69G5FAV", "01BRZ3NDEKTSV4RRFFQ69G5FAV", "ready", "ticket-1", "{}", "2026-08-26T04:00:00.000Z", "2026-08-26T04:00:00.000Z")).not.toThrow();
    expect(() => database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run("01DRZ3NDEKTSV4RRFFQ69G5FAV", "01ARZ3NDEKTSV4RRFFQ69G5FAV", "01BRZ3NDEKTSV4RRFFQ69G5FAV", "ready", "ticket-1", "{}", "2026-08-26T04:00:00.000Z", "2026-08-26T04:00:00.000Z")).toThrow();
    expect(() => database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run("01ERZ3NDEKTSV4RRFFQ69G5FAV", "01ARZ3NDEKTSV4RRFFQ69G5FAV", "01ZZZ3NDEKTSV4RRFFQ69G5FAV", "ready", "ticket-2", "{}", "2026-08-26T04:00:00.000Z", "2026-08-26T04:00:00.000Z")).toThrow();
    database.close();
  });
});
