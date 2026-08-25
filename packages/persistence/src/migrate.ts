import { parseEnvironment } from "@nexora/config";
import { migrate, openDatabase, validateMigration } from "./db.js";

const environment = parseEnvironment(process.env);
if (environment.migrationMode !== "disabled") {
  const database = openDatabase(environment.dbPath);
  if (environment.migrationMode === "auto") migrate(database);
  if (environment.migrationMode === "validate") validateMigration(database);
  database.close();
}
