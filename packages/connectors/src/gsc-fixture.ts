import { z } from "@nexora/contracts";

export const SeoGscRowSchema = z.object({ clicks: z.number().int().nonnegative(), ctr: z.number().finite().nonnegative(), impressions: z.number().int().nonnegative(), position: z.number().finite().positive(), query: z.string().min(1), url: z.string().url() }).strict();

const GscFixtureInputSchema = z.object({ rows: z.array(SeoGscRowSchema), source_file: z.string().min(1), target_keyword: z.string().min(1) }).strict();

export type SeoGscRow = z.infer<typeof SeoGscRowSchema>;
export type SeoSourceReceipt = {
  readonly source_file: string;
  readonly target_keyword: string;
  readonly rows: readonly SeoGscRow[];
  readonly row_count: number;
};

export function readGscFixture(input: z.input<typeof GscFixtureInputSchema>): SeoSourceReceipt {
  const fixture = GscFixtureInputSchema.parse(input);
  return { source_file: fixture.source_file, target_keyword: fixture.target_keyword, rows: fixture.rows, row_count: fixture.rows.length };
}
