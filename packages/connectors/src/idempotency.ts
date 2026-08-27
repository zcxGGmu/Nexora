import { PersistenceError, type IdempotencyRecord, type IdempotencyRepository } from "@nexora/persistence";
import { systemClock, type Clock } from "@nexora/contracts";
import { ConnectorExecutionError } from "./errors.js";

const CONNECTOR_RECEIPT_RESOURCE = "connector_receipt";
const UNKNOWN_SIDE_EFFECT_RESOURCE = "connector_side_effect_unknown";

export type ConnectorIdempotencyInput = {
  readonly workspace_id: string;
  readonly idempotency_key: string;
  readonly request_hash: string;
  readonly receipt_ref: string;
};

export type ConnectorIdempotencyClaim =
  | { readonly kind: "reserved"; readonly receipt_ref: string }
  | { readonly kind: "reused"; readonly receipt_ref: string };

export type ConnectorIdempotencyPreflight =
  | { readonly kind: "available" }
  | { readonly kind: "reused"; readonly receipt_ref: string };

export type ConnectorIdempotencyFreeze = { readonly kind: "frozen"; readonly receipt_ref: string };

export class ConnectorIdempotencyGate {
  constructor(private readonly repository: IdempotencyRepository, private readonly clock: Clock = systemClock) {}

  begin(input: ConnectorIdempotencyInput): ConnectorIdempotencyClaim {
    const existing = this.repository.get(input.workspace_id, input.idempotency_key);
    if (existing !== undefined) return reuseExisting(existing, input);
    const reserved = this.reserve(input, UNKNOWN_SIDE_EFFECT_RESOURCE);
    if (reserved.resource_type === UNKNOWN_SIDE_EFFECT_RESOURCE && reserved.resource_id === input.receipt_ref) return { kind: "reserved", receipt_ref: input.receipt_ref };
    return reuseExisting(reserved, input);
  }

  claim(input: ConnectorIdempotencyInput): ConnectorIdempotencyClaim {
    const existing = this.repository.get(input.workspace_id, input.idempotency_key);
    if (existing !== undefined) {
      if (existing.resource_type === UNKNOWN_SIDE_EFFECT_RESOURCE && existing.resource_id === input.receipt_ref) return this.confirmReceipt(input);
      return reuseExisting(existing, input);
    }
    const reserved = this.reserve(input, CONNECTOR_RECEIPT_RESOURCE);
    if (reserved.resource_id === input.receipt_ref) return { kind: "reserved", receipt_ref: input.receipt_ref };
    return reuseExisting(reserved, input);
  }

  preflight(input: ConnectorIdempotencyInput): ConnectorIdempotencyPreflight {
    const existing = this.repository.get(input.workspace_id, input.idempotency_key);
    if (existing === undefined) return { kind: "available" };
    return reuseExistingRecord(existing, input);
  }

  freezeUnknown(input: ConnectorIdempotencyInput): ConnectorIdempotencyFreeze {
    const existing = this.repository.get(input.workspace_id, input.idempotency_key);
    if (existing !== undefined) return freezeExisting(existing, input);
    const reserved = this.reserve(input, UNKNOWN_SIDE_EFFECT_RESOURCE);
    if (reserved.resource_type === UNKNOWN_SIDE_EFFECT_RESOURCE && reserved.resource_id === input.receipt_ref) return { kind: "frozen", receipt_ref: input.receipt_ref };
    return freezeExisting(reserved, input);
  }

  private reserve(input: ConnectorIdempotencyInput, resourceType: string): IdempotencyRecord {
    try {
      return this.repository.reserve({ workspace_id: input.workspace_id, idempotency_key: input.idempotency_key, request_hash: input.request_hash, resource_type: resourceType, resource_id: input.receipt_ref, created_at: this.clock.now() });
    } catch (error) {
      if (error instanceof PersistenceError && error.code === "IDEMPOTENCY_KEY_REUSED") {
        throw new ConnectorExecutionError("IDEMPOTENCY_KEY_REUSED", "Idempotency key was reused with a different connector request");
      }
      throw error;
    }
  }

  private confirmReceipt(input: ConnectorIdempotencyInput): ConnectorIdempotencyClaim {
    try {
      const record = this.repository.replaceResource({ workspace_id: input.workspace_id, idempotency_key: input.idempotency_key, request_hash: input.request_hash, from_resource_type: UNKNOWN_SIDE_EFFECT_RESOURCE, to_resource_type: CONNECTOR_RECEIPT_RESOURCE, resource_id: input.receipt_ref });
      if (record.resource_type === CONNECTOR_RECEIPT_RESOURCE && record.resource_id === input.receipt_ref) return { kind: "reserved", receipt_ref: input.receipt_ref };
      return reuseExisting(record, input);
    } catch (error) {
      if (error instanceof PersistenceError && error.code === "IDEMPOTENCY_KEY_REUSED") throw new ConnectorExecutionError("IDEMPOTENCY_KEY_REUSED", "Idempotency key was reused with a different connector request");
      throw error;
    }
  }
}

function reuseExisting(existing: IdempotencyRecord, input: ConnectorIdempotencyInput): ConnectorIdempotencyClaim {
  return reuseExistingRecord(existing, input);
}

function reuseExistingRecord(existing: IdempotencyRecord, input: ConnectorIdempotencyInput): { readonly kind: "reused"; readonly receipt_ref: string } {
  assertSameRequest(existing, input);
  if (existing.resource_type === UNKNOWN_SIDE_EFFECT_RESOURCE) throw new ConnectorExecutionError("DUPLICATE_SIDE_EFFECT", "Connector side effect is unknown and must be reconciled before retry");
  if (existing.resource_type !== CONNECTOR_RECEIPT_RESOURCE) throw new ConnectorExecutionError("DUPLICATE_SIDE_EFFECT", "Idempotency key is already reserved by another resource");
  return { kind: "reused", receipt_ref: existing.resource_id };
}

function freezeExisting(existing: IdempotencyRecord, input: ConnectorIdempotencyInput): ConnectorIdempotencyFreeze {
  assertSameRequest(existing, input);
  if (existing.resource_type === UNKNOWN_SIDE_EFFECT_RESOURCE) return { kind: "frozen", receipt_ref: existing.resource_id };
  throw new ConnectorExecutionError("DUPLICATE_SIDE_EFFECT", "Idempotency key already has a known connector receipt");
}

function assertSameRequest(existing: IdempotencyRecord, input: ConnectorIdempotencyInput): void {
  if (existing.request_hash !== input.request_hash) {
    throw new ConnectorExecutionError("IDEMPOTENCY_KEY_REUSED", "Idempotency key was reused with a different connector request");
  }
}
