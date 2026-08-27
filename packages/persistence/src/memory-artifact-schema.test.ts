import { describe, expect, it } from "vitest";
import { CORE_TABLES, migrate, openDatabase } from "./index.js";

describe("memory and artifact SQLite migration", () => {
  it("Given a migrated database When C07 starts Then memory and artifact version facts are immutable", () => {
    const database = openDatabase(":memory:");
    migrate(database, { now: () => "2026-08-26T04:00:00.000Z" });

    expect(CORE_TABLES).toEqual(expect.arrayContaining(["memory_notes", "memory_versions", "memory_snapshots", "artifact_versions"]));
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row["name"]);
    expect(tables).toEqual(expect.arrayContaining(["memory_notes", "memory_versions", "memory_snapshots", "artifact_versions"]));
    const triggers = database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all().map((row) => row["name"]);
    expect(triggers).toEqual(expect.arrayContaining(["memory_versions_no_update", "memory_versions_no_delete", "artifact_versions_no_update", "artifact_versions_no_delete"]));

    database.close();
  });
});
