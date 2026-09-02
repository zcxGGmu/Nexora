import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  EventIdSchema,
  RunIdSchema,
  SkillDescriptorSchema,
  SkillInstallationSchema,
  SkillInvocationFactSchema,
  SkillReviewSchema,
  SkillScanSchema,
  SkillSourceSchema,
  SkillVersionSchema,
  TimestampSchema,
  UlidSchema,
  WorkspaceIdSchema,
} from "@nexora/contracts";

import { pageForRoute } from "../app/detail-pages.js";
import { parseRouteUrl } from "../app/router.js";
import type { SkillsLearningProjection } from "../app/skills-learning-api.js";
import { SkillsLearningPage, SkillsLearningPageContent, SkillsLearningUnavailableFallback, buildSkillsLearningView, skillsLearningFixture, type SkillsLearningView } from "./SkillsLearningPage.js";

const WORKSPACE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RUN_ID = "01BRZ3NDEKTSV4RRFFQ69G5FAV";
const LOOP_ID = "01CRZ3NDEKTSV4RRFFQ69G5FAV";
const EVENT_ID = "01DRZ3NDEKTSV4RRFFQ69G5FAV";
const INSTALLED_VERSION_ID = "01ERZ3NDEKTSV4RRFFQ69G5FAV";
const NEWER_VERSION_ID = "01FRZ3NDEKTSV4RRFFQ69G5FAV";
const INSTALLATION_ID = "01JRZ3NDEKTSV4RRFFQ69G5FAV";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NEWER_HASH = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const DIFF_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TIME = "2026-09-02T04:00:00.000Z";

