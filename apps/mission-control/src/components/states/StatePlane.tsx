import { AlertTriangle, CheckCircle2, Clock3, CloudOff, FileSearch, ShieldAlert, Split } from "lucide-react";
import type { JSX } from "react";

import { statusClassForTone, type StatusTone } from "../../design/status.js";

export type StatePlaneKind = "loading" | "empty" | "offline" | "error" | "permission" | "partial";

export type StatePlaneProps = {
  readonly kind: StatePlaneKind;
  readonly title: string;
  readonly impact: string;
  readonly nextAction: string;
  readonly evidenceHref?: string;
};

export function StatePlane(props: StatePlaneProps): JSX.Element {
  const meta = stateMeta(props.kind);
  const alertRole = props.kind === "error" || props.kind === "permission" ? "alert" : undefined;
  return (
    <article className={`state-plane state-plane--${props.kind}`} role={alertRole} aria-labelledby={`${props.kind}-state-title`}>
      <div className="state-plane__title" id={`${props.kind}-state-title`}>
        <meta.Icon aria-hidden="true" size={18} />
        <span>{props.title}</span>
        <span className={statusClassForTone(meta.tone)}>{meta.label}</span>
      </div>
      <p>{props.impact}</p>
      <span className="state-plane__action">{props.nextAction}</span>
      {props.evidenceHref === undefined ? null : <a className="row-action" href={props.evidenceHref}>Open evidence</a>}
    </article>
  );
}

function stateMeta(kind: StatePlaneKind): { readonly Icon: typeof AlertTriangle; readonly label: string; readonly tone: StatusTone } {
  switch (kind) {
    case "empty":
      return { Icon: FileSearch, label: "Empty", tone: "muted" };
    case "error":
      return { Icon: AlertTriangle, label: "Error", tone: "danger" };
    case "loading":
      return { Icon: Clock3, label: "Loading", tone: "info" };
    case "offline":
      return { Icon: CloudOff, label: "Offline", tone: "warning" };
    case "partial":
      return { Icon: Split, label: "Partial", tone: "warning" };
    case "permission":
      return { Icon: ShieldAlert, label: "Permission", tone: "danger" };
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled state kind ${String(value)}`);
}

export function VerifiedState(props: Omit<StatePlaneProps, "kind">): JSX.Element {
  return (
    <article className="state-plane" aria-live="polite">
      <div className="state-plane__title">
        <CheckCircle2 aria-hidden="true" size={18} />
        <span>{props.title}</span>
        <span className={statusClassForTone("success")}>Verified</span>
      </div>
      <p>{props.impact}</p>
      <span className="state-plane__action">{props.nextAction}</span>
    </article>
  );
}
