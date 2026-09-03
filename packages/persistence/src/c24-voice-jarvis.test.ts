import { describe, expect, it } from "vitest";
import { CORE_MIGRATION_VERSION, CORE_TABLES, migrate, openDatabase, type SqliteDatabase } from "./index.js";
import {
  AudioPolicyRepository,
  VoiceCommandRepository,
  VoiceSessionRepository,
  VoiceTranscriptRepository,
  WakeWordRepository,
} from "./repositories/index.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  otherWorkspace: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  otherRun: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  gatewaySession: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  otherGatewaySession: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  voiceSession: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
  otherVoiceSession: "01KRZ3NDEKTSV4RRFFQ69K5FAV",
  transcript: "01NRZ3NDEKTSV4RRFFQ69N5FAV",
  command: "01MRZ3NDEKTSV4RRFFQ69M5FAV",
  policy: "voice-policy-c24-jarvis",
  noExportPolicy: "voice-policy-c24-no-export",
  wakeWord: "wake-word-c24-jarvis",
};

const TIME = "2026-09-03T04:00:00.000Z";
const LATER = "2026-09-03T04:05:00.000Z";
const DEADLINE = "2026-09-03T05:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("C24 voice and Jarvis persistence", () => {
  it("Given migrations run When schema is validated Then C24 tables and migration version 15 exist", () => {
    const database = openDatabase(":memory:");
    try {
      migrate(database, { now: () => TIME });
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row["name"]);
      const triggers = database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all().map((row) => row["name"]);

      expect(CORE_MIGRATION_VERSION).toBeGreaterThanOrEqual(15);
      expect(CORE_TABLES).toEqual(expect.arrayContaining(["voice_audio_policies", "voice_wake_words", "voice_sessions", "voice_transcripts", "voice_commands"]));
      expect(tables).toEqual(expect.arrayContaining(["voice_audio_policies", "voice_wake_words", "voice_sessions", "voice_transcripts", "voice_commands"]));
      expect(triggers).toEqual(expect.arrayContaining(["c24_voice_transcripts_no_update", "c24_voice_commands_no_update", "c24_voice_sessions_guarded_update"]));
      expect(triggers).toEqual(expect.arrayContaining(["c24_voice_sessions_payload_json_insert", "c24_voice_transcripts_scope_insert", "c24_voice_commands_transcript_scope_insert"]));
      expect(triggers).toEqual(expect.arrayContaining(["c24_voice_audio_policies_payload_json_insert", "c24_voice_wake_words_payload_json_insert", "c24_voice_sessions_current_transcript_scope_update"]));
      expect(triggers).toEqual(expect.arrayContaining(["c24_voice_audio_policies_no_update", "c24_voice_wake_words_no_update", "c24_voice_sessions_command_backing_update"]));
    } finally {
      database.close();
    }
  });

  it("Given a scoped run and gateway session When voice records are created Then repositories return typed descriptor-only facts", () => {
    withDatabase((database) => {
      const policies = new AudioPolicyRepository(database);
      const sessions = new VoiceSessionRepository(database);
      policies.create(audioPolicy());
      new WakeWordRepository(database).create(wakeWord());

      const session = sessions.create(voiceSession());
      new VoiceCommandRepository(database).record({ ...voiceCommand(), kind: "pause", idempotency_key: "voice:pause:c24", reason: "Operator paused descriptor-only Jarvis." });
      const paused = sessions.update({ ...session, status: "paused", updated_at: LATER }, 1);

      expect(session).toMatchObject({ id: IDS.voiceSession, run_id: IDS.run, gateway_session_id: IDS.gatewaySession, descriptor_only: true });
      expect(paused).toMatchObject({ status: "paused", revision: 2 });
      expect(sessions.get(IDS.workspace, IDS.voiceSession)).toMatchObject({ status: "paused", revision: 2 });
      expect(() => sessions.update({ ...paused, status: "active", updated_at: LATER }, 1)).toThrow(/version|conflict/i);
    });
  });

  it("Given transcripts and commands When recorded Then they are append-only facts", () => {
    withDatabase((database) => {
      seedVoiceSession(database);
      const transcripts = new VoiceTranscriptRepository(database);
      const commands = new VoiceCommandRepository(database);
      const storedTranscript = transcripts.record(transcript());
      const storedCommand = commands.record(voiceCommand());

      expect(storedTranscript).toMatchObject({ id: IDS.transcript, audio_ref: null, redacted: true, descriptor_only: true });
      expect(storedCommand).toMatchObject({ command: { command_id: IDS.command, kind: "interrupt", descriptor_only: true }, replayed: false });
      expect(() => database.prepare("UPDATE voice_transcripts SET lifecycle_status = 'deleted' WHERE id = ?").run(IDS.transcript)).toThrow(/append|update|abort|constraint/i);
      expect(() => database.prepare("DELETE FROM voice_transcripts WHERE id = ?").run(IDS.transcript)).toThrow(/append|delete|abort|constraint/i);
      expect(() => database.prepare("UPDATE voice_commands SET kind = 'resume' WHERE command_id = ?").run(IDS.command)).toThrow(/append|update|abort|constraint/i);
      expect(() => database.prepare("DELETE FROM voice_commands WHERE command_id = ?").run(IDS.command)).toThrow(/append|delete|abort|constraint/i);
    });
  });

  it("Given lifecycle commands When policy disables delete or export Then repository and raw SQL reject them", () => {
    withDatabase((database) => {
      seedVoiceSession(database);
      new VoiceTranscriptRepository(database).record(transcript());
      const commands = new VoiceCommandRepository(database);

      expect(commands.record({ ...voiceCommand(), kind: "delete_transcript", transcript_id: IDS.transcript })).toMatchObject({ command: { kind: "delete_transcript" }, replayed: false });
      expect(new VoiceTranscriptRepository(database).get(IDS.workspace, IDS.transcript)).toMatchObject({ lifecycle_status: "delete_requested" });
      expect(() => commands.record({ ...voiceCommand(), command_id: "01NRZ3NDEKTSV4RRFFQ69N5FAV", kind: "export_transcript", transcript_id: IDS.transcript, idempotency_key: "voice:export:c24" })).toThrow(/lifecycle|final|already|constraint/i);
      expect(() => insertRawVoiceCommand(database, { ...voiceCommand(), command_id: "01PRZ3NDEKTSV4RRFFQ69P5FAV", kind: "export_transcript", transcript_id: IDS.transcript, idempotency_key: "voice:raw-export:c24" })).toThrow(/lifecycle|already|abort|constraint/i);

      new AudioPolicyRepository(database).create({ ...audioPolicy(), id: IDS.noExportPolicy, retention: { ...retentionPolicy(), deletion_allowed: false, export_allowed: false } });
      new VoiceSessionRepository(database).create({ ...voiceSession(), id: IDS.otherVoiceSession, audio_policy_id: IDS.noExportPolicy, gateway_session_id: IDS.otherGatewaySession, run_id: IDS.otherRun, wake_word_id: IDS.wakeWord });
      new VoiceTranscriptRepository(database).record({ ...transcript(), id: "01PRZ3NDEKTSV4RRFFQ69P5FAV", voice_session_id: IDS.otherVoiceSession, run_id: IDS.otherRun });

      expect(() => commands.record({ ...voiceCommand(), command_id: "01QRZ3NDEKTSV4RRFFQ69Q5FAV", voice_session_id: IDS.otherVoiceSession, run_id: IDS.otherRun, kind: "delete_transcript", transcript_id: "01PRZ3NDEKTSV4RRFFQ69P5FAV", idempotency_key: "voice:delete:disabled" })).toThrow(/delete|policy|disabled|constraint/i);
      expect(() => insertRawVoiceCommand(database, { ...voiceCommand(), command_id: "01RRZ3NDEKTSV4RRFFQ69R5FAV", voice_session_id: IDS.otherVoiceSession, run_id: IDS.otherRun, kind: "export_transcript", transcript_id: "01PRZ3NDEKTSV4RRFFQ69P5FAV", idempotency_key: "voice:export:disabled" })).toThrow(/export|policy|disabled|abort|constraint/i);
    });
  });

  it("Given initial transcripts When lifecycle state is forged Then repository and raw SQL reject it", () => {
    withDatabase((database) => {
      seedVoiceSession(database);
      const transcripts = new VoiceTranscriptRepository(database);

      expect(() => transcripts.record({ ...transcript(), lifecycle_status: "delete_requested" })).toThrow(/initial|retained|constraint/i);
      expect(() => insertRawTranscript(database, { ...transcript(), id: "01XRZ3NDEKTSV4RRFFQ69X5FAV", lifecycle_status: "export_requested" })).toThrow(/initial|retained|abort|constraint/i);
    });
  });

  it("Given raw SQL secret-shaped voice facts When inserted Then database redaction parity rejects them", () => {
    withDatabase((database) => {
      expect(() => insertRawAudioPolicy(database, { ...audioPolicy(), id: "voice-policy-c24-secret", name: "secret://voice/live-token" })).toThrow(/secret|safe|abort|constraint/i);
      expect(() => insertRawWakeWord(database, { ...wakeWord(), id: "wake-word-c24-secret", phrase: "jarvis token=abcd1234" })).toThrow(/secret|safe|abort|constraint/i);
      seedVoiceSession(database);

      expect(() => insertRawVoiceSession(database, { ...voiceSession(), id: "01ZRZ3NDEKTSV4RRFFQ69Z5FAV", name: "secret://voice/live-token" })).toThrow(/secret|safe|abort|constraint/i);
      expect(() => insertRawTranscript(database, { ...transcript(), id: "01XRZ3NDEKTSV4RRFFQ69X5FAV", transcript_ref: "secret://voice/live-token" })).toThrow(/secret|safe|abort|constraint/i);
      expect(() => insertRawTranscript(database, { ...transcript(), id: "01YRZ3NDEKTSV4RRFFQ69Y5FAV", transcript_ref: "artifact://transcripts/c24/token%3Dabcd1234.json" })).toThrow(/secret|safe|abort|constraint/i);
      expect(() => insertRawVoiceCommand(database, { ...voiceCommand(), command_id: "01XRZ3NDEKTSV4RRFFQ69X5FAV", idempotency_key: "voice:token%3Dabcd1234" })).toThrow(/secret|safe|abort|constraint/i);
      expect(() => insertRawVoiceCommand(database, { ...voiceCommand(), command_id: "01YRZ3NDEKTSV4RRFFQ69Y5FAV", reason: "api_key=abcd1234" })).toThrow(/secret|safe|abort|constraint/i);
    });
  });

  it("Given reviewer bypass examples When inserted through raw SQL Then transcript artifact grammar is enforced", () => {
    withDatabase((database) => {
      seedVoiceSession(database);

      const invalidTranscriptRefs = [
        { id: "01VZZ3NDEKTSV4RRFFQ69A5FA0", transcript_ref: "artifact://transcripts/c24/t%6fken=abcd1234.json" },
        { id: "01VZZ3NDEKTSV4RRFFQ69A5FA1", transcript_ref: "artifact://transcripts/c24/t%256fken=abcd1234.json" },
        { id: "01VZZ3NDEKTSV4RRFFQ69A5FA2", transcript_ref: "artifact://https://example.com/private.json" },
        { id: "01VZZ3NDEKTSV4RRFFQ69A5FA3", transcript_ref: "artifact://transcripts/c24/has space.json" },
        { id: "01VZZ3NDEKTSV4RRFFQ69A5FA4", transcript_ref: "artifact://" },
        { id: "01VZZ3NDEKTSV4RRFFQ69A5FA5", transcript_ref: "artifact://transcripts/c24/../secret.json" },
        { id: "01VZZ3NDEKTSV4RRFFQ69A5FA6", transcript_ref: "artifact://transcripts\\c24\\raw.json" },
        { id: "01VZZ3NDEKTSV4RRFFQ69A5FA7", transcript_ref: "artifact:///transcripts/c24/raw.json" },
        { id: "01VZZ3NDEKTSV4RRFFQ69A5FA8", transcript_ref: "artifact://transcripts/c24/." },
      ];

      for (const invalidRef of invalidTranscriptRefs) {
        expect(() => insertRawTranscript(database, { ...transcript(), id: invalidRef.id, transcript_ref: invalidRef.transcript_ref })).toThrow(/artifact|path|secret|safe|abort|constraint/i);
      }
    });
  });

  it("Given normalized secret markers When inserted through raw SQL Then every C24 text surface rejects them", () => {
    withDatabase((database) => {
      expect(() => insertRawAudioPolicy(database, { ...audioPolicy(), id: "voice-policy-c24-obfuscated-payload", note: "client%5fsecret=abcd1234" })).toThrow(/secret|safe|normalized|abort|constraint/i);
      expect(() => insertRawWakeWord(database, { ...wakeWord(), id: "wake-word-c24-obfuscated-phrase", phrase: "jarvis api\u200b_key=abcd1234" })).toThrow(/secret|safe|normalized|abort|constraint/i);
      seedVoiceSession(database);

      expect(() => insertRawVoiceSession(database, { ...voiceSession(), id: "01VZZ3NDEKTSV4RRFFQ69A5FA9", operator_note: "t%6fken=abcd1234" })).toThrow(/secret|safe|normalized|abort|constraint/i);
      expect(() => insertRawTranscript(database, { ...transcript(), id: "01WZZ3NDEKTSV4RRFFQ69A5FA0", review_note: "api\u200b_key=abcd1234" })).toThrow(/secret|safe|normalized|abort|constraint/i);
      expect(() => insertRawVoiceCommand(database, { ...voiceCommand(), command_id: "01WZZ3NDEKTSV4RRFFQ69A5FA1", idempotency_key: "voice:t%6fken=abcd1234" })).toThrow(/secret|safe|normalized|abort|constraint/i);
      expect(() => insertRawVoiceCommand(database, { ...voiceCommand(), command_id: "01WZZ3NDEKTSV4RRFFQ69A5FA2", reason: "api\u200b_key=abcd1234" })).toThrow(/secret|safe|normalized|abort|constraint/i);
      expect(() => insertRawVoiceCommand(database, { ...voiceCommand(), command_id: "01WZZ3NDEKTSV4RRFFQ69A5FA3", payload_marker: "secret%3a//voice/live-token" })).toThrow(/secret|safe|normalized|abort|constraint/i);
    });
  });

  it("Given repeated command idempotency keys When payload is identical Then replay is safe and conflicts are rejected", () => {
    withDatabase((database) => {
      seedVoiceSession(database);
      const commands = new VoiceCommandRepository(database);

      expect(commands.record(voiceCommand())).toMatchObject({ command: { command_id: IDS.command }, replayed: false });
      expect(commands.record(voiceCommand())).toMatchObject({ command: { command_id: IDS.command }, replayed: true });
      expect(() => commands.record({ ...voiceCommand(), command_id: "01SRZ3NDEKTSV4RRFFQ69S5FAV", reason: "Different interrupt reason." })).toThrow(/idempotency|conflict|reused/i);
    });
  });

  it("Given raw SQL bypass attempts When scope differs Then session transcript and command rows are rejected", () => {
    withDatabase((database) => {
      seedVoiceSession(database);
      new VoiceTranscriptRepository(database).record(transcript());

      expect(() => insertRawVoiceSession(database, { ...voiceSession(), run_id: IDS.otherRun })).toThrow(/scope|run|gateway|foreign|abort|constraint/i);
      expect(() => insertRawTranscript(database, { ...transcript(), run_id: IDS.otherRun })).toThrow(/scope|run|session|abort|constraint/i);
      expect(() => insertRawVoiceCommand(database, { ...voiceCommand(), transcript_id: IDS.transcript, voice_session_id: IDS.otherVoiceSession })).toThrow(/scope|session|transcript|abort|constraint/i);
      expect(() => insertRawVoiceCommand(database, { ...voiceCommand(), workspace_id: IDS.otherWorkspace })).toThrow(/scope|workspace|foreign|abort|constraint/i);
    });
  });

  it("Given raw SQL side-effect claims When inserted Then descriptor-only audio boundaries are enforced", () => {
    withDatabase((database) => {
      expect(() => insertRawAudioPolicy(database, { ...audioPolicy(), microphone_mode: "enabled" })).toThrow(/microphone|descriptor|policy|abort|constraint/i);
      expect(() => insertRawAudioPolicy(database, { ...audioPolicy(), descriptor_only: false })).toThrow(/descriptor|policy|abort|constraint/i);
      new AudioPolicyRepository(database).create(audioPolicy());
      new WakeWordRepository(database).create(wakeWord());
      expect(() => insertRawVoiceSession(database, { ...voiceSession(), input_audio_ref: "file:///tmp/live.wav" })).toThrow(/audio|descriptor|secret|normalized|abort|constraint/i);
      new VoiceSessionRepository(database).create(voiceSession());
      expect(() => insertRawTranscript(database, { ...transcript(), audio_ref: "artifact://audio/c24/raw.wav" })).toThrow(/audio|descriptor|abort|constraint/i);
      expect(() => insertRawVoiceCommand(database, { ...voiceCommand(), descriptor_only: false })).toThrow(/descriptor|command|abort|constraint/i);
    });
  });

  it("Given raw descriptor payload drift When audio policy or wake word is inserted Then payload parity blocks provider claims", () => {
    withDatabase((database) => {
      expect(() => insertRawAudioPolicy(database, { ...audioPolicy(), id: "voice-policy-c24-speaker-drift", speaker_mode: "enabled" })).toThrow(/payload|parity|abort|constraint/i);
      expect(() => insertRawAudioPolicy(database, { ...audioPolicy(), id: "voice-policy-c24-stt-drift", stt_mode: "provider_live" })).toThrow(/payload|parity|abort|constraint/i);
      expect(() => insertRawWakeWord(database, { ...wakeWord(), id: "wake-word-c24-local-drift", local_only: false })).toThrow(/payload|parity|abort|constraint/i);
      expect(() => insertRawWakeWord(database, { ...wakeWord(), id: "wake-word-c24-consent-drift", consent_required: false })).toThrow(/payload|parity|abort|constraint/i);
    });
  });

  it("Given raw descriptor updates When policy payload is changed Then audio policy and wake word facts remain immutable", () => {
    withDatabase((database) => {
      new AudioPolicyRepository(database).create(audioPolicy());
      new WakeWordRepository(database).create(wakeWord());

      expect(() => database.prepare("UPDATE voice_audio_policies SET payload_json = ? WHERE workspace_id = ? AND id = ?").run(JSON.stringify({ ...audioPolicy(), speaker_mode: "enabled" }), IDS.workspace, IDS.policy)).toThrow(/append|immutable|update|abort|constraint/i);
      expect(() => database.prepare("UPDATE voice_wake_words SET payload_json = ? WHERE workspace_id = ? AND id = ?").run(JSON.stringify({ ...wakeWord(), local_only: false }), IDS.workspace, IDS.wakeWord)).toThrow(/append|immutable|update|abort|constraint/i);
    });
  });

  it("Given voice session creation When initial state is already advanced Then repository and raw SQL reject it", () => {
    withDatabase((database) => {
      new AudioPolicyRepository(database).create(audioPolicy());
      new WakeWordRepository(database).create(wakeWord());
      const sessions = new VoiceSessionRepository(database);

      expect(() => sessions.create({ ...voiceSession(), status: "active" })).toThrow(/initial|idle|turn|transcript|constraint/i);
      expect(() => sessions.create({ ...voiceSession(), turn_count: 1 })).toThrow(/initial|idle|turn|transcript|constraint/i);
      expect(() => sessions.create({ ...voiceSession(), status: "interrupted", interrupted_at: LATER })).toThrow(/initial|idle|turn|transcript|constraint/i);
      expect(() => insertRawVoiceSession(database, { ...voiceSession(), id: "01TRZ3NDEKTSV4RRFFQ69T5FAV", status: "active" })).toThrow(/initial|idle|turn|transcript|abort|constraint/i);
      expect(() => insertRawVoiceSession(database, { ...voiceSession(), id: "01URZ3NDEKTSV4RRFFQ69U5FAV", turn_count: 1 })).toThrow(/initial|idle|turn|transcript|abort|constraint/i);
    });
  });

  it("Given voice session creation When current transcript is prefilled Then repository and raw SQL reject it", () => {
    withDatabase((database) => {
      new AudioPolicyRepository(database).create(audioPolicy());
      new WakeWordRepository(database).create(wakeWord());
      const sessions = new VoiceSessionRepository(database);

      expect(() => sessions.create({ ...voiceSession(), current_transcript_id: "01LRZ3NDEKTSV4RRFFQ69L5FAV" })).toThrow(/current|transcript|initial|null|constraint/i);
      expect(() => insertRawVoiceSession(database, { ...voiceSession(), id: "01TRZ3NDEKTSV4RRFFQ69T5FAV", current_transcript_id: "01LRZ3NDEKTSV4RRFFQ69L5FAV" })).toThrow(/current|transcript|initial|null|abort|constraint/i);
    });
  });

  it("Given voice session updates When immutable facts or secret payload drift are attempted Then updates are rejected", () => {
    withDatabase((database) => {
      seedVoiceSession(database);
      const sessions = new VoiceSessionRepository(database);
      const session = sessions.get(IDS.workspace, IDS.voiceSession);
      expect(session).toBeDefined();
      if (session === undefined) return;

      expect(() => sessions.update({ ...session, name: "Renamed Jarvis session", updated_at: LATER }, 1)).toThrow(/immutable|version|conflict/i);
      expect(() => sessions.update({ ...session, locale: "fr-FR", updated_at: LATER }, 1)).toThrow(/immutable|version|conflict/i);
      expect(() => sessions.update({ ...session, interaction_budget: { max_turns: 24, max_transcript_chars: 20_000 }, updated_at: LATER }, 1)).toThrow(/immutable|version|conflict/i);
      expect(() => sessions.update({ ...session, deadline_at: "2026-09-03T06:00:00.000Z", updated_at: LATER }, 1)).toThrow(/immutable|version|conflict/i);
      expect(() => sessions.update({ ...session, status: "paused", updated_at: LATER }, 1)).toThrow(/command|append|constraint/i);

      expect(() => database.prepare("UPDATE voice_sessions SET status = 'paused', payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = 1").run(JSON.stringify({ ...voiceSession(), status: "paused", revision: 2, updated_at: LATER }), LATER, IDS.workspace, IDS.voiceSession)).toThrow(/command|append|abort|constraint/i);
      expect(() => database.prepare("UPDATE voice_sessions SET name = ?, payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = 1").run("secret://voice/live-token", JSON.stringify({ ...voiceSession(), name: "secret://voice/live-token", revision: 2, updated_at: LATER }), LATER, IDS.workspace, IDS.voiceSession)).toThrow(/secret|safe|normalized|guarded|abort|constraint/i);
    });
  });

  it("Given a raw resume command on an idle session When SQL updates state Then zero-turn active forgery is rejected", () => {
    withDatabase((database) => {
      seedVoiceSession(database);
      insertRawVoiceCommand(database, { ...voiceCommand(), command_id: "01VRZ3NDEKTSV4RRFFQ69V5FAV", kind: "resume", idempotency_key: "voice:resume:idle-bypass", reason: "Raw resume should not start idle session." });

      expect(() => database.prepare("UPDATE voice_sessions SET status = 'active', payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = 1").run(JSON.stringify({ ...voiceSession(), status: "active", revision: 2, updated_at: LATER }), LATER, IDS.workspace, IDS.voiceSession)).toThrow(/command|append|abort|constraint/i);
    });
  });

  it("Given current transcript updates When transcript scope differs Then repository and raw SQL reject the pointer", () => {
    withDatabase((database) => {
      seedVoiceSession(database);
      const sessions = new VoiceSessionRepository(database);
      const session = sessions.get(IDS.workspace, IDS.voiceSession);
      expect(session).toBeDefined();
      if (session === undefined) return;

      expect(() => sessions.update({ ...session, current_transcript_id: "01LRZ3NDEKTSV4RRFFQ69L5FAV", updated_at: LATER }, 1)).toThrow(/current|transcript|scope|constraint/i);
      new VoiceCommandRepository(database).record({ ...voiceCommand(), kind: "wake", idempotency_key: "voice:wake:invalid-current", reason: "Operator started descriptor-only Jarvis." });
      expect(() => database.prepare("UPDATE voice_sessions SET status = 'active', turn_count = 1, current_transcript_id = ?, payload_json = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = 1").run("01LRZ3NDEKTSV4RRFFQ69L5FAV", JSON.stringify({ ...voiceSession(), status: "active", turn_count: 1, current_transcript_id: "01LRZ3NDEKTSV4RRFFQ69L5FAV", revision: 2, updated_at: LATER }), LATER, IDS.workspace, IDS.voiceSession)).toThrow(/current|transcript|scope|abort|constraint/i);
    });

    withDatabase((database) => {
      seedVoiceSession(database);
      new VoiceSessionRepository(database).create({ ...voiceSession(), id: IDS.otherVoiceSession, run_id: IDS.otherRun, gateway_session_id: IDS.otherGatewaySession });
      new VoiceTranscriptRepository(database).record({ ...transcript(), id: "01PRZ3NDEKTSV4RRFFQ69P5FAV", voice_session_id: IDS.otherVoiceSession, run_id: IDS.otherRun });
      const sessions = new VoiceSessionRepository(database);
      const session = sessions.get(IDS.workspace, IDS.voiceSession);
      expect(session).toBeDefined();
      if (session === undefined) return;

      expect(() => sessions.update({ ...session, current_transcript_id: "01PRZ3NDEKTSV4RRFFQ69P5FAV", updated_at: LATER }, 1)).toThrow(/current|transcript|scope|constraint/i);
    });

    withDatabase((database) => {
      seedVoiceSession(database);
      new VoiceTranscriptRepository(database).record(transcript());
      new VoiceCommandRepository(database).record({ ...voiceCommand(), kind: "wake", idempotency_key: "voice:wake:set-current", reason: "Operator started descriptor-only Jarvis." });
      const sessions = new VoiceSessionRepository(database);
      const session = sessions.get(IDS.workspace, IDS.voiceSession);
      expect(session).toBeDefined();
      if (session === undefined) return;

      expect(sessions.update({ ...session, status: "active", turn_count: 1, current_transcript_id: IDS.transcript, updated_at: LATER }, 1)).toMatchObject({ current_transcript_id: IDS.transcript, revision: 2 });
    });
  });

  it("Given command idempotency keys When reused in another session Then repository and raw SQL reject workspace-global replay", () => {
    withDatabase((database) => {
      seedVoiceSession(database);
      new VoiceSessionRepository(database).create({ ...voiceSession(), id: IDS.otherVoiceSession, run_id: IDS.otherRun, gateway_session_id: IDS.otherGatewaySession });
      const commands = new VoiceCommandRepository(database);

      commands.record(voiceCommand());

      expect(() => commands.record({ ...voiceCommand(), command_id: "01TRZ3NDEKTSV4RRFFQ69T5FAV", voice_session_id: IDS.otherVoiceSession, run_id: IDS.otherRun })).toThrow(/idempotency|reused|conflict|unique/i);
      expect(() => insertRawVoiceCommand(database, { ...voiceCommand(), command_id: "01URZ3NDEKTSV4RRFFQ69U5FAV", voice_session_id: IDS.otherVoiceSession, run_id: IDS.otherRun })).toThrow(/idempotency|unique|constraint/i);
    });
  });
});

