import { z } from "@nexora/contracts";
import { SeoGscRowSchema } from "./gsc-fixture.js";

const SeoJudgeInputSchema = z
  .object({
    attempt: z.number().int().positive(),
    run_id: z.string().min(1),
    content: z.string().min(1),
    canonical_url: z.string().url(),
    source_file: z.string().min(1),
    source_rows: z.array(SeoGscRowSchema),
  })
  .strict();

export type SeoValidationResult = { readonly gate: string; readonly passed: boolean };
export type SeoJudgeResult = {
  readonly status: "pass" | "fail";
  readonly attempt: number;
  readonly judge_ref: string;
  readonly reason: string;
  readonly validation_results: readonly SeoValidationResult[];
};

export type SeoJudgeInput = {
  readonly attempt: number;
  readonly run_id: string;
  readonly content: string;
  readonly canonical_url: string;
  readonly source_file: string;
  readonly source_rows: readonly z.infer<typeof SeoGscRowSchema>[];
};

export function judgeSeoDraft(input: SeoJudgeInput): SeoJudgeResult {
  const parsed = SeoJudgeInputSchema.parse({ ...input, source_rows: [...input.source_rows] });
  const numericClaimsTrace = numericClaimsAreSourceBacked(parsed.content, parsed.source_rows);
  const validationResults: readonly SeoValidationResult[] = [
    { gate: "source_data_present", passed: parsed.source_rows.length > 0 },
    { gate: "claims_have_sources", passed: parsed.content.includes("## Source receipt") && parsed.content.includes(parsed.source_file) },
    { gate: "no_invented_metrics", passed: numericClaimsTrace },
    { gate: "canonical_url_present", passed: parsed.content.includes(parsed.canonical_url) },
    { gate: "internal_links_checked", passed: parsed.content.includes("Internal link checked") },
  ];
  const failed = validationResults.filter((result) => !result.passed);
  return {
    status: failed.length === 0 ? "pass" : "fail",
    attempt: parsed.attempt,
    judge_ref: `judge://seo_draft_v1/${parsed.run_id}/attempt-${parsed.attempt}`,
    reason: failed.length === 0 ? "All SEO source gates passed" : `Failed gates: ${failed.map((result) => result.gate).join(", ")}`,
    validation_results: validationResults,
  };
}

function numericClaimsAreSourceBacked(content: string, rows: readonly z.infer<typeof SeoGscRowSchema>[]): boolean {
  const allowed = new Set<string>([String(rows.length)]);
  for (const row of rows) {
    allowed.add(String(row.clicks));
    allowed.add(String(row.impressions));
    allowed.add(trimTrailingZeroes(row.position));
    allowed.add((row.ctr * 100).toFixed(1));
  }
  return numericClaims(content).every((claim) => allowed.has(trimTrailingZeroes(claim.replace("%", ""))));
}

function numericClaims(content: string): readonly string[] {
  const claims: string[] = [];
  for (const line of content.split("\n")) {
    if (numericLineIsReferenceOnly(line)) continue;
    for (const match of line.matchAll(/\b\d+(?:\.\d+)?%?/g)) {
      const [claim] = match;
      if (claim !== undefined) claims.push(claim);
    }
  }
  return claims;
}

function numericLineIsReferenceOnly(line: string): boolean {
  return line.startsWith("Canonical URL:") || line.startsWith("- Source file:") || line.startsWith("- Memory refs:") || line.startsWith("- Publish disabled:") || line.startsWith("# ");
}

function trimTrailingZeroes(value: number | string): string {
  return String(value).replace(/\.0$/, "");
}
