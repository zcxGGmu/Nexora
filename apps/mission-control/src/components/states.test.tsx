import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./states/EmptyState.js";
import { ErrorState } from "./states/ErrorState.js";
import { LoadingState } from "./states/LoadingState.js";
import { OfflineState } from "./states/OfflineState.js";
import { PartialSuccessState } from "./states/PartialSuccessState.js";
import { PermissionDeniedState } from "./states/PermissionDeniedState.js";

describe("C10 shared state components", () => {
  it("Given all state variants When rendered Then each explains condition impact and next action", () => {
    const variants = [
      <LoadingState key="loading" impact="Existing projections stay visible while the latest cursor loads." nextAction="Keep reading cached evidence." title="Loading workspace projections" />,
      <EmptyState key="empty" impact="No attention items match this filter." nextAction="Create a ticket or clear the filter." title="Inbox is clear" />,
      <OfflineState key="offline" impact="Write commands and approvals are disabled." nextAction="Reconnect before approving risk." title="Offline cached view" />,
      <ErrorState key="error" impact="Runs cannot refresh their evidence spine." nextAction="Retry this module." title="Event stream failed" />,
      <PermissionDeniedState key="permission" impact="This role can only read filtered projections." nextAction="Request an Owner to grant access." title="Workspace permission required" />,
      <PartialSuccessState key="partial" impact="Two steps completed and one needs review." nextAction="Open the failed step." title="Run partially completed" />,
    ];

    const markup = renderToStaticMarkup(<section>{variants}</section>);

    for (const expected of [
      "Loading workspace projections",
      "Existing projections stay visible",
      "Keep reading cached evidence",
      "Inbox is clear",
      "No attention items match",
      "Create a ticket or clear the filter",
      "Offline cached view",
      "Write commands and approvals are disabled",
      "Reconnect before approving risk",
      "Event stream failed",
      "Runs cannot refresh their evidence spine",
      "Retry this module",
      "Workspace permission required",
      "This role can only read filtered projections",
      "Request an Owner to grant access",
      "Run partially completed",
      "Two steps completed",
      "Open the failed step",
    ]) {
      expect(markup).toContain(expected);
    }

    expect(markup).toContain("role=\"alert\"");
  });
});
