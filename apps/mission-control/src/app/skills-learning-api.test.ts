import { describe, expect, it } from "vitest";
import { LearningCandidateSchema, SkillDescriptorSchema, SkillInstallationSchema, SkillInvocationFactSchema, SkillReviewSchema, SkillScanSchema, SkillSourceSchema, SkillVersionSchema, WorkspaceIdSchema } from "@nexora/contracts";

import { createLearningCandidate, fetchSkillsLearningProjection, resolveSkillsLearningWorkspace, sendSkillLifecycleControl, shouldUseSkillsLearningFallback, workspaceIdForSkillsLearningApi, type SkillLifecycleWriter, type SkillPostOptions } from "./skills-learning-api.js";

const WORKSPACE_ID = WorkspaceIdSchema.parse("01ARZ3NDEKTSV4RRFFQ69G5FAV");
const RUN_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const LOOP_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const EVENT_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const SKILL_ID = "skill-visual-qa";
const VERSION_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const ROLLBACK_TARGET_VERSION_ID = "01HRZ3NDEKTSV4RRFFQ69G5FAV";
const INSTALLATION_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const INVOCATION_ID = "01JRZ3NDEKTSV4RRFFQ69G5FAV";
const TIME = "2026-09-02T04:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DIFF_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("Mission Control Skills/Learning API", () => {
  it("fetches live skill descriptors and details from the control API", async () => {
    const skill = SkillDescriptorSchema.parse(skillDescriptor());
    const calls: string[] = [];

    const projection = await fetchSkillsLearningProjection(WORKSPACE_ID, (path, workspace) => {
      calls.push(`${path}?workspace_id=${workspace}`);
      if (path === `/v1/skills/${SKILL_ID}`) return Promise.resolve(skillDetail(skill));
      return Promise.resolve({ schema_version: 1, skills: [skill] });
    });

    expect(calls).toEqual([`/v1/skills?workspace_id=${WORKSPACE_ID}`, `/v1/skills/${SKILL_ID}?workspace_id=${WORKSPACE_ID}`]);
    expect(projection.skills).toEqual([skill]);
    expect(projection.details[0]).toMatchObject({ skill, installations: [expect.objectContaining({ status: "installed" })] });
  });

  it("resolves canonical workspace ids and known aliases without accepting arbitrary scopes", () => {
    expect(workspaceIdForSkillsLearningApi("ws-demo")).toBe(WORKSPACE_ID);
    expect(resolveSkillsLearningWorkspace(WORKSPACE_ID)).toEqual({ kind: "resolved", workspace_id: WORKSPACE_ID });
    expect(resolveSkillsLearningWorkspace("ws-unknown")).toEqual({ kind: "invalid", input: "ws-unknown" });
  });

  it("posts skill lifecycle commands with Idempotency-Key and If-Match headers", async () => {
    const calls: PostCall[] = [];
    const writer = createWriter(calls);

    await sendSkillLifecycleControl({ workspace_id: WORKSPACE_ID, skill_id: SKILL_ID, action: "install", version_id: VERSION_ID, reason: "Install approved snapshot", expected_revision: 1 }, "skill:install", writer);
    await sendSkillLifecycleControl({ workspace_id: WORKSPACE_ID, skill_id: SKILL_ID, action: "quarantine", version_id: VERSION_ID, reason: "Critical scan finding", expected_revision: 2, installation_revision: 1 }, "skill:quarantine", writer);
    await sendSkillLifecycleControl({ workspace_id: WORKSPACE_ID, skill_id: SKILL_ID, action: "rollback", version_id: VERSION_ID, rollback_to_version_id: ROLLBACK_TARGET_VERSION_ID, reason: "Restore approved snapshot", expected_revision: 3, installation_revision: 2 }, "skill:rollback", writer);

    expect(calls.map((call) => call.path)).toEqual([
      `/v1/skills/${SKILL_ID}/install`,
      `/v1/skills/${SKILL_ID}/quarantine`,
      `/v1/skills/${SKILL_ID}/rollback`,
    ]);
    expect(calls.map((call) => call.headers["If-Match"])).toEqual(["1", "2", "3"]);
    expect(calls[1]?.json).toMatchObject({ schema_version: 1, workspace_id: WORKSPACE_ID, version_id: VERSION_ID, installation_revision: 1 });
    expect(calls[2]?.json).toMatchObject({ schema_version: 1, workspace_id: WORKSPACE_ID, version_id: VERSION_ID, installation_revision: 2, rollback_to_version_id: ROLLBACK_TARGET_VERSION_ID });
  });

  it("posts /learn candidates as descriptor-only control requests", async () => {
    const calls: PostCall[] = [];
    const writer = createWriter(calls);

    await createLearningCandidate({ workspace_id: WORKSPACE_ID, run_id: RUN_ID, goal_loop_id: LOOP_ID, source_event_id: EVENT_ID, proposed_skill_id: SKILL_ID, lesson: "Fresh visual QA evidence is required", proposed_diff_summary: "Add visual QA evidence rule", evidence_refs: ["artifact://progress/c21/visual-qa.json"] }, "learn:c21", writer);

    expect(calls).toEqual([{ path: "/v1/learning/candidates", headers: { "Idempotency-Key": "learn:c21" }, json: { schema_version: 1, workspace_id: WORKSPACE_ID, run_id: RUN_ID, goal_loop_id: LOOP_ID, source_event_id: EVENT_ID, proposed_skill_id: SKILL_ID, lesson: "Fresh visual QA evidence is required", proposed_diff_summary: "Add visual QA evidence rule", evidence_refs: ["artifact://progress/c21/visual-qa.json"], descriptor_only: true } }]);
  });

  it("does not fall back to local fixtures for authorization scope or revision errors", () => {
    expect(shouldUseSkillsLearningFallback({ response: { status: 401 } })).toBe(false);
    expect(shouldUseSkillsLearningFallback({ response: { status: 403 } })).toBe(false);
    expect(shouldUseSkillsLearningFallback({ response: { status: 404 } })).toBe(false);
    expect(shouldUseSkillsLearningFallback({ response: { status: 409 } })).toBe(false);
    expect(shouldUseSkillsLearningFallback({ response: { status: 503 } })).toBe(true);
    expect(shouldUseSkillsLearningFallback(new TypeError("Failed to fetch"))).toBe(true);
  });
});

