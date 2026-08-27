import type { ConnectorDescriptor, PolicyScope } from "@nexora/contracts";
import type { ConnectorJson } from "./hashes.js";

export type MockDraftPayloadInput = {
  readonly title: string;
  readonly content: string;
  readonly target_ref: string;
  readonly workspace_id: string;
  readonly run_id: string;
  readonly requested_scope: PolicyScope;
  readonly artifact_id: string;
  readonly artifact_version: number;
  readonly idempotency_key: string;
  readonly review_id: string;
  readonly review_version: number;
};

export function draftPayload(input: MockDraftPayloadInput): ConnectorJson {
  return { title: input.title, content: input.content, target_ref: input.target_ref };
}

export function requestPayload(input: MockDraftPayloadInput, payloadHash: string, descriptor: ConnectorDescriptor): ConnectorJson {
  return {
    connector_id: descriptor.id,
    connector_version: descriptor.version,
    workspace_id: input.workspace_id,
    run_id: input.run_id,
    requested_scope: { kind: input.requested_scope.kind, id: input.requested_scope.id },
    artifact_id: input.artifact_id,
    artifact_version: input.artifact_version,
    target_ref: input.target_ref,
    risk_level: descriptor.risk_level,
    idempotency_key: input.idempotency_key,
    review_id: input.review_id,
    review_version: input.review_version,
    payload_hash: payloadHash,
  };
}
