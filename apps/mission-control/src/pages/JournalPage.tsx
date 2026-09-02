import { BookOpen, CircleAlert, CircleCheck, CircleDashed, GitPullRequestArrow, Network, ShieldCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ChangeEvent, JSX } from "react";

import {
  buildJournalControlView,
  fetchJournalProjection,
  requestJournalWriteback,
  resolveJournalWorkspace,
  sendWritebackDecision,
  shouldUseJournalFallback,
  type JournalControlView,
  type JournalWritebackInput,
} from "../app/journal-api.js";

export type { JournalControlView } from "../app/journal-api.js";
export type WritebackUiDecision = "approve" | "reject";

export type JournalWritebackUiInput = Pick<JournalWritebackInput, "target_ref" | "diff_hash" | "reason" | "expected_target_revision">;

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const REQUEST_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const DIFF_HASH = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

const EMPTY_WRITEBACK_INPUT: JournalWritebackUiInput = {
  target_ref: "",
  diff_hash: "",
  reason: "",
  expected_target_revision: 1,
};

export const journalControlFixture: JournalControlView = {
  workspaceId: WORKSPACE_ID,
  vaults: [{ id: "vault-obsidian-demo", name: "Obsidian Demo Vault", kind: "obsidian", accessMode: "read_only", syncStatus: "indexed", sourceKinds: ["manual", "omi", "obsidian"], descriptorOnly: true }],
  selected: {
    id: "vault-obsidian-demo",
    name: "Obsidian Demo Vault",
    kind: "obsidian",
    accessMode: "read_only",
    syncStatus: "indexed",
    sourceKinds: ["manual", "omi", "obsidian"],
    descriptorOnly: true,
    latestEntryTitle: "Daily operating journal",
    latestEntryDate: "2026-09-02",
    sourceCount: 1,
    graphStatus: "graph_fts",
    nodeCount: 42,
    documentCount: 8,
    memoryCandidates: 1,
    pendingWritebacks: 1,
    approvedWritebacks: 0,
    candidateId: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
    targetRef: "workspace://vaults/demo/Journal/2026-09-02.md",
    diffHash: DIFF_HASH,
    expectedTargetRevision: 3,
  },
  writebackRequests: [{ id: REQUEST_ID, candidateId: "01ERZ3NDEKTSV4RRFFQ69G5FAV", targetRef: "workspace://vaults/demo/Journal/2026-09-02.md", diffHash: DIFF_HASH, reason: "Stage reviewed diff", status: "pending_review", revision: 1 }],
};

const JOURNAL_UNAVAILABLE_FEEDBACK = "Journal control data unavailable; showing local planning fixture. No external connection was attempted.";

export function JournalPage(props: { readonly workspaceId?: string; readonly view?: JournalControlView }): JSX.Element {
  if (props.view !== undefined) return <JournalPageContent view={props.view} />;
  return <LiveJournalPage workspaceId={props.workspaceId ?? "ws-demo"} />;
}

