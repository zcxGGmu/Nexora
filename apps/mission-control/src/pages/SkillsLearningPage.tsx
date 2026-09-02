import { BrainCircuit, CircleAlert, CircleCheck, CircleDashed, RotateCcw, ShieldCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ChangeEvent, JSX } from "react";

import {
  createLearningCandidate,
  fetchSkillsLearningProjection,
  resolveSkillsLearningWorkspace,
  sendSkillLifecycleControl,
  shouldUseSkillsLearningFallback,
  type SkillDetail,
  type SkillLifecycleAction,
  type SkillsLearningProjection,
} from "../app/skills-learning-api.js";

export type SkillsLearningView = {
  readonly workspaceId: string;
  readonly skills: readonly SkillSummary[];
  readonly selected: SkillSummary;
  readonly learning: {
    readonly pending: number;
    readonly applied: number;
    readonly command: string;
  };
};

type SkillSummary = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly versionId: string;
  readonly semver: string;
  readonly rollbackTargetVersionId: string | null;
  readonly rollbackTargetSemver: string | null;
  readonly approvedVersions: readonly SkillApprovedVersion[];
  readonly sourceHash: string;
  readonly snapshotHash: string;
  readonly scanStatus: string;
  readonly reviewDecision: string;
  readonly installationStatus: string;
  readonly invocationStatus: string;
  readonly revision: number;
  readonly installationRevision: number | null;
  readonly runId: string | null;
  readonly goalLoopId: string | null;
  readonly sourceEventId: string | null;
};

type SkillApprovedVersion = {
  readonly id: string;
  readonly semver: string;
  readonly snapshotHash: string;
};

type SkillsLearningUiCommand = SkillLifecycleAction;

export type SkillsLearningLearnInput = {
  readonly lesson: string;
  readonly proposed_diff_summary: string;
  readonly evidence_refs: readonly string[];
};

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const LOOP_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const VERSION_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_EVENT_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EMPTY_LEARN_INPUT: SkillsLearningLearnInput = {
  lesson: "",
  proposed_diff_summary: "",
  evidence_refs: [],
};

export const skillsLearningFixture: SkillsLearningView = {
  workspaceId: WORKSPACE_ID,
  skills: [
    {
      id: "skill-visual-qa",
      name: "Visual QA",
      status: "active",
      versionId: VERSION_ID,
      semver: "1.0.0",
      rollbackTargetVersionId: null,
      rollbackTargetSemver: null,
      approvedVersions: [{ id: VERSION_ID, semver: "1.0.0", snapshotHash: HASH }],
      sourceHash: HASH,
      snapshotHash: HASH,
      scanStatus: "passed",
      reviewDecision: "approve",
      installationStatus: "installed",
      invocationStatus: "allowed",
      revision: 1,
      installationRevision: 1,
      runId: RUN_ID,
      goalLoopId: LOOP_ID,
      sourceEventId: SOURCE_EVENT_ID,
    },
  ],
  selected: {
    id: "skill-visual-qa",
    name: "Visual QA",
    status: "active",
    versionId: VERSION_ID,
    semver: "1.0.0",
    rollbackTargetVersionId: null,
    rollbackTargetSemver: null,
    approvedVersions: [{ id: VERSION_ID, semver: "1.0.0", snapshotHash: HASH }],
    sourceHash: HASH,
    snapshotHash: HASH,
    scanStatus: "passed",
    reviewDecision: "approve",
    installationStatus: "installed",
    invocationStatus: "allowed",
    revision: 1,
    installationRevision: 1,
    runId: RUN_ID,
    goalLoopId: LOOP_ID,
    sourceEventId: SOURCE_EVENT_ID,
  },
  learning: { pending: 1, applied: 0, command: "/learn" },
};

const LEARNING_UNAVAILABLE_FEEDBACK = "Skills/Learning control data unavailable; showing local planning fixture. No external connection was attempted.";

export function SkillsLearningPage(props: { readonly workspaceId?: string; readonly view?: SkillsLearningView }): JSX.Element {
  if (props.view !== undefined) return <SkillsLearningPageContent view={props.view} />;
  return <LiveSkillsLearningPage workspaceId={props.workspaceId ?? "ws-demo"} />;
}

