import { Ellipsis, GitPullRequestArrow, Inbox, ListChecks, Target } from "lucide-react";
import type { JSX } from "react";

import type { ShellRouteKey } from "./Sidebar.js";

export type MobileRouteKey = "inbox" | "runs" | "goals" | "review" | "memory";

export type MobileNavItem = {
  readonly key: MobileRouteKey;
  readonly label: string;
  readonly href: string;
  readonly count: number | null;
};

const mobileIcons = {
  goals: Target,
  inbox: Inbox,
  memory: Ellipsis,
  review: GitPullRequestArrow,
  runs: ListChecks,
} as const;

export function MobileNav(props: { readonly currentRoute: ShellRouteKey; readonly items: readonly MobileNavItem[] }): JSX.Element {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {props.items.map((item) => {
        const Icon = mobileIcons[item.key];
        return (
          <a href={item.href} aria-current={item.key === props.currentRoute ? "page" : undefined} key={item.key}>
            <Icon aria-hidden="true" size={18} />
            <span>{item.label}</span>
            {item.count === null ? null : <span className="mono" aria-label={`${item.count} open items`}>{item.count}</span>}
          </a>
        );
      })}
    </nav>
  );
}
