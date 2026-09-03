import { describe, expect, it } from "vitest";
import { parseNexoraCliCommand } from "./index.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  media: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  notebook: "notebook-c25-market-brief",
  avatar: "avatar-c25-founder-demo",
};

describe("C25 Studio/Media CLI control semantics", () => {
  it("Given studio render and notebook commands When parsed Then they stay descriptor-only local control requests", () => {
    expect(parseNexoraCliCommand(`/studio render ${IDS.media} --workspace ${IDS.workspace} --run ${IDS.run} --source artifact://research/c25/source-pack.json --preview artifact://media/c25/preview.mp4 --if-match 1 --idempotency-key studio:render:c25`)).toMatchObject({
      method: "POST",
      path: `/v1/studio/media-artifacts/${IDS.media}/render`,
      descriptor_only: true,
    });
    expect(parseNexoraCliCommand(`/notebook generate ${IDS.notebook} --workspace ${IDS.workspace} --run ${IDS.run} --source artifact://notebooks/c25/source-pack.snapshot.json --output artifact://notebooks/c25/generated-brief.md --if-match 1 --idempotency-key notebook:generate:c25`)).toMatchObject({
      method: "POST",
      path: `/v1/studio/notebooks/${IDS.notebook}/generate`,
      descriptor_only: true,
    });
  });

  it("Given avatar and share commands When parsed Then consent and review-gated share semantics are explicit", () => {
    expect(parseNexoraCliCommand(`/avatar profile ${IDS.avatar} --workspace ${IDS.workspace} --run ${IDS.run} --consent artifact://avatars/c25/consent.json --expires 2026-10-04T04:00:00.000Z --idempotency-key avatar:profile:c25`)).toMatchObject({ path: "/v1/studio/avatar-profiles", descriptor_only: true });
    expect(parseNexoraCliCommand(`/studio share ${IDS.media} --workspace ${IDS.workspace} --run ${IDS.run} --reason "request review" --if-match 1 --idempotency-key studio:share:c25`)).toMatchObject({ path: `/v1/studio/media-artifacts/${IDS.media}/share`, descriptor_only: true });
  });

  it("Given live NotebookLM media provider or credential flags When parsed Then CLI rejects before command construction", () => {
    expect(() => parseNexoraCliCommand(`/notebook generate ${IDS.notebook} --workspace ${IDS.workspace} --run ${IDS.run} --notebooklm live --credential secret://notebooklm/token --idempotency-key notebook:live:c25`)).toThrow(/notebooklm|credential|descriptor-only|external/i);
    expect(() => parseNexoraCliCommand(`/studio render ${IDS.media} --workspace ${IDS.workspace} --run ${IDS.run} --provider runway --external --idempotency-key studio:provider:c25`)).toThrow(/provider|external|descriptor-only/i);
    expect(() => parseNexoraCliCommand(`/avatar profile ${IDS.avatar} --workspace ${IDS.workspace} --face-file /Users/zq/private.mov --idempotency-key avatar:path:c25`)).toThrow(/credential|path|descriptor-only|file/i);
  });
});
