import type { JSX, ReactNode } from "react";

import { MobileNav, type MobileNavItem } from "./MobileNav.js";
import { Sidebar, type ShellNavGroup, type ShellRouteKey } from "./Sidebar.js";
import { Topbar } from "./Topbar.js";

export function AppShell(props: {
  readonly currentRoute: ShellRouteKey;
  readonly groups: readonly ShellNavGroup[];
  readonly mobileItems: readonly MobileNavItem[];
  readonly createHref: string;
  readonly coworkHref: string;
  readonly rail: ReactNode;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#route-title">Skip to route title</a>
      <Topbar createHref={props.createHref} coworkHref={props.coworkHref} />
      <Sidebar currentRoute={props.currentRoute} groups={props.groups} />
      <main className="main-scroll" id="main-content">
        {props.children}
      </main>
      <aside className="context-rail" aria-label="Evidence and policy context">
        {props.rail}
      </aside>
      <MobileNav currentRoute={props.currentRoute} items={props.mobileItems} />
    </div>
  );
}
