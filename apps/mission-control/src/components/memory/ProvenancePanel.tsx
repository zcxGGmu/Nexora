import type { JSX } from "react";

export type MemoryProvenance = {
  readonly scope: string;
  readonly type: string;
  readonly sourceRun: string;
  readonly consumers: readonly string[];
  readonly trust: string;
  readonly receiptHref: string;
};

export function ProvenancePanel(props: { readonly provenance: MemoryProvenance }): JSX.Element {
  return (
    <section className="panel" aria-labelledby="memory-provenance-title">
      <div className="panel-header"><h2 id="memory-provenance-title">Provenance</h2></div>
      <dl className="fact-grid">
        <div><dt>Scope</dt><dd>Scope {props.provenance.scope}</dd></div>
        <div><dt>Type</dt><dd>Type {props.provenance.type}</dd></div>
        <div><dt>Source Run</dt><dd>Source Run {props.provenance.sourceRun}</dd></div>
        <div><dt>Consumers</dt><dd>Consumers {props.provenance.consumers.join(", ")}</dd></div>
        <div><dt>Trust</dt><dd>Trust {props.provenance.trust}</dd></div>
      </dl>
      <a className="row-action" href={props.provenance.receiptHref}>Open source receipt</a>
    </section>
  );
}
