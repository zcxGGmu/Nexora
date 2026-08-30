import { CircleAlert, CircleCheck, CircleDashed, CircleOff } from "lucide-react";
import type { JSX } from "react";

export type RegistryDescriptorView = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly health: "unknown" | "healthy" | "degraded" | "offline";
  readonly enabled: boolean;
  readonly detail: string;
  readonly capabilities: readonly string[];
  readonly requested?: string;
  readonly actual?: string;
  readonly executionLocation?: "local" | "remote";
  readonly dataClassification?: string;
};

export type RegistryView = {
  readonly runtimes: readonly RegistryDescriptorView[];
  readonly providers: readonly RegistryDescriptorView[];
  readonly models: readonly RegistryDescriptorView[];
  readonly backends: readonly RegistryDescriptorView[];
  readonly tools: readonly RegistryDescriptorView[];
};

export const registryFixture: RegistryView = {
  runtimes: [{ actual: "Hermes 0.20.6 · OpenRouter", capabilities: ["tool_calling", "skills", "cron"], dataClassification: "internal", detail: "local · protocol v1 · 0.20.6", enabled: true, executionLocation: "local", health: "healthy", id: "runtime-hermes-local", kind: "hermes", name: "Hermes local", requested: "Hermes 0.20.5 · Nous Portal" }],
  providers: [{ capabilities: ["model routing", "secret reference"], detail: "OpenRouter · us · credential reference only", enabled: true, health: "healthy", id: "provider-openrouter", kind: "openrouter", name: "OpenRouter" }],
  models: [{ capabilities: ["reasoning", "tool_calling"], detail: "provider-openrouter · 131k context · cost tracked", enabled: true, health: "healthy", id: "model-hermes-llama", kind: "hermes-llama", name: "Hermes Llama" }],
  backends: [{ capabilities: ["subprocess", "filesystem"], detail: "local execution · no egress", enabled: true, health: "healthy", id: "backend-local", kind: "local", name: "Local process" }],
  tools: [{ capabilities: ["memory:read"], detail: "builtin · R0 · no review", enabled: true, health: "healthy", id: "tool-memory-read", kind: "builtin", name: "Memory read" }],
};

export function RegistryPage(props: { readonly view: RegistryView }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Runtime Control</p>
        <h1 id="route-title">Runtime Registry</h1>
        <p>One scoped catalog for runtimes, providers, models, backends, and tools. Descriptors show declared capability; execution requires a separate policy-approved command.</p>
      </header>
      <section className="state-plane state-plane--info" aria-label="Registry boundary">
        <div className="state-plane__title">Descriptor only · no external connection</div>
        <p>Health and capability values are registry facts. This page does not start a runtime, call a model, install MCP, or send data outside the workspace.</p>
      </section>
      <div className="workspace-grid">
        <DescriptorPanel id="runtimes" title="Runtimes" descriptors={props.view.runtimes} />
        <DescriptorPanel id="provider-model" title="Provider / Model" descriptors={[...props.view.providers, ...props.view.models]} />
        <DescriptorPanel id="execution-backends" title="Execution Backends" descriptors={props.view.backends} />
        <DescriptorPanel id="tools-mcp" title="Tools & MCP" descriptors={props.view.tools} />
      </div>
    </div>
  );
}

function DescriptorPanel(props: { readonly id: string; readonly title: string; readonly descriptors: readonly RegistryDescriptorView[] }): JSX.Element {
  return (
    <section className="panel" aria-labelledby={`${props.id}-registry-title`}>
      <div className="panel-header"><h2 id={`${props.id}-registry-title`}>{props.title}</h2><span className="mono meta">{props.descriptors.length}</span></div>
      {props.descriptors.length === 0 ? <p className="padded-row">No descriptors in this scope.</p> : <div className="row-list">{props.descriptors.map((descriptor) => <DescriptorRow descriptor={descriptor} key={descriptor.id} />)}</div>}
    </section>
  );
}

function DescriptorRow(props: { readonly descriptor: RegistryDescriptorView }): JSX.Element {
  const descriptor = props.descriptor;
  const StatusIcon = descriptor.health === "healthy" ? CircleCheck : descriptor.health === "degraded" ? CircleAlert : descriptor.health === "offline" ? CircleOff : CircleDashed;
  return (
    <article className="work-row">
      <div>
        <h3>{descriptor.name}</h3>
        <div className="row-meta"><span className="mono">{descriptor.id}</span> · {descriptor.kind} · {descriptor.detail}</div>
        {(descriptor.requested !== undefined || descriptor.actual !== undefined || descriptor.executionLocation !== undefined || descriptor.dataClassification !== undefined) && (
          <dl className="fact-grid registry-facts">
            {descriptor.requested !== undefined && <div><dt>Requested runtime</dt><dd>{descriptor.requested}</dd></div>}
            {descriptor.actual !== undefined && <div><dt>Actual runtime</dt><dd>{descriptor.actual}</dd></div>}
            {descriptor.executionLocation !== undefined && <div><dt>Execution location</dt><dd>{descriptor.executionLocation}</dd></div>}
            {descriptor.dataClassification !== undefined && <div><dt>Data classification</dt><dd>{descriptor.dataClassification}</dd></div>}
          </dl>
        )}
        <p>{descriptor.capabilities.join(" · ")}</p>
      </div>
      <span aria-label={`${descriptor.enabled ? descriptor.health : "disabled"} declared registry state`} className={`status-badge status-badge--${descriptor.health === "healthy" ? "success" : descriptor.health === "degraded" ? "warning" : descriptor.health === "offline" ? "danger" : "muted"}`}><StatusIcon aria-hidden="true" size={14} />{descriptor.enabled ? descriptor.health : "disabled"} · declared</span>
    </article>
  );
}
