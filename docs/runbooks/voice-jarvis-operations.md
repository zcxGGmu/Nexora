# Voice/Jarvis Operations

Voice/Jarvis routes are local control-plane APIs. They record audio policy descriptors, wake word descriptors, voice session descriptors, transcript descriptors, and voice command facts. They do not read microphones, play speaker audio, call STT/VAD/TTS providers, store voiceprints, connect MCP tools, read credentials, or send external messages.

## Inspect sessions

```bash
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/voice-sessions?workspace_id=$WORKSPACE_ID"
```

Use session detail when checking audio policy, wake word, transcript facts, and command facts:

```bash
curl -fsS -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  "http://127.0.0.1:4310/v1/voice-sessions/$VOICE_SESSION_ID?workspace_id=$WORKSPACE_ID"
```

Reads require `run:read`. The detail projection includes the current voice session revision used by `If-Match` on wake, interrupt, pause, resume, delete transcript, and export transcript commands.

## Register descriptors

All C24 writes require Owner workspace authority and a safe `Idempotency-Key`. Do not put `secret://`, raw paths, bearer tokens, provider URLs, credential names, or audio file paths in the idempotency key because accepted responses echo it as a command id.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: voice:session:$REQUEST_ID" \
  --data @voice-session.json \
  "http://127.0.0.1:4310/v1/voice-sessions"
```

Transcript descriptors must start as `retained`, be redacted, carry `audio_ref: null`, and use safe `artifact://` refs for transcript artifacts. Initial delete/export lifecycle states are rejected.

Voice session descriptors must be registered at the inert baseline: `idle`, `turn_count = 0`, `current_transcript_id: null`, and `interrupted_at: null`. Registering an already active, paused, interrupted, or transcript-bound session is rejected because C24 cannot claim live audio capture or provider progress.

## Command sessions

Wake, interrupt, pause, and resume are descriptor-only state transitions on local voice session records. They require `If-Match` and do not control a live microphone, speaker, provider, or assistant runtime.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: voice:pause:$REQUEST_ID" \
  -H "If-Match: $VOICE_SESSION_REVISION" \
  --data '{"schema_version":1,"workspace_id":"'$WORKSPACE_ID'","run_id":"'$RUN_ID'","kind":"pause","reason":"operator pause","descriptor_only":true}' \
  "http://127.0.0.1:4310/v1/voice-sessions/$VOICE_SESSION_ID/pause"
```

Valid transitions include idle to active/paused/stopped/error, active to idle/paused/interrupted/stopped/error, paused to idle/active/stopped/error, interrupted to active/paused/stopped/error, and error to stopped. Stopped sessions are terminal.

Every state change must correspond to an append-only voice command fact for the same workspace, voice session, and run. Direct database updates that try to wake, pause, interrupt, or resume without a matching command are rejected; `resume` is only valid from `paused` or `interrupted`, never from a forged idle session.

`current_transcript_id` can only be assigned after the transcript exists for the same workspace, voice session, and run. Use it as a pointer to an already recorded transcript descriptor, not as a client-supplied future placeholder.

## Transcript lifecycle

Delete and export requests append command facts. They do not mutate transcript rows. The visible transcript lifecycle is derived from the first matching lifecycle command fact.

```bash
curl -fsS -X POST -H "Authorization: Bearer $NEXORA_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: voice:delete:$REQUEST_ID" \
  -H "If-Match: $VOICE_SESSION_REVISION" \
  --data '{"schema_version":1,"workspace_id":"'$WORKSPACE_ID'","voice_session_id":"'$VOICE_SESSION_ID'","run_id":"'$RUN_ID'","kind":"delete_transcript","reason":"operator lifecycle request","descriptor_only":true}' \
  "http://127.0.0.1:4310/v1/voice-transcripts/$TRANSCRIPT_ID/delete"
```

If delete or export is disabled by the attached audio policy, the command is rejected. A transcript that already has a delete/export lifecycle command rejects later conflicting lifecycle commands.

## Safety checks

Before marking a Voice/Jarvis incident or stage complete, verify:

- Audio policy remains microphone disabled, speaker disabled, VAD/STT/TTS descriptor-only, audio retention zero, and voiceprint storage disabled.
- Reads require `run:read`; writes require Owner workspace authority.
- Session and transcript commands reject missing or stale `If-Match` values.
- Idempotency replay returns the original command only when request semantics match, and changed replay returns `IDEMPOTENCY_KEY_REUSED`.
- Voice sessions bind to the same workspace, run, and gateway session; transcripts and commands bind to the same workspace, run, voice session, and transcript.
- Initial voice sessions are idle, zero-turn, have no current transcript, and cannot mutate name, locale, interaction budget, deadline, descriptor-only flag, schema version, audio policy, wake word, run, or gateway session after registration.
- Session state changes are command-backed, and raw SQL updates cannot forge wake/pause/interrupt/resume status changes without matching command facts.
- Transcript and command rows are append-only; lifecycle is derived from command facts.
- Raw SQL bypass attempts reject unsafe transcript refs, nested schemes, whitespace, empty artifact paths, traversal, backslashes, percent-encoded markers, default-ignorable characters, `secret://`, credential-shaped text, and payload/column drift across audio policy, wake word, session, transcript, and command descriptors.
- Mission Control `/voice-jarvis?workspace=ws-demo` shows audio policy, wake word, sessions, transcripts, command facts, real DOM controls, five mobile nav items, no overflow, and the no-external-connection/no-microphone boundary.

## Current limitations

- C24 does not read live microphone input or speaker output.
- C24 does not call STT, VAD, TTS, wake word, assistant, API provider, or MCP runtimes.
- C24 does not persist audio, voiceprints, live transcripts, credentials, or provider endpoints.
- Transcript refs are redacted artifact descriptors only; actual transcript artifact creation remains outside this stage.
- Future live Voice/Jarvis adapters require separate consent, sandboxing, provider credential mediation, retention policy, and external side-effect receipts before execution is enabled.