function withDatabase(callback: (database: SqliteDatabase) => void): void {
  const database = openDatabase(":memory:");
  try {
    migrate(database, { now: () => TIME });
    seedRunAndGatewaySession(database);
    callback(database);
  } finally {
    database.close();
  }
}

function seedVoiceSession(database: SqliteDatabase): void {
  new AudioPolicyRepository(database).create(audioPolicy());
  new WakeWordRepository(database).create(wakeWord());
  new VoiceSessionRepository(database).create(voiceSession());
}

function seedRunAndGatewaySession(database: SqliteDatabase): void {
  const goal = { id: IDS.goal, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, title: "C24 goal", objective: "Validate Voice/Jarvis control-plane", definition_of_done: ["done"] };
  const ticket = { id: IDS.ticket, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, status: "ready", definition_of_done: ["done"], assigned_agents: [], approval_policy: { mode: "required" }, idempotency_key: "ticket:c24" };
  const run = { id: IDS.run, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, ticket_id: IDS.ticket, execution_location: "local", status: "running", budget: { max_tokens: 10_000, max_cost_usd: 10 }, memory_snapshot: { snapshot_id: IDS.workspace, version: 1 }, connector_versions: { deterministic: "1.0.0" } };
  const otherRun = { ...run, id: IDS.otherRun };
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'C24 workspace', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'C24 other workspace', 1, ?, ?)").run(IDS.otherWorkspace, TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(IDS.goal, IDS.workspace, goal.title, goal.objective, JSON.stringify(goal.definition_of_done), JSON.stringify(goal), TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'ready', ?, ?, 1, ?, ?)").run(IDS.ticket, IDS.workspace, IDS.goal, ticket.idempotency_key, JSON.stringify(ticket), TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.ticket, JSON.stringify(run), TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.otherRun, IDS.workspace, IDS.ticket, JSON.stringify(otherRun), TIME, TIME);
  database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES ('gateway-c24-voice', ?, 'Gateway C24 Voice', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME, TIME);
  database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES ('channel-c24-voice', ?, 'gateway-c24-voice', 'Channel C24 Voice', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'gateway-c24-voice', 'channel-c24-voice', NULL, ?, NULL, 'foreground', 'active', 'turn-1', NULL, ?, '{}', 1, ?, ?)").run(IDS.gatewaySession, IDS.workspace, IDS.run, TIME, TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'gateway-c24-voice', 'channel-c24-voice', NULL, ?, NULL, 'foreground', 'active', 'turn-1', NULL, ?, '{}', 1, ?, ?)").run(IDS.otherGatewaySession, IDS.workspace, IDS.otherRun, TIME, TIME, TIME);
}

