import type { JSX } from "react";

import { EmptyState } from "../components/states/EmptyState.js";
import { ErrorState } from "../components/states/ErrorState.js";
import { LoadingState } from "../components/states/LoadingState.js";
import { OfflineState } from "../components/states/OfflineState.js";
import { PartialSuccessState } from "../components/states/PartialSuccessState.js";
import { PermissionDeniedState } from "../components/states/PermissionDeniedState.js";

export function DesignSystemPage(): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Design System</p>
        <h1 id="route-title">Primitive showcase and state matrix</h1>
        <p>Tokens, status labels, focus behavior, and recovery copy are visible before product screens compose them.</p>
      </header>
      <section className="showcase-grid" aria-label="Shared states">
        <LoadingState title="Loading workspace projections" impact="Existing projections stay visible while the latest cursor loads." nextAction="Keep reading cached evidence." />
        <EmptyState title="Inbox is clear" impact="No attention items match this filter." nextAction="Create a ticket or clear the filter." />
        <OfflineState title="Offline cached view" impact="Write commands and approvals are disabled." nextAction="Reconnect before approving risk." />
        <ErrorState title="Event stream failed" impact="Runs cannot refresh their evidence spine." nextAction="Retry this module." />
        <PermissionDeniedState title="Workspace permission required" impact="This role can only read filtered projections." nextAction="Request an Owner to grant access." />
        <PartialSuccessState title="Run partially completed" impact="Two steps completed and one needs review." nextAction="Open the failed step." />
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Touch target and focus contract</h2>
          <button className="primary-action" type="button">Primary command</button>
        </div>
        <article className="work-row">
          <div>
            <h3>Long ID and unbroken content wraps safely</h3>
            <p className="mono">run_01ARZ3NDEKTSV4RRFFQ69G5FAV_payload_hash_sha256_7f4a6d15c0e2</p>
          </div>
          <button className="row-action" type="button">Copy</button>
        </article>
      </section>
    </div>
  );
}
