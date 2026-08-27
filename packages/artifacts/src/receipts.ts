import { redactSecrets } from "@nexora/policy";

export type ReceiptSummaryInput = {
  readonly receipt_id: string;
  readonly inputs: readonly string[];
  readonly tool_calls: readonly string[];
  readonly validation_results: readonly string[];
  readonly secret_refs: readonly string[];
  readonly notes: string;
};

export type ReceiptSummary = {
  readonly receipt_id: string;
  readonly inputs: readonly string[];
  readonly tool_calls: readonly string[];
  readonly validation_results: readonly string[];
  readonly notes: string;
  readonly redactions: readonly string[];
};

export function summarizeReceipt(input: ReceiptSummaryInput): ReceiptSummary {
  const redacted = redactSecrets({ notes: input.notes }, { secret_refs: input.secret_refs });
  return {
    receipt_id: input.receipt_id,
    inputs: input.inputs,
    tool_calls: input.tool_calls,
    validation_results: input.validation_results,
    notes: readNotes(redacted.value),
    redactions: redacted.redactions,
  };
}

function readNotes(value: unknown): string {
  if (isRecord(value) && typeof value["notes"] === "string") return value["notes"];
  return "[redaction failed]";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
