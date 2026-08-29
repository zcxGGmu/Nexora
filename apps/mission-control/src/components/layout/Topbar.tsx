import { Command, Plus, Search, Wifi } from "lucide-react";
import type { JSX } from "react";

import { useScope } from "../../app/scope-context.js";

export function Topbar(props: { readonly createHref: string; readonly coworkHref: string }): JSX.Element {
  const scope = useScope();
  return (
    <header className="topbar">
      <a className="scope-button" href={props.createHref} aria-label={`Current scope ${scope.state.current.workspaceLabel}`}>
        <span className="scope-label">{scope.state.current.workspaceLabel}</span>
        <span className="meta scope-access-label">{scope.state.current.accessMode}</span>
      </a>
      <label className="meta topbar-search-label" htmlFor="global-search">Search</label>
      <span className="search-control" role="search">
        <Search aria-hidden="true" size={16} />
        <input id="global-search" aria-label="Search goals runs artifacts and memory" placeholder="Search evidence" />
      </span>
      <div className="topbar-spacer" />
      <a className="row-action" href={props.coworkHref}>
        <Command aria-hidden="true" size={16} />
        Start
      </a>
      <a className="primary-action" href={props.createHref}>
        <Plus aria-hidden="true" size={16} />
        <span className="topbar-create-label">Create</span>
      </a>
      <span className="status-badge status-badge--success" role="status" aria-label="Connection status Connected">
        <Wifi aria-hidden="true" size={14} />
        <span className="topbar-status-label">Connected</span>
      </span>
    </header>
  );
}