describe("C21 Mission Control Skills/Learning surface", () => {
  it("Given Skills/Learning facts When rendered Then scan review install and snapshot boundaries are visible", () => {
    const markup = renderToStaticMarkup(<SkillsLearningPage view={skillsLearningFixture} />);

    for (const expected of [
      "Skills &amp; Learning",
      "Descriptor-only learning",
      "No external connection",
      "Approved snapshot",
      "Approve",
      "Source hash",
      "Scan",
      "Review",
      "Install",
      "Source event",
      "Revoke",
      "Quarantine",
      "Rollback",
      "/learn",
      "No real MCP execution",
      "No URL/PDF/credential reads",
    ]) {
      expect(markup).toContain(expected);
    }

    expect(markup).toContain("data-control-kind=\"approve\"");
    expect(markup).toContain("data-control-kind=\"install\"");
    expect(markup).toContain("data-control-kind=\"revoke\"");
    expect(markup).toContain("data-control-kind=\"quarantine\"");
    expect(markup).toContain("data-control-kind=\"rollback\"");
    expect(markup).not.toContain("external_skill_executed");
  });

  it("wires Approve Install Revoke Quarantine Rollback and /learn controls to callbacks", () => {
    const commands: string[] = [];
    const skill = requiredSkill(skillsLearningFixture);
    const view: SkillsLearningView = { ...skillsLearningFixture, selected: { ...skill, installationStatus: "installed", revision: 2, approvedVersions: [...skill.approvedVersions, { id: NEWER_VERSION_ID, semver: "1.1.0", snapshotHash: NEWER_HASH }] } };
    const element = SkillsLearningPageContent({
      view,
      onLifecycleCommand: (kind, skillId) => commands.push(`${kind}:${skillId}`),
      learnInput: {
        lesson: "Record source-backed learning.",
        proposed_diff_summary: "Update the approved descriptor snapshot.",
        evidence_refs: ["artifact://progress/c21/ui-control.json"],
      },
      onLearnCommand: () => commands.push("learn"),
    });

    clickButton(element, "Approve");
    clickButton(element, "Install");
    clickButton(element, "Revoke");
    clickButton(element, "Quarantine");
    clickButton(element, "Rollback");
    clickButton(element, "/learn");

    expect(commands).toEqual(["approve:skill-visual-qa", "install:skill-visual-qa", "revoke:skill-visual-qa", "quarantine:skill-visual-qa", "rollback:skill-visual-qa", "learn"]);
  });

  it("selects a non-first skill before sending lifecycle and /learn controls", () => {
    const selectedSkills: string[] = [];
    const commands: string[] = [];
    const secondSkill = secondSkillSummary();
    const view: SkillsLearningView = {
      ...skillsLearningFixture,
      skills: [...skillsLearningFixture.skills, secondSkill],
    };
    const element = SkillsLearningPageContent({
      view,
      selectedSkillId: secondSkill.id,
      onSelectedSkillChange: (skillId) => selectedSkills.push(skillId),
      onLifecycleCommand: (kind, skillId, rollbackToVersionId) => commands.push(`${kind}:${skillId}:${rollbackToVersionId ?? "none"}`),
      learnInput: {
        lesson: "Record keyboard workflow correction.",
        proposed_diff_summary: "Update keyboard workflow skill.",
        evidence_refs: ["artifact://progress/c21/keyboard-qa.json"],
      },
      onLearnCommand: (_input, skillId) => commands.push(`learn:${skillId}`),
    });

    clickSkillSelector(element, secondSkill.id);
    clickButton(element, "Approve");
    clickButton(element, "/learn");

    expect(selectedSkills).toEqual([secondSkill.id]);
    expect(commands).toEqual([`approve:${secondSkill.id}:none`, `learn:${secondSkill.id}`]);
    expect(renderToStaticMarkup(element)).toContain("Keyboard QA");
    expect(renderToStaticMarkup(element)).toContain(secondSkill.versionId);
  });

  it("uses an approved rollback target distinct from the installed version", () => {
    const commands: string[] = [];
    const view = buildSkillsLearningView(rolledBackProjection(), WORKSPACE_ID);
    const element = SkillsLearningPageContent({
      view,
      selectedRollbackTargetId: INSTALLED_VERSION_ID,
      onLifecycleCommand: (kind, skillId, rollbackToVersionId) => commands.push(`${kind}:${skillId}:${rollbackToVersionId ?? "none"}`),
    });

    clickButton(element, "Rollback");

    expect(view.selected).toMatchObject({
      id: "skill-visual-qa",
      versionId: NEWER_VERSION_ID,
      semver: "1.0.0",
      rollbackTargetVersionId: INSTALLED_VERSION_ID,
    });
    expect(commands).toEqual([`rollback:skill-visual-qa:${INSTALLED_VERSION_ID}`]);
    expect(renderToStaticMarkup(element)).toContain(`Rollback target 1.0.0 | ${INSTALLED_VERSION_ID}`);
  });

  it("submits operator-provided /learn lesson diff and evidence refs", () => {
    const submitted: unknown[] = [];
    const input = {
      lesson: "Require current screenshot evidence before visual signoff.",
      proposed_diff_summary: "Add visual signoff evidence guidance to the skill.",
      evidence_refs: ["artifact://progress/c21/operator-visual-qa.json", "workspace://Skills/visual-qa/review.md"],
    };
    const element = SkillsLearningPageContent({
      view: skillsLearningFixture,
      learnInput: input,
      onLearnCommand: (...values: readonly unknown[]) => {
        submitted.push(values[0]);
      },
    });

    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("Learning lesson");
    expect(markup).toContain("Learning evidence refs");
    clickButton(element, "/learn");

    expect(submitted).toEqual([input]);
  });

  it("keeps /learn disabled until the operator provides candidate fields", () => {
    const element = SkillsLearningPageContent({ view: skillsLearningFixture, onLearnCommand: () => { throw new Error("/learn must wait for operator-provided candidate fields"); } });
    const button = findButton(element, "/learn");

    expect(button?.disabled).toBe(true);
    expect(renderToStaticMarkup(element)).not.toContain("Fresh verification evidence is required before a stage is marked complete.");
  });

  it("keeps /learn visible but disabled when no source event fact is available", () => {
    const skill = requiredSkill(skillsLearningFixture);
    const view: SkillsLearningView = { ...skillsLearningFixture, selected: { ...skill, sourceEventId: null } };
    const element = SkillsLearningPageContent({ view, onLearnCommand: () => { throw new Error("/learn should remain disabled without a source event"); } });
    const button = findButton(element, "/learn");

    expect(button?.disabled).toBe(true);
    expect(renderToStaticMarkup(element)).toContain("missing source event");
  });

  it("renders unavailable fallback controls as read-only when lifecycle handlers are missing", () => {
    const element = SkillsLearningUnavailableFallback({ onRetry: () => undefined });
    const markup = renderToStaticMarkup(element);

    for (const controlKind of ["approve", "install", "revoke", "quarantine", "rollback", "learn"]) {
      expect(markup).toMatch(new RegExp(`data-control-kind="${controlKind}"[^>]*disabled=""`));
    }
    expect(markup).toMatch(/<button class="row-action" type="button">Retry Skills API<\/button>/);
  });

  it("correlates displayed lifecycle facts by installed version and enables first /learn from source context", () => {
    const view = buildSkillsLearningView(twoVersionProjectionWithoutCandidates(), WORKSPACE_ID);

    expect(view.selected).toMatchObject({
      id: "skill-visual-qa",
      versionId: INSTALLED_VERSION_ID,
      semver: "1.0.0",
      sourceHash: HASH,
      snapshotHash: HASH,
      scanStatus: "passed",
      reviewDecision: "approve",
      installationStatus: "installed",
      invocationStatus: "allowed",
      runId: RUN_ID,
      goalLoopId: LOOP_ID,
      sourceEventId: EVENT_ID,
    });
    expect(view.learning).toMatchObject({ pending: 0, applied: 0 });

    const element = SkillsLearningPageContent({
      view,
      learnInput: {
        lesson: "Record source-backed learning.",
        proposed_diff_summary: "Update the approved descriptor snapshot.",
        evidence_refs: ["artifact://progress/c21/source-context.json"],
      },
      onLearnCommand: () => undefined,
    });
    expect(findButton(element, "/learn")?.disabled).toBe(false);
    expect(renderToStaticMarkup(element)).not.toContain(NEWER_HASH);
  });

  it("does not display unrelated lifecycle facts when the selected version lacks exact matches", () => {
    const view = buildSkillsLearningView(projectionWithUnrelatedLifecycleFacts(), WORKSPACE_ID);

    expect(view.selected).toMatchObject({
      id: "skill-visual-qa",
      versionId: INSTALLED_VERSION_ID,
      semver: "1.0.0",
      sourceHash: HASH,
      snapshotHash: HASH,
      scanStatus: "missing",
      reviewDecision: "missing",
      installationStatus: "installed",
      invocationStatus: "blocked",
    });
  });

  it("Given the C21 Skills deep link When routed Then Mission Control renders the live page", () => {
    const page = pageForRoute(parseRouteUrl("http://nexora.local/skills?workspace=ws-demo"));

    expect(page).toMatchObject({ props: { workspaceId: "ws-demo" } });
    expect(page).not.toMatchObject({ props: { view: expect.anything() } });
  });
});

