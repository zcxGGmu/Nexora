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
  "queue_jobs",
  "leases",
  "memory_notes",
  "memory_versions",
  "memory_snapshots",
  "artifact_versions",
  "egress_receipts",
  "schedules",
  "schedule_occurrences",
  "connector_quarantines",
] as const;

export type CoreTable = (typeof CORE_TABLES)[number];
export const CORE_MIGRATION_VERSION = 7;