function LiveJournalPage(props: { readonly workspaceId: string }): JSX.Element {
  const workspaceResolution = resolveJournalWorkspace(props.workspaceId);
  const apiWorkspaceId = workspaceResolution.kind === "resolved" ? workspaceResolution.workspace_id : null;
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [writebackInput, setWritebackInput] = useState<JournalWritebackUiInput>(EMPTY_WRITEBACK_INPUT);
  const query = useQuery({
    queryKey: ["journal-control", apiWorkspaceId],
    queryFn: () => {
      if (apiWorkspaceId === null) throw new Error("Journal workspace scope is invalid");
      return fetchJournalProjection(apiWorkspaceId);
    },
    enabled: apiWorkspaceId !== null,
  });
  const requestWriteback = useMutation({
    mutationFn: async (input: { readonly view: JournalControlView; readonly writebackInput: JournalWritebackUiInput }) => {
      if (apiWorkspaceId === null) throw new Error("Journal workspace scope is invalid");
      await requestJournalWriteback({ workspace_id: apiWorkspaceId, vault_id: input.view.selected.id, candidate_id: input.view.selected.candidateId, ...effectiveInput(input.view, input.writebackInput) }, `journal:writeback:${input.view.selected.candidateId}:${crypto.randomUUID()}`);
    },
    onSuccess: async () => {
      setFeedback("Writeback request accepted; rereading Journal projection.");
      await queryClient.invalidateQueries({ queryKey: ["journal-control", apiWorkspaceId] });
    },
    onError: () => setFeedback("Writeback request was not accepted. Refresh scope and check descriptor refs."),
  });
  const decision = useMutation({
    mutationFn: async (input: { readonly requestId: string; readonly decision: WritebackUiDecision; readonly revision: number }) => {
      if (apiWorkspaceId === null) throw new Error("Journal workspace scope is invalid");
      await sendWritebackDecision({ workspace_id: apiWorkspaceId, request_id: input.requestId, decision: input.decision, reason: `${input.decision} reviewed descriptor diff.`, expected_revision: input.revision }, `journal:${input.decision}:${input.requestId}:${crypto.randomUUID()}`);
    },
    onSuccess: async (_data, input) => {
      setFeedback(`${input.decision} accepted; rereading writeback facts.`);
      await queryClient.invalidateQueries({ queryKey: ["journal-control", apiWorkspaceId] });
    },
    onError: () => setFeedback("Writeback decision was not accepted. Refresh request revision and retry."),
  });

  if (apiWorkspaceId === null) return <JournalState title="Invalid Journal workspace scope" message="Journal control data requires a canonical workspace ULID or explicit local demo alias. No API request or external connection was attempted." alert />;
  if (query.isPending) return <JournalState title="Loading Journal control data" message="Reading workspace-scoped vault bridges, daily journal facts, graph index snapshots, memory candidates, and writeback requests." />;
  if (query.isError) {
    if (shouldUseJournalFallback(query.error)) return <JournalPageContent view={journalControlFixture} feedback={JOURNAL_UNAVAILABLE_FEEDBACK} onRetry={() => void query.refetch()} />;
    return <JournalState title="Journal control data denied" message="The control API rejected this workspace-scoped Journal projection. Local fixtures are not shown for authorization, scope, or revision errors." alert onRetry={() => void query.refetch()} />;
  }
  const view = buildJournalControlView(query.data, apiWorkspaceId);
  return <JournalPageContent view={view} commandPending={requestWriteback.isPending || decision.isPending} feedback={feedback} writebackInput={writebackInput} onWritebackInputChange={setWritebackInput} onRequestWriteback={(input) => requestWriteback.mutate({ view, writebackInput: input })} onWritebackDecision={(requestId, nextDecision) => { const request = view.writebackRequests.find((candidate) => candidate.id === requestId); if (request !== undefined) decision.mutate({ requestId, decision: nextDecision, revision: request.revision }); }} />;
}

