import { BookOpen, CircleAlert, CircleCheck, Clapperboard, Eye, RefreshCw, Share2, ShieldCheck, Sparkles, UserRound, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { JSX } from "react";

import {
  buildStudioMediaControlView,
  fetchStudioMediaProjection,
  resolveStudioMediaWorkspace,
  sendStudioMediaCommand,
  shouldUseStudioMediaFallback,
  type StudioMediaCommandKind,
  type StudioMediaControlView,
} from "../app/studio-media-api.js";

export type { StudioMediaControlView } from "../app/studio-media-api.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const MEDIA_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const RENDER_JOB_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const NOTEBOOK_ID = "notebook-c25-market-brief";
const NOTEBOOK_SOURCE_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const NOTEBOOK_GENERATION_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const AVATAR_ID = "avatar-c25-founder-demo";
const SHARE_ID = "01HRZ3NDEKTSV4RRFFQ69H5FAV";

export const studioMediaFixture: StudioMediaControlView = {
  workspaceId: WORKSPACE_ID,
  mediaArtifacts: [
    {
      id: MEDIA_ID,
      title: "C25 source-backed video preview",
      mediaType: "video",
      revision: 1,
      runId: RUN_ID,
      moderationStatus: "needs_review",
      sharePolicy: "review_required",
      previewRef: "artifact://media/c25/preview.mp4",
      renderVersion: 1,
      temporaryUrlExpiresAt: null,
      descriptorOnly: true,
    },
  ],
  renderJobs: [
    {
      id: RENDER_JOB_ID,
      mediaArtifactId: MEDIA_ID,
      runId: RUN_ID,
      workerDescriptorId: "render-worker-c25-local-descriptor",
      status: "queued",
      inputHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      outputArtifactRef: null,
      sideEffectPolicy: "none",
      descriptorOnly: true,
    },
  ],
  notebooks: [
    {
      id: NOTEBOOK_ID,
      title: "C25 NotebookLM descriptor",
      revision: 1,
      runId: RUN_ID,
      sourcePolicy: "snapshot_only",
      generationPolicy: "local_descriptor_only",
      sharePolicy: "review_required",
      descriptorOnly: true,
    },
  ],
  notebookSources: [
    {
      id: NOTEBOOK_SOURCE_ID,
      notebookId: NOTEBOOK_ID,
      runId: RUN_ID,
      sourceKind: "artifact_snapshot",
      sourceRef: "artifact://research/c25/source-pack.json",
      sourceHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      snapshotRef: "artifact://notebooks/c25/source-pack.snapshot.json",
      title: "Market source pack",
      descriptorOnly: true,
    },
  ],
  notebookGenerations: [
    {
      id: NOTEBOOK_GENERATION_ID,
      notebookId: NOTEBOOK_ID,
      runId: RUN_ID,
      sourceIds: [NOTEBOOK_SOURCE_ID],
      generationKind: "brief",
      outputRef: "artifact://notebooks/c25/generated-brief.md",
      citationRefs: ["artifact://notebooks/c25/source-pack.snapshot.json#p1"],
      status: "draft",
      descriptorOnly: true,
    },
  ],
  avatarProfiles: [
    {
      id: AVATAR_ID,
      displayName: "Founder avatar descriptor",
      revision: 1,
      runId: RUN_ID,
      consentStatus: "approved",
      consentArtifactRef: "artifact://avatars/c25/consent.json",
      voiceCloneMode: "disabled",
      renderMode: "descriptor_only",
      expiresAt: "2026-10-04T04:00:00.000Z",
      revokedAt: null,
      descriptorOnly: true,
    },
  ],
  shares: [
    {
      id: SHARE_ID,
      mediaArtifactId: MEDIA_ID,
      runId: RUN_ID,
      status: "pending_review",
      previewRef: "artifact://media/c25/preview.mp4",
      expiresAt: "2026-09-04T05:00:00.000Z",
      descriptorOnly: true,
    },
  ],
  commands: [
    {
      id: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
      kind: "preview",
      targetId: MEDIA_ID,
      targetType: "media_artifact",
      expectedRevision: 1,
      reason: "Operator requested descriptor preview.",
      createdAt: "2026-09-04T04:00:00.000Z",
    },
  ],
  selected: { mediaId: MEDIA_ID, renderJobId: RENDER_JOB_ID, notebookId: NOTEBOOK_ID, notebookSourceId: NOTEBOOK_SOURCE_ID, notebookGenerationId: NOTEBOOK_GENERATION_ID, avatarId: AVATAR_ID, shareId: SHARE_ID },
};

const STUDIO_MEDIA_UNAVAILABLE_FEEDBACK = "Studio/Media control data unavailable; showing local planning fixture. No NotebookLM, media provider, Avatar provider, MCP, credential, URL/PDF/Drive pull, render, publish, or external connection was attempted.";

export function StudioMediaPage(props: { readonly workspaceId?: string; readonly view?: StudioMediaControlView }): JSX.Element {
  if (props.view !== undefined) return <StudioMediaPageContent view={props.view} />;
  return <LiveStudioMediaPage workspaceId={props.workspaceId ?? "ws-demo"} />;
}

function LiveStudioMediaPage(props: { readonly workspaceId: string }): JSX.Element {
  const workspaceResolution = resolveStudioMediaWorkspace(props.workspaceId);
  const apiWorkspaceId = workspaceResolution.kind === "resolved" ? workspaceResolution.workspace_id : null;
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["studio-media-control", apiWorkspaceId],
    queryFn: () => {
      if (apiWorkspaceId === null) throw new Error("Studio/Media workspace scope is invalid");
      return fetchStudioMediaProjection(apiWorkspaceId);
    },
    enabled: apiWorkspaceId !== null,
  });
  const command = useMutation({
    mutationFn: async (input: { readonly targetId: string; readonly command: StudioMediaCommandKind; readonly view: StudioMediaControlView }) => {
      if (apiWorkspaceId === null) throw new Error("Studio/Media workspace scope is invalid");
      const commandInput = commandInputFor(input.view, input.targetId, input.command, apiWorkspaceId);
      await sendStudioMediaCommand(commandInput, `studio-media:${input.command}:${input.targetId}:${crypto.randomUUID()}`);
    },
    onSuccess: async (_data, input) => {
      setFeedback(`${input.command} accepted; rereading Studio/Media projection.`);
      await queryClient.invalidateQueries({ queryKey: ["studio-media-control", apiWorkspaceId] });
    },
    onError: () => setFeedback("Studio/Media command was not accepted. Refresh revision and review descriptor state."),
  });

  if (apiWorkspaceId === null) return <StudioMediaState title="Invalid Studio/Media workspace scope" message="Studio/Media control data requires a canonical workspace ULID or the explicit local demo alias. No API request or external provider connection was attempted." alert />;
  if (query.isPending) return <StudioMediaState title="Loading Studio/Media control data" message="Reading workspace-scoped media artifacts, render queue facts, Notebook snapshots, Avatar consent, and command receipts." />;
  if (query.isError) {
    if (shouldUseStudioMediaFallback(query.error)) return <StudioMediaPageContent view={studioMediaFixture} feedback={STUDIO_MEDIA_UNAVAILABLE_FEEDBACK} />;
    return <StudioMediaState title="Studio/Media control data denied" message="The control API rejected this workspace-scoped Studio/Media projection. Local fixtures are not shown for authorization or scope errors." alert onRetry={() => void query.refetch()} />;
  }
  const view = buildStudioMediaControlView(query.data, apiWorkspaceId);
  return <StudioMediaPageContent view={view} commandPending={command.isPending} feedback={feedback} onStudioCommand={(targetId, kind) => command.mutate({ targetId, command: kind, view })} />;
}

