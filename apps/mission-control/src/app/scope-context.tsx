import { createContext, useContext, useMemo, useState } from "react";
import type { JSX, ReactNode } from "react";

export type AccessMode = "read_only" | "read_write";

export type ScopeSelection = {
  readonly workspace: string;
  readonly workspaceLabel: string;
  readonly site: string;
  readonly project: string;
  readonly accessMode: AccessMode;
  readonly policyVersion: string;
};

export type ScopeUrlState = {
  readonly workspace: string | null;
  readonly site: string | null;
  readonly project: string | null;
  readonly filter: string | null;
  readonly tab: string | null;
  readonly cursor: string | null;
};

export type ScopeState = {
  readonly current: ScopeSelection;
  readonly queryEpoch: number;
  readonly clearedViews: readonly string[];
  readonly urlState: ScopeUrlState;
};

type ScopeContextValue = {
  readonly state: ScopeState;
  readonly setScope: (next: ScopeSelection) => void;
};

const CLEARED_VIEWS = ["attention", "runs", "goals", "artifacts", "reviews"] as const;
const ScopeContext = createContext<ScopeContextValue | null>(null);

export function createScopeState(current: ScopeSelection): ScopeState {
  return {
    current,
    queryEpoch: 0,
    clearedViews: [],
    urlState: scopeUrlState(current),
  };
}

export function switchScope(state: ScopeState, next: ScopeSelection): ScopeState {
  return {
    current: next,
    queryEpoch: state.queryEpoch + 1,
    clearedViews: CLEARED_VIEWS,
    urlState: {
      workspace: next.workspace,
      site: next.site,
      project: next.project,
      filter: null,
      tab: null,
      cursor: null,
    },
  };
}

export function ScopeProvider(props: { readonly initialState: ScopeState; readonly children: ReactNode }): JSX.Element {
  const [state, setState] = useState<ScopeState>(props.initialState);
  const value = useMemo<ScopeContextValue>(
    () => ({ state, setScope: (next) => setState((current) => switchScope(current, next)) }),
    [state],
  );

  return <ScopeContext.Provider value={value}>{props.children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
  const value = useContext(ScopeContext);
  if (value === null) throw new Error("ScopeProvider is required");
  return value;
}

function scopeUrlState(scope: ScopeSelection): ScopeUrlState {
  return {
    workspace: scope.workspace,
    site: scope.site,
    project: scope.project,
    filter: null,
    tab: null,
    cursor: null,
  };
}
