export const CORE_TABLES = [
  "workspaces",
  "agents",
  "goals",
  "tickets",
  "runs",
  "attempts",
  "steps",
  "artifacts",
  "receipts",
  "review_decisions",
  "idempotency_records",
  "events",
  "projection_checkpoints",
] as const;

export type CoreTable = (typeof CORE_TABLES)[number];
export const CORE_MIGRATION_VERSION = 2;