function retentionPolicy(): object {
  return { transcript_retention_days: 30, audio_retention_days: 0, deletion_allowed: true, export_allowed: true, voiceprint_storage: "disabled" };
}

function audioPolicy(): object {
  return { id: IDS.policy, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, name: "C24 Jarvis descriptor-only audio policy", microphone_mode: "disabled", speaker_mode: "disabled", vad_mode: "descriptor_only", stt_mode: "descriptor_only", tts_mode: "descriptor_only", wake_word_mode: "consent_required", wall_mode: "descriptor_only", retention: retentionPolicy(), descriptor_only: true };
}

function wakeWord(): object {
  return { id: IDS.wakeWord, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, phrase: "jarvis", locale: "en-US", sensitivity: 0.65, consent_required: true, local_only: true, descriptor_only: true };
}

function voiceSession(): object {
  return { id: IDS.voiceSession, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, revision: 1, run_id: IDS.run, gateway_session_id: IDS.gatewaySession, audio_policy_id: IDS.policy, wake_word_id: IDS.wakeWord, name: "Jarvis wall mode control session", mode: "wall", status: "idle", locale: "en-US", turn_count: 0, interaction_budget: { max_turns: 12, max_transcript_chars: 20_000 }, deadline_at: DEADLINE, input_audio_ref: null, output_audio_ref: null, current_transcript_id: null, interrupted_at: null, descriptor_only: true };
}

