import type { ArtifactWithContent } from "@nexora/artifacts";
import type { ConnectorDescriptor, ConnectorExecutionReceipt, ConnectorPreview, ConnectorReviewRequired, ReviewDecision } from "@nexora/contracts";
import type { PolicyActor } from "@nexora/policy";

export type ConnectorAuthorization = {
  readonly kind: "authorized";
  readonly preview: ConnectorPreview;
  readonly review: ReviewDecision | null;
  readonly review_ref: string | null;
  readonly artifact_version: number;
};

export type ConnectorAuthorizationStamp = {
  readonly request_hash: string;
  readonly payload_hash: string;
  readonly requires_review: boolean;
  readonly review_ref: string | null;
  readonly artifact_version: number;
};

export type CreateConnectorAuthorizationInput = {
  readonly preview: ConnectorPreview;
  readonly review: ReviewDecision | null;
  readonly review_ref: string | null;
  readonly artifact_version: number;
};

export type ConnectorAuthorizeInput<TInput> = {
  readonly actor: PolicyActor;
  readonly input: TInput;
};

export type ConnectorExecuteInput<TInput, TAuthorization extends ConnectorAuthorization = ConnectorAuthorization> = {
  readonly input: TInput;
  readonly authorization: TAuthorization;
  readonly receipt_id: string;
};

export interface ConnectorLifecycle<TInput, TAuthorization extends ConnectorAuthorization = ConnectorAuthorization> {
  readonly descriptor: ConnectorDescriptor;
  validate(input: unknown): TInput;
  preview(input: TInput): ConnectorPreview;
  authorize(input: ConnectorAuthorizeInput<TInput>): TAuthorization | ConnectorReviewRequired;
  execute(input: ConnectorExecuteInput<TInput, TAuthorization>): ConnectorExecutionReceipt;
  verify(receipt: ConnectorExecutionReceipt): ConnectorExecutionReceipt;
  rollback(receipt: ConnectorExecutionReceipt): ConnectorExecutionReceipt;
  readArtifact(input: { readonly workspace_id: string; readonly artifact_id: string; readonly version: number }): ArtifactWithContent;
}
