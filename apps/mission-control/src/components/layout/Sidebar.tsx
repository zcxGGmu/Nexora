import { Boxes, FileText, Gauge, GitPullRequestArrow, Inbox, MemoryStick, MessageSquareText, Settings, Target, Ticket } from "lucide-react";
import type { JSX } from "react";

export type ShellRouteKey = "design-system" | "mission-control" | "cowork" | "inbox" | "goals" | "tickets" | "runs" | "review" | "artifacts" | "memory" | "workflows" | "settings";

export type ShellNavItem = {
  readonly key: ShellRouteKey;
  readonly label: string;
  readonly href: string;
};

export type ShellNavGroup = {
  readonly label: string;
  readonly items: readonly ShellNavItem[];
};

const icons = {
  "design-system": Boxes,
  artifacts: FileText,
  cowork: MessageSquareText,
  goals: Target,
  inbox: Inbox,
  memory: MemoryStick,
  "mission-control": Gauge,
  review: GitPullRequestArrow,
  runs: Gauge,
  settings: Settings,
  tickets: Ticket,
  workflows: GitPullRequestArrow,
} as const;

export function Sidebar(props: { readonly currentRoute: ShellRouteKey; readonly groups: readonly ShellNavGroup[] }): JSX.Element {
  return (
    <nav className="sidebar" aria-label="Primary navigation">
      <div className="brand">
        <strong>Nexora</strong>
        <span>Agent OS control plane</span>
      </div>
      {props.groups.map((group) => (
        <section className="nav-group" key={group.label} aria-labelledby={`nav-${group.label}`}>
          <h2 id={`nav-${group.label}`}>{group.label}</h2>
          {group.items.map((item) => {
            const Icon = icons[item.key];
            return (
              <a className="nav-link" href={item.href} aria-current={item.key === props.currentRoute ? "page" : undefined} key={item.key}>
                <Icon aria-hidden="true" size={17} />
                <span className="nav-label">{item.label}</span>
              </a>
            );
          })}
        </section>
      ))}
    </nav>
  );
}
