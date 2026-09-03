# ADR-0019: Voice and Jarvis Control Plane

## Context

Nexora needs a Voice/Jarvis surface after Browser/Computer Use so operators can inspect voice session descriptors, audio policies, wake word descriptors, transcript descriptors, transcript lifecycle commands, and Jarvis wall-mode controls. C24 is still a control-plane stage. It must not read a microphone, play audio, call STT/VAD/TTS providers, store voiceprints, connect MCP tools, read credentials, or send external messages.

## Decision

- Add strict contracts for `AudioPolicy`, `WakeWordDescriptor`, `VoiceSessionDescriptor`, `TranscriptDescriptor`, and `VoiceCommand`.
- Keep C24 descriptor-only. API `202 Accepted` responses record local control facts and command facts; they do not capture audio, play speaker output, invoke providers, call MCP, read credentials, or send outbound traffic.
- Force audio policy defaults to disabled microphone, disabled speaker, descriptor-only VAD/STT/TTS, consent-required wake word, descriptor-only wall mode, zero audio retention, and disabled voiceprint storage.
- Store all C24 facts with `workspace_id`. Voice sessions bind to a run and gateway session; transcripts bind to the same voice session and run; lifecycle commands bind to the same transcript, session, run, and workspace.
- Require new voice sessions to start from the server-safe baseline: `idle`, `turn_count = 0`, `current_transcript_id = null`, `interrupted_at = null`, and descriptor-only policy bindings. Client-created active/paused/interrupted state is rejected so initial registration cannot masquerade as live audio execution.
- Require session state changes to be backed by append-only `VoiceCommand` facts. Direct session updates cannot forge wake, pause, interrupt, or resume transitions without a same-workspace/session/run command, and `resume` only applies from paused or interrupted sessions.
- Treat session identity and policy facts as immutable after registration: name, locale, interaction budget, deadline, descriptor-only flag, schema version, audio policy, wake word, run, and gateway session cannot drift through update paths.
- Allow `current_transcript_id` only after the transcript exists for the same workspace, voice session, and run. Session registration must not point at a future or foreign transcript.
- Treat transcripts and voice commands as append-only facts. Transcript delete/export requests are represented by command facts and derived lifecycle state, not by mutating transcript rows.
- Require initial transcript descriptors to start as `retained`. Later delete/export requests derive `delete_requested` or `export_requested` from the first lifecycle command fact and reject conflicting lifecycle commands.
- Require Owner workspace authority for C24 writes and `run:read` for reads. Session and transcript commands require `If-Match` against the current voice session revision. Idempotency keys are safe opaque command tokens and replay only when the full client-controlled semantics match.
- Validate descriptor refs, payload JSON, and text at both contracts and SQLite layers. Transcript refs are `artifact://` descriptors with non-empty relative paths only; raw paths, whitespace, traversal, backslashes, nested schemes, percent-encoded markers, default-ignorable characters, `secret://`, and credential-shaped text are rejected.
- Back descriptor immutability and payload/column parity in SQLite triggers for audio policies, wake words, voice sessions, transcripts, and commands so raw SQL bypasses cannot claim live providers, alter lifecycle facts, or desynchronize serialized payloads from indexed columns.
- Expose the control plane through API routes, CLI parser semantics, and Mission Control `/voice-jarvis` with audio policy, wake word, sessions, transcript state, command facts, wake/interrupt/pause/resume/delete/export controls, responsive layout, and the no-external-connection boundary visible.

## Consequences

Operators can inspect and steer Voice/Jarvis control intent without enabling live audio or provider execution. The database backs the critical invariants even when callers bypass repositories with raw SQL, including append-only facts, session/run/workspace binding, transcript lifecycle policy, payload parity, guarded session transitions, idempotency safety, and normalized secret/path rejection.

The tradeoff is that C24 intentionally does not implement real voice runtime behavior. Future live audio/provider stages require a separate execution ADR covering explicit operator consent, microphone permission mediation, audio retention, voiceprint storage policy, provider credential mediation, rate limits, incident response, and external side-effect receipts.

## Rollback

Disable `/v1/voice-*` routes and remove Mission Control `/voice-jarvis` navigation first. Preserve migration 15 rows for audit/export before a planned rollback. Do not mutate or delete existing transcript or command facts outside a controlled migration rollback because they are append-only audit records.