function LiveSkillsLearningPage(props: { readonly workspaceId: string }): JSX.Element {
  const workspaceResolution = resolveSkillsLearningWorkspace(props.workspaceId);
  const apiWorkspaceId = workspaceResolution.kind === "resolved" ? workspaceResolution.workspace_id : null;
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [learnInput, setLearnInput] = useState<SkillsLearningLearnInput>(EMPTY_LEARN_INPUT);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [rollbackTargetBySkill, setRollbackTargetBySkill] = useState<Readonly<Record<string, string>>>({});
  const query = useQuery({
    queryKey: ["skills-learning", apiWorkspaceId],
    queryFn: () => {
      if (apiWorkspaceId === null) throw new Error("Skills/Learning workspace scope is invalid");
      return fetchSkillsLearningProjection(apiWorkspaceId);
    },
    enabled: apiWorkspaceId !== null,
  });
  const lifecycle = useMutation({
    mutationFn: async (input: { readonly action: SkillsLearningUiCommand; readonly skill: SkillSummary; readonly rollbackToVersionId?: string }) => {
      if (apiWorkspaceId === null) throw new Error("Skills/Learning workspace scope is invalid");
      const installationRevision = installationRevisionForAction(input.action, input.skill);
      await sendSkillLifecycleControl({
        workspace_id: apiWorkspaceId,
        skill_id: input.skill.id,
        action: input.action,
        version_id: input.skill.versionId,
        ...(input.action === "rollback" ? { rollback_to_version_id: input.rollbackToVersionId } : {}),
        reason: reasonForAction(input.action),
        expected_revision: input.skill.revision,
        ...(installationRevision === undefined ? {} : { installation_revision: installationRevision }),
      }, `skill:${input.action}:${input.skill.id}:${crypto.randomUUID()}`);
    },
    onSuccess: async (_data, input) => {
      setFeedback(`${input.action} accepted; rereading Skills/Learning projection.`);
      await queryClient.invalidateQueries({ queryKey: ["skills-learning", apiWorkspaceId] });
    },
    onError: () => {
      setFeedback("Skills/Learning command was not accepted. Refresh the projection and check the current revision.");
    },
  });
  const learn = useMutation({
    mutationFn: async (input: { readonly skill: SkillSummary; readonly learnInput: SkillsLearningLearnInput }) => {
      if (apiWorkspaceId === null) throw new Error("Skills/Learning workspace scope is invalid");
      const skill = input.skill;
      if (skill.runId === null || skill.goalLoopId === null || skill.sourceEventId === null) throw new Error("Learning candidate requires run goal loop and source event scope facts");
      await createLearningCandidate({
        workspace_id: apiWorkspaceId,
        run_id: skill.runId,
        goal_loop_id: skill.goalLoopId,
        source_event_id: skill.sourceEventId,
        proposed_skill_id: skill.id,
        lesson: input.learnInput.lesson.trim(),
        proposed_diff_summary: input.learnInput.proposed_diff_summary.trim(),
        evidence_refs: input.learnInput.evidence_refs.map((reference) => reference.trim()).filter((reference) => reference.length > 0),
      }, `learn:${skill.id}:${crypto.randomUUID()}`);
    },
    onSuccess: async () => {
      setFeedback("/learn accepted; rereading Skills/Learning projection.");
      await queryClient.invalidateQueries({ queryKey: ["skills-learning", apiWorkspaceId] });
    },
    onError: () => {
      setFeedback("/learn candidate was not accepted. Refresh scope and retry with reviewed evidence.");
    },
  });

  if (apiWorkspaceId === null) return <SkillsLearningState title="Invalid Skills/Learning workspace scope" message="Skills/Learning control data requires a canonical workspace ULID or the explicit local demo alias. No API request or external connection was attempted." alert />;
  if (query.isPending) return <SkillsLearningState title="Loading Skills/Learning control data" message="Reading workspace-scoped skill descriptors, approved snapshots, scans, reviews, installations, and invocation facts." />;
  if (query.isError) {
    if (shouldUseSkillsLearningFallback(query.error)) return <SkillsLearningUnavailableFallback onRetry={() => void query.refetch()} />;
    return <SkillsLearningState title="Skills/Learning control data denied" message="The control API rejected this workspace-scoped Skills/Learning projection. Local fixtures are not shown for authorization, scope, or revision errors." alert onRetry={() => void query.refetch()} />;
  }
  const view = buildSkillsLearningView(query.data, apiWorkspaceId);
  const selected = selectedSkill(view, selectedSkillId);
  const selectedRollbackTargetId = rollbackTargetBySkill[selected.id] ?? defaultRollbackTargetId(selected) ?? undefined;
  return <SkillsLearningPageContent view={view} selectedSkillId={selected.id} {...(selectedRollbackTargetId === undefined ? {} : { selectedRollbackTargetId })} commandPending={lifecycle.isPending || learn.isPending} feedback={feedback} learnInput={learnInput} onLearnInputChange={setLearnInput} onSelectedSkillChange={setSelectedSkillId} onRollbackTargetChange={(skillId, versionId) => setRollbackTargetBySkill((current) => ({ ...current, [skillId]: versionId }))} onLifecycleCommand={(kind, skillId, rollbackToVersionId) => { const skill = view.skills.find((candidate) => candidate.id === skillId); if (skill !== undefined) lifecycle.mutate({ action: kind, skill, ...(rollbackToVersionId === undefined ? {} : { rollbackToVersionId }) }); }} onLearnCommand={(input, skillId) => { const skill = view.skills.find((candidate) => candidate.id === skillId); if (skill !== undefined) learn.mutate({ skill, learnInput: input }); }} />;
}

