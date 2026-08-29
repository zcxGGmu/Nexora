export type TraceSpan = {
  readonly trace_id: string;
  readonly span_id: string;
  readonly parent_span_id: string | null;
  readonly name: string;
  readonly started_at: string;
};

export function createTraceSpan(input: TraceSpan): TraceSpan {
  return input;
}
