import type { JSX } from "react";

import { EmptyState } from "../components/states/EmptyState.js";

export type MissingDetailView = {
  readonly id: string;
  readonly kind: "Artifact" | "Review" | "Run" | "Workflow";
};

export function MissingDetailPage(props: { readonly view: MissingDetailView }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">C11 fixture boundary</p>
        <h1 id="route-title">{props.view.kind} not found</h1>
        <p>Unknown detail links keep scope and URL state visible without reusing unrelated fixture data.</p>
      </header>
      <EmptyState title={`${props.view.kind} ${props.view.id} is unavailable`} impact={`No C11 fixture exists for ${props.view.kind} ${props.view.id}.`} nextAction="Return to Mission Control or open a known evidence link." />
    </div>
  );
}
