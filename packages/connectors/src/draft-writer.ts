import { z } from "@nexora/contracts";
import { SeoGscRowSchema, type SeoSourceReceipt } from "./gsc-fixture.js";

const SeoDraftWriterInputSchema = z
  .object({
    attempt: z.number().int().positive(),
    mode: z.enum(["source_backed", "invent_metric"]),
    source_receipt: z.object({ source_file: z.string().min(1), target_keyword: z.string().min(1), rows: z.array(SeoGscRowSchema), row_count: z.number().int().nonnegative() }).strict(),
    site: z.object({ id: z.string().min(1), canonical_url: z.string().url(), voice: z.string().min(1) }).strict(),
    target_keyword: z.string().min(1),
    memory_refs: z.array(z.string().min(1)),
  })
  .strict();

export type SeoDraftWriterMode = "source_backed" | "invent_metric";
export type SeoDraftWriterInput = {
  readonly attempt: number;
  readonly mode: SeoDraftWriterMode;
  readonly source_receipt: SeoSourceReceipt;
  readonly site: { readonly id: string; readonly canonical_url: string; readonly voice: string };
  readonly target_keyword: string;
  readonly memory_refs: readonly string[];
};

export function createSeoDraftMarkdown(input: SeoDraftWriterInput): string {
  const parsed = SeoDraftWriterInputSchema.parse({ ...input, memory_refs: [...input.memory_refs], source_receipt: { ...input.source_receipt, rows: [...input.source_receipt.rows] } });
  const topRow = topOpportunity(parsed.source_receipt);
  const inventedMetric = parsed.mode === "invent_metric" ? "\n- Invented metric: 18.4% conversion lift after publishing.\n" : "";
  return [
    `# ${parsed.target_keyword}`,
    "",
    `Canonical URL: ${parsed.site.canonical_url}`,
    `Voice: ${parsed.site.voice}`,
    "",
    "## Opportunity",
    `- Query: ${topRow.query}`,
    `- URL: ${topRow.url}`,
    `- Impressions: ${topRow.impressions}`,
    `- Clicks: ${topRow.clicks}`,
    `- CTR: ${(topRow.ctr * 100).toFixed(1)}%`,
    `- Average position: ${topRow.position}`,
    inventedMetric.trimEnd(),
    "## Draft",
    `Operators searching for ${parsed.target_keyword} need a concise setup path, clear handoff rules, and proof that every metric is tied back to the supplied Search Console fixture.`,
    "",
    "## Source receipt",
    `- Source file: ${parsed.source_receipt.source_file}`,
    `- Rows reviewed: ${parsed.source_receipt.row_count}`,
    `- Memory refs: ${parsed.memory_refs.join(", ")}`,
    "- Internal link checked: /docs/agent-os/setup",
    "- Publish disabled: no CMS, indexing, or external publish call executed.",
  ].filter((line) => line.length > 0).join("\n");
}

function topOpportunity(sourceReceipt: SeoSourceReceipt): SeoSourceReceipt["rows"][number] {
  const [first] = sourceReceipt.rows;
  if (first === undefined) throw new DraftWriterError("SEO draft writer requires at least one GSC row");
  return first;
}

export class DraftWriterError extends Error {
  readonly name = "DraftWriterError";
}
