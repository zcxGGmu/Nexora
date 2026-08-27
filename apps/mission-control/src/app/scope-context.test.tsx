import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScopeProvider, createScopeState, switchScope, useScope } from "./scope-context.js";

describe("C10 scope context", () => {
  it("Given an existing filtered scope When switching workspace Then stale route lists are explicitly cleared", () => {
    const initial = createScopeState({
      accessMode: "read_write",
      policyVersion: "policy-v1",
      project: "proj-a",
      site: "site-a",
      workspace: "ws-a",
      workspaceLabel: "Demo Workspace",
    });

    const switched = switchScope(initial, {
      accessMode: "read_only",
      policyVersion: "policy-v2",
      project: "proj-b",
      site: "site-b",
      workspace: "ws-b",
      workspaceLabel: "Restricted Workspace",
    });

    expect(switched.current.workspace).toBe("ws-b");
    expect(switched.current.accessMode).toBe("read_only");
    expect(switched.queryEpoch).toBe(initial.queryEpoch + 1);
    expect(switched.clearedViews).toEqual(["attention", "runs", "goals", "artifacts", "reviews"]);
    expect(switched.urlState.filter).toBeNull();
    expect(switched.urlState.tab).toBeNull();
    expect(switched.urlState.cursor).toBeNull();
  });

  it("Given a scope provider When rendered Then descendants can read label access mode and policy version", () => {
    function ScopeProbe(): React.JSX.Element {
      const scope = useScope();
      return <output>{`${scope.state.current.workspaceLabel}:${scope.state.current.accessMode}:${scope.state.current.policyVersion}`}</output>;
    }

    const initial = createScopeState({
      accessMode: "read_write",
      policyVersion: "policy-v1",
      project: "proj-a",
      site: "site-a",
      workspace: "ws-a",
      workspaceLabel: "Demo Workspace",
    });

    const markup = renderToStaticMarkup(
      <ScopeProvider initialState={initial}>
        <ScopeProbe />
      </ScopeProvider>,
    );

    expect(markup).toContain("Demo Workspace:read_write:policy-v1");
  });
});