export function SkillsLearningUnavailableFallback(props: { readonly onRetry?: () => void }): JSX.Element {
  if (props.onRetry === undefined) return <SkillsLearningPageContent view={skillsLearningFixture} feedback={LEARNING_UNAVAILABLE_FEEDBACK} />;
  return <SkillsLearningPageContent view={skillsLearningFixture} feedback={LEARNING_UNAVAILABLE_FEEDBACK} onRetry={props.onRetry} />;
}

export function SkillsLearningPageContent(props: {
  readonly view: SkillsLearningView;
  readonly selectedSkillId?: string;
  readonly selectedRollbackTargetId?: string;
  readonly commandPending?: boolean;
  readonly feedback?: string | null;
  readonly learnInput?: SkillsLearningLearnInput;
  readonly onLearnInputChange?: (input: SkillsLearningLearnInput) => void;
  readonly onSelectedSkillChange?: (skillId: string) => void;
  readonly onRollbackTargetChange?: (skillId: string, versionId: string) => void;
  readonly onLifecycleCommand?: (kind: SkillsLearningUiCommand, skillId: string, rollbackToVersionId?: string) => void;
  readonly onLearnCommand?: (input: SkillsLearningLearnInput, skillId: string) => void;
  readonly onRetry?: () => void;
}): JSX.Element {
  const selected = selectedSkill(props.view, props.selectedSkillId);
  const rollbackTargetId = props.selectedRollbackTargetId ?? defaultRollbackTargetId(selected);
  const rollbackTarget = rollbackTargetId === null ? undefined : selected.approvedVersions.find((version) => version.id === rollbackTargetId);
  const rollbackTargetLabel = rollbackTarget === undefined ? "missing rollback target" : `${rollbackTarget.semver} | ${rollbackTarget.id}`;
  const learnInput = props.learnInput ?? EMPTY_LEARN_INPUT;
  const learnReady = learnInput.lesson.trim().length > 0 && learnInput.proposed_diff_summary.trim().length > 0 && learnInput.evidence_refs.some((reference) => reference.trim().length > 0);
  const updateLesson = (event: ChangeEvent<HTMLTextAreaElement>): void => props.onLearnInputChange?.({ ...learnInput, lesson: event.currentTarget.value });
  const updateDiffSummary = (event: ChangeEvent<HTMLTextAreaElement>): void => props.onLearnInputChange?.({ ...learnInput, proposed_diff_summary: event.currentTarget.value });
  const updateEvidenceRefs = (event: ChangeEvent<HTMLTextAreaElement>): void => props.onLearnInputChange?.({ ...learnInput, evidence_refs: parseEvidenceRefs(event.currentTarget.value) });
  const updateRollbackTarget = (event: ChangeEvent<HTMLSelectElement>): void => props.onRollbackTargetChange?.(selected.id, event.currentTarget.value);
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Skills Control</p>
        <h1 id="route-title">Skills &amp; Learning</h1>
        <p>Review approved snapshots, quarantine risk, and capture corrections without executing external skills.</p>
      </header>
      <section className="state-plane state-plane--info" aria-label="Skills learning boundary">
        <div className="state-plane__title"><BrainCircuit aria-hidden="true" size={18} /><span>Descriptor-only learning</span><span className="status-badge status-badge--info">No external connection</span></div>
        <p>No real MCP execution. No URL/PDF/credential reads. This page records local descriptors, reviews, command receipts, and approved snapshot references only.</p>
      </section>
      <section className="workspace-grid workspace-grid--wide">
        <section className="panel" aria-labelledby="skills-list-title">
          <div className="panel-header"><h2 id="skills-list-title">Skills</h2><span className="mono meta">{props.view.skills.length}</span></div>
          <div className="row-list">{props.view.skills.length === 0 ? <div className="padded-row meta">No skill descriptors are registered for this workspace.</div> : props.view.skills.map((skill) => <button aria-pressed={skill.id === selected.id} className="work-row" data-skill-id={skill.id} key={skill.id} onClick={() => props.onSelectedSkillChange?.(skill.id)} type="button"><div><h3>{skill.name}</h3><div className="row-meta mono">{skill.id} | {skill.semver}</div><p>Approved snapshot {shortHash(skill.snapshotHash)} | Scan {skill.scanStatus} | Review {skill.reviewDecision}</p></div><StatusBadge tone={toneForStatus(skill.status)} label={skill.status} /></button>)}</div>
        </section>
        <section className="panel" aria-labelledby="skill-detail-title">
          <div className="panel-header"><h2 id="skill-detail-title">Approved snapshot</h2><StatusBadge tone={toneForStatus(selected.installationStatus)} label={selected.installationStatus} /></div>
          <dl className="fact-grid">
            <div><dt>Skill</dt><dd>{selected.name} | revision {selected.revision}</dd></div>
            <div><dt>Version</dt><dd>{selected.semver} | {selected.rollbackTargetVersionId ?? selected.versionId}</dd></div>
            <div aria-label={`Rollback target ${rollbackTargetLabel}`}><dt>Rollback target</dt><dd>{rollbackTargetLabel}</dd></div>
            <div><dt>Source hash</dt><dd>{selected.sourceHash}</dd></div>
            <div><dt>Approved snapshot</dt><dd>{selected.snapshotHash}</dd></div>
            <div><dt>Scan</dt><dd>Scan {selected.scanStatus}</dd></div>
            <div><dt>Review</dt><dd>Review {selected.reviewDecision}</dd></div>
            <div><dt>Install</dt><dd>Install {selected.installationStatus} | revision {selected.installationRevision ?? "n/a"}</dd></div>
            <div><dt>Invocation</dt><dd>{selected.invocationStatus}</dd></div>
            <div><dt>Source event</dt><dd>{selected.sourceEventId ?? "missing source event"}</dd></div>
            <div><dt>Learning queue</dt><dd>{props.view.learning.pending} pending | {props.view.learning.applied} applied | {props.view.learning.command}</dd></div>
          </dl>
          <label className="field-label" htmlFor="skills-learning-rollback-target">Rollback approved snapshot target</label>
          <select id="skills-learning-rollback-target" aria-label="Rollback target" disabled={props.commandPending === true || props.onRollbackTargetChange === undefined || selected.approvedVersions.length === 0} onChange={updateRollbackTarget} value={rollbackTargetId ?? ""}>
            {selected.approvedVersions.length === 0 ? <option value="">No approved snapshots</option> : selected.approvedVersions.map((version) => <option key={version.id} value={version.id}>{version.semver} | {shortHash(version.snapshotHash)}</option>)}
          </select>
          <div className="decision-sheet" aria-label="/learn candidate input">
            <label className="field-label" htmlFor="skills-learning-lesson">Learning lesson</label>
            <textarea id="skills-learning-lesson" aria-label="Learning lesson" onChange={updateLesson} placeholder="Record the reusable correction or workflow rule." readOnly={props.onLearnInputChange === undefined} value={learnInput.lesson} />
            <label className="field-label" htmlFor="skills-learning-diff-summary">Learning diff summary</label>
            <textarea id="skills-learning-diff-summary" aria-label="Learning diff summary" onChange={updateDiffSummary} placeholder="Summarize the proposed skill descriptor update." readOnly={props.onLearnInputChange === undefined} value={learnInput.proposed_diff_summary} />
            <label className="field-label" htmlFor="skills-learning-evidence-refs">Learning evidence refs</label>
            <textarea id="skills-learning-evidence-refs" aria-label="Learning evidence refs" onChange={updateEvidenceRefs} placeholder="artifact://progress/c21/verification.log" readOnly={props.onLearnInputChange === undefined} value={learnInput.evidence_refs.join("\n")} />
          </div>
          <div className="button-row" aria-label="Skills/Learning controls">
            <button className="row-action" data-control-kind="approve" type="button" disabled={props.commandPending === true || props.onLifecycleCommand === undefined} onClick={() => props.onLifecycleCommand?.("approve", selected.id)}><CircleCheck aria-hidden="true" size={15} />Approve</button>
            <button className="row-action" data-control-kind="install" type="button" disabled={props.commandPending === true || props.onLifecycleCommand === undefined} onClick={() => props.onLifecycleCommand?.("install", selected.id)}><ShieldCheck aria-hidden="true" size={15} />Install</button>
            <button className="row-action" data-control-kind="revoke" type="button" disabled={props.commandPending === true || props.onLifecycleCommand === undefined} onClick={() => props.onLifecycleCommand?.("revoke", selected.id)}><CircleAlert aria-hidden="true" size={15} />Revoke</button>
            <button className="row-action" data-control-kind="quarantine" type="button" disabled={props.commandPending === true || props.onLifecycleCommand === undefined} onClick={() => props.onLifecycleCommand?.("quarantine", selected.id)}><CircleAlert aria-hidden="true" size={15} />Quarantine</button>
            <button className="row-action" data-control-kind="rollback" type="button" disabled={props.commandPending === true || props.onLifecycleCommand === undefined || rollbackTargetId === null} onClick={() => props.onLifecycleCommand?.("rollback", selected.id, rollbackTargetId ?? undefined)}><RotateCcw aria-hidden="true" size={15} />Rollback</button>
            <button className="row-action" data-control-kind="learn" type="button" disabled={props.commandPending === true || props.onLearnCommand === undefined || selected.sourceEventId === null || !learnReady} onClick={() => props.onLearnCommand?.(learnInput, selected.id)}>/learn</button>
          </div>
          {props.feedback === undefined || props.feedback === null ? null : <p className="meta" role="status" aria-live="polite">{props.feedback}</p>}
          {props.onRetry === undefined ? null : <button className="row-action" type="button" onClick={props.onRetry}>Retry Skills API</button>}
        </section>
      </section>
      <section className="state-plane state-plane--warning" aria-label="Skills safety policy">
        <div className="state-plane__title"><CircleAlert aria-hidden="true" size={18} /><span>Approved snapshot required</span></div>
        <p>Invocations are allowed only when an installed version matches the approved snapshot hash. Quarantine and rollback are control-plane facts, not external installs.</p>
      </section>
    </div>
  );
}

