import { describe, expect, it } from "vitest";
import { parseLearningCommand } from "./skills-learning.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  goalLoop: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  event: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  version: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  rollbackVersion: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
};

describe("C21 Skills/Learning CLI control semantics", () => {
  it("Given /learn When parsed Then it creates a descriptor-only learning candidate request", () => {
    const parsed = parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh visual QA evidence is required" --diff "Add visual QA evidence rule" --evidence artifact://progress/c21/visual-qa.json --idempotency-key learn:c21:visual-qa`);

    expect(parsed).toEqual({
      method: "POST",
      path: "/v1/learning/candidates",
      headers: { "idempotency-key": "learn:c21:visual-qa" },
      body: {
        schema_version: 1,
        workspace_id: IDS.workspace,
        run_id: IDS.run,
        goal_loop_id: IDS.goalLoop,
        source_event_id: IDS.event,
        proposed_skill_id: "skill-visual-qa",
        lesson: "Fresh visual QA evidence is required",
        proposed_diff_summary: "Add visual QA evidence rule",
        evidence_refs: ["artifact://progress/c21/visual-qa.json"],
        descriptor_only: true,
      },
      descriptor_only: true,
    });
  });

  it("Given skill lifecycle commands When parsed Then they target control API routes with If-Match", () => {
    expect(parseLearningCommand(`/skill install skill-visual-qa --workspace ${IDS.workspace} --version ${IDS.version} --reason "Install approved snapshot" --if-match 1 --idempotency-key skill:install:c21`)).toEqual({
      method: "POST",
      path: "/v1/skills/skill-visual-qa/install",
      headers: { "idempotency-key": "skill:install:c21", "if-match": "1" },
      body: { schema_version: 1, workspace_id: IDS.workspace, version_id: IDS.version, reason: "Install approved snapshot" },
      descriptor_only: true,
    });
    expect(parseLearningCommand(`/skill approve skill-visual-qa --workspace ${IDS.workspace} --version ${IDS.version} --reason "Approve reviewed snapshot" --if-match 2 --idempotency-key skill:approve:c21`).path).toBe("/v1/skills/skill-visual-qa/approve");
    expect(parseLearningCommand(`/skill revoke skill-visual-qa --workspace ${IDS.workspace} --version ${IDS.version} --installation-revision 1 --reason "Revoke stale snapshot" --if-match 3 --idempotency-key skill:revoke:c21`).path).toBe("/v1/skills/skill-visual-qa/revoke");
    expect(parseLearningCommand(`/skill quarantine skill-visual-qa --workspace ${IDS.workspace} --version ${IDS.version} --installation-revision 2 --reason "Critical scan finding" --if-match 4 --idempotency-key skill:quarantine:c21`).path).toBe("/v1/skills/skill-visual-qa/quarantine");
    expect(parseLearningCommand(`/skill rollback skill-visual-qa --workspace ${IDS.workspace} --version ${IDS.version} --installation-revision 3 --rollback-to ${IDS.rollbackVersion} --reason "Restore approved snapshot" --if-match 5 --idempotency-key skill:rollback:c21`)).toMatchObject({
      path: "/v1/skills/skill-visual-qa/rollback",
      body: { installation_revision: 3, rollback_to_version_id: IDS.rollbackVersion },
    });
  });

  it("Given rollback-only flags on non-rollback actions When parsed Then CLI rejects the unused lifecycle target", () => {
    expect(() => parseLearningCommand(`/skill install skill-visual-qa --workspace ${IDS.workspace} --version ${IDS.version} --rollback-to ${IDS.rollbackVersion} --reason "Install approved snapshot" --if-match 1 --idempotency-key skill:install:c21:rollback-flag`)).toThrow(/rollback-to|rollback/i);
  });

  it("Given local or external read flags When parsed Then descriptor-only CLI rejects them", () => {
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --url https://example.com/SKILL.md`)).toThrow(/external|descriptor-only/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --source file:///Users/zq/private/SKILL.md`)).toThrow(/external|descriptor-only/i);
    expect(() => parseLearningCommand(`/skill install skill-visual-qa --workspace ${IDS.workspace} --version ${IDS.version} --mcp real-server --if-match 1 --idempotency-key skill:install:c21`)).toThrow(/external|descriptor-only/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --lesson "Store token=abcd1234"`)).toThrow(/secret/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Use vault:providers/openai-api-key" --diff "Add rule" --evidence artifact://progress/c21/visual-qa.json --idempotency-key learn:c21:vault-single-colon`)).toThrow(/secret|credential|descriptor-only/i);
    expect(() => parseLearningCommand(`/skill quarantine skill-visual-qa --workspace ${IDS.workspace} --version ${IDS.version} --installation-revision 2 --reason "Fetch smb://server/share/secret.txt" --if-match 4 --idempotency-key skill:quarantine:c21:smb`)).toThrow(/path|external|descriptor-only/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Read /Users/zq/private/SKILL.md" --diff "Add rule" --evidence artifact://progress/c21/visual-qa.json --idempotency-key learn:c21:path`)).toThrow(/path|external|descriptor-only/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Read /opt/nexora/private/SKILL.md" --diff "Add rule" --evidence artifact://progress/c21/visual-qa.json --idempotency-key learn:c21:opt-path`)).toThrow(/path|external|descriptor-only/i);
    expect(() => parseLearningCommand(String.raw`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Read \\server\share\secret.txt" --diff "Add rule" --evidence artifact://progress/c21/visual-qa.json --idempotency-key learn:c21:unc-path`)).toThrow(/path|external|descriptor-only/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Add rule" --evidence vault://providers/openai-api-key --idempotency-key learn:c21:vault`)).toThrow(/credential|vault|descriptor-only/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Add rule" --evidence artifact://progress/token=abcd1234 --idempotency-key learn:c21:token-ref`)).toThrow(/credential|descriptor-only/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Add rule" --evidence artifact://vault:providers/openai-api-key --idempotency-key learn:c21:nested-vault-ref`)).toThrow(/credential|descriptor-only/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Add rule" --evidence artifact://../secrets.txt --idempotency-key learn:c21:traversal`)).toThrow(/path|credential|descriptor-only/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Add rule" --evidence workspace:///Users/zq/private/SKILL.md --idempotency-key learn:c21:absolute`)).toThrow(/path|credential|descriptor-only/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Add rule" --evidence workspace://Skills/../../private/SKILL.md --idempotency-key learn:c21:parent`)).toThrow(/path|credential|descriptor-only/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Add rule" --evidence workspace://Skills/%2e%2e/private/SKILL.md --idempotency-key learn:c21:encoded`)).toThrow(/path|credential|descriptor-only/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Add rule" --evidence artifact://https://example.com/private.pdf --idempotency-key learn:c21:nested-url`)).toThrow(/path|credential|descriptor-only|external/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Add rule" --evidence workspace://Skills/..%2525252Fprivate%2525252FSKILL.md --idempotency-key learn:c21:multi-encoded`)).toThrow(/path|credential|descriptor-only|external/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Add rule" --evidence workspace://D:\\private\\SKILL.md --idempotency-key learn:c21:drive-backslash`)).toThrow(/path|credential|descriptor-only|external/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Add rule" --evidence workspace://Skills/%5c%5cserver%5cshare%5csecret.txt --idempotency-key learn:c21:encoded-unc`)).toThrow(/path|credential|descriptor-only|external/i);
    expect(() => parseLearningCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.run} --goal-loop ${IDS.goalLoop} --source-event ${IDS.event} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Fetch smb://server/share/secret.txt" --evidence artifact://progress/c21/visual-qa.json --idempotency-key learn:c21:smb-diff`)).toThrow(/path|credential|descriptor-only|external/i);
  });
});