type ButtonProps = {
  readonly className?: string;
  readonly "data-skill-id"?: string;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly children?: ReactNode;
};

function clickButton(node: ReactNode, label: string): void {
  const button = findButton(node, label);
  if (button === undefined) throw new Error(`Missing ${label} Skills/Learning action button`);
  expect(button.disabled ?? false).toBe(false);
  const onClick = button.onClick;
  if (onClick === undefined) throw new Error(`Missing ${label} Skills/Learning action handler`);
  onClick();
}

function findButton(node: ReactNode, label: string): ButtonProps | undefined {
  if (node === null || node === undefined || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findButton(child, label);
      if (match !== undefined) return match;
    }
    return undefined;
  }
  if (!isValidElement<ButtonProps>(node)) return undefined;
  if (node.type === "button" && node.props.className === "row-action" && textFromNode(node.props.children).includes(label)) return node.props;
  return findButton(node.props.children, label);
}

function clickSkillSelector(node: ReactNode, skillId: string): void {
  const button = findSkillSelector(node, skillId);
  if (button === undefined) throw new Error(`Missing ${skillId} Skills/Learning selector button`);
  expect(button.disabled ?? false).toBe(false);
  const onClick = button.onClick;
  if (onClick === undefined) throw new Error(`Missing ${skillId} Skills/Learning selector handler`);
  onClick();
}