export function JournalPageContent(props: {
  readonly view: JournalControlView;
  readonly commandPending?: boolean;
  readonly feedback?: string | null;
  readonly writebackInput?: JournalWritebackUiInput;
  readonly onWritebackInputChange?: (input: JournalWritebackUiInput) => void;
  readonly onRequestWriteback?: (input: JournalWritebackUiInput, candidateId: string) => void;
  readonly onWritebackDecision?: (requestId: string, decision: WritebackUiDecision) => void;
  readonly onRetry?: () => void;
}): JSX.Element {
  const input = effectiveInput(props.view, props.writebackInput ?? EMPTY_WRITEBACK_INPUT);
  const selectedRequest = props.view.writebackRequests.find((request) => request.status === "pending_review") ?? props.view.writebackRequests[0];
  const requestReady = input.target_ref.trim().length > 0 && input.diff_hash.trim().length > 0 && input.reason.trim().length > 0 && input.expected_target_revision > 0 && props.view.selected.candidateId !== "missing-candidate";
  const updateTarget = (event: ChangeEvent<HTMLInputElement>): void => props.onWritebackInputChange?.({ ...input, target_ref: event.currentTarget.value });
  const updateHash = (event: ChangeEvent<HTMLInputElement>): void => props.onWritebackInputChange?.({ ...input, diff_hash: event.currentTarget.value });
  const updateReason = (event: ChangeEvent<HTMLTextAreaElement>): void => props.onWritebackInputChange?.({ ...input, reason: event.currentTarget.value });
  const updateRevision = (event: ChangeEvent<HTMLInputElement>): void => props.onWritebackInputChange?.({ ...input, expected_target_revision: numberFromInput(event.currentTarget.value) });
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Journal Control</p>
        <h1 id="route-title">Journal &amp; Vault</h1>
        <p>Inspect vault bridge descriptors, daily journal facts, graph indexes, and approval-only writeback requests.</p>
      </header>
      <section className="state-plane state-plane--info" aria-label="Journal boundary">
        <div className="state-plane__title"><BookOpen aria-hidden="true" size={18} /><span>Descriptor-only vault bridge</span><span className="status-badge status-badge--info">No external connection</span></div>
        <p>No real Obsidian, OMI, MCP, or vault writeback is connected. This page records local descriptors, graph/FTS snapshots, memory candidates, and pending approval facts only.</p>
      </section>
      <section className="workspace-grid workspace-grid--wide">
        <section className="panel" aria-labelledby="journal-vaults-title">
          <div className="panel-header"><h2 id="journal-vaults-title">Vault bridges</h2><span className="mono meta">{props.view.vaults.length}</span></div>
          <div className="row-list">{props.view.vaults.length === 0 ? <div className="padded-row meta">No vault bridge descriptors are registered for this workspace.</div> : props.view.vaults.map((vault) => <article className="work-row" key={vault.id}><div><h3>{vault.name}</h3><div className="row-meta mono">{vault.id} | {vault.kind} | {vault.accessMode}</div><p>Sources: {vault.sourceKinds.join(", ")} | descriptor-only {String(vault.descriptorOnly)}</p></div><StatusBadge tone={vault.syncStatus === "indexed" ? "success" : vault.syncStatus === "error" ? "danger" : "warning"} label={vault.syncStatus} /></article>)}</div>
        </section>
        <section className="panel" aria-labelledby="journal-detail-title">
          <div className="panel-header"><h2 id="journal-detail-title">Daily journal</h2><StatusBadge tone={props.view.selected.pendingWritebacks > 0 ? "warning" : "success"} label={`${props.view.selected.pendingWritebacks} pending writeback`} /></div>
          <dl className="fact-grid">
            <div><dt>Vault</dt><dd>{props.view.selected.name} | {props.view.selected.accessMode}</dd></div>
            <div><dt>Entry</dt><dd>{props.view.selected.latestEntryTitle} | {props.view.selected.latestEntryDate}</dd></div>
            <div><dt>Sources</dt><dd>{props.view.selected.sourceCount} captured descriptor refs</dd></div>
            <div><dt>Graph/FTS index</dt><dd>{props.view.selected.graphStatus} | {props.view.selected.nodeCount} nodes | {props.view.selected.documentCount} docs</dd></div>
            <div><dt>Memory candidates</dt><dd>{props.view.selected.memoryCandidates} candidates | candidate {props.view.selected.candidateId}</dd></div>
            <div><dt>Writeback approval</dt><dd>{props.view.selected.pendingWritebacks} pending | {props.view.selected.approvedWritebacks} approved | no vault write</dd></div>
          </dl>
          <div className="decision-sheet" aria-label="Journal writeback request input">
            <label className="field-label" htmlFor="journal-writeback-target">Writeback target ref</label>
            <input id="journal-writeback-target" aria-label="Writeback target ref" onChange={updateTarget} readOnly={props.onWritebackInputChange === undefined} value={input.target_ref} />
            <label className="field-label" htmlFor="journal-writeback-hash">Writeback diff hash</label>
            <input id="journal-writeback-hash" aria-label="Writeback diff hash" onChange={updateHash} readOnly={props.onWritebackInputChange === undefined} value={input.diff_hash} />
            <label className="field-label" htmlFor="journal-writeback-revision">Expected target revision</label>
            <input id="journal-writeback-revision" aria-label="Expected target revision" inputMode="numeric" onChange={updateRevision} readOnly={props.onWritebackInputChange === undefined} value={String(input.expected_target_revision)} />
            <label className="field-label" htmlFor="journal-writeback-reason">Writeback reason</label>
            <textarea id="journal-writeback-reason" aria-label="Writeback reason" onChange={updateReason} readOnly={props.onWritebackInputChange === undefined} value={input.reason} />
          </div>
          <div className="button-row" aria-label="Journal controls">
            <button className="row-action" data-control-kind="request-writeback" type="button" disabled={props.commandPending === true || props.onRequestWriteback === undefined || !requestReady} onClick={() => props.onRequestWriteback?.(input, props.view.selected.candidateId)}><GitPullRequestArrow aria-hidden="true" size={15} />Request writeback</button>
            <button className="row-action" data-control-kind="approve-writeback" type="button" disabled={props.commandPending === true || props.onWritebackDecision === undefined || selectedRequest === undefined || selectedRequest.status !== "pending_review"} onClick={() => { if (selectedRequest !== undefined) props.onWritebackDecision?.(selectedRequest.id, "approve"); }}><CircleCheck aria-hidden="true" size={15} />Approve</button>
            <button className="row-action" data-control-kind="reject-writeback" type="button" disabled={props.commandPending === true || props.onWritebackDecision === undefined || selectedRequest === undefined || selectedRequest.status !== "pending_review"} onClick={() => { if (selectedRequest !== undefined) props.onWritebackDecision?.(selectedRequest.id, "reject"); }}><CircleAlert aria-hidden="true" size={15} />Reject</button>
          </div>
          {props.feedback === undefined || props.feedback === null ? null : <p className="meta" role="status" aria-live="polite">{props.feedback}</p>}
          {props.onRetry === undefined ? null : <button className="row-action" type="button" onClick={props.onRetry}>Retry Journal API</button>}
        </section>
      </section>
      <section className="workspace-grid">
        <section className="panel" aria-labelledby="journal-graph-title">
          <div className="panel-header"><h2 id="journal-graph-title">Graph/FTS index</h2><Network aria-hidden="true" size={18} /></div>
          <div className="padded-row"><p className="row-meta">{props.view.selected.graphStatus} | {props.view.selected.nodeCount} graph nodes | {props.view.selected.documentCount} searchable documents | append-only snapshot</p></div>
        </section>
        <section className="panel" aria-labelledby="journal-memory-title">
          <div className="panel-header"><h2 id="journal-memory-title">Memory candidates</h2><ShieldCheck aria-hidden="true" size={18} /></div>
          <div className="padded-row"><p className="row-meta">{props.view.selected.memoryCandidates} candidates require review before promotion. Approved writeback remains a descriptor fact until a later explicitly authorized vault connector stage.</p></div>
        </section>
      </section>
      <section className="state-plane state-plane--warning" aria-label="Journal writeback policy">
        <div className="state-plane__title"><CircleAlert aria-hidden="true" size={18} /><span>Writeback requires approval</span></div>
        <p>Approve and reject only append local decision facts and update request state. They do not write files, call Obsidian, sync OMI, or contact MCP providers.</p>
      </section>
    </div>
  );
}