function parseEvidenceRefs(value: string): readonly string[] {
  return value.split(/[\n,]/).map((reference) => reference.trim()).filter((reference) => reference.length > 0);
}

function SkillsLearningState(props: { readonly title: string; readonly message: string; readonly alert?: boolean; readonly onRetry?: () => void }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Skills Control</p>
        <h1 id="route-title">Skills &amp; Learning</h1>
      </header>
      <section className="state-plane state-plane--info" role={props.alert ? "alert" : undefined}>
        <div className="state-plane__title"><CircleDashed aria-hidden="true" size={18} /><span>{props.title}</span><span className="status-badge status-badge--info">No external connection</span></div>
        <p>{props.message}</p>
        {props.onRetry === undefined ? null : <button className="row-action" type="button" onClick={props.onRetry}>Retry</button>}
      </section>
    </div>
  );
}

export function buildSkillsLearningView(projection: SkillsLearningProjection, workspaceId: string): SkillsLearningView {
  const summaries = projection.details.map(skillSummary);
  const selected = summaries[0] ?? emptySkillSummary(workspaceId);
  const candidates = projection.details.flatMap((detail) => detail.candidates ?? []);
  return {
    workspaceId,
    skills: summaries,
    selected,
    learning: {
      pending: candidates.filter((candidate) => candidate.status === "needs_review").length,
      applied: candidates.filter((candidate) => candidate.status === "applied").length,
      command: "/learn",
    },
  };
}