function transcript(): object {
  return { id: IDS.transcript, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, voice_session_id: IDS.voiceSession, run_id: IDS.run, source_kind: "stt_descriptor", transcript_ref: "artifact://transcripts/c24/jarvis-turn-1.json", transcript_hash: HASH, audio_ref: null, redacted: true, lifecycle_status: "retained", expires_at: "2026-10-03T04:00:00.000Z", deleted_at: null, export_ref: null, descriptor_only: true };
}

function voiceCommand(): object {
  return { schema_version: 1, command_id: IDS.command, workspace_id: IDS.workspace, voice_session_id: IDS.voiceSession, run_id: IDS.run, kind: "interrupt", idempotency_key: "voice:interrupt:c24", expected_revision: 1, transcript_id: null, reason: "Operator interrupted a descriptor-only Jarvis turn.", descriptor_only: true, created_at: TIME };
}

function insertRawAudioPolicy(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO voice_audio_policies(id, workspace_id, name, microphone_mode, speaker_mode, vad_mode, stt_mode, tts_mode, wake_word_mode, wall_mode, retention_json, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'disabled', 'descriptor_only', 'descriptor_only', 'descriptor_only', 'consent_required', 'descriptor_only', ?, ?, ?, 1, ?, ?)").run(textProperty(payload, "id", IDS.policy), IDS.workspace, textProperty(payload, "name", "Raw audio policy"), textProperty(payload, "microphone_mode", "disabled"), JSON.stringify(retentionPolicy()), booleanFlag(payload, "descriptor_only", 1), JSON.stringify(payload), TIME, TIME);
}

