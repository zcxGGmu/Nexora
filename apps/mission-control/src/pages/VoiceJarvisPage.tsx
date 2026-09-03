import { CircleAlert, CircleCheck, CircleDashed, FileText, MicOff, Pause, Play, Radio, ShieldCheck, VolumeX, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { JSX } from "react";

import {
  buildVoiceJarvisControlView,
  fetchVoiceJarvisProjection,
  resolveVoiceJarvisWorkspace,
  sendTranscriptLifecycleCommand,
  sendVoiceSessionCommand,
  shouldUseVoiceJarvisFallback,
  type VoiceJarvisControlView,
  type VoiceJarvisSessionCommandKind,
  type VoiceJarvisTranscriptCommandKind,
} from "../app/voice-jarvis-api.js";

export type { VoiceJarvisControlView } from "../app/voice-jarvis-api.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const GATEWAY_SESSION_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const VOICE_SESSION_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const TRANSCRIPT_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const COMMAND_ID = "01GRZ3NDEKTSV4RRFFQ69G5FAV";

export const voiceJarvisFixture: VoiceJarvisControlView = {
  workspaceId: WORKSPACE_ID,
  sessions: [
    {
      id: VOICE_SESSION_ID,
      name: "Jarvis wall mode control session",
      mode: "wall",
      status: "active",
      revision: 2,
      runId: RUN_ID,
      gatewaySessionId: GATEWAY_SESSION_ID,
      locale: "en-US",
      turnCount: 1,
      maxTurns: 12,
      maxTranscriptChars: 20_000,
      deadlineAt: "2026-09-04T02:00:00.000Z",
      currentTranscriptId: TRANSCRIPT_ID,
    },
  ],
  selected: { sessionId: VOICE_SESSION_ID, transcriptId: TRANSCRIPT_ID, commandId: COMMAND_ID },
  audio: {
    policyId: "voice-policy-c24-jarvis",
    name: "C24 Jarvis descriptor-only audio policy",
    microphoneMode: "disabled",
    speakerMode: "disabled",
    vadMode: "descriptor_only",
    sttMode: "descriptor_only",
    ttsMode: "descriptor_only",
    wakeWordMode: "consent_required",
    wallMode: "descriptor_only",
    transcriptRetentionDays: 30,
    audioRetentionDays: 0,
    deletionAllowed: true,
    exportAllowed: true,
    voiceprintStorage: "disabled",
    descriptorOnly: true,
  },
  wakeWord: {
    id: "wake-word-c24-jarvis",
    phrase: "jarvis",
    locale: "en-US",
    sensitivity: 0.65,
    consentRequired: true,
    localOnly: true,
  },
  transcripts: {
    total: 1,
    redacted: 1,
    retained: 1,
    deleteRequested: 0,
    exportRequested: 0,
    final: 0,
    audioRefsDisabled: true,
    items: [
      {
        id: TRANSCRIPT_ID,
        sourceKind: "stt_descriptor",
        transcriptRef: "artifact://transcripts/c24/jarvis-turn-1.json",
        transcriptHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        lifecycleStatus: "retained",
        expiresAt: "2026-10-04T01:00:00.000Z",
        deletedAt: null,
        exportRef: null,
        redacted: true,
        audioRef: null,
      },
    ],
  },
  commands: {
    total: 1,
    latestKind: "wake",
    items: [
      {
        id: COMMAND_ID,
        kind: "wake",
        expectedRevision: 1,
        transcriptId: null,
        reason: "Wake Jarvis descriptor-only session.",
        createdAt: "2026-09-04T01:00:00.000Z",
      },
    ],
  },
};

const VOICE_JARVIS_UNAVAILABLE_FEEDBACK = "Voice/Jarvis control data unavailable; showing local planning fixture. No microphone, speaker, provider, MCP, or external connection was attempted.";

export function VoiceJarvisPage(props: { readonly workspaceId?: string; readonly view?: VoiceJarvisControlView }): JSX.Element {
  if (props.view !== undefined) return <VoiceJarvisPageContent view={props.view} />;
  return <LiveVoiceJarvisPage workspaceId={props.workspaceId ?? "ws-demo"} />;
}

function LiveVoiceJarvisPage(props: { readonly workspaceId: string }): JSX.Element {
  const workspaceResolution = resolveVoiceJarvisWorkspace(props.workspaceId);
  const apiWorkspaceId = workspaceResolution.kind === "resolved" ? workspaceResolution.workspace_id : null;
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["voice-jarvis-control", apiWorkspaceId],
    queryFn: () => {
      if (apiWorkspaceId === null) throw new Error("Voice/Jarvis workspace scope is invalid");
      return fetchVoiceJarvisProjection(apiWorkspaceId);
    },
    enabled: apiWorkspaceId !== null,
  });
  const sessionCommand = useMutation({
    mutationFn: async (input: { readonly sessionId: string; readonly command: VoiceJarvisSessionCommandKind; readonly view: VoiceJarvisControlView }) => {
      if (apiWorkspaceId === null) throw new Error("Voice/Jarvis workspace scope is invalid");
      const session = input.view.sessions.find((candidate) => candidate.id === input.sessionId);
      if (session === undefined) throw new Error("Voice/Jarvis session is unavailable");
      await sendVoiceSessionCommand(
        {
          workspace_id: apiWorkspaceId,
          session_id: session.id,
          run_id: session.runId,
          kind: input.command,
          expected_revision: session.revision,
          reason: reasonForSessionCommand(input.command),
        },
        `voice-jarvis:${input.command}:${session.id}:${crypto.randomUUID()}`,
      );
    },
    onSuccess: async (_data, input) => {
      setFeedback(`${input.command} accepted; rereading Voice/Jarvis projection.`);
      await queryClient.invalidateQueries({ queryKey: ["voice-jarvis-control", apiWorkspaceId] });
    },
    onError: () => setFeedback("Voice/Jarvis session command was not accepted. Refresh revision and check state."),
  });
  const transcriptCommand = useMutation({
    mutationFn: async (input: { readonly transcriptId: string; readonly command: VoiceJarvisTranscriptCommandKind; readonly view: VoiceJarvisControlView }) => {
      if (apiWorkspaceId === null) throw new Error("Voice/Jarvis workspace scope is invalid");
      const transcript = input.view.transcripts.items.find((candidate) => candidate.id === input.transcriptId);
      const session = input.view.sessions.find((candidate) => candidate.id === input.view.selected.sessionId);
      if (transcript === undefined || session === undefined) throw new Error("Voice/Jarvis transcript or session is unavailable");
      await sendTranscriptLifecycleCommand(
        {
          workspace_id: apiWorkspaceId,
          transcript_id: transcript.id,
          voice_session_id: session.id,
          run_id: session.runId,
          kind: input.command,
          expected_revision: session.revision,
          reason: reasonForTranscriptCommand(input.command),
        },
        `voice-jarvis:${input.command}:${transcript.id}:${crypto.randomUUID()}`,
      );
    },
    onSuccess: async (_data, input) => {
      setFeedback(`${input.command} accepted; rereading transcript lifecycle facts.`);
      await queryClient.invalidateQueries({ queryKey: ["voice-jarvis-control", apiWorkspaceId] });
    },
    onError: () => setFeedback("Voice/Jarvis transcript command was not accepted. Refresh policy and revision."),
  });

  if (apiWorkspaceId === null) return <VoiceJarvisState title="Invalid Voice/Jarvis workspace scope" message="Voice/Jarvis control data requires a canonical workspace ULID or the explicit local demo alias. No API request, microphone read, speaker playback, or external connection was attempted." alert />;
  if (query.isPending) return <VoiceJarvisState title="Loading Voice/Jarvis control data" message="Reading workspace-scoped voice sessions, audio policy, wake word descriptors, transcript lifecycle facts, and command receipts." />;
  if (query.isError) {
    if (shouldUseVoiceJarvisFallback(query.error)) return <VoiceJarvisPageContent view={voiceJarvisFixture} feedback={VOICE_JARVIS_UNAVAILABLE_FEEDBACK} />;
    return <VoiceJarvisState title="Voice/Jarvis control data denied" message="The control API rejected this workspace-scoped Voice/Jarvis projection. Local fixtures are not shown for authorization, scope, or revision errors." alert onRetry={() => void query.refetch()} />;
  }
  const view = buildVoiceJarvisControlView(query.data, apiWorkspaceId);
  const commandPending = sessionCommand.isPending || transcriptCommand.isPending;
  return (
    <VoiceJarvisPageContent
      view={view}
      commandPending={commandPending}
      feedback={feedback}
      onSessionCommand={(sessionId, command) => sessionCommand.mutate({ sessionId, command, view })}
      onTranscriptCommand={(transcriptId, command) => transcriptCommand.mutate({ transcriptId, command, view })}
    />
  );
}