function findSkillSelector(node: ReactNode, skillId: string): ButtonProps | undefined {
  if (node === null || node === undefined || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findSkillSelector(child, skillId);
      if (match !== undefined) return match;
    }
    return undefined;
  }
  if (!isValidElement<ButtonProps>(node)) return undefined;
  if (node.type === "button" && node.props["data-skill-id"] === skillId) return node.props;
  return findSkillSelector(node.props.children, skillId);
}

function textFromNode(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => textFromNode(child)).join("");
  if (isValidElement<ButtonProps>(node)) return textFromNode(node.props.children);
  return "";
}

function requiredSkill(view: SkillsLearningView): SkillsLearningView["skills"][number] {
  const skill = view.skills[0];
  if (skill === undefined) throw new Error("Skills/Learning fixture requires a skill");
  return skill;
}

function secondSkillSummary(): SkillsLearningView["skills"][number] {
  return {
    ...requiredSkill(skillsLearningFixture),
    id: "skill-keyboard-qa",
    name: "Keyboard QA",
    versionId: "01VRZ3NDEKTSV4RRFFQ69S5FAV",
    semver: "2.0.0",
    runId: RUN_ID,
    goalLoopId: LOOP_ID,
    sourceEventId: EVENT_ID,
    revision: 4,
    installationRevision: 2,
  };
}

function twoVersionProjectionWithoutCandidates(): SkillsLearningProjection {
  const eventType: "learning.source" = "learning.source";
  return {
    skills: [skillDescriptor()],
    details: [
      {
        schema_version: 1,
        skill: skillDescriptor(),
        versions: [version(NEWER_VERSION_ID, "1.1.0", NEWER_HASH), version(INSTALLED_VERSION_ID, "1.0.0", HASH)],
        sources: [source(NEWER_VERSION_ID, NEWER_HASH), source(INSTALLED_VERSION_ID, HASH)],
        scans: [scan(NEWER_VERSION_ID, NEWER_HASH), scan(INSTALLED_VERSION_ID, HASH)],
        reviews: [review(NEWER_VERSION_ID, NEWER_HASH), review(INSTALLED_VERSION_ID, HASH)],
        installations: [installation()],
        invocation_facts: [invocation()],
        candidates: [],
        learning_contexts: [{ workspace_id: WorkspaceIdSchema.parse(WORKSPACE_ID), run_id: RunIdSchema.parse(RUN_ID), goal_loop_id: UlidSchema.parse(LOOP_ID), source_event_id: EventIdSchema.parse(EVENT_ID), event_type: eventType, occurred_at: TimestampSchema.parse(TIME) }],
      },
    ],
  };
}

function projectionWithUnrelatedLifecycleFacts(): SkillsLearningProjection {
  const projection = twoVersionProjectionWithoutCandidates();
  const detail = projection.details[0];
  if (detail === undefined) throw new Error("Skills/Learning projection fixture requires a detail");
  return {
    ...projection,
    details: [
      {
        ...detail,
        sources: [source(NEWER_VERSION_ID, NEWER_HASH)],
        scans: [scan(NEWER_VERSION_ID, NEWER_HASH)],
        reviews: [review(NEWER_VERSION_ID, NEWER_HASH)],
        invocation_facts: [unrelatedInvocation()],
      },
    ],
  };
}

function rolledBackProjection(): SkillsLearningProjection {
  const projection = twoVersionProjectionWithoutCandidates();
  const detail = projection.details[0];
  if (detail === undefined) throw new Error("Skills/Learning projection fixture requires a detail");
  return {
    ...projection,
    details: [
      {
        ...detail,
        installations: [installationForVersion(NEWER_VERSION_ID, NEWER_HASH, "rolled_back", INSTALLED_VERSION_ID)],
        invocation_facts: [],
      },
    ],
  };
}

function skillDescriptor() {
  return SkillDescriptorSchema.parse({ id: "skill-visual-qa", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, name: "Visual QA", description: "Reusable UI verification rules.", status: "active", current_version_id: NEWER_VERSION_ID, approved_version_id: NEWER_VERSION_ID, capabilities: ["qa:visual"], tags: ["qa"], quarantine_reason: null, descriptor_only: true, revision: 2 });
}