function insertRawWakeWord(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO voice_wake_words(id, workspace_id, phrase, locale, sensitivity, consent_required, local_only, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'en-US', 0.65, 1, 1, 1, ?, 1, ?, ?)").run(textProperty(payload, "id", IDS.wakeWord), IDS.workspace, textProperty(payload, "phrase", "jarvis"), JSON.stringify(payload), TIME, TIME);
}

function insertRawVoiceSession(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO voice_sessions(id, workspace_id, run_id, gateway_session_id, audio_policy_id, wake_word_id, name, mode, status, locale, turn_count, interaction_budget_json, deadline_at, input_audio_ref, output_audio_ref, current_transcript_id, interrupted_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'en-US', ?, ?, ?, ?, NULL, ?, ?, 1, ?, 1, ?, ?)").run(textProperty(payload, "id", "01TRZ3NDEKTSV4RRFFQ69T5FAV"), IDS.workspace, textProperty(payload, "run_id", IDS.run), textProperty(payload, "gateway_session_id", IDS.gatewaySession), textProperty(payload, "audio_policy_id", IDS.policy), nullableTextProperty(payload, "wake_word_id"), textProperty(payload, "name", "Raw voice session"), textProperty(payload, "mode", "wall"), textProperty(payload, "status", "idle"), numberProperty(payload, "turn_count", 0), JSON.stringify({ max_turns: 12, max_transcript_chars: 20_000 }), DEADLINE, nullableTextProperty(payload, "input_audio_ref"), nullableTextProperty(payload, "current_transcript_id"), nullableTextProperty(payload, "interrupted_at"), JSON.stringify(payload), TIME, TIME);
}

