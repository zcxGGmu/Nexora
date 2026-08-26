import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { systemClock, type Clock } from "@nexora/contracts";
import { CORE_MIGRATION_VERSION, CORE_TABLES } from "./schema.js";

const MIGRATIONS = [
  { version: 1, path: "./migrations/0001_core.sql" },
  { version: 2, path: "./migrations/0002_event_store.sql" },
  { version: 3, path: "./migrations/0003_orchestration.sql" },
] as const;

export type SqliteDatabase = DatabaseSync;

export function openDatabase(path: string): SqliteDatabase {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  return database;
}

export function migrate(database: SqliteDatabase, clock: Clock = systemClock): void {
  database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);");
  for (const migration of MIGRATIONS) {
    const applied = database.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(migration.version);
    if (applied !== undefined) continue;
    const sql = readFileSync(new URL(migration.path, import.meta.url), "utf8");
    withTransaction(database, () => {
      database.exec(sql);
      database.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(migration.version, clock.now());
    });
  }
  validateMigration(database);
}

export function validateMigration(database: SqliteDatabase): void {
  const migrationTable = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (migrationTable === undefined) throw new Error(`SQLite migration ${CORE_MIGRATION_VERSION} is not applied`);
  const row = database.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(CORE_MIGRATION_VERSION);
  if (row === undefined) throw new Error(`SQLite migration ${CORE_MIGRATION_VERSION} is not applied`);
  for (const migration of MIGRATIONS) {
    const applied = database.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(migration.version);
    if (applied === undefined) throw new Error(`SQLite migration ${migration.version} is not applied`);
  }
  const requiredTables = CORE_TABLES;
  const placeholders = requiredTables.map(() => "?").join(",");
  const rows = database.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`).all(...requiredTables);
  if (rows.length !== requiredTables.length) throw new Error(`SQLite migration ${CORE_MIGRATION_VERSION} is incomplete`);
}

export function rollback(database: SqliteDatabase): void {
  const migrationTable = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (migrationTable === undefined) return;

  withTransaction(database, () => {
    database.exec(`DROP TABLE IF EXISTS leases;
      DROP TABLE IF EXISTS queue_jobs;
      DROP TABLE IF EXISTS projection_checkpoints;
      DROP TABLE IF EXISTS events;
      DROP TABLE IF EXISTS review_decisions;
      DROP TABLE IF EXISTS receipts;
      DROP TABLE IF EXISTS artifacts;
      DROP TABLE IF EXISTS steps;
      DROP TABLE IF EXISTS attempts;
      DROP TABLE IF EXISTS runs;
      DROP TABLE IF EXISTS tickets;
      DROP TABLE IF EXISTS goals;
      DROP TABLE IF EXISTS agents;
      DROP TABLE IF EXISTS idempotency_records;
      DROP TABLE IF EXISTS workspaces;
      DROP TABLE IF EXISTS schema_migrations;`);
  });
}

export function withTransaction<T>(database: SqliteDatabase, work: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
