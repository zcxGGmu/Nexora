import { describe, expect, it } from "vitest";
import { LearningSourceEventSchema } from "@nexora/contracts";
import { z } from "zod";
import { createLocalBearerToken } from "../plugins/auth.js";
import { closeControlFixture, createControlFixture, IDS, ownerHeader, seedAttemptStepAndJob, seedRun, TIME, TOKEN_SECRET } from "./test-fixtures.js";
import {
  GoalLoopRepository,
  SkillInstallationRepository,
  SkillInvocationFactRepository,
  SkillRepository,
  SkillReviewRepository,
  SkillScanRepository,
  SkillSourceRepository,
  SkillVersionRepository,
  type SqliteDatabase,
} from "@nexora/persistence";

const SKILL_ID = "skill-visual-qa";
const APPROVED_VERSION_ID = "01SRZ3NDEKTSV4RRFFQ69S5FAV";
const DRAFT_VERSION_ID = "01TRZ3NDEKTSV4RRFFQ69T5FAV";
const SOURCE_ID = "01VRZ3NDEKTSV4RRFFQ69V5FAV";
const SCAN_ID = "01WRZ3NDEKTSV4RRFFQ69W5FAV";
const REVIEW_ID = "01XRZ3NDEKTSV4RRFFQ69X5FAV";
const INSTALLATION_ID = "01YRZ3NDEKTSV4RRFFQ69Y5FAV";
const INVOCATION_ID = "01ZRZ3NDEKTSV4RRFFQ69Z5FAV";
const CANDIDATE_ID = "012RZ3NDEKTSV4RRFFQ69S5FAV";
const SECOND_CANDIDATE_ID = "011RZ3NDEKTSV4RRFFQ69S5FAV";
const MISSING_SKILL_ID = "skill-missing-qa";
const APPROVE_COMMAND_ID = "016RZ3NDEKTSV4RRFFQ69S5FAV";
const INSTALL_COMMAND_ID = "013RZ3NDEKTSV4RRFFQ69S5FAV";
const QUARANTINE_COMMAND_ID = "014RZ3NDEKTSV4RRFFQ69S5FAV";
const ROLLBACK_COMMAND_ID = "015RZ3NDEKTSV4RRFFQ69S5FAV";
const REVOKE_COMMAND_ID = "017RZ3NDEKTSV4RRFFQ69S5FAV";
const OTHER_APPROVED_VERSION_ID = "018RZ3NDEKTSV4RRFFQ69S5FAV";
const SECOND_APPROVED_VERSION_ID = "019RZ3NDEKTSV4RRFFQ69S5FAV";
const SECOND_SOURCE_ID = "01ASR3NDEKTSV4RRFFQ69S5FAV";
const SECOND_SCAN_ID = "01BSR3NDEKTSV4RRFFQ69S5FAV";
const SECOND_REVIEW_ID = "01CSR3NDEKTSV4RRFFQ69S5FAV";
const SIBLING_LOOP_ID = "01XZZ3NDEKTSV4RRFFQ69Z5FAV";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DIFF_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DEADLINE = "2026-09-02T05:00:00.000Z";

const AcceptedCommandSchema = z.object({
  schema_version: z.literal(1),
  command_id: z.string().min(1),
  status: z.literal("accepted"),
  object_type: z.string().min(1),
  object_id: z.string().min(1),
  status_url: z.string().min(1),
  events_url: z.string().nullable(),
}).passthrough();

const ErrorSchema = z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), required_action: z.string() }).passthrough();

