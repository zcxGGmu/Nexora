import { useSyncExternalStore } from "react";
import type { JSX } from "react";

import { createScopeState, ScopeProvider, type ScopeSelection, type ScopeUrlState } from "./scope-context.js";
import { AppShell } from "../components/layout/AppShell.js";
import type { MobileNavItem } from "../components/layout/MobileNav.js";
import type { ShellNavGroup, ShellRouteKey } from "../components/layout/Sidebar.js";
import { EmptyState } from "../components/states/EmptyState.js";
import { DesignSystemPage } from "../pages/DesignSystemPage.js";
import { InboxPage, inboxFixture } from "../pages/InboxPage.js";
import { MissionControlPage, MissionControlRail, missionControlFixture } from "../pages/MissionControlPage.js";
import { PlaceholderPage } from "../pages/PlaceholderPage.js";

export type RouteDefinition = {
  readonly key: ShellRouteKey;
  readonly path: string;
};

export type ParsedRoute = {
  readonly key: ShellRouteKey;
  readonly path: string;
  readonly params: Readonly<Record<string, string>>;
  readonly urlState: ScopeUrlState;
};

export const routeDefinitions: readonly RouteDefinition[] = [
  { key: "design-system", path: "/design-system" },
  { key: "mission-control", path: "/mission-control" },
  { key: "cowork", path: "/cowork/:conversationId?" },
  { key: "inbox", path: "/inbox" },
  { key: "goals", path: "/goals" },
  { key: "tickets", path: "/tickets" },
  { key: "runs", path: "/runs/:id" },
  { key: "review", path: "/review/:id" },
  { key: "artifacts", path: "/artifacts/:id" },
  { key: "memory", path: "/memory" },
  { key: "settings", path: "/settings" },
] as const;

export function AppRouter(): JSX.Element {
  const route = useCurrentRoute();
  const scopeState = createScopeState(scopeFromUrlState(route.urlState));
  return (
    <ScopeProvider initialState={scopeState}>
      <AppShell
        currentRoute={route.key}
        groups={navigationGroups(route.urlState)}
        mobileItems={mobileNavItems(route.urlState)}
        createHref={buildRouteHref("goals", route.urlState)}
        coworkHref={buildRouteHref("cowork", route.urlState)}
        rail={railForRoute(route)}
      >
        {pageForRoute(route)}
      </AppShell>
    </ScopeProvider>
  );
}

export function parseRouteUrl(input: string): ParsedRoute {
  const url = new URL(input, "http://nexora.local");
  for (const definition of routeDefinitions) {
    const params = matchPath(definition.path, url.pathname);
    if (params !== null) return { key: definition.key, params, path: definition.path, urlState: urlStateFromSearch(url.searchParams) };
  }
  return { key: "mission-control", params: {}, path: "/mission-control", urlState: urlStateFromSearch(url.searchParams) };
}

export function buildRouteHref(key: ShellRouteKey, state: ScopeUrlState, params: Readonly<Record<string, string>> = {}): string {
  const search = new URLSearchParams();
  addSearch(search, "workspace", state.workspace);
  addSearch(search, "site", state.site);
  addSearch(search, "project", state.project);
  addSearch(search, "filter", state.filter);
  addSearch(search, "tab", state.tab);
  addSearch(search, "cursor", state.cursor);
  const query = search.toString();
  const pathname = pathnameForKey(key, params);
  return query.length === 0 ? pathname : `${pathname}?${query}`;
}

function useCurrentRoute(): ParsedRoute {
  const href = useSyncExternalStore(subscribeToLocation, currentHref, serverHref);
  return parseRouteUrl(href);
}

