import type { JSX } from "react";

import { EmptyState } from "../components/states/EmptyState.js";

export function PlaceholderPage(props: { readonly title: string; readonly scope: string; readonly nextStage: string }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">{props.nextStage}</p>
        <h1 id="route-title">{props.title}</h1>
        <p>{props.scope} deep link state is preserved by the C10 shell. Detailed workspace controls land in the next UI stage.</p>
      </header>
      <EmptyState title={`${props.title} is routed`} impact="This C10 screen keeps URL state, scope, and evidence navigation active without pretending later controls are available." nextAction="Return to Mission Control or open Inbox." />
    </div>
  );
}
