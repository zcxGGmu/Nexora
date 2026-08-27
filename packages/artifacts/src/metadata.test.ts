import { describe, expect, it } from "vitest";
import { createArtifactPreview, sha256Content } from "./metadata.js";
import { summarizeReceipt } from "./receipts.js";

describe("artifact metadata", () => {
  it("Given content and receipt details When summarizing provenance Then previews are bounded and secrets are redacted", () => {
    const hash = sha256Content("draft");
    const preview = createArtifactPreview({ content_type: "json", content: "{\"token\":\"NEXORA_SECRET\",\"ok\":true}", secret_refs: ["NEXORA_SECRET"] });
    const receipt = summarizeReceipt({ receipt_id: "receipt-1", inputs: ["memory://About/business.md"], tool_calls: ["artifact.write"], validation_results: ["source_data_attached"], secret_refs: ["NEXORA_SECRET"], notes: "used NEXORA_SECRET" });

    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(preview.preview).toContain("[REDACTED]");
    expect(preview.redactions).toEqual(["$.token"]);
    expect(receipt.notes).toBe("used [REDACTED]");
    expect(receipt.redactions).toEqual(["$.notes"]);
  });
});