export function VoiceJarvisPageContent(props: {
  readonly view: VoiceJarvisControlView;
  readonly commandPending?: boolean;
  readonly feedback?: string | null;
  readonly onSessionCommand?: (sessionId: string, command: VoiceJarvisSessionCommandKind) => void;
  readonly onTranscriptCommand?: (transcriptId: string, command: VoiceJarvisTranscriptCommandKind) => void;
  readonly onRetry?: () => void;
}): JSX.Element {
  const selectedSession = props.view.sessions.find((session) => session.id === props.view.selected.sessionId) ?? props.view.sessions[0];
  const selectedTranscript = props.view.transcripts.items.find((transcript) => transcript.id === props.view.selected.transcriptId) ?? props.view.transcripts.items[0];
  const transcriptLifecycleLocked = selectedTranscript === undefined || selectedTranscript.lifecycleStatus !== "retained";
  const hasSession = selectedSession !== undefined;
  return (
    <div className="page-stack voice-jarvis-page">
      <header className="page-header">
        <p className="section-kicker">Voice Control</p>
        <h1 id="route-title">Voice / Jarvis</h1>
        <p>Coordinate wake word, transcript lifecycle, and Jarvis session descriptors without touching live audio or providers.</p>
      </header>
      <section className="state-plane state-plane--info" aria-label="Voice Jarvis boundary">
        <div className="state-plane__title"><MicOff aria-hidden="true" size={18} /><span>Descriptor-only voice control</span><span className="status-badge status-badge--info">No external connection</span></div>
        <p>No microphone is read, no speaker audio is played, and no STT, VAD, TTS, MCP, credential, or provider connection is attempted. Only workspace-scoped control-plane facts are recorded.</p>
      </section>
      <section className="workspace-grid workspace-grid--wide">
        <section className="panel" aria-labelledby="voice-sessions-title">
          <div className="panel-header"><h2 id="voice-sessions-title">Voice sessions</h2><span className="mono meta">{props.view.sessions.length}</span></div>
          <div className="row-list">
            {props.view.sessions.length === 0 ? <div className="padded-row meta">No Voice/Jarvis sessions are registered for this workspace.</div> : props.view.sessions.map((session) => (
              <article className="work-row voice-jarvis-session-row" key={session.id}>
                <div>
                  <h3>{session.name} <span className="row-meta">{session.mode}</span></h3>
                  <div className="row-meta mono">{session.id} | revision {session.revision} | run {session.runId}</div>
                  <p>Turns {session.turnCount}/{session.maxTurns} | locale {session.locale} | deadline {session.deadlineAt}</p>
                </div>
                <div className="button-row">
                  <StatusBadge tone={toneForSession(session.status)} label={session.status} />
                  <button className="row-action" data-control-kind="wake" type="button" disabled={props.commandPending === true || props.onSessionCommand === undefined || session.status === "stopped" || session.status === "error"} onClick={() => props.onSessionCommand?.(session.id, "wake")}><Radio aria-hidden="true" size={15} />Wake</button>
                  <button className="row-action" data-control-kind="interrupt" type="button" disabled={props.commandPending === true || props.onSessionCommand === undefined || session.status !== "active"} onClick={() => props.onSessionCommand?.(session.id, "interrupt")}><XCircle aria-hidden="true" size={15} />Interrupt</button>
                  {session.status === "paused" ? <button className="row-action" data-control-kind="resume" type="button" disabled={props.commandPending === true || props.onSessionCommand === undefined} onClick={() => props.onSessionCommand?.(session.id, "resume")}><Play aria-hidden="true" size={15} />Resume</button> : <button className="row-action" data-control-kind="pause" type="button" disabled={props.commandPending === true || props.onSessionCommand === undefined || session.status !== "active"} onClick={() => props.onSessionCommand?.(session.id, "pause")}><Pause aria-hidden="true" size={15} />Pause</button>}
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="panel" aria-labelledby="voice-audio-policy-title">
          <div className="panel-header"><h2 id="voice-audio-policy-title">Audio policy</h2><VolumeX aria-hidden="true" size={18} /></div>
          <dl className="fact-grid">
            <div><dt>Policy</dt><dd>{props.view.audio.name} | {props.view.audio.policyId}</dd></div>
            <div><dt>Microphone</dt><dd>{props.view.audio.microphoneMode}</dd></div>
            <div><dt>Speaker</dt><dd>{props.view.audio.speakerMode}</dd></div>
            <div><dt>VAD/STT/TTS</dt><dd>{props.view.audio.vadMode} | {props.view.audio.sttMode} | {props.view.audio.ttsMode}</dd></div>
            <div><dt>Audio retention</dt><dd>{props.view.audio.audioRetentionDays} days</dd></div>
            <div><dt>Voiceprint</dt><dd>{props.view.audio.voiceprintStorage}</dd></div>
            <div><dt>Descriptor-only</dt><dd>{String(props.view.audio.descriptorOnly)}</dd></div>
          </dl>
        </section>
      </section>
      <section className="workspace-grid">
        <section className="panel" aria-labelledby="voice-wake-word-title">
          <div className="panel-header"><h2 id="voice-wake-word-title">Wake word</h2><ShieldCheck aria-hidden="true" size={18} /></div>
          {props.view.wakeWord === null ? <div className="padded-row meta">No wake word descriptor is attached to the selected session.</div> : <dl className="fact-grid">
            <div><dt>Phrase</dt><dd>{props.view.wakeWord.phrase}</dd></div>
            <div><dt>Locale</dt><dd>{props.view.wakeWord.locale}</dd></div>
            <div><dt>Sensitivity</dt><dd>{props.view.wakeWord.sensitivity.toFixed(2)}</dd></div>
            <div><dt>Consent required</dt><dd>{String(props.view.wakeWord.consentRequired)}</dd></div>
            <div><dt>Local only</dt><dd>{String(props.view.wakeWord.localOnly)}</dd></div>
          </dl>}
        </section>
        <section className="panel" aria-labelledby="voice-transcript-summary-title">
          <div className="panel-header"><h2 id="voice-transcript-summary-title">Transcripts</h2><span className="mono meta">{props.view.transcripts.redacted}/{props.view.transcripts.total} redacted</span></div>
          <dl className="fact-grid">
            <div><dt>Retained</dt><dd>{props.view.transcripts.retained}</dd></div>
            <div><dt>Delete requested</dt><dd>{props.view.transcripts.deleteRequested}</dd></div>
            <div><dt>Export requested</dt><dd>{props.view.transcripts.exportRequested}</dd></div>
            <div><dt>Final</dt><dd>{props.view.transcripts.final}</dd></div>
            <div><dt>Audio refs</dt><dd>{props.view.transcripts.audioRefsDisabled ? "disabled" : "unexpected"}</dd></div>
          </dl>
          <div className="button-row padded-row" aria-label="Voice transcript controls">
            <button className="row-action" data-control-kind="delete-transcript" type="button" disabled={props.commandPending === true || props.onTranscriptCommand === undefined || !props.view.audio.deletionAllowed || transcriptLifecycleLocked || !hasSession} onClick={() => { if (selectedTranscript !== undefined) props.onTranscriptCommand?.(selectedTranscript.id, "delete_transcript"); }}><FileText aria-hidden="true" size={15} />Delete transcript</button>
            <button className="row-action" data-control-kind="export-transcript" type="button" disabled={props.commandPending === true || props.onTranscriptCommand === undefined || !props.view.audio.exportAllowed || transcriptLifecycleLocked || !hasSession} onClick={() => { if (selectedTranscript !== undefined) props.onTranscriptCommand?.(selectedTranscript.id, "export_transcript"); }}><FileText aria-hidden="true" size={15} />Export transcript</button>
          </div>
        </section>
      </section>
      <section className="workspace-grid workspace-grid--wide">
        <section className="panel" aria-labelledby="voice-transcript-facts-title">
          <div className="panel-header"><h2 id="voice-transcript-facts-title">Transcript facts</h2><span className="mono meta">{props.view.transcripts.total}</span></div>
          <div className="row-list">
            {props.view.transcripts.items.length === 0 ? <div className="padded-row meta">No transcript descriptors are recorded yet.</div> : props.view.transcripts.items.map((transcript) => (
              <article className="work-row" key={transcript.id}>
                <div><h3>{transcript.sourceKind} | {transcript.lifecycleStatus}</h3><div className="row-meta mono">{transcript.id}</div><p>{shortRef(transcript.transcriptRef)} | audio_ref {String(transcript.audioRef)}</p></div>
                <StatusBadge tone={toneForTranscript(transcript.lifecycleStatus)} label={transcript.redacted ? "redacted" : "unredacted"} />
              </article>
            ))}
          </div>
        </section>
        <section className="panel" aria-labelledby="voice-command-facts-title">
          <div className="panel-header"><h2 id="voice-command-facts-title">Command facts</h2><span className="mono meta">{props.view.commands.total}</span></div>
          <div className="row-list">
            {props.view.commands.items.length === 0 ? <div className="padded-row meta">No Voice/Jarvis command facts are recorded yet.</div> : props.view.commands.items.map((command) => (
              <article className="work-row" key={command.id}>
                <div><h3>{command.kind}</h3><div className="row-meta mono">{command.id} | expected revision {command.expectedRevision}</div><p>{command.reason ?? "No reason recorded"}</p></div>
                <StatusBadge tone="info" label={command.transcriptId === null ? "session" : "transcript"} />
              </article>
            ))}
          </div>
        </section>
      </section>
      {selectedSession === undefined ? null : <p className="meta">Selected session {selectedSession.id} stays workspace-scoped to {props.view.workspaceId}; current transcript {selectedSession.currentTranscriptId ?? "none"}.</p>}
      {props.feedback === undefined || props.feedback === null ? null : <p className="meta" role="status" aria-live="polite">{props.feedback}</p>}
      {props.onRetry === undefined ? null : <button className="row-action" type="button" onClick={props.onRetry}>Retry Voice/Jarvis API</button>}
      <section className="state-plane state-plane--warning" aria-label="Voice Jarvis policy">
        <div className="state-plane__title"><CircleAlert aria-hidden="true" size={18} /><span>Audio and provider side effects disabled</span></div>
        <p>Wake word, interrupt, transcript delete, and transcript export controls write local command facts only. Real microphone capture, audio playback, provider STT/TTS calls, voiceprint storage, and external messaging remain disabled.</p>
      </section>
    </div>
  );
}

function VoiceJarvisState(props: { readonly title: string; readonly message: string; readonly alert?: boolean; readonly onRetry?: () => void }): JSX.Element {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="section-kicker">Voice Control</p>
        <h1 id="route-title">Voice / Jarvis</h1>
      </header>
      <section className="state-plane state-plane--info" role={props.alert ? "alert" : undefined}>
        <div className="state-plane__title"><CircleDashed aria-hidden="true" size={18} /><span>{props.title}</span><span className="status-badge status-badge--info">No external connection</span></div>
        <p>{props.message}</p>
        {props.onRetry === undefined ? null : <button className="row-action" type="button" onClick={props.onRetry}>Retry</button>}
      </section>
    </div>
  );
}

function reasonForSessionCommand(kind: VoiceJarvisSessionCommandKind): string {
  switch (kind) {
    case "wake":
      return "Operator woke descriptor-only Jarvis session.";
    case "interrupt":
      return "Operator interrupted descriptor-only Jarvis session.";
    case "pause":
      return "Operator paused descriptor-only Jarvis session.";
    case "resume":
      return "Operator resumed descriptor-only Jarvis session.";
    default:
      return assertNever(kind);
  }
}

function reasonForTranscriptCommand(kind: VoiceJarvisTranscriptCommandKind): string {
  switch (kind) {
    case "delete_transcript":
      return "Operator requested descriptor-only transcript deletion.";
    case "export_transcript":
      return "Operator requested descriptor-only transcript export.";
    default:
      return assertNever(kind);
  }
}

function toneForSession(status: VoiceJarvisControlView["sessions"][number]["status"]): "success" | "warning" | "danger" | "info" {
  if (status === "active") return "success";
  if (status === "paused" || status === "interrupted") return "warning";
  if (status === "error") return "danger";
  return "info";
}

function toneForTranscript(status: VoiceJarvisControlView["transcripts"]["items"][number]["lifecycleStatus"]): "success" | "warning" | "danger" | "info" {
  if (status === "retained") return "success";
  if (status === "delete_requested" || status === "export_requested") return "warning";
  if (status === "deleted") return "danger";
  return "info";
}

function StatusBadge(props: { readonly tone: "success" | "warning" | "danger" | "info"; readonly label: string }): JSX.Element {
  const Icon = props.tone === "success" ? CircleCheck : props.tone === "warning" ? CircleAlert : props.tone === "danger" ? CircleAlert : CircleDashed;
  return <span className={`status-badge status-badge--${props.tone}`}><Icon aria-hidden="true" size={14} />{props.label}</span>;
}

function shortRef(value: string): string {
  return value.length <= 72 ? value : `${value.slice(0, 34)}...${value.slice(-30)}`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Voice/Jarvis value ${String(value)}`);
}
