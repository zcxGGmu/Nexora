import { describe, expect, it } from "vitest";
import { ConnectorQuarantineService } from "../../packages/observability/src/index.js";
import { migrate, openDatabase } from "../../packages/persistence/src/index.js";
import { evaluateConnectorPolicy } from "../../packages/policy/src/index.js";

const ID = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  owner: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  operator: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
} as const;
const TIME = "2026-08-29T04:00:00.000Z";
const CONNECTOR = {
  id: "gsc.export",
  version: "1.0.0",
  risk_level: "R1",
  data_classification: "internal",
  requires_review: false,
  allowed_scopes: [{ kind: "workspace", id: ID.workspace }],
} as const;
const LOCAL_EGRESS = {
  execution_location: "local",
  provider: "local",
  region: "local",
  data_classification: "internal",
  allowed_providers: ["local"],
  allowed_regions: ["local"],
  minimal_snapshot: false,
  target_url: "http://127.0.0.1/resource",
} as const;

describe("C15 connector quarantine", () => {
  it("Given a quarantined connector When connector policy is evaluated Then execution is blocked until an Owner releases it", () => {
    const database = openDatabase(":memory:");
    migrate(database, { now: () => TIME });
    database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(ID.workspace, "Security", TIME, TIME);
    const quarantine = new ConnectorQuarantineService(database);
    quarantine.quarantine({ id: "01DRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: ID.workspace, connector_id: CONNECTOR.id, connector_version: CONNECTOR.version, reason: "Vendor incident", actor_id: ID.owner, created_at: TIME });

    try {
      const active = quarantine.active(ID.workspace, CONNECTOR.id, CONNECTOR.version);
      if (active === undefined) throw new Error("Expected active connector quarantine");
      const denied = evaluateConnectorPolicy({
        actor: { id: ID.operator, role: "Operator", workspace_id: ID.workspace, allowed_scopes: [{ kind: "workspace", id: ID.workspace }] },
        connector: CONNECTOR,
        requested_scope: { kind: "workspace", id: ID.workspace },
        approval: null,
        egress: LOCAL_EGRESS,
        quarantine: active,
      });

      expect(denied).toMatchObject({ allowed: false, code: "CONNECTOR_UNAVAILABLE", required_action: "release_connector_quarantine" });
      expect(() => quarantine.release({ workspace_id: ID.workspace, connector_id: CONNECTOR.id, connector_version: CONNECTOR.version, actor_id: ID.operator, actor_role: "Operator", reason: "Retry", released_at: TIME })).toThrow("Owner role is required");
      quarantine.release({ workspace_id: ID.workspace, connector_id: CONNECTOR.id, connector_version: CONNECTOR.version, actor_id: ID.owner, actor_role: "Owner", reason: "Vendor cleared", released_at: TIME });

      expect(quarantine.active(ID.workspace, CONNECTOR.id, CONNECTOR.version)).toBeUndefined();
      expect(evaluateConnectorPolicy({
        actor: { id: ID.operator, role: "Operator", workspace_id: ID.workspace, allowed_scopes: [{ kind: "workspace", id: ID.workspace }] },
        connector: CONNECTOR,
        requested_scope: { kind: "workspace", id: ID.workspace },
        approval: null,
        egress: LOCAL_EGRESS,
      })).toMatchObject({ allowed: true });
    } finally {
      database.close();
    }
  });
});
