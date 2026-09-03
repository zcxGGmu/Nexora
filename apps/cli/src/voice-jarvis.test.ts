import { describe, expect, it } from "vitest";
import { parseNexoraCliCommand } from "./index.js";
import { parseVoiceJarvisCommand } from "./voice-jarvis.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  gatewaySession: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  voiceSession: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  transcript: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
};

describe("C24 Voice/Jarvis CLI control semantics", () => {
  it("Given /voice session When parsed Then it creates a descriptor-only Jarvis wall session request", () => {
    const parsed = parseVoiceJarvisCommand(`/voice session start --workspace ${IDS.workspace} --session ${IDS.voiceSession} --run ${IDS.run} --gateway-session ${IDS.gatewaySession} --policy voice-policy-c24-jarvis --wake-word wake-word-c24-jarvis --name "Jarvis Wall" --mode wall --locale en-US --max-turns 12 --max-transcript-chars 20000 --deadline 2026-09-03T05:00:00.000Z --idempotency-key voice:session:c24`);

    expect(parsed).toEqual({
      method: "POST",
      path: "/v1/voice-sessions",
      headers: { "idempotency-key": "voice:session:c24" },
      body: expect.objectContaining({ id: IDS.voiceSession, workspace_id: IDS.workspace, run_id: IDS.run, mode: "wall", descriptor_only: true }),
      descriptor_only: true,
    });
  });

  it("Given /jarvis interrupt and transcript commands When parsed Then If-Match and transcript lifecycle semantics are explicit", () => {
    const interrupt = parseVoiceJarvisCommand(`/jarvis interrupt ${IDS.voiceSession} --workspace ${IDS.workspace} --run ${IDS.run} --reason "Stop speaking" --if-match 1 --idempotency-key jarvis:interrupt:c24`);
    const deletion = parseVoiceJarvisCommand(`/voice transcript delete ${IDS.transcript} --workspace ${IDS.workspace} --session ${IDS.voiceSession} --run ${IDS.run} --reason "Delete transcript" --if-match 2 --idempotency-key voice:delete:c24`);
    const exportCommand = parseVoiceJarvisCommand(`/voice transcript export ${IDS.transcript} --workspace ${IDS.workspace} --session ${IDS.voiceSession} --run ${IDS.run} --reason "Export transcript" --if-match 2 --idempotency-key voice:export:c24`);

    expect(interrupt).toEqual({ method: "POST", path: `/v1/voice-sessions/${IDS.voiceSession}/interrupt`, headers: { "idempotency-key": "jarvis:interrupt:c24", "if-match": "1" }, body: { schema_version: 1, workspace_id: IDS.workspace, run_id: IDS.run, kind: "interrupt", reason: "Stop speaking", descriptor_only: true }, descriptor_only: true });
    expect(deletion).toMatchObject({ method: "POST", path: `/v1/voice-transcripts/${IDS.transcript}/delete`, headers: { "if-match": "2" }, body: { voice_session_id: IDS.voiceSession, kind: "delete_transcript", descriptor_only: true } });
    expect(exportCommand).toMatchObject({ method: "POST", path: `/v1/voice-transcripts/${IDS.transcript}/export`, body: { kind: "export_transcript", descriptor_only: true } });
  });

  it("Given root parser sees voice or jarvis commands Then it routes them to C24 parser", () => {
    expect(parseNexoraCliCommand(`/voice pause ${IDS.voiceSession} --workspace ${IDS.workspace} --run ${IDS.run} --reason "Pause listening" --if-match 3 --idempotency-key voice:pause:c24`)).toMatchObject({ path: `/v1/voice-sessions/${IDS.voiceSession}/pause`, descriptor_only: true });
    expect(parseNexoraCliCommand(`/jarvis resume ${IDS.voiceSession} --workspace ${IDS.workspace} --run ${IDS.run} --reason "Resume listening" --if-match 4 --idempotency-key jarvis:resume:c24`)).toMatchObject({ path: `/v1/voice-sessions/${IDS.voiceSession}/resume`, descriptor_only: true });
  });

  it("Given microphone provider or credential flags When parsed Then CLI rejects before command construction", () => {
    expect(() => parseVoiceJarvisCommand(`/voice session start --workspace ${IDS.workspace} --session ${IDS.voiceSession} --run ${IDS.run} --gateway-session ${IDS.gatewaySession} --policy voice-policy-c24-jarvis --wake-word wake-word-c24-jarvis --microphone live --idempotency-key voice:session:mic`)).toThrow(/microphone|audio|provider|descriptor-only/i);
    expect(() => parseVoiceJarvisCommand(`/jarvis interrupt ${IDS.voiceSession} --workspace ${IDS.workspace} --run ${IDS.run} --credential secret://voice/live --if-match 1 --idempotency-key jarvis:secret:c24`)).toThrow(/credential|secret|descriptor-only/i);
    expect(() => parseVoiceJarvisCommand(`/voice transcript export ${IDS.transcript} --workspace ${IDS.workspace} --session ${IDS.voiceSession} --run ${IDS.run} --reason "token=abcd1234" --if-match 2 --idempotency-key voice:export:secret`)).toThrow(/secret|credential/i);
  });
});
