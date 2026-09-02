import { describe, expect, it } from "vitest";
import {
  LearningCandidateSchema,
  LearningCommandSchema,
  SkillDescriptorSchema,
  SkillInstallationSchema,
  SkillInvocationFactSchema,
  SkillReviewSchema,
  SkillScanSchema,
  SkillSourceSchema,
  SkillVersionSchema,
  canInvokeSkillSnapshot,
  canTransitionSkillInstallation,
  containsPathLikeText,
} from "./skills.js";
import { containsSecretLikeText } from "./goal.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  skill: "skill-seo-draft-writer",
  version: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  source: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  scan: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  review: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  install: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  invocation: "01NRZ3NDEKTSV4RRFFQ69H5FAV",
  candidate: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  command: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  run: "01JRZ3NDEKTSV4RRFFQ69H5FAV",
  goalLoop: "01KRZ3NDEKTSV4RRFFQ69H5FAV",
  event: "01MRZ3NDEKTSV4RRFFQ69H5FAV",
};

const TIME = "2026-09-02T04:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DIFF_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const descriptor = {
  id: IDS.skill,
  workspace_id: IDS.workspace,
  schema_version: 1,
  created_at: TIME,
  updated_at: TIME,
  name: "SEO Draft Writer",
  description: "Writes controlled SEO draft instructions after review.",
  status: "active",
  current_version_id: IDS.version,
  approved_version_id: IDS.version,
  capabilities: ["draft:seo", "review:handoff"],
  tags: ["seo", "draft"],
  quarantine_reason: null,
  descriptor_only: true,
} as const;

const version = {
  id: IDS.version,
  workspace_id: IDS.workspace,
  schema_version: 1,
  created_at: TIME,
  updated_at: TIME,
  skill_id: IDS.skill,
  semver: "1.2.0",
  status: "approved",
  source_hash: HASH,
  snapshot_hash: HASH,
  snapshot_ref: "artifact://skills/seo-draft-writer/1.2.0/SKILL.md",
  diff_hash: DIFF_HASH,
  diff_summary: "Tightens evidence requirements for SEO drafts.",
  approved_at: TIME,
  approved_by: "owner:michael",
  revoked_at: null,
  rollback_to_version_id: null,
  descriptor_only: true,
} as const;