function subscribeToLocation(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function currentHref(): string {
  return window.location.href;
}

function serverHref(): string {
  return "http://nexora.local/mission-control?workspace=ws-demo&site=site-demo&project=project-demo";
}

function pageForRoute(route: ParsedRoute): JSX.Element {
  switch (route.key) {
    case "artifacts":
      return <PlaceholderPage title="Artifact Workspace" scope={route.urlState.workspace ?? "current workspace"} nextStage="C11" />;
    case "cowork":
      return <PlaceholderPage title="Quick Cowork" scope={route.urlState.workspace ?? "current workspace"} nextStage="C10 entry" />;
    case "design-system":
      return <DesignSystemPage />;
    case "goals":
      return <PlaceholderPage title="Goal Portfolio" scope={route.urlState.workspace ?? "current workspace"} nextStage="C11" />;
    case "inbox":
      return <InboxPage view={inboxFixture} />;
    case "memory":
      return <PlaceholderPage title="Memory Explorer" scope={route.urlState.workspace ?? "current workspace"} nextStage="C11" />;
    case "mission-control":
      return <MissionControlPage view={missionControlFixture} />;
    case "review":
      return <PlaceholderPage title="Review Center" scope={route.urlState.workspace ?? "current workspace"} nextStage="C11" />;
    case "runs":
      return <PlaceholderPage title="Run Detail" scope={route.urlState.workspace ?? "current workspace"} nextStage="C11" />;
    case "settings":
      return <PlaceholderPage title="Settings" scope={route.urlState.workspace ?? "current workspace"} nextStage="C10 shell" />;
    case "tickets":
      return <PlaceholderPage title="Tickets" scope={route.urlState.workspace ?? "current workspace"} nextStage="C11" />;
    default:
      return assertNever(route.key);
  }
}

function railForRoute(route: ParsedRoute): JSX.Element {
  if (route.key === "mission-control") return <MissionControlRail health={missionControlFixture.health} />;
  return <EmptyState title="Evidence rail" impact="Select a Run, Review, Artifact, or Memory item to inspect provenance." nextAction="Open Mission Control." />;
}

function navigationGroups(state: ScopeUrlState): readonly ShellNavGroup[] {
  return [
    { label: "Workbench", items: [navItem("mission-control", "Mission Control", state), navItem("inbox", "Inbox", state), navItem("review", "Review", state, { id: "rev-r3" })] },
    { label: "Work", items: [navItem("cowork", "Cowork", state), navItem("goals", "Goals", state), navItem("tickets", "Tickets", state), navItem("runs", "Runs", state, { id: "run-active" }), navItem("artifacts", "Artifacts", state, { id: "artifact-summary" }), navItem("memory", "Memory", state)] },
    { label: "System", items: [navItem("design-system", "Design System", state), navItem("settings", "Settings", state)] },
  ];
}

function mobileNavItems(state: ScopeUrlState): readonly MobileNavItem[] {
  return [
    { key: "inbox", label: "Inbox", href: buildRouteHref("inbox", state), count: 2 },
    { key: "runs", label: "Runs", href: buildRouteHref("runs", state, { id: "run-active" }), count: 1 },
    { key: "goals", label: "Goals", href: buildRouteHref("goals", state), count: 2 },
    { key: "review", label: "Review", href: buildRouteHref("review", state, { id: "rev-r3" }), count: 3 },
    { key: "memory", label: "More", href: buildRouteHref("memory", state), count: null },
  ];
}

function navItem(key: ShellRouteKey, label: string, state: ScopeUrlState, params: Readonly<Record<string, string>> = {}): { readonly key: ShellRouteKey; readonly label: string; readonly href: string } {
  return { key, label, href: buildRouteHref(key, state, params) };
}

function pathnameForKey(key: ShellRouteKey, params: Readonly<Record<string, string>>): string {
  switch (key) {
    case "artifacts":
      return `/artifacts/${encodeURIComponent(params["id"] ?? "artifact-summary")}`;
    case "cowork":
      return params["conversationId"] === undefined ? "/cowork" : `/cowork/${encodeURIComponent(params["conversationId"])}`;
    case "design-system":
      return "/design-system";
    case "goals":
      return "/goals";
    case "inbox":
      return "/inbox";
    case "memory":
      return "/memory";
    case "mission-control":
      return "/mission-control";
    case "review":
      return `/review/${encodeURIComponent(params["id"] ?? "rev-r3")}`;
    case "runs":
      return `/runs/${encodeURIComponent(params["id"] ?? "run-active")}`;
    case "settings":
      return "/settings";
    case "tickets":
      return "/tickets";
    default:
      return assertNever(key);
  }
}

function matchPath(pattern: string, pathname: string): Readonly<Record<string, string>> | null {
  const patternSegments = segments(pattern);
  const pathSegments = segments(pathname);
  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const segment = patternSegments[index];
    const pathSegment = pathSegments[index];
    if (segment === undefined) return null;
    if (segment.endsWith("?")) {
      const key = segment.slice(1, -1);
      if (pathSegment !== undefined) params[key] = pathSegment;
      continue;
    }
    if (segment.startsWith(":")) {
      if (pathSegment === undefined) return null;
      params[segment.slice(1)] = pathSegment;
      continue;
    }
    if (segment !== pathSegment) return null;
  }
  return pathSegments.length > patternSegments.length ? null : params;
}

function segments(pathname: string): readonly string[] {
  return pathname.split("/").filter((segment) => segment.length > 0);
}

function urlStateFromSearch(search: URLSearchParams): ScopeUrlState {
  return {
    cursor: search.get("cursor"),
    filter: search.get("filter"),
    project: search.get("project"),
    site: search.get("site"),
    tab: search.get("tab"),
    workspace: search.get("workspace"),
  };
}

function addSearch(search: URLSearchParams, key: string, value: string | null): void {
  if (value !== null && value.length > 0) search.set(key, value);
}

function scopeFromUrlState(state: ScopeUrlState): ScopeSelection {
  return {
    accessMode: "read_write",
    policyVersion: "policy-v1",
    project: state.project ?? "project-demo",
    site: state.site ?? "site-demo",
    workspace: state.workspace ?? "ws-demo",
    workspaceLabel: state.workspace ?? "Demo Workspace",
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled route ${String(value)}`);
}
