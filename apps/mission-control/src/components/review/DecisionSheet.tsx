import { useState } from "react";
import type { ChangeEvent, JSX } from "react";

export type ReviewDecisionRecord = {
  readonly id: string;
  readonly risk: "R1" | "R2" | "R3";
  readonly scope: string;
  readonly reversibility: string;
  readonly payloadHash: string;
  readonly expiresAt: string;
  readonly canApprove: boolean;
  readonly staleReason: string | null;
};

export function DecisionSheet(props: { readonly review: ReviewDecisionRecord }): JSX.Element {
  const [reason, setReason] = useState("");
  const [hash, setHash] = useState("");
  const [decision, setDecision] = useState<string | null>(null);
  const reasonReady = reason.trim().length > 0;
  const hashReady = hash === props.review.payloadHash;
  const approveReady = props.review.canApprove && reasonReady && hashReady;
  const canRecordReasonedDecision = reasonReady;
  const updateReason = (event: ChangeEvent<HTMLTextAreaElement>): void => setReason(event.currentTarget.value);
  const updateHash = (event: ChangeEvent<HTMLInputElement>): void => setHash(event.currentTarget.value);
  const recordDecision = (label: "Approve" | "Reject" | "Request changes"): void => {
    setDecision(`Decision recorded: ${label} for ${props.review.id}; no external side effect executed.`);
  };
  return (
    <section className="panel decision-sheet" aria-labelledby="decision-title">
      <div className="panel-header">
        <h2 id="decision-title">Decision Sheet</h2>
        <span className={props.review.canApprove ? "status-badge status-badge--success" : "status-badge status-badge--danger"}>{props.review.canApprove ? "Payload hash current" : "Payload hash stale"}</span>
      </div>
      <dl className="fact-grid">
        <div><dt>Risk</dt><dd>Risk {props.review.risk}</dd></div>
        <div><dt>Scope</dt><dd>Scope {props.review.scope}</dd></div>
        <div><dt>Reversibility</dt><dd>{props.review.reversibility}</dd></div>
        <div><dt>Payload hash</dt><dd>Payload hash {props.review.payloadHash}</dd></div>
        <div><dt>Expiry</dt><dd>Expires {props.review.expiresAt}</dd></div>
      </dl>
      {props.review.staleReason === null ? null : <p className="state-plane__action">{props.review.staleReason}</p>}
      <label className="field-label" htmlFor={`${props.review.id}-reason`}>Reason required</label>
      <textarea id={`${props.review.id}-reason`} aria-label="Decision reason" onChange={updateReason} placeholder="Record approval, rejection, or requested changes." value={reason} />
      <label className="field-label" htmlFor={`${props.review.id}-hash`}>Confirm exact payload hash</label>
      <input id={`${props.review.id}-hash`} aria-label="Confirm exact payload hash" onChange={updateHash} value={hash} />
      <div className="button-row">
        <button className="primary-action" type="button" disabled={!approveReady} onClick={() => recordDecision("Approve")}>Approve</button>
        <button className="row-action" type="button" disabled={!canRecordReasonedDecision} onClick={() => recordDecision("Reject")}>Reject</button>
        <button className="row-action" type="button" disabled={!canRecordReasonedDecision} onClick={() => recordDecision("Request changes")}>Request changes</button>
      </div>
      {decision === null ? null : <p className="state-plane__action" aria-live="polite">{decision}</p>}
    </section>
  );
}