describe("C21 Skills/Learning API", () => {
  it("Given skill facts When a run reader lists and opens detail Then lifecycle and descriptor-only boundaries are visible", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);
    seedGoalLoop(fixture.database);
    seedSourceEvent(fixture.database, IDS.event1, IDS.run, 0);
    seedSourceEvent(fixture.database, IDS.event2, IDS.run, 1, MISSING_SKILL_ID);
    seedSkillGraph(fixture.database, true);

    try {
      const list = await fixture.api.inject({ method: "GET", url: `/v1/skills?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/skills/${SKILL_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });
      const crossWorkspace = await fixture.api.inject({ method: "GET", url: `/v1/skills?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader(IDS.otherWorkspace) } });

      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject({ schema_version: 1, skills: [expect.objectContaining({ id: SKILL_ID, descriptor_only: true })] });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        schema_version: 1,
        skill: expect.objectContaining({ id: SKILL_ID, status: "active" }),
        versions: [expect.objectContaining({ id: APPROVED_VERSION_ID, status: "approved", snapshot_hash: HASH })],
        sources: [expect.objectContaining({ source_ref: "workspace://Skills/visual-qa/SKILL.md" })],
        scans: [expect.objectContaining({ status: "passed" })],
        reviews: [expect.objectContaining({ decision: "approve" })],
        installations: [expect.objectContaining({ id: INSTALLATION_ID, status: "installed" })],
        invocation_facts: [expect.objectContaining({ id: INVOCATION_ID, status: "allowed" })],
      });
      expect(crossWorkspace.statusCode).toBe(403);
      expect(JSON.stringify(detail.json())).not.toContain("secret://");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given only a source event and no invocation or candidate When opening skill detail Then first /learn has scoped context", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);
    seedGoalLoop(fixture.database);
    seedSourceEvent(fixture.database, IDS.event1, IDS.run, 0);
    seedSkillGraph(fixture.database, false);

    try {
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/skills/${SKILL_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });

      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        installations: [],
        invocation_facts: [],
        candidates: [],
        learning_contexts: [expect.objectContaining({ workspace_id: IDS.workspace, run_id: IDS.run, goal_loop_id: IDS.event0, source_event_id: IDS.event1, event_type: "learning.source" })],
      });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given another skill has the latest learning source When opening detail Then /learn context remains skill-scoped", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);
    seedGoalLoop(fixture.database);
    seedSourceEvent(fixture.database, IDS.event1, IDS.run, 0, SKILL_ID);
    seedSourceEvent(fixture.database, IDS.event2, IDS.run, 1, "skill-other-approved");
    seedSkillGraph(fixture.database, true);

    try {
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/skills/${SKILL_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });

      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        learning_contexts: [expect.objectContaining({ source_event_id: IDS.event1, event_type: "learning.source" })],
      });
      expect(JSON.stringify(detail.json())).not.toContain(IDS.event2);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given another goal loop has the latest learning source When opening detail Then /learn context remains loop-scoped", async () => {
    const fixture = createControlFixture();
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);
    seedGoalLoop(fixture.database);
    seedSiblingGoalLoop(fixture.database);
    seedSourceEvent(fixture.database, IDS.event1, IDS.run, 0, SKILL_ID, IDS.event0);
    seedSourceEvent(fixture.database, IDS.event2, IDS.run, 1, SKILL_ID, SIBLING_LOOP_ID);
    seedSkillGraph(fixture.database, true);

    try {
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/skills/${SKILL_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });

      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        learning_contexts: [expect.objectContaining({ goal_loop_id: IDS.event0, source_event_id: IDS.event1, event_type: "learning.source" })],
      });
      expect(JSON.stringify(detail.json())).not.toContain(IDS.event2);
      expect(JSON.stringify(detail.json())).not.toContain(SIBLING_LOOP_ID);
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a same-run source event from another loop When /learn creates a candidate Then it is rejected", async () => {
    const fixture = createControlFixture([CANDIDATE_ID]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);
    seedGoalLoop(fixture.database);
    seedSiblingGoalLoop(fixture.database);
    seedSourceEvent(fixture.database, IDS.event2, IDS.run, 0, SKILL_ID, SIBLING_LOOP_ID);
    seedSkillGraph(fixture.database, true);

    try {
      const wrongLoopSource = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:wrong-loop-source", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), source_event_id: IDS.event2 } });

      expect(wrongLoopSource.statusCode).toBe(404);
      expect(ErrorSchema.parse(wrongLoopSource.json())).toMatchObject({ required_action: "check_scope" });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a correction When /learn creates a candidate Then owner write is idempotent and viewer write is denied", async () => {
    const fixture = createControlFixture([CANDIDATE_ID, SECOND_CANDIDATE_ID]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);
    seedGoalLoop(fixture.database);
    seedSourceEvent(fixture.database, IDS.event1, IDS.run, 0);
    seedSkillGraph(fixture.database, true);

    try {
      const first = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:visual-qa", traceparent: IDS.owner }, payload: learningCandidatePayload() });
      const replay = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:visual-qa", traceparent: IDS.owner }, payload: learningCandidatePayload() });
      const conflict = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:visual-qa", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), lesson: "Different correction text with the same diff summary." } });
      const viewer = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: viewerHeader(), "idempotency-key": "learn:c21:viewer", traceparent: IDS.owner }, payload: learningCandidatePayload() });
      const invalid = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:secret", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), evidence_refs: ["file:///Users/zq/private.pdf"], lesson: "Store token=abcd1234" } });
      const pathLeak = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:path", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), evidence_refs: ["vault://providers/openai-api-key"], lesson: "Read /Users/zq/private/SKILL.md" } });
      const secretRef = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:secret-ref", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), evidence_refs: ["artifact://progress/token=abcd1234"] } });
      const nestedSecretRef = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:nested-secret-ref", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), evidence_refs: ["artifact://vault:providers/openai-api-key"] } });
      const driveRef = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:drive-ref", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), evidence_refs: ["workspace://D:\\private\\SKILL.md"] } });
      const uncPathLeak = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:unc-path", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), lesson: String.raw`Read \\server\share\secret.txt`, evidence_refs: ["workspace://Skills/%5c%5cserver%5cshare%5csecret.txt"] } });
      const singleColonCredentialRef = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:single-colon-credential", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), lesson: "Use vault:providers/openai-api-key" } });
      const networkSchemeRef = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:network-scheme", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), proposed_diff_summary: "Fetch smb://server/share/secret.txt" } });
      const statusEscalation = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:status", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), status: "approved" } });
      const missingSourceEvent = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:missing-source-event", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), source_event_id: "01MSR3NDEKTSV4RRFFQ69S5FAV" } });
      const missingProposedSkill = await fixture.api.inject({ method: "POST", url: "/v1/learning/candidates", headers: { authorization: ownerHeader(), "idempotency-key": "learn:c21:missing-proposed-skill", traceparent: IDS.owner }, payload: { ...learningCandidatePayload(), source_event_id: IDS.event2, proposed_skill_id: MISSING_SKILL_ID } });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/skills/${SKILL_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: viewerHeader() } });

      expect(first.statusCode).toBe(202);
      expect(replay.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(replay.json())).toEqual(AcceptedCommandSchema.parse(first.json()));
      expect(AcceptedCommandSchema.parse(first.json())).toMatchObject({ object_type: "learning_candidate", object_id: CANDIDATE_ID });
      expect(conflict.statusCode).toBe(409);
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ candidates: [expect.objectContaining({ id: CANDIDATE_ID, proposed_skill_id: SKILL_ID, status: "needs_review" })] });
      expect(viewer.statusCode).toBe(403);
      expect(invalid.statusCode).toBe(400);
      expect(pathLeak.statusCode).toBe(400);
      expect(secretRef.statusCode).toBe(400);
      expect(nestedSecretRef.statusCode).toBe(400);
      expect(driveRef.statusCode).toBe(400);
      expect(uncPathLeak.statusCode).toBe(400);
      expect(singleColonCredentialRef.statusCode).toBe(400);
      expect(networkSchemeRef.statusCode).toBe(400);
      expect(statusEscalation.statusCode).toBe(400);
      expect(missingSourceEvent.statusCode).toBe(404);
      expect(missingProposedSkill.statusCode).toBe(404);
      expect(ErrorSchema.parse(missingProposedSkill.json())).toMatchObject({ required_action: "check_scope" });
      expect(countLearningCandidatesBySkill(fixture.database, MISSING_SKILL_ID)).toBe(0);
      expect(countLearningCommandsByIdempotencyKey(fixture.database, "learn:c21:missing-proposed-skill")).toBe(0);
      expect(JSON.stringify(invalid.json())).not.toContain("abcd1234");
      expect(JSON.stringify(invalid.json())).not.toContain("/Users/zq");
      expect(JSON.stringify(uncPathLeak.json())).not.toContain("server");
      expect(JSON.stringify(nestedSecretRef.json())).not.toContain("openai-api-key");
      expect(JSON.stringify(singleColonCredentialRef.json())).not.toContain("openai-api-key");
      expect(JSON.stringify(networkSchemeRef.json())).not.toContain("server");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given approved and draft skill versions When lifecycle commands run Then If-Match idempotency and approved snapshots are enforced", async () => {
    const fixture = createControlFixture([INSTALLATION_ID, INSTALL_COMMAND_ID, QUARANTINE_COMMAND_ID, ROLLBACK_COMMAND_ID]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);
    seedGoalLoop(fixture.database);
    seedSkillGraph(fixture.database, false);
    seedSecondApprovedVersion(fixture.database);

    try {
      const draftInstall = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/install`, headers: lifecycleHeaders("skill:install:draft", "2"), payload: lifecyclePayload(DRAFT_VERSION_ID) });
      const install = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/install`, headers: lifecycleHeaders("skill:install:c21", "2"), payload: lifecyclePayload(APPROVED_VERSION_ID) });
      const installReplay = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/install`, headers: lifecycleHeaders("skill:install:c21", "2"), payload: lifecyclePayload(APPROVED_VERSION_ID) });
      const duplicateInstall = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/install`, headers: lifecycleHeaders("skill:install:c21:duplicate", "2"), payload: lifecyclePayload(APPROVED_VERSION_ID) });
      const secondVersionInstall = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/install`, headers: lifecycleHeaders("skill:install:c21:second-version", "2"), payload: lifecyclePayload(SECOND_APPROVED_VERSION_ID) });
      const missingMatch = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/quarantine`, headers: { authorization: ownerHeader(), "idempotency-key": "skill:quarantine:missing-match", traceparent: IDS.owner }, payload: lifecyclePayload(APPROVED_VERSION_ID) });
      const viewer = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/quarantine`, headers: { ...lifecycleHeaders("skill:quarantine:viewer", "1"), authorization: viewerHeader() }, payload: lifecyclePayload(APPROVED_VERSION_ID, "Critical scan finding.", 1) });
      const missingInstallationRevision = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/quarantine`, headers: lifecycleHeaders("skill:quarantine:missing-install-revision", "3"), payload: lifecyclePayload(APPROVED_VERSION_ID, "Critical scan finding.") });
      const quarantine = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/quarantine`, headers: lifecycleHeaders("skill:quarantine:c21", "3"), payload: lifecyclePayload(APPROVED_VERSION_ID, "Critical scan finding.", 1) });
      const noOpRollback = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/rollback`, headers: lifecycleHeaders("skill:rollback:no-op", "4"), payload: { ...lifecyclePayload(APPROVED_VERSION_ID, "Rollback must target a different reviewed snapshot.", 2), rollback_to_version_id: APPROVED_VERSION_ID } });
      const rollback = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/rollback`, headers: lifecycleHeaders("skill:rollback:c21", "4"), payload: { ...lifecyclePayload(APPROVED_VERSION_ID, "Rollback to reviewed snapshot.", 2), rollback_to_version_id: SECOND_APPROVED_VERSION_ID } });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/skills/${SKILL_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(install.statusCode).toBe(202);
      expect(installReplay.statusCode).toBe(202);
      expect(AcceptedCommandSchema.parse(installReplay.json())).toEqual(AcceptedCommandSchema.parse(install.json()));
      expect(duplicateInstall.statusCode).toBe(409);
      expect(secondVersionInstall.statusCode).toBe(409);
      expect(draftInstall.statusCode).toBe(409);
      expect(ErrorSchema.parse(draftInstall.json())).toMatchObject({ required_action: "inspect_constraint" });
      expect(missingMatch.statusCode).toBe(428);
      expect(viewer.statusCode).toBe(403);
      expect(missingInstallationRevision.statusCode).toBe(400);
      expect(quarantine.statusCode).toBe(202);
      expect(noOpRollback.statusCode).toBe(409);
      expect(rollback.statusCode).toBe(202);
      expect(detail.json()).toMatchObject({ installations: [expect.objectContaining({ id: INSTALLATION_ID, status: "rolled_back", rollback_to_version_id: SECOND_APPROVED_VERSION_ID })] });
      expect(JSON.stringify(detail.json())).not.toContain("external_skill_executed");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a non-rollback lifecycle command carries rollback target When posted Then schema rejects it before idempotent replay", async () => {
    const fixture = createControlFixture([INSTALL_COMMAND_ID]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);
    seedGoalLoop(fixture.database);
    seedSkillGraph(fixture.database, false);

    try {
      const invalidInstall = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/install`, headers: lifecycleHeaders("skill:install:rollback-field", "2"), payload: { ...lifecyclePayload(APPROVED_VERSION_ID), rollback_to_version_id: APPROVED_VERSION_ID } });
      const replayWithDifferentTarget = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/install`, headers: lifecycleHeaders("skill:install:rollback-field", "2"), payload: { ...lifecyclePayload(APPROVED_VERSION_ID), rollback_to_version_id: DRAFT_VERSION_ID } });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/skills/${SKILL_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(invalidInstall.statusCode).toBe(400);
      expect(replayWithDifferentTarget.statusCode).toBe(400);
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ installations: [] });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a raw approved version without trust facts When approve is requested Then the skill pointer is not promoted", async () => {
    const fixture = createControlFixture([APPROVE_COMMAND_ID]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);
    seedGoalLoop(fixture.database);
    seedSkillGraph(fixture.database, true);
    insertRawUnreviewedApprovedVersion(fixture.database);

    try {
      const approve = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/approve`, headers: lifecycleHeaders("skill:approve:raw-unreviewed", "2"), payload: lifecyclePayload(SECOND_APPROVED_VERSION_ID, "Approve reviewed snapshot.") });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/skills/${SKILL_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(approve.statusCode).toBe(409);
      expect(detail.json()).toMatchObject({ skill: expect.objectContaining({ approved_version_id: APPROVED_VERSION_ID, current_version_id: APPROVED_VERSION_ID }) });
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given an installed approved skill When approve and revoke commands run Then control routes are connected and append-only", async () => {
    const fixture = createControlFixture([APPROVE_COMMAND_ID, REVOKE_COMMAND_ID]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);
    seedGoalLoop(fixture.database);
    seedSkillGraph(fixture.database, true);

    try {
      const approve = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/approve`, headers: lifecycleHeaders("skill:approve:c21", "2"), payload: lifecyclePayload(APPROVED_VERSION_ID, "Approve reviewed snapshot.") });
      const staleRevoke = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/revoke`, headers: lifecycleHeaders("skill:revoke:c21:stale", "2"), payload: lifecyclePayload(APPROVED_VERSION_ID, "Revoke installed snapshot.", 1) });
      const revoke = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/revoke`, headers: lifecycleHeaders("skill:revoke:c21", "3"), payload: lifecyclePayload(APPROVED_VERSION_ID, "Revoke installed snapshot.", 1) });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/skills/${SKILL_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(approve.statusCode).toBe(202);
      expect(staleRevoke.statusCode).toBe(409);
      expect(ErrorSchema.parse(staleRevoke.json())).toMatchObject({ code: "VERSION_CONFLICT", required_action: "refresh_state" });
      expect(revoke.statusCode).toBe(202);
      expect(detail.json()).toMatchObject({ installations: [expect.objectContaining({ id: INSTALLATION_ID, status: "revoked", revoked_at: TIME })] });
      expect(JSON.stringify(detail.json())).not.toContain("external_skill_executed");
    } finally {
      await closeControlFixture(fixture);
    }
  });

  it("Given a rollback target from another skill When requested Then it is rejected before changing installation state", async () => {
    const fixture = createControlFixture([ROLLBACK_COMMAND_ID]);
    seedRun(fixture.database, "running");
    seedAttemptStepAndJob(fixture.database);
    seedSession(fixture.database);
    seedGoalLoop(fixture.database);
    seedSkillGraph(fixture.database, true);
    seedOtherSkillVersion(fixture.database);

    try {
      const rollback = await fixture.api.inject({ method: "POST", url: `/v1/skills/${SKILL_ID}/rollback`, headers: lifecycleHeaders("skill:rollback:foreign", "2"), payload: { ...lifecyclePayload(APPROVED_VERSION_ID, "Rollback to reviewed snapshot.", 1), rollback_to_version_id: OTHER_APPROVED_VERSION_ID } });
      const detail = await fixture.api.inject({ method: "GET", url: `/v1/skills/${SKILL_ID}?workspace_id=${IDS.workspace}`, headers: { authorization: ownerHeader() } });

      expect(rollback.statusCode).toBe(409);
      expect(detail.json()).toMatchObject({ installations: [expect.objectContaining({ id: INSTALLATION_ID, status: "installed", rollback_to_version_id: null })] });
    } finally {
      await closeControlFixture(fixture);
    }
  });
});

function lifecycleHeaders(key: string, version: string) {
  return { authorization: ownerHeader(), "idempotency-key": key, "if-match": version, traceparent: IDS.owner };
}

function viewerHeader(): string {
  return createLocalBearerToken({ workspace_id: IDS.workspace, actor_id: IDS.owner, role: "Viewer", tokenSecret: TOKEN_SECRET });
}

function seedSession(database: SqliteDatabase): void {
  database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES ('gateway-c21', ?, 'Gateway C21', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME, TIME);
  database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES ('channel-c21', ?, 'gateway-c21', 'Channel C21', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'gateway-c21', 'channel-c21', ?, ?, NULL, 'background', 'active', 'turn-1', NULL, ?, '{}', 1, ?, ?)").run(IDS.attempt, IDS.workspace, IDS.agent, IDS.run, TIME, TIME, TIME);
}

function seedGoalLoop(database: SqliteDatabase): void {
  new GoalLoopRepository(database).create({ id: IDS.event0, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, run_id: IDS.run, session_id: IDS.attempt, parent_loop_id: null, root_loop_id: IDS.event0, status: "running", objective: "Learn from the correction.", definition_of_done: ["Candidate is reviewed."], max_turns: 5, turn_count: 1, budget: { max_tokens: 10_000, max_cost_usd: 1 }, deadline_at: DEADLINE, continuation_cursor: "turn-1", judge: { done: false, reason: "Continue." }, descriptor_only: true });
}

function seedSiblingGoalLoop(database: SqliteDatabase): void {
  new GoalLoopRepository(database).create({ id: SIBLING_LOOP_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, run_id: IDS.run, session_id: IDS.attempt, parent_loop_id: null, root_loop_id: SIBLING_LOOP_ID, status: "running", objective: "Sibling learning loop.", definition_of_done: ["Candidate is reviewed."], max_turns: 5, turn_count: 1, budget: { max_tokens: 10_000, max_cost_usd: 1 }, deadline_at: DEADLINE, continuation_cursor: "turn-1", judge: { done: false, reason: "Continue." }, descriptor_only: true });
}

function seedSkillGraph(database: SqliteDatabase, install: boolean): void {
  const skills = new SkillRepository(database);
  skills.create(draftSkill());
  new SkillVersionRepository(database).create(version(APPROVED_VERSION_ID, "approved"));
  new SkillVersionRepository(database).create(version(DRAFT_VERSION_ID, "draft"));
  new SkillSourceRepository(database).record(source());
  new SkillScanRepository(database).record(scan());
  new SkillReviewRepository(database).record(review());
  skills.update(skill(), 1);
  if (install) {
    new SkillInstallationRepository(database).install(installation());
    new SkillInvocationFactRepository(database).record(invocation());
  }
}

function seedOtherSkillVersion(database: SqliteDatabase): void {
  const otherSkillId = "skill-other-approved";
  new SkillRepository(database).create({ ...draftSkill(), id: otherSkillId, name: "Other Approved Skill", capabilities: ["qa:other"] });
  new SkillVersionRepository(database).create({ ...version(OTHER_APPROVED_VERSION_ID, "approved"), skill_id: otherSkillId, semver: "2.0.0" });
}

function seedSecondApprovedVersion(database: SqliteDatabase): void {
  new SkillVersionRepository(database).create({ ...version(SECOND_APPROVED_VERSION_ID, "approved"), semver: "1.2.0", snapshot_ref: "artifact://skills/visual-qa/1.2.0/SKILL.md" });
  new SkillSourceRepository(database).record({ ...source(), id: SECOND_SOURCE_ID, version_id: SECOND_APPROVED_VERSION_ID, source_ref: "workspace://Skills/visual-qa/1.2.0/SKILL.md" });
  new SkillScanRepository(database).record({ ...scan(), id: SECOND_SCAN_ID, version_id: SECOND_APPROVED_VERSION_ID });
  new SkillReviewRepository(database).record({ ...review(), id: SECOND_REVIEW_ID, version_id: SECOND_APPROVED_VERSION_ID, scan_id: SECOND_SCAN_ID });
}

function insertRawUnreviewedApprovedVersion(database: SqliteDatabase): void {
  const payload = JSON.stringify({ ...version(SECOND_APPROVED_VERSION_ID, "approved"), semver: "1.2.0", snapshot_ref: "artifact://skills/visual-qa/1.2.0/SKILL.md", diff_summary: "Raw unreviewed version." });
  database.prepare("INSERT INTO skill_versions(id, workspace_id, skill_id, semver, status, source_hash, snapshot_hash, snapshot_ref, diff_hash, diff_summary, approved_at, approved_by, revoked_at, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, '1.2.0', 'approved', ?, ?, 'artifact://skills/visual-qa/1.2.0/SKILL.md', ?, 'Raw unreviewed version.', ?, 'owner:michael', NULL, NULL, 1, ?, 1, ?, ?)").run(SECOND_APPROVED_VERSION_ID, IDS.workspace, SKILL_ID, HASH, HASH, DIFF_HASH, TIME, payload, TIME, TIME);
}

function skill(): object {
  return { id: SKILL_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, name: "Visual QA", description: "Captures reusable visual QA rules.", status: "active", current_version_id: APPROVED_VERSION_ID, approved_version_id: APPROVED_VERSION_ID, capabilities: ["qa:visual"], tags: ["qa"], quarantine_reason: null, descriptor_only: true };
}

function draftSkill(): object {
  return { ...skill(), status: "draft", current_version_id: null, approved_version_id: null };
}

function version(id: string, status: "approved" | "draft"): object {
  return { id, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: SKILL_ID, semver: status === "approved" ? "1.0.0" : "1.1.0", status, source_hash: HASH, snapshot_hash: status === "approved" ? HASH : null, snapshot_ref: status === "approved" ? "artifact://skills/visual-qa/1.0.0/SKILL.md" : null, diff_hash: DIFF_HASH, diff_summary: "Adds a visual QA learning rule.", approved_at: status === "approved" ? TIME : null, approved_by: status === "approved" ? "owner:michael" : null, revoked_at: null, rollback_to_version_id: null, descriptor_only: true };
}

function source(): object {
  return { id: SOURCE_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: SKILL_ID, version_id: APPROVED_VERSION_ID, source_kind: "workspace", source_ref: "workspace://Skills/visual-qa/SKILL.md", source_hash: HASH, diff_hash: DIFF_HASH, diff_summary: "Adds a reusable visual QA correction.", descriptor_only: true };
}

function scan(): object {
  return { id: SCAN_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: SKILL_ID, version_id: APPROVED_VERSION_ID, source_hash: HASH, status: "passed", findings: [], secret_findings: 0, scanned_at: TIME, descriptor_only: true };
}

function review(): object {
  return { id: REVIEW_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: SKILL_ID, version_id: APPROVED_VERSION_ID, scan_id: SCAN_ID, decision: "approve", reviewer_ref: "owner:michael", reason: "Reviewed source hash and approved snapshot.", approved_snapshot_hash: HASH, decided_at: TIME, descriptor_only: true };
}

function installation(): object {
  return { id: INSTALLATION_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: SKILL_ID, version_id: APPROVED_VERSION_ID, status: "installed", approved_snapshot_hash: HASH, installed_at: TIME, revoked_at: null, quarantine_reason: null, rollback_to_version_id: null, descriptor_only: true };
}

function invocation(): object {
  return { id: INVOCATION_ID, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: SKILL_ID, version_id: APPROVED_VERSION_ID, installation_id: INSTALLATION_ID, run_id: IDS.run, goal_loop_id: IDS.event0, status: "allowed", snapshot_hash: HASH, reason: "Installed version matches the approved snapshot.", descriptor_only: true };
}

function learningCandidatePayload(): object {
  return { schema_version: 1, workspace_id: IDS.workspace, run_id: IDS.run, goal_loop_id: IDS.event0, source_event_id: IDS.event1, proposed_skill_id: SKILL_ID, lesson: "Fresh visual QA evidence is required before marking a UI stage complete.", proposed_diff_summary: "Adds a visual QA evidence rule.", evidence_refs: ["artifact://progress/c20/visual-qa-summary.json"], descriptor_only: true };
}

function countLearningCandidatesBySkill(database: SqliteDatabase, skillId: string): number {
  const row = database.prepare("SELECT COUNT(*) AS count FROM learning_candidates WHERE workspace_id = ? AND proposed_skill_id = ?").get(IDS.workspace, skillId);
  return Number(row?.["count"] ?? 0);
}

function countLearningCommandsByIdempotencyKey(database: SqliteDatabase, idempotencyKey: string): number {
  const row = database.prepare("SELECT COUNT(*) AS count FROM learning_commands WHERE workspace_id = ? AND idempotency_key = ?").get(IDS.workspace, idempotencyKey);
  return Number(row?.["count"] ?? 0);
}

function lifecyclePayload(versionId: string, reason = "Install reviewed visual QA snapshot.", installationRevision?: number): object {
  const base = { schema_version: 1, workspace_id: IDS.workspace, version_id: versionId, reason };
  if (installationRevision === undefined) return base;
  return { ...base, installation_revision: installationRevision };
}

function seedSourceEvent(database: SqliteDatabase, eventId: string, runId: string, sequence: number, skillId: string = SKILL_ID, goalLoopId: string = IDS.event0): void {
  const payload = LearningSourceEventSchema.parse({
    event_id: eventId,
    event_type: "learning.source",
    schema_version: 1,
    occurred_at: TIME,
    workspace_id: IDS.workspace,
    scope: { kind: "run", id: runId },
    trace_id: IDS.owner,
    run_id: runId,
    attempt_id: null,
    step_id: null,
    actor: { type: "human", id: IDS.owner },
    payload: { descriptor_only: true, proposed_skill_id: skillId, goal_loop_id: goalLoopId, continuation_cursor: "turn-1" },
    redactions: [],
    sequence,
  });
  database.prepare("INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, ?, 'learning.source', ?, ?, ?, NULL, NULL, ?, 1)").run(eventId, IDS.workspace, runId, sequence, TIME, TIME, IDS.owner, JSON.stringify(payload));
}