function skillSummary(detail: SkillDetail): SkillSummary {
  const installation = preferredInstallation(detail.installations);
  const preferredVersionId = installation?.version_id ?? detail.skill.approved_version_id ?? detail.skill.current_version_id ?? null;
  const rollbackTargetVersionId = installation?.status === "rolled_back" ? installation.rollback_to_version_id : null;
  const displayVersionId = rollbackTargetVersionId ?? preferredVersionId;
  const version = versionForDetail(detail, displayVersionId);
  const installedVersion = versionForDetail(detail, preferredVersionId);
  const versionId = installedVersion?.id ?? preferredVersionId ?? displayVersionId;
  const source = sourceForVersion(detail.sources, displayVersionId);
  const scan = scanForVersion(detail.scans, displayVersionId, version?.source_hash ?? null);
  const review = reviewForVersion(detail.reviews, displayVersionId, scan?.id ?? null);
  const invocation = invocationForSelection(detail.invocation_facts, installation, versionId);
  const candidate = detail.candidates[0];
  const learningContext = detail.learning_contexts[0];
  const approvedVersions = approvedVersionsForDetail(detail);
  const rollbackTarget = rollbackTargetVersionId === null ? undefined : approvedVersions.find((candidateVersion) => candidateVersion.id === rollbackTargetVersionId);
  return {
    id: detail.skill.id,
    name: detail.skill.name,
    status: detail.skill.status,
    versionId: versionId ?? "missing-version",
    semver: version?.semver ?? installedVersion?.semver ?? "unversioned",
    rollbackTargetVersionId,
    rollbackTargetSemver: rollbackTarget?.semver ?? null,
    approvedVersions,
    sourceHash: source?.source_hash ?? version?.source_hash ?? "missing-source-hash",
    snapshotHash: version?.snapshot_hash ?? installation?.approved_snapshot_hash ?? "missing-approved-snapshot",
    scanStatus: scan?.status ?? "missing",
    reviewDecision: review?.decision ?? "missing",
    installationStatus: installation?.status ?? "not_installed",
    invocationStatus: invocation?.status ?? "blocked",
    revision: detail.skill.revision,
    installationRevision: installation?.revision ?? null,
    runId: invocation?.run_id ?? candidate?.run_id ?? learningContext?.run_id ?? null,
    goalLoopId: invocation?.goal_loop_id ?? candidate?.goal_loop_id ?? learningContext?.goal_loop_id ?? null,
    sourceEventId: candidate?.source_event_id ?? learningContext?.source_event_id ?? null,
  };
}