type PostCall = {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
};

function createWriter(calls: PostCall[]): SkillLifecycleWriter {
  return {
    post: (path: string, options: SkillPostOptions): Promise<unknown> => {
      calls.push({ path, headers: options.headers, json: options.json });
      return Promise.resolve({ ok: true });
    },
  };
}

function skillDescriptor(): object {
  return { id: SKILL_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, name: "Visual QA", description: "Reusable UI verification rules.", status: "active", current_version_id: VERSION_ID, approved_version_id: VERSION_ID, capabilities: ["qa:visual"], tags: ["qa"], quarantine_reason: null, descriptor_only: true, revision: 1 };
}

function skillDetail(skill: ReturnType<typeof SkillDescriptorSchema.parse>): object {
  return {
    schema_version: 1,
    skill,
    versions: [SkillVersionSchema.parse({ id: VERSION_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: SKILL_ID, semver: "1.0.0", status: "approved", source_hash: HASH, snapshot_hash: HASH, snapshot_ref: "artifact://skills/visual-qa/1.0.0/SKILL.md", diff_hash: DIFF_HASH, diff_summary: "Adds visual QA rule.", approved_at: TIME, approved_by: "owner:michael", revoked_at: null, rollback_to_version_id: null, descriptor_only: true })],
    sources: [SkillSourceSchema.parse({ id: "01GRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: SKILL_ID, version_id: VERSION_ID, source_kind: "workspace", source_ref: "workspace://Skills/visual-qa/SKILL.md", source_hash: HASH, diff_hash: DIFF_HASH, diff_summary: "Adds rule.", descriptor_only: true })],
    scans: [SkillScanSchema.parse({ id: "01HRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: SKILL_ID, version_id: VERSION_ID, source_hash: HASH, status: "passed", findings: [], secret_findings: 0, scanned_at: TIME, descriptor_only: true })],
    reviews: [SkillReviewSchema.parse({ id: "01KRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: SKILL_ID, version_id: VERSION_ID, scan_id: "01HRZ3NDEKTSV4RRFFQ69G5FAV", decision: "approve", reviewer_ref: "owner:michael", reason: "Approved snapshot hash.", approved_snapshot_hash: HASH, decided_at: TIME, descriptor_only: true })],
    installations: [SkillInstallationSchema.parse({ id: INSTALLATION_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: SKILL_ID, version_id: VERSION_ID, status: "installed", approved_snapshot_hash: HASH, installed_at: TIME, revoked_at: null, quarantine_reason: null, rollback_to_version_id: null, descriptor_only: true })],
    invocation_facts: [SkillInvocationFactSchema.parse({ id: INVOCATION_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: SKILL_ID, version_id: VERSION_ID, installation_id: INSTALLATION_ID, run_id: RUN_ID, goal_loop_id: LOOP_ID, status: "allowed", snapshot_hash: HASH, reason: "Installed version matches approved snapshot.", descriptor_only: true })],
    candidates: [LearningCandidateSchema.parse({ id: "01MRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, run_id: RUN_ID, goal_loop_id: LOOP_ID, source_event_id: EVENT_ID, proposed_skill_id: SKILL_ID, lesson: "Fresh visual QA evidence is required", proposed_diff_summary: "Adds rule.", evidence_refs: ["artifact://progress/c21/visual-qa.json"], status: "needs_review", descriptor_only: true })],
  };
}
