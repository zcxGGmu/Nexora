import { describe, expect, it } from "vitest";

import { createSeoDraftMarkdown, judgeSeoDraft, readGscFixture } from "./index.js";

const row = { clicks: 82, ctr: 0.073, impressions: 2296, position: 12, query: "agent os setup", url: "https://example.test/agent-os" } as const;

describe("C12 SEO connector helpers", () => {
  it("Given a source-backed draft When judged Then every quality gate passes", () => {
    const receipt = readGscFixture({ rows: [row], source_file: "fixtures/gsc/acme-2026-08-28.json", target_keyword: "agent os setup" });
    const content = createSeoDraftMarkdown({ attempt: 1, memory_refs: ["memory://Sites/acme.md"], mode: "source_backed", site: { canonical_url: "https://example.test/agent-os", id: "site-acme", voice: "plainspoken" }, source_receipt: receipt, target_keyword: "agent os setup" });

    const result = judgeSeoDraft({ attempt: 1, canonical_url: "https://example.test/agent-os", content, run_id: "run-seo", source_file: receipt.source_file, source_rows: receipt.rows });

    expect(result.status).toBe("pass");
    expect(result.validation_results.every((gate) => gate.passed)).toBe(true);
  });

  it("Given a draft with a fabricated numeric claim When judged Then invented metrics fail", () => {
    const receipt = readGscFixture({ rows: [row], source_file: "fixtures/gsc/acme-2026-08-28.json", target_keyword: "agent os setup" });
    const content = `${createSeoDraftMarkdown({ attempt: 1, memory_refs: ["memory://Sites/acme.md"], mode: "source_backed", site: { canonical_url: "https://example.test/agent-os", id: "site-acme", voice: "plainspoken" }, source_receipt: receipt, target_keyword: "agent os setup" })}\n- Expected lift: 18.4%`;

    const result = judgeSeoDraft({ attempt: 1, canonical_url: "https://example.test/agent-os", content, run_id: "run-seo", source_file: receipt.source_file, source_rows: receipt.rows });

    expect(result.status).toBe("fail");
    expect(result.validation_results).toContainEqual({ gate: "no_invented_metrics", passed: false });
  });
});