export function StudioMediaPageContent(props: {
  readonly view: StudioMediaControlView;
  readonly commandPending?: boolean;
  readonly feedback?: string | null;
  readonly onStudioCommand?: (targetId: string, command: StudioMediaCommandKind) => void;
  readonly onRetry?: () => void;
}): JSX.Element {
  const selectedMedia = props.view.mediaArtifacts.find((media) => media.id === props.view.selected.mediaId) ?? props.view.mediaArtifacts[0];
  const selectedRenderJob = props.view.renderJobs.find((job) => job.id === props.view.selected.renderJobId) ?? props.view.renderJobs[0];
  const selectedNotebook = props.view.notebooks.find((notebook) => notebook.id === props.view.selected.notebookId) ?? props.view.notebooks[0];
  const selectedNotebookSource = props.view.notebookSources.find((source) => source.id === props.view.selected.notebookSourceId) ?? props.view.notebookSources[0];
  const selectedNotebookGeneration = props.view.notebookGenerations.find((generation) => generation.id === props.view.selected.notebookGenerationId) ?? props.view.notebookGenerations[0];
  const selectedAvatar = props.view.avatarProfiles.find((avatar) => avatar.id === props.view.selected.avatarId) ?? props.view.avatarProfiles[0];
  const selectedShare = props.view.shares.find((share) => share.id === props.view.selected.shareId) ?? props.view.shares[0];
  return (
    <div className="page-stack studio-media-page">
      <header className="page-header">
        <p className="section-kicker">Studio Control</p>
        <h1 id="route-title">Studio / Media</h1>
        <p>Coordinate media previews, Notebook snapshots, and Avatar consent as descriptor-only control facts.</p>
      </header>
      <section className="state-plane state-plane--info" aria-label="Studio Media boundary">
        <div className="state-plane__title"><ShieldCheck aria-hidden="true" size={18} /><span>Descriptor-only studio control</span><span className="status-badge status-badge--info">No external provider</span></div>
        <p>No NotebookLM, media generation provider, Avatar provider, MCP, credential, URL/PDF/Drive pull, real render, publish action, or external side effect is attempted.</p>
      </section>
      {props.feedback !== undefined && props.feedback !== null ? <div className="state-plane state-plane--success" role="status">{props.feedback}</div> : null}
      <section className="workspace-grid workspace-grid--wide">
        <section className="panel" aria-labelledby="studio-media-artifacts-title">
          <div className="panel-header"><h2 id="studio-media-artifacts-title">Media artifacts</h2><span className="mono meta">{props.view.mediaArtifacts.length}</span></div>
          <div className="row-list">
            {props.view.mediaArtifacts.length === 0 ? <div className="padded-row meta">No media artifacts are registered for this workspace.</div> : props.view.mediaArtifacts.map((media) => (
              <article className="work-row studio-media-row" key={media.id}>
                <div>
                  <h3>{media.title} <span className="row-meta">{media.mediaType}</span></h3>
                  <div className="row-meta mono">{media.id} | revision {media.revision} | run {media.runId}</div>
                  <p>Preview {media.previewRef ?? "missing"} | render v{media.renderVersion} | Temporary URL {media.temporaryUrlExpiresAt ?? "none"}</p>
                </div>
                <div className="button-row">
                  <StatusBadge tone={media.moderationStatus === "approved" ? "success" : "warning"} label={media.moderationStatus} />
                  <button className="row-action" data-control-kind="preview" type="button" disabled={buttonDisabled(props.commandPending, props.onStudioCommand)} onClick={() => props.onStudioCommand?.(media.id, "preview")}><Eye aria-hidden="true" size={15} />Preview</button>
                  <button className="row-action" data-control-kind="share" type="button" disabled={buttonDisabled(props.commandPending, props.onStudioCommand)} onClick={() => props.onStudioCommand?.(media.id, "share")}><Share2 aria-hidden="true" size={15} />Share</button>
                  <button className="row-action" data-control-kind="rerender" type="button" disabled={buttonDisabled(props.commandPending, props.onStudioCommand)} onClick={() => props.onStudioCommand?.(media.id, "rerender")}><RefreshCw aria-hidden="true" size={15} />Rerender</button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="panel" aria-labelledby="studio-render-queue-title">
          <div className="panel-header"><h2 id="studio-render-queue-title">Render queue</h2><Clapperboard aria-hidden="true" size={18} /></div>
          <dl className="fact-grid">
            <div><dt>Selected media</dt><dd>{selectedMedia?.id ?? "none"}</dd></div>
            <div><dt>Selected render job</dt><dd>{selectedRenderJob?.id ?? "none"}</dd></div>
            <div><dt>Selected notebook</dt><dd>{selectedNotebook?.id ?? "none"}</dd></div>
            <div><dt>Moderation</dt><dd>{selectedMedia?.moderationStatus ?? "none"}</dd></div>
            <div><dt>Share policy</dt><dd>{selectedMedia?.sharePolicy ?? "none"}</dd></div>
            <div><dt>Descriptor-only</dt><dd>{String(selectedMedia?.descriptorOnly ?? true)}</dd></div>
          </dl>
          <div className="row-list compact-list">
            {props.view.renderJobs.length === 0 ? <div className="padded-row meta">No render jobs are queued for this workspace.</div> : props.view.renderJobs.map((job) => (
              <article className="work-row" key={job.id}>
                <div>
                  <h3>{job.status} <span className="row-meta">render job</span></h3>
                  <div className="row-meta mono">{job.id} | media {job.mediaArtifactId}</div>
                  <p>Worker {job.workerDescriptorId} | side effects {job.sideEffectPolicy}</p>
                </div>
                <StatusBadge tone={job.status === "failed" ? "danger" : job.status === "queued" ? "warning" : "info"} label={job.status} />
              </article>
            ))}
          </div>
        </section>
      </section>
      <section className="workspace-grid">
        <section className="panel" aria-labelledby="studio-notebooks-title">
          <div className="panel-header"><h2 id="studio-notebooks-title">Notebook snapshots</h2><BookOpen aria-hidden="true" size={18} /></div>
          <div className="row-list compact-list">
            {props.view.notebooks.map((notebook) => (
              <article className="work-row" key={notebook.id}>
                <div>
                  <h3>{notebook.title}</h3>
                  <div className="row-meta mono">{notebook.id} | revision {notebook.revision}</div>
                  <p>{notebook.sourcePolicy} | {notebook.generationPolicy} | {notebook.sharePolicy}</p>
                </div>
                <button className="row-action" data-control-kind="notebook_generate" type="button" disabled={buttonDisabled(props.commandPending, props.onStudioCommand)} onClick={() => props.onStudioCommand?.(notebook.id, "notebook_generate")}><Sparkles aria-hidden="true" size={15} />Generate brief</button>
              </article>
            ))}
          </div>
        </section>
        <section className="panel" aria-labelledby="studio-notebook-sources-title">
          <div className="panel-header"><h2 id="studio-notebook-sources-title">Notebook sources</h2><ShieldCheck aria-hidden="true" size={18} /></div>
          <dl className="fact-grid">
            <div><dt>Selected source</dt><dd>{selectedNotebookSource?.id ?? "none"}</dd></div>
            <div><dt>Source kind</dt><dd>{selectedNotebookSource?.sourceKind ?? "none"}</dd></div>
            <div><dt>Snapshot</dt><dd>{selectedNotebookSource?.snapshotRef ?? "none"}</dd></div>
            <div><dt>Source hash</dt><dd>{selectedNotebookSource?.sourceHash.slice(0, 18) ?? "none"}</dd></div>
          </dl>
        </section>
      </section>
      <section className="workspace-grid">
        <section className="panel" aria-labelledby="studio-notebook-generations-title">
          <div className="panel-header"><h2 id="studio-notebook-generations-title">Notebook generations</h2><Sparkles aria-hidden="true" size={18} /></div>
          <div className="row-list compact-list">
            {props.view.notebookGenerations.length === 0 ? <div className="padded-row meta">No Notebook generations have been recorded.</div> : props.view.notebookGenerations.map((generation) => (
              <article className="work-row" key={generation.id}>
                <div>
                  <h3>{generation.generationKind} <span className="row-meta">{generation.status}</span></h3>
                  <div className="row-meta mono">{generation.id} | sources {generation.sourceIds.length}</div>
                  <p>Output {generation.outputRef} | citations {generation.citationRefs.length}</p>
                </div>
                <StatusBadge tone={generation.status === "approved" ? "success" : generation.status === "rejected" ? "danger" : "info"} label={generation.status} />
              </article>
            ))}
          </div>
        </section>
        <section className="panel" aria-labelledby="studio-avatar-title">
          <div className="panel-header"><h2 id="studio-avatar-title">Avatar consent</h2><UserRound aria-hidden="true" size={18} /></div>
          <dl className="fact-grid">
            <div><dt>Profile</dt><dd>{selectedAvatar?.displayName ?? "none"}</dd></div>
            <div><dt>Run</dt><dd>{selectedAvatar?.runId ?? "none"}</dd></div>
            <div><dt>Consent</dt><dd>{selectedAvatar?.consentStatus ?? "none"}</dd></div>
            <div><dt>Voice clone</dt><dd>{selectedAvatar?.voiceCloneMode ?? "disabled"}</dd></div>
            <div><dt>Render mode</dt><dd>{selectedAvatar?.renderMode ?? "descriptor_only"}</dd></div>
            <div><dt>Expires</dt><dd>{selectedAvatar?.expiresAt ?? "none"}</dd></div>
          </dl>
          <div className="button-row panel-actions">
            <button className="row-action" data-control-kind="revoke_avatar" type="button" disabled={selectedAvatar === undefined || buttonDisabled(props.commandPending, props.onStudioCommand)} onClick={() => selectedAvatar !== undefined ? props.onStudioCommand?.(selectedAvatar.id, "revoke_avatar") : undefined}><XCircle aria-hidden="true" size={15} />Revoke avatar</button>
          </div>
        </section>
      </section>
      <section className="workspace-grid">
        <section className="panel" aria-labelledby="studio-share-facts-title">
          <div className="panel-header"><h2 id="studio-share-facts-title">Share facts</h2><Share2 aria-hidden="true" size={18} /></div>
          <dl className="fact-grid">
            <div><dt>Selected share</dt><dd>{selectedShare?.id ?? "none"}</dd></div>
            <div><dt>Status</dt><dd>{selectedShare?.status ?? "none"}</dd></div>
            <div><dt>Preview ref</dt><dd>{selectedShare?.previewRef ?? "none"}</dd></div>
            <div><dt>Expires</dt><dd>{selectedShare?.expiresAt ?? "none"}</dd></div>
          </dl>
        </section>
        <section className="panel" aria-labelledby="studio-generation-source-title">
          <div className="panel-header"><h2 id="studio-generation-source-title">Generation source binding</h2><CircleCheck aria-hidden="true" size={18} /></div>
          <dl className="fact-grid">
            <div><dt>Generation</dt><dd>{selectedNotebookGeneration?.id ?? "none"}</dd></div>
            <div><dt>Notebook</dt><dd>{selectedNotebookGeneration?.notebookId ?? "none"}</dd></div>
            <div><dt>Run</dt><dd>{selectedNotebookGeneration?.runId ?? "none"}</dd></div>
            <div><dt>Descriptor-only</dt><dd>{String(selectedNotebookGeneration?.descriptorOnly ?? true)}</dd></div>
          </dl>
        </section>
      </section>
      <section className="panel" aria-labelledby="studio-command-title">
        <div className="panel-header"><h2 id="studio-command-title">Command receipts</h2><CircleCheck aria-hidden="true" size={18} /></div>
        <div className="row-list compact-list">
          {props.view.commands.length === 0 ? <div className="padded-row meta">No Studio/Media commands recorded yet.</div> : props.view.commands.map((command) => (
            <article className="work-row" key={command.id}>
              <div>
                <h3>{command.kind} <span className="row-meta">{command.targetType}</span></h3>
                <div className="row-meta mono">{command.id} | target {command.targetId} | rev {command.expectedRevision}</div>
                <p>{command.reason}</p>
              </div>
              <StatusBadge tone="info" label={command.createdAt} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function commandInputFor(view: StudioMediaControlView, targetId: string, kind: StudioMediaCommandKind, workspaceId: string): Parameters<typeof sendStudioMediaCommand>[0] {
  if (kind === "notebook_generate") {
    const notebook = view.notebooks.find((candidate) => candidate.id === targetId);
    if (notebook === undefined) throw new Error("Notebook descriptor is unavailable");
    return { workspace_id: workspaceId, run_id: notebook.runId, target_id: targetId, target_type: "notebook", kind, expected_revision: notebook.revision, reason: "Generate descriptor-only Notebook brief." };
  }
  if (kind === "revoke_avatar") {
    const avatar = view.avatarProfiles.find((candidate) => candidate.id === targetId);
    if (avatar === undefined) throw new Error("Avatar descriptor is unavailable");
    return { workspace_id: workspaceId, run_id: avatar.runId, target_id: targetId, target_type: "avatar_profile", kind, expected_revision: avatar.revision, reason: "Revoke descriptor-only Avatar consent." };
  }
  const media = view.mediaArtifacts.find((candidate) => candidate.id === targetId);
  if (media === undefined) throw new Error("Media artifact descriptor is unavailable");
  return { workspace_id: workspaceId, run_id: media.runId, target_id: targetId, target_type: "media_artifact", kind, expected_revision: media.revision, reason: `Operator requested ${kind}.` };
}

function buttonDisabled(commandPending: boolean | undefined, handler: ((targetId: string, command: StudioMediaCommandKind) => void) | undefined): boolean {
  return commandPending === true || handler === undefined;
}

function StatusBadge(props: { readonly tone: "success" | "warning" | "danger" | "info"; readonly label: string }): JSX.Element {
  const Icon = props.tone === "success" ? CircleCheck : props.tone === "danger" ? XCircle : props.tone === "warning" ? CircleAlert : ShieldCheck;
  return <span className={`status-badge status-badge--${props.tone}`}><Icon aria-hidden="true" size={14} />{props.label}</span>;
}

function StudioMediaState(props: { readonly title: string; readonly message: string; readonly alert?: boolean; readonly onRetry?: () => void }): JSX.Element {
  return (
    <div className="page-stack studio-media-page">
      <header className="page-header">
        <p className="section-kicker">Studio Control</p>
        <h1 id="route-title">Studio / Media</h1>
      </header>
      <section className={props.alert === true ? "state-plane state-plane--danger" : "state-plane state-plane--info"} role={props.alert === true ? "alert" : "status"}>
        <div className="state-plane__title"><CircleAlert aria-hidden="true" size={18} /><span>{props.title}</span></div>
        <p>{props.message}</p>
        {props.onRetry === undefined ? null : <button className="row-action" type="button" onClick={props.onRetry}>Retry</button>}
      </section>
    </div>
  );
}