function version(id: string, semver: string, snapshotHash: string) {
  return SkillVersionSchema.parse({ id, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: "skill-visual-qa", semver, status: "approved", source_hash: snapshotHash, snapshot_hash: snapshotHash, snapshot_ref: `artifact://skills/visual-qa/${semver}/SKILL.md`, diff_hash: DIFF_HASH, diff_summary: "Adds visual QA rule.", approved_at: TIME, approved_by: "owner:michael", revoked_at: null, rollback_to_version_id: null, descriptor_only: true });
}

function source(versionId: string, sourceHash: string) {
  return SkillSourceSchema.parse({ id: idForVersion(versionId, "source"), workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: "skill-visual-qa", version_id: versionId, source_kind: "workspace", source_ref: `workspace://Skills/visual-qa/${versionId}/SKILL.md`, source_hash: sourceHash, diff_hash: DIFF_HASH, diff_summary: "Adds rule.", descriptor_only: true });
}

function scan(versionId: string, sourceHash: string) {
  return SkillScanSchema.parse({ id: idForVersion(versionId, "scan"), workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: "skill-visual-qa", version_id: versionId, source_hash: sourceHash, status: "passed", findings: [], secret_findings: 0, scanned_at: TIME, descriptor_only: true });
}

function review(versionId: string, snapshotHash: string) {
  return SkillReviewSchema.parse({ id: idForVersion(versionId, "review"), workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: "skill-visual-qa", version_id: versionId, scan_id: idForVersion(versionId, "scan"), decision: "approve", reviewer_ref: "owner:michael", reason: "Approved snapshot hash.", approved_snapshot_hash: snapshotHash, decided_at: TIME, descriptor_only: true });
}

function installation() {
  return installationForVersion(INSTALLED_VERSION_ID, HASH, "installed", null);
}

function installationForVersion(versionId: string, snapshotHash: string, status: "installed" | "rolled_back", rollbackToVersionId: string | null) {
  return SkillInstallationSchema.parse({ id: INSTALLATION_ID, workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: "skill-visual-qa", version_id: versionId, status, approved_snapshot_hash: snapshotHash, installed_at: TIME, revoked_at: null, quarantine_reason: null, rollback_to_version_id: rollbackToVersionId, descriptor_only: true, revision: 3 });
}

function invocation() {
  return SkillInvocationFactSchema.parse({ id: "01KRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: "skill-visual-qa", version_id: INSTALLED_VERSION_ID, installation_id: INSTALLATION_ID, run_id: RUN_ID, goal_loop_id: LOOP_ID, status: "allowed", snapshot_hash: HASH, reason: "Installed version matches approved snapshot.", descriptor_only: true });
}

function unrelatedInvocation() {
  return SkillInvocationFactSchema.parse({ id: "01SRZ3NDEKTSV4RRFFQ69G5FAV", workspace_id: WORKSPACE_ID, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: "skill-visual-qa", version_id: NEWER_VERSION_ID, installation_id: INSTALLATION_ID, run_id: RUN_ID, goal_loop_id: LOOP_ID, status: "allowed", snapshot_hash: NEWER_HASH, reason: "Other version matched an approved snapshot.", descriptor_only: true });
}

function idForVersion(versionId: string, kind: "source" | "scan" | "review"): string {
  if (versionId === INSTALLED_VERSION_ID && kind === "source") return "01TRZ3NDEKTSV4RRFFQ69G5FAV";
  if (versionId === INSTALLED_VERSION_ID && kind === "scan") return "01MRZ3NDEKTSV4RRFFQ69G5FAV";
  if (versionId === INSTALLED_VERSION_ID && kind === "review") return "01NRZ3NDEKTSV4RRFFQ69G5FAV";
  if (kind === "source") return "01PRZ3NDEKTSV4RRFFQ69G5FAV";
  if (kind === "scan") return "01QRZ3NDEKTSV4RRFFQ69G5FAV";
  return "01RRZ3NDEKTSV4RRFFQ69G5FAV";
}
