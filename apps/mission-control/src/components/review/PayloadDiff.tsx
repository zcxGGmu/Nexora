import type { JSX } from "react";

export type DiffLine = {
  readonly marker: "+" | "-" | " ";
  readonly text: string;
};

export function PayloadDiff(props: { readonly lines: readonly DiffLine[] }): JSX.Element {
  return (
    <section className="panel" aria-labelledby="payload-diff-title">
      <div className="panel-header"><h2 id="payload-diff-title">Payload Diff</h2></div>
      <pre className="code-block" aria-label="Payload diff">
        {props.lines.map((line) => `${line.marker} ${line.text}`).join("\n")}
      </pre>
    </section>
  );
}