function JournalState(props: { readonly title: string; readonly message: string; readonly alert?: boolean; readonly onRetry?: () => void }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Journal Control</p>
        <h1 id="route-title">Journal &amp; Vault</h1>
      </header>
      <section className="state-plane state-plane--info" role={props.alert ? "alert" : undefined}>
        <div className="state-plane__title"><CircleDashed aria-hidden="true" size={18} /><span>{props.title}</span><span className="status-badge status-badge--info">No external connection</span></div>
        <p>{props.message}</p>
        {props.onRetry === undefined ? null : <button className="row-action" type="button" onClick={props.onRetry}>Retry</button>}
      </section>
    </div>
  );
}

function effectiveInput(view: JournalControlView, input: JournalWritebackUiInput): JournalWritebackUiInput {
  return {
    target_ref: input.target_ref.trim().length === 0 ? view.selected.targetRef : input.target_ref,
    diff_hash: input.diff_hash.trim().length === 0 ? view.selected.diffHash : input.diff_hash,
    reason: input.reason.trim().length === 0 ? "Stage reviewed memory candidate for operator approval." : input.reason,
    expected_target_revision: input.expected_target_revision > 0 ? input.expected_target_revision : view.selected.expectedTargetRevision,
  };
}

function numberFromInput(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function StatusBadge(props: { readonly tone: "success" | "warning" | "danger" | "info"; readonly label: string }): JSX.Element {
  const Icon = props.tone === "success" ? CircleCheck : props.tone === "warning" ? CircleAlert : props.tone === "danger" ? CircleAlert : CircleDashed;
  return <span className={`status-badge status-badge--${props.tone}`}><Icon aria-hidden="true" size={14} />{props.label}</span>;
}
