import type { JSX } from "react";

import type { ArtifactVersionView } from "./ReceiptTabs.js";

export function ArtifactPreview(props: { readonly artifact: ArtifactVersionView; readonly preview: string }): JSX.Element {
  return (
    <section className="panel artifact-preview" aria-labelledby="artifact-preview-title">
      <div className="panel-header">
        <h2 id="artifact-preview-title">Artifact {props.artifact.name}</h2>
        <span className="status-badge status-badge--success">Fixed version {props.artifact.version}</span>
      </div>
      <article className="preview-body">
        <p>{props.preview}</p>
        <p className="state-plane__action">Editing creates a new artifact version; old approvals stay bound to {props.artifact.version}.</p>
        <p className="meta">No command was repeated on refresh.</p>
      </article>
    </section>
  );
}