function insertRawTranscript(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO voice_transcripts(id, workspace_id, voice_session_id, run_id, source_kind, transcript_ref, transcript_hash, audio_ref, redacted, lifecycle_status, expires_at, deleted_at, export_ref, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'stt_descriptor', ?, ?, ?, 1, ?, ?, NULL, NULL, 1, ?, 1, ?, ?)").run(textProperty(payload, "id", "01VRZ3NDEKTSV4RRFFQ69V5FAV"), textProperty(payload, "workspace_id", IDS.workspace), textProperty(payload, "voice_session_id", IDS.voiceSession), textProperty(payload, "run_id", IDS.run), textProperty(payload, "transcript_ref", "artifact://transcripts/c24/raw.json"), HASH, nullableTextProperty(payload, "audio_ref"), textProperty(payload, "lifecycle_status", "retained"), textProperty(payload, "expires_at", "2026-10-03T04:00:00.000Z"), JSON.stringify(payload), TIME, TIME);
}

function insertRawVoiceCommand(database: SqliteDatabase, payload: object): void {
  database.prepare("INSERT INTO voice_commands(command_id, workspace_id, voice_session_id, run_id, kind, idempotency_key, expected_revision, transcript_id, reason, descriptor_only, payload_json, schema_version, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 1, ?)").run(textProperty(payload, "command_id", "01WRZ3NDEKTSV4RRFFQ69W5FAV"), textProperty(payload, "workspace_id", IDS.workspace), textProperty(payload, "voice_session_id", IDS.voiceSession), textProperty(payload, "run_id", IDS.run), textProperty(payload, "kind", "interrupt"), textProperty(payload, "idempotency_key", "voice:raw:c24"), nullableTextProperty(payload, "transcript_id"), nullableTextProperty(payload, "reason"), booleanFlag(payload, "descriptor_only", 1), JSON.stringify(payload), TIME);
}

function textProperty(payload: object, key: string, fallback: string): string {
  const entry = Object.entries(payload).find(([entryKey]) => entryKey === key);
  if (entry === undefined) return fallback;
  const value = entry[1];
  return typeof value === "string" ? value : fallback;
}

function nullableTextProperty(payload: object, key: string): string | null {
  const entry = Object.entries(payload).find(([entryKey]) => entryKey === key);
  if (entry === undefined) return null;
  const value = entry[1];
  return typeof value === "string" ? value : null;
}

function booleanFlag(payload: object, key: string, fallback: number): number {
  const entry = Object.entries(payload).find(([entryKey]) => entryKey === key);
  if (entry === undefined) return fallback;
  return entry[1] === false ? 0 : 1;
}

function numberProperty(payload: object, key: string, fallback: number): number {
  const entry = Object.entries(payload).find(([entryKey]) => entryKey === key);
  if (entry === undefined) return fallback;
  const value = entry[1];
  return typeof value === "number" ? value : fallback;
}
