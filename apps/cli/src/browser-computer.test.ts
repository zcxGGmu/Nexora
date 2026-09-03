import { describe, expect, it } from "vitest";
import { parseBrowserComputerCommand } from "./browser-computer.js";
import { parseNexoraCliCommand } from "./index.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  gatewaySession: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  browserSession: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  action: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
};

describe("C23 Browser/Computer Use CLI control semantics", () => {
  it("Given /browser session When parsed Then it creates a descriptor-only browser session request", () => {
    const parsed = parseBrowserComputerCommand(`/browser session start --workspace ${IDS.workspace} --session ${IDS.browserSession} --run ${IDS.run} --gateway-session ${IDS.gatewaySession} --sandbox sandbox-c23-browser --name "Browser QA" --target browser://url/https/example.com/docs --idempotency-key browser:session:c23`);

    expect(parsed).toEqual({
      method: "POST",
      path: "/v1/browser-sessions",
      headers: { "idempotency-key": "browser:session:c23" },
      body: expect.objectContaining({ id: IDS.browserSession, workspace_id: IDS.workspace, run_id: IDS.run, descriptor_only: true }),
      descriptor_only: true,
    });
  });

  it("Given /browser action and /computer takeover When parsed Then commands carry approval and If-Match semantics", () => {
    const action = parseBrowserComputerCommand(`/browser action navigate --workspace ${IDS.workspace} --session ${IDS.browserSession} --action ${IDS.action} --run ${IDS.run} --target browser://url/https/example.com/docs --summary "Open approved docs" --approval 01FRZ3NDEKTSV4RRFFQ69G5FAV --idempotency-key browser:action:c23`);
    const takeover = parseBrowserComputerCommand(`/computer takeover ${IDS.browserSession} --workspace ${IDS.workspace} --reason "Manual operator takeover" --if-match 2 --idempotency-key computer:takeover:c23`);

    expect(action).toMatchObject({ method: "POST", path: "/v1/browser-actions", headers: { "idempotency-key": "browser:action:c23" }, body: { target_ref: "browser://url/https/example.com/docs", descriptor_only: true } });
    expect(takeover).toEqual({ method: "POST", path: `/v1/browser-sessions/${IDS.browserSession}/takeover`, headers: { "idempotency-key": "computer:takeover:c23", "if-match": "2" }, body: { schema_version: 1, workspace_id: IDS.workspace, kind: "takeover", reason: "Manual operator takeover", descriptor_only: true }, descriptor_only: true });
  });

  it("Given root parser sees browser or computer commands Then it routes them to C23 parser", () => {
    expect(parseNexoraCliCommand(`/browser stop ${IDS.browserSession} --workspace ${IDS.workspace} --reason "Stop safely" --if-match 3 --idempotency-key browser:stop:c23`)).toMatchObject({ path: `/v1/browser-sessions/${IDS.browserSession}/stop`, descriptor_only: true });
    expect(parseNexoraCliCommand(`/computer pause ${IDS.browserSession} --workspace ${IDS.workspace} --reason "Pause automation" --if-match 3 --idempotency-key computer:pause:c23`)).toMatchObject({ path: `/v1/browser-sessions/${IDS.browserSession}/pause`, descriptor_only: true });
  });

  it("Given external side-effect flags unsafe targets or credentials When parsed Then CLI rejects before command construction", () => {
    expect(() => parseBrowserComputerCommand(`/browser action navigate --workspace ${IDS.workspace} --session ${IDS.browserSession} --action ${IDS.action} --run ${IDS.run} --target browser://url/http/169.254.169.254/latest/meta-data --idempotency-key browser:action:ssrf`)).toThrow(/ssrf|allowlist|external|descriptor-only/i);
    expect(() => parseBrowserComputerCommand(`/browser action navigate --workspace ${IDS.workspace} --session ${IDS.browserSession} --action ${IDS.action} --run ${IDS.run} --target file:///Users/zq/private.txt --idempotency-key browser:action:path`)).toThrow(/path|external|descriptor-only/i);
    expect(() => parseBrowserComputerCommand(`/browser session start --workspace ${IDS.workspace} --session ${IDS.browserSession} --run ${IDS.run} --gateway-session ${IDS.gatewaySession} --sandbox sandbox-c23-browser --credential secret://browser/live --idempotency-key browser:session:secret`)).toThrow(/credential|secret|descriptor-only/i);
    expect(() => parseBrowserComputerCommand(`/computer takeover ${IDS.browserSession} --workspace ${IDS.workspace} --execute-real-click --if-match 2 --idempotency-key computer:takeover:real`)).toThrow(/external|side effect|descriptor-only/i);
    expect(() => parseBrowserComputerCommand(`/browser action navigate --workspace ${IDS.workspace} --session ${IDS.browserSession} --action ${IDS.action} --run ${IDS.run} --target browser://url/https/example.com/docs --idempotency-key browser:action:token=abcd1234`)).toThrow(/idempotency|secret|credential/i);
  });
});