function preferredInstallation(installations: readonly SkillDetail["installations"][number][]): SkillDetail["installations"][number] | undefined {
  return installations.find((installation) => installation.status === "installed" || installation.status === "quarantined" || installation.status === "rolled_back") ?? installations[0];
}

function versionForDetail(detail: SkillDetail, preferredVersionId: string | null): SkillDetail["versions"][number] | undefined {
  if (preferredVersionId === null) return detail.versions[0];
  return detail.versions.find((version) => version.id === preferredVersionId);
}

function sourceForVersion(sources: readonly SkillDetail["sources"][number][], versionId: string | null): SkillDetail["sources"][number] | undefined {
  if (versionId === null) return undefined;
  return sources.find((source) => source.version_id === versionId);
}

function scanForVersion(scans: readonly SkillDetail["scans"][number][], versionId: string | null, sourceHash: string | null): SkillDetail["scans"][number] | undefined {
  if (versionId === null) return undefined;
  return scans.find((scan) => scan.version_id === versionId && (sourceHash === null || scan.source_hash === sourceHash)) ?? scans.find((scan) => scan.version_id === versionId);
}

function reviewForVersion(reviews: readonly SkillDetail["reviews"][number][], versionId: string | null, scanId: string | null): SkillDetail["reviews"][number] | undefined {
  if (versionId === null) return undefined;
  return reviews.find((review) => review.version_id === versionId && (scanId === null || review.scan_id === scanId)) ?? reviews.find((review) => review.version_id === versionId);
}

