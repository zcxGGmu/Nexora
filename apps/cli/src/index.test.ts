import { describe, expect, it } from "vitest";
import { parseNexoraCliCommand } from "@nexora/cli";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  loop: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
};

describe("CLI root dispatcher", () => {
  it("routes journal goal and learning commands through the public package entry", () => {
    expect(parseNexoraCliCommand(`/journal vault --workspace ${IDS.workspace} --vault vault-obsidian-demo --name "Obsidian Demo Vault" --kind obsidian --root-ref workspace://vaults/demo --idempotency-key journal:vault:c22`)).toMatchObject({
      path: "/v1/vaults",
      descriptor_only: true,
    });
    expect(parseNexoraCliCommand(`/goal resume ${IDS.loop} --workspace ${IDS.workspace} --cursor turn-2 --if-match 3 --idempotency-key goal:resume:c20`)).toMatchObject({
      path: `/v1/goal-loops/${IDS.loop}/resume`,
      descriptor_only: true,
    });
    expect(parseNexoraCliCommand(`/learn --workspace ${IDS.workspace} --run ${IDS.loop} --goal-loop ${IDS.loop} --source-event ${IDS.loop} --proposed-skill skill-visual-qa --lesson "Fresh evidence" --diff "Add rule" --evidence artifact://progress/c21/visual-qa.json --idempotency-key learn:c21:visual-qa`)).toMatchObject({
      path: "/v1/learning/candidates",
      descriptor_only: true,
    });
  });
});