describe("C21 Skills/Learning contracts", () => {
  it("Given a skill descriptor and version When parsed Then approved snapshot facts are explicit", () => {
    const parsedDescriptor = SkillDescriptorSchema.parse(descriptor);
    const parsedVersion = SkillVersionSchema.parse(version);

    expect(parsedDescriptor).toMatchObject({
      id: IDS.skill,
      workspace_id: IDS.workspace,
      status: "active",
      current_version_id: IDS.version,
      approved_version_id: IDS.version,
      descriptor_only: true,
    });
    expect(parsedVersion).toMatchObject({
      skill_id: IDS.skill,
      status: "approved",
      source_hash: HASH,
      snapshot_hash: HASH,
      snapshot_ref: "artifact://skills/seo-draft-writer/1.2.0/SKILL.md",
      descriptor_only: true,
    });
    expect(SkillDescriptorSchema.safeParse({ ...descriptor, name: "token=abcd1234" }).success).toBe(false);
    expect(SkillDescriptorSchema.safeParse({ ...descriptor, name: "Read /opt/nexora/private/SKILL.md" }).success).toBe(false);
    expect(SkillDescriptorSchema.safeParse({ ...descriptor, description: "Read D:/private/SKILL.md during setup." }).success).toBe(false);
    expect(SkillDescriptorSchema.safeParse({ ...descriptor, description: String.raw`Read \\server\share\secret.txt during setup.` }).success).toBe(false);
    expect(SkillVersionSchema.safeParse({ ...version, approved_by: "owner:sk-proj-abcdefghi" }).success).toBe(false);
    expect(SkillVersionSchema.safeParse({ ...version, approved_by: "owner:/Users/zq/private" }).success).toBe(false);
    expect(SkillVersionSchema.safeParse({ ...version, snapshot_ref: "artifact://skills/token=abcd1234/SKILL.md" }).success).toBe(false);
    expect(SkillVersionSchema.safeParse({ ...version, snapshot_ref: "artifact://C:/private/SKILL.md" }).success).toBe(false);
    expect(SkillVersionSchema.safeParse({ ...version, snapshot_ref: "artifact://D:\\private\\SKILL.md" }).success).toBe(false);
    expect(SkillVersionSchema.safeParse({ ...version, approved_by: "owner:vault:providers/openai-api-key" }).success).toBe(false);
  });

  it("Given source facts When parsed Then external reads paths and secret-shaped text are rejected", () => {
    const source = {
      id: IDS.source,
      workspace_id: IDS.workspace,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      skill_id: IDS.skill,
      version_id: IDS.version,
      source_kind: "workspace",
      source_ref: "workspace://Skills/seo-draft-writer/SKILL.md",
      source_hash: HASH,
      diff_hash: DIFF_HASH,
      diff_summary: "Adds a reusable correction from the latest run.",
      descriptor_only: true,
    } as const;

    expect(SkillSourceSchema.parse(source).source_ref).toBe("workspace://Skills/seo-draft-writer/SKILL.md");
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "https://example.com/SKILL.md" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "/Users/zq/.codex/skills/live/SKILL.md" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "artifact://../secrets.txt" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "workspace:///Users/zq/private/SKILL.md" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "workspace://Skills/../../private/SKILL.md" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "workspace://Skills/%2e%2e/private/SKILL.md" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "artifact://https://example.com/private.pdf" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "artifact://https:%2F%2Fexample.com/private.pdf" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "workspace://https://example.com/SKILL.md" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "workspace://Skills/..%2525252Fprivate%2525252FSKILL.md" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "workspace://Skills/path=/etc/passwd" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "workspace://Skills/token=abcd1234/SKILL.md" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "workspace://D:/private/SKILL.md" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, source_ref: "workspace://D:\\private\\SKILL.md" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, diff_summary: "source=/etc/passwd must not be persisted." }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, diff_summary: "Read /opt/nexora/private/SKILL.md during setup." }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, diff_summary: "Read //server/share/secret.txt during setup." }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, diff_summary: "Fetch smb://server/share/secret.txt during setup." }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, diff_summary: "Use token=abcd1234 during setup" }).success).toBe(false);
    expect(SkillSourceSchema.safeParse({ ...source, unknown: "field" }).success).toBe(false);
  });

  it("Given credential and network schemes When checked Then descriptor text rejects them", () => {
    expect(containsSecretLikeText("Use vault:providers/openai-api-key")).toBe(true);
    expect(containsSecretLikeText("Use credential:providers/openai-api-key")).toBe(true);
    expect(containsSecretLikeText("See artifact://vault:providers/openai-api-key")).toBe(true);
    expect(containsPathLikeText("Fetch smb://server/share/secret.txt")).toBe(true);
    expect(containsPathLikeText("Fetch sftp://server/share/secret.txt")).toBe(true);
  });

  it("Given UNC path variants When checked Then descriptor text treats them as local paths", () => {
    expect(containsPathLikeText(String.raw`Read \\server\share\secret.txt`)).toBe(true);
    expect(containsPathLikeText("Read //server/share/secret.txt")).toBe(true);
    expect(containsPathLikeText("Read %5c%5cserver%5cshare%5csecret.txt")).toBe(true);
  });

  it("Given scan and review facts When parsed Then unsafe findings force quarantine before install", () => {
    const scan = {
      id: IDS.scan,
      workspace_id: IDS.workspace,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      skill_id: IDS.skill,
      version_id: IDS.version,
      source_hash: HASH,
      status: "passed",
      findings: [],
      secret_findings: 0,
      scanned_at: TIME,
      descriptor_only: true,
    } as const;
    const review = {
      id: IDS.review,
      workspace_id: IDS.workspace,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      skill_id: IDS.skill,
      version_id: IDS.version,
      scan_id: IDS.scan,
      decision: "approve",
      reviewer_ref: "owner:michael",
      reason: "Source hash and diff match the reviewed learning correction.",
      approved_snapshot_hash: HASH,
      decided_at: TIME,
      descriptor_only: true,
    } as const;

    expect(SkillScanSchema.parse(scan).status).toBe("passed");
    expect(SkillReviewSchema.parse(review).decision).toBe("approve");
    expect(SkillScanSchema.safeParse({ ...scan, secret_findings: 1 }).success).toBe(false);
    expect(SkillScanSchema.safeParse({ ...scan, findings: [{ severity: "critical", code: "SECRET_REF", message: "credential-shaped text" }] }).success).toBe(false);
    expect(SkillReviewSchema.safeParse({ ...review, decision: "approve", approved_snapshot_hash: null }).success).toBe(false);
    expect(SkillReviewSchema.safeParse({ ...review, decision: "quarantine", reason: "secret://skills/live" }).success).toBe(false);
    expect(SkillReviewSchema.safeParse({ ...review, reviewer_ref: "owner:/Users/zq/private" }).success).toBe(false);
  });

  it("Given installations When evaluated Then only approved snapshots are invokable and rollback remains local", () => {
    const installation = {
      id: IDS.install,
      workspace_id: IDS.workspace,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      skill_id: IDS.skill,
      version_id: IDS.version,
      status: "installed",
      approved_snapshot_hash: HASH,
      installed_at: TIME,
      revoked_at: null,
      quarantine_reason: null,
      rollback_to_version_id: null,
      descriptor_only: true,
    } as const;

    expect(canInvokeSkillSnapshot(SkillInstallationSchema.parse(installation))).toBe(true);
    expect(canInvokeSkillSnapshot(SkillInstallationSchema.parse({ ...installation, status: "revoked", revoked_at: TIME }))).toBe(false);
    expect(SkillInstallationSchema.safeParse({ ...installation, status: "installed", approved_snapshot_hash: null }).success).toBe(false);
    expect(SkillInstallationSchema.safeParse({ ...installation, status: "quarantined", quarantine_reason: null }).success).toBe(false);
    expect(canTransitionSkillInstallation("installed", "revoked")).toBe(true);
    expect(canTransitionSkillInstallation("revoked", "installed")).toBe(false);
    expect(canTransitionSkillInstallation("quarantined", "installed")).toBe(false);
  });

  it("Given invocation facts When parsed Then allowed runs must name the approved snapshot", () => {
    const invocation = {
      id: IDS.invocation,
      workspace_id: IDS.workspace,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      skill_id: IDS.skill,
      version_id: IDS.version,
      installation_id: IDS.install,
      run_id: IDS.run,
      goal_loop_id: IDS.goalLoop,
      status: "allowed",
      snapshot_hash: HASH,
      reason: "Installed version matches the approved snapshot.",
      descriptor_only: true,
    } as const;

    expect(SkillInvocationFactSchema.parse(invocation)).toMatchObject({ status: "allowed", snapshot_hash: HASH });
    expect(SkillInvocationFactSchema.safeParse({ ...invocation, status: "allowed", snapshot_hash: null }).success).toBe(false);
    expect(SkillInvocationFactSchema.safeParse({ ...invocation, status: "blocked", snapshot_hash: null }).success).toBe(true);
    expect(SkillInvocationFactSchema.safeParse({ ...invocation, reason: "Read secret://skills/live" }).success).toBe(false);
  });

  it("Given a learning candidate and command When parsed Then /learn remains descriptor-only and scope-bound", () => {
    const candidate = {
      id: IDS.candidate,
      workspace_id: IDS.workspace,
      schema_version: 1,
      created_at: TIME,
      updated_at: TIME,
      run_id: IDS.run,
      goal_loop_id: IDS.goalLoop,
      source_event_id: IDS.event,
      proposed_skill_id: IDS.skill,
      lesson: "When visual QA is required, verify fresh PNG dimensions before completion.",
      proposed_diff_summary: "Adds a reusable visual QA completion rule.",
      evidence_refs: ["artifact://progress/c20/visual-qa-summary.json"],
      status: "needs_review",
      descriptor_only: true,
    } as const;
    const command = {
      schema_version: 1,
      command_id: IDS.command,
      workspace_id: IDS.workspace,
      kind: "learn",
      idempotency_key: "learn:c21:visual-qa-rule",
      expected_revision: null,
      installation_revision: null,
      candidate_id: IDS.candidate,
      skill_id: null,
      version_id: null,
      reason: "Capture the correction as a reusable skill update.",
      rollback_to_version_id: null,
      descriptor_only: true,
      created_at: TIME,
    } as const;

    expect(LearningCandidateSchema.parse(candidate).status).toBe("needs_review");
    expect(LearningCommandSchema.parse(command).kind).toBe("learn");
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["https://example.com/private.pdf"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["vault://providers/openai-api-key"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["artifact://../secrets.txt"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["workspace:///Users/zq/private/SKILL.md"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["workspace://Skills/../../private/SKILL.md"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["workspace://Skills/%2e%2e/private/SKILL.md"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["artifact://https://example.com/private.pdf"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["artifact://https:%2F%2Fexample.com/private.pdf"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["workspace://Skills/..%2525252Fprivate%2525252FSKILL.md"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["workspace://Skills/source=/etc/passwd"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["artifact://progress/token=abcd1234"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["artifact://vault:providers/openai-api-key"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["workspace://D:/private/SKILL.md"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["workspace://D:\\private\\SKILL.md"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, evidence_refs: ["workspace://Skills/%5c%5cserver%5cshare%5csecret.txt"] }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, lesson: "Store api_key=live-token-123" }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, lesson: "Read /Users/zq/private/SKILL.md" }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, lesson: "Read /opt/nexora/private/SKILL.md" }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, lesson: String.raw`Read \\server\share\secret.txt` }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, lesson: "Use vault:providers/openai-api-key" }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, proposed_diff_summary: "Fetch smb://server/share/secret.txt" }).success).toBe(false);
    expect(LearningCommandSchema.safeParse({ ...command, reason: "Use vault:providers/openai-api-key" }).success).toBe(false);
    expect(LearningCandidateSchema.safeParse({ ...candidate, lesson: "source=/etc/passwd must not be persisted" }).success).toBe(false);
    expect(LearningCommandSchema.safeParse({ ...command, kind: "install", version_id: null }).success).toBe(false);
    expect(LearningCommandSchema.safeParse({ ...command, kind: "install", candidate_id: null, version_id: IDS.version, rollback_to_version_id: IDS.version }).success).toBe(false);
    expect(LearningCommandSchema.safeParse({ ...command, kind: "rollback", rollback_to_version_id: null }).success).toBe(false);
    expect(LearningCommandSchema.safeParse({ ...command, descriptor_only: false }).success).toBe(false);
  });
});