function invocationForSelection(invocations: readonly SkillDetail["invocation_facts"][number][], installation: SkillDetail["installations"][number] | undefined, versionId: string | null): SkillDetail["invocation_facts"][number] | undefined {
  if (installation !== undefined) {
    return invocations.find((invocation) => invocation.installation_id === installation.id && invocation.version_id === installation.version_id);
  }
  if (versionId === null) return undefined;
  return invocations.find((invocation) => invocation.version_id === versionId);
}

function emptySkillSummary(workspaceId: string): SkillSummary {
  return { id: "skill-empty", name: `No skills for ${workspaceId}`, status: "draft", versionId: "missing-version", semver: "unversioned", rollbackTargetVersionId: null, rollbackTargetSemver: null, approvedVersions: [], sourceHash: "missing-source-hash", snapshotHash: "missing-approved-snapshot", scanStatus: "missing", reviewDecision: "missing", installationStatus: "not_installed", invocationStatus: "blocked", revision: 1, installationRevision: null, runId: null, goalLoopId: null, sourceEventId: null };
}

function selectedSkill(view: SkillsLearningView, selectedSkillId: string | null | undefined): SkillSummary {
  if (selectedSkillId === null || selectedSkillId === undefined) return view.selected;
  return view.skills.find((skill) => skill.id === selectedSkillId) ?? view.selected;
}

function approvedVersionsForDetail(detail: SkillDetail): readonly SkillApprovedVersion[] {
  return detail.versions
    .filter((version) => version.status === "approved" && version.snapshot_hash !== null)
    .map((version) => ({ id: version.id, semver: version.semver, snapshotHash: version.snapshot_hash ?? "missing-approved-snapshot" }));
}

function defaultRollbackTargetId(skill: SkillSummary): string | null {
  if (skill.rollbackTargetVersionId !== null) return skill.rollbackTargetVersionId;
  return skill.approvedVersions.find((version) => version.id !== skill.versionId)?.id ?? null;
}

function installationRevisionForAction(action: SkillLifecycleAction, skill: SkillSummary): number | undefined {
  if (action === "approve" || action === "install") return undefined;
  return skill.installationRevision ?? undefined;
}

function reasonForAction(action: SkillLifecycleAction): string {
  switch (action) {
    case "approve":
      return "Approve reviewed descriptor snapshot.";
    case "install":
      return "Install approved descriptor snapshot.";
    case "revoke":
      return "Revoke stale descriptor snapshot.";
    case "quarantine":
      return "Quarantine skill after review finding.";
    case "rollback":
      return "Rollback to reviewed approved snapshot.";
    default:
      return assertNever(action);
  }
}

function shortHash(value: string): string {
  return value.startsWith("sha256:") ? `${value.slice(0, 13)}...` : value;
}

function toneForStatus(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "active" || status === "approved" || status === "passed" || status === "installed" || status === "allowed") return "success";
  if (status === "quarantined" || status === "needs_review" || status === "not_installed") return "warning";
  if (status === "revoked" || status === "failed" || status === "blocked") return "danger";
  return "info";
}

function StatusBadge(props: { readonly tone: "success" | "warning" | "danger" | "info"; readonly label: string }): JSX.Element {
  const Icon = props.tone === "success" ? CircleCheck : props.tone === "warning" ? CircleAlert : props.tone === "danger" ? CircleAlert : CircleDashed;
  return <span className={`status-badge status-badge--${props.tone}`}><Icon aria-hidden="true" size={14} />{props.label}</span>;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Skills/Learning value ${String(value)}`);
}
