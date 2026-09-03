import { describe, expect, it } from "vitest";
import { LearningSourceEventSchema } from "@nexora/contracts";
import { CORE_MIGRATION_VERSION, migrate, openDatabase, type SqliteDatabase } from "./index.js";
import {
  GoalLoopRepository,
  LearningCandidateRepository,
  LearningCommandRepository,
  SkillInstallationRepository,
  SkillInvocationFactRepository,
  SkillRepository,
  SkillReviewRepository,
  SkillScanRepository,
  SkillSourceRepository,
  SkillVersionRepository,
} from "./repositories/index.js";

const IDS = {
  workspace: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  otherWorkspace: "01BRZ3NDEKTSV4RRFFQ69H5FAV",
  agent: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
  goal: "01CRZ3NDEKTSV4RRFFQ69G5FAV",
  ticket: "01DRZ3NDEKTSV4RRFFQ69G5FAV",
  run: "01ERZ3NDEKTSV4RRFFQ69G5FAV",
  gateway: "gateway-c21",
  channel: "channel-c21",
  session: "01FRZ3NDEKTSV4RRFFQ69G5FAV",
  loop: "01GRZ3NDEKTSV4RRFFQ69G5FAV",
  siblingLoop: "01GZZ3NDEKTSV4RRFFQ69G5FAV",
  event: "01VRZ3NDEKTSV4RRFFQ69V5FAV",
  siblingLoopEvent: "01PZZ3NDEKTSV4RRFFQ69P5FAV",
  missingSkillEvent: "01TZZ3NDEKTSV4RRFFQ69T5FAV",
  versionSecondApproved: "01SRZ3NDEKTSV4RRFFQ69S5FAV",
    otherTicket: "01WRZ3NDEKTSV4RRFFQ69W5FAV",
    otherRun: "01XRZ3NDEKTSV4RRFFQ69X5FAV",
    otherEvent: "01YRZ3NDEKTSV4RRFFQ69Y5FAV",
    foreignSkillEvent: "01KZZ3NDEKTSV4RRFFQ69K5FAV",
    missingEvent: "01ZRZ3NDEKTSV4RRFFQ69Z5FAV",
  skill: "skill-visual-qa",
  versionApproved: "01HRZ3NDEKTSV4RRFFQ69H5FAV",
  versionDraft: "01JRZ3NDEKTSV4RRFFQ69J5FAV",
  source: "01KRZ3NDEKTSV4RRFFQ69K5FAV",
  scan: "01MRZ3NDEKTSV4RRFFQ69M5FAV",
  review: "01NRZ3NDEKTSV4RRFFQ69N5FAV",
  install: "01PRZ3NDEKTSV4RRFFQ69P5FAV",
  invocation: "01QRZ3NDEKTSV4RRFFQ69Q5FAV",
  candidate: "01RRZ3NDEKTSV4RRFFQ69R5FAV",
  commandA: "01SRZ3NDEKTSV4RRFFQ69S5FAV",
  commandB: "01TRZ3NDEKTSV4RRFFQ69T5FAV",
};

const TIME = "2026-09-02T04:00:00.000Z";
const LATER = "2026-09-02T04:05:00.000Z";
const DEADLINE = "2026-09-02T05:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DIFF_HASH = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("C21 skills and learning persistence", () => {
  it("Given migrations run When schema is validated Then C21 tables and current migration exist", () => {
    const database = openDatabase(":memory:");
    try {
      migrate(database, { now: () => TIME });
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row["name"]);

      expect(database.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row["version"])).toEqual(currentMigrationVersions());
      expect(tables).toEqual(expect.arrayContaining(["skills", "skill_versions", "skill_sources", "skill_scans", "skill_reviews", "skill_installations", "skill_invocation_facts", "learning_candidates", "learning_commands"]));
    } finally {
      database.close();
    }
  });

  it("Given raw SQL bypass attempts When inserting trust facts Then DB constraints bind skills versions scans and snapshots", () => {
    const database = createDatabase();
    try {
      seedSkillLifecycle(database);
      seedOtherSkillLifecycle(database);

      expect(() => insertRawApprovedVersionWithoutSnapshotRef(database, "01TRZ3NDEKTSV4RRFFQ69T5FAV")).toThrow(/approved|snapshot|metadata|abort/i);
      expect(() => {
        insertRawApprovedVersionWithSnapshotRef(database, { version_id: "01GZZ3NDEKTSV4RRFFQ69G5FAV", snapshot_ref: "file:///etc/passwd" });
        insertRawInstallation(database, { id: "01HZZ3NDEKTSV4RRFFQ69H5FAV", version_id: "01GZZ3NDEKTSV4RRFFQ69G5FAV", snapshot_hash: HASH });
      }).toThrow(/snapshot|ref|descriptor|abort/i);
      expect(() => {
        insertRawApprovedVersionWithSnapshotRef(database, { version_id: "01IZZ3NDEKTSV4RRFFQ69I5FAV", snapshot_ref: "artifact://../secrets.txt" });
        insertRawInstallation(database, { id: "01JZZ3NDEKTSV4RRFFQ69J5FAV", version_id: "01IZZ3NDEKTSV4RRFFQ69I5FAV", snapshot_hash: HASH });
      }).toThrow(/snapshot|ref|descriptor|abort/i);
      insertRawApprovedVersionWithSnapshotRef(database, { version_id: "01NZZ3NDEKTSV4RRFFQ69N5FAV", snapshot_ref: "artifact://skills/unreviewed/1.0.0/SKILL.md" });
      expect(() => insertRawInstallation(database, { id: "01MZZ3NDEKTSV4RRFFQ69M5FAV", version_id: "01NZZ3NDEKTSV4RRFFQ69N5FAV", snapshot_hash: HASH })).toThrow(/scan|review|snapshot|abort/i);
      expect(() => new SkillVersionRepository(database).approve({ workspace_id: IDS.workspace, skill_id: IDS.skill, version_id: "01NZZ3NDEKTSV4RRFFQ69N5FAV", approved_by: "owner:michael", approved_at: TIME })).toThrow(/scan|review|snapshot/i);
      expect(() => updateRawSkillPointers(database, IDS.versionDraft)).toThrow(/approved|snapshot|skill|version|abort/i);
      expect(() => insertRawActiveSkillWithUntrustedPointer(database)).toThrow(/approved|snapshot|skill|version|abort/i);
      expect(() => updateRawSkillCurrentPointerOnly(database, IDS.versionDraft)).toThrow(/approved|snapshot|skill|version|abort/i);
      expect(() => updateRawSkillPayloadPointerDrift(database, IDS.versionDraft)).toThrow(/payload|column|skill|version|abort/i);
      expect(() => updateRawApprovedVersionToDraft(database)).toThrow(/approved|snapshot|trust|abort/i);
      expect(() => insertRawSkillWithUnsafeText(database, "skill-raw-drive-path", "Read D:/private/SKILL.md during setup.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawSkillWithUnsafeText(database, "skill-raw-backslash-path", "Read D:\\private\\SKILL.md during setup.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawSkillWithUnsafeText(database, "skill-raw-unc-path", String.raw`Read \\server\share\secret.txt during setup.`)).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawApprovedVersionWithUnsafeDiff(database, "01OZZ3NDEKTSV4RRFFQ69O5FAV", "Store password=abcd1234 in the skill diff.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawApprovedVersionWithUnsafeDiff(database, "01SZZ3NDEKTSV4RRFFQ69S5FAV", "Use Bearer abcdefghijklmnop for approval.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawApprovedVersionWithUnsafeDiff(database, "01UTZ3NDEKTSV4RRFFQ69T5FAV", "Use vault:providers/openai-api-key for approval.")).toThrow(/text|secret|path|abort/i);
      expect(() => updateRawApprovedVersionUnsafeDiff(database, "Read /private/nexora/SKILL.md before approval.")).toThrow(/text|secret|path|abort/i);
      expect(() => updateRawApprovedVersionUnsafeDiff(database, "Fetch smb://server/share/secret.txt before approval.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawApprovedVersionWithSnapshotRef(database, { version_id: "01ZTZ3NDEKTSV4RRFFQ69T5FAV", snapshot_ref: "artifact://skills/token=abcd1234/SKILL.md" })).toThrow(/snapshot|ref|descriptor|abort/i);
      expect(() => insertRawApprovedVersionWithSnapshotRef(database, { version_id: "01ZPZ3NDEKTSV4RRFFQ69P5FAV", snapshot_ref: "artifact://C:/private/SKILL.md" })).toThrow(/snapshot|ref|descriptor|abort/i);
      expect(() => insertRawApprovedVersionWithSnapshotRef(database, { version_id: "01ZUZ3NDEKTSV4RRFFQ69U5FAV", snapshot_ref: "artifact://D:\\private\\SKILL.md" })).toThrow(/snapshot|ref|descriptor|abort/i);
      expect(() => insertRawSource(database, { id: "01WZZ3NDEKTSV4RRFFQ69W5FAV", skill_id: IDS.skill, version_id: "01XZZ3NDEKTSV4RRFFQ69X5FAV" })).toThrow(/skill|version|scope|abort/i);
      expect(() => insertRawSourceWithUnsafeRef(database, "01BZZ3NDEKTSV4RRFFQ69B5FAV", "workspace://Skills/source=/etc/passwd")).toThrow(/source|ref|descriptor|abort/i);
      expect(() => insertRawSourceWithUnsafeRef(database, "01UZZ3NDEKTSV4RRFFQ69U5FAV", "workspace://Skills/..")).toThrow(/source|ref|descriptor|abort/i);
      expect(() => insertRawSourceWithUnsafeRef(database, "01ZRZ3NDEKTSV4RRFFQ69R5FAV", "workspace://Skills/token=abcd1234/SKILL.md")).toThrow(/source|ref|descriptor|abort/i);
      expect(() => insertRawSourceWithUnsafeRef(database, "01ZQZ3NDEKTSV4RRFFQ69Q5FAV", "workspace://D:/private/SKILL.md")).toThrow(/source|ref|descriptor|abort/i);
      expect(() => insertRawSourceWithUnsafeRef(database, "01ZVZ3NDEKTSV4RRFFQ69V5FAV", "workspace://D:\\private\\SKILL.md")).toThrow(/source|ref|descriptor|abort/i);
      expect(() => insertRawSourceWithUnsafeDiff(database, "01RZZ3NDEKTSV4RRFFQ69R5FAV", "Read /Users/zq/private/SKILL.md before applying.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawSourceWithUnsafeDiff(database, "01ZAZ3NDEKTSV4RRFFQ69A5FAV", "Read C:/nexora/private/SKILL.md before applying.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawApprovedVersionWithSnapshotRef(database, { version_id: "01LZZ3NDEKTSV4RRFFQ69L5FAV", snapshot_ref: "artifact://skills/.." })).toThrow(/snapshot|ref|descriptor|abort/i);
      expect(() => insertRawScan(database, { id: "01YZZ3NDEKTSV4RRFFQ69Y5FAV", skill_id: IDS.skill, version_id: "01XZZ3NDEKTSV4RRFFQ69X5FAV" })).toThrow(/skill|version|scope|abort/i);
      expect(() => insertRawScanWithUnsafeFinding(database, "01QZZ3NDEKTSV4RRFFQ69Q5FAV", "Saw token=abcd1234 in scan output.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawScanWithUnsafeFinding(database, "01ZBZ3NDEKTSV4RRFFQ69B5FAV", "Saw AKIAIOSFODNN7EXAMPLE in scan output.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawReview(database, { id: "01ZZZ3NDEKTSV4RRFFQ69Z5FAV", skill_id: IDS.skill, version_id: IDS.versionApproved, scan_id: "01AZZ3NDEKTSV4RRFFQ69A5FAV" })).toThrow(/scan|skill|version|scope|abort/i);
      expect(() => insertRawReviewWithUnsafeReason(database, "01PZZ3NDEKTSV4RRFFQ69P5FAV", "Reviewer saw token=abcd1234 in the diff.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawInstallationWithUnsafeReason(database, "01YZZ3NDEKTSV4RRFFQ69Y5FAV", "file:///Users/zq/private/SKILL.md")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawInstallationWithUnsafeReason(database, "01ZCZ3NDEKTSV4RRFFQ69C5FAV", "Use sk-test-abcdefgh for quarantine follow-up.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawDirtyPassedScan(database, "01DZZ3NDEKTSV4RRFFQ69D5FAV")).toThrow(/scan|findings|passed|abort/i);
      insertRawFailedScan(database, "01EZZ3NDEKTSV4RRFFQ69E5FAV");
      expect(() => insertRawReview(database, { id: "01FZZ3NDEKTSV4RRFFQ69F5FAV", skill_id: IDS.skill, version_id: IDS.versionApproved, scan_id: "01EZZ3NDEKTSV4RRFFQ69E5FAV" })).toThrow(/scan|passed|clean|abort/i);
    } finally {
      database.close();
    }
  });

  it("Given approved and draft skill versions When installing Then only approved snapshots become invokable", () => {
    const database = createDatabase();
    try {
      seedSkillLifecycle(database);
      const installations = new SkillInstallationRepository(database);
      const installed = installations.install(installation(IDS.versionApproved));

      expect(installed).toMatchObject({ skill_id: IDS.skill, version_id: IDS.versionApproved, status: "installed", approved_snapshot_hash: HASH });
      expect(installations.get(IDS.workspace, IDS.install)).toMatchObject({ status: "installed" });
      expect(() => installations.install({ ...installation(IDS.versionApproved), id: IDS.commandA })).toThrow(/already|unique|constraint|installed/i);
      expect(() => installations.install({ ...installation(IDS.versionSecondApproved), id: IDS.commandA })).toThrow(/already|unique|constraint|installed/i);
      expect(() => installations.install({ ...installation(IDS.versionDraft), id: IDS.commandA })).toThrow(/approved|snapshot|version/i);
      expect(() => insertRawInstallation(database, { id: IDS.commandB, version_id: IDS.versionSecondApproved, snapshot_hash: HASH })).toThrow(/unique|constraint|abort/i);
      expect(() => insertRawInstallation(database, { id: IDS.commandB, version_id: IDS.versionDraft, snapshot_hash: HASH })).toThrow(/approved|snapshot|abort/i);
      expect(installations.list(IDS.otherWorkspace)).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("Given scan review source and invocation facts When stored Then audit facts are append-only and scoped", () => {
    const database = createDatabase();
    try {
      seedSkillLifecycle(database);
      new SkillInstallationRepository(database).install(installation(IDS.versionApproved));
      const invocations = new SkillInvocationFactRepository(database);

      expect(new SkillSourceRepository(database).listByVersion(IDS.workspace, IDS.versionApproved)).toHaveLength(1);
      expect(new SkillScanRepository(database).listByVersion(IDS.workspace, IDS.versionApproved)).toHaveLength(1);
      expect(new SkillReviewRepository(database).listByVersion(IDS.workspace, IDS.versionApproved)).toHaveLength(1);
      expect(invocations.record(invocation("allowed", HASH))).toMatchObject({ status: "allowed", snapshot_hash: HASH });
      expect(invocations.listByRun(IDS.workspace, IDS.run)).toEqual([expect.objectContaining({ id: IDS.invocation, status: "allowed" })]);
      expect(() => invocations.record({ ...invocation("allowed", HASH), id: IDS.commandA, snapshot_hash: DIFF_HASH })).toThrow(/approved|snapshot|installation/i);
      expect(() => invocations.record({ ...invocation("allowed", HASH), id: IDS.commandB, goal_loop_id: "01WRZ3NDEKTSV4RRFFQ69W5FAV" })).toThrow(/run|goal/i);
      expect(() => insertRawInvocation(database, { ...invocation("allowed", HASH), id: IDS.commandB, goal_loop_id: "01WRZ3NDEKTSV4RRFFQ69W5FAV" })).toThrow(/run|goal|scope|abort/i);
      expect(() => database.prepare("UPDATE skill_reviews SET reason = 'mutated' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.review)).toThrow(/append-only|abort/i);
      expect(() => database.prepare("DELETE FROM skill_scans WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.scan)).toThrow(/append-only|abort/i);
      expect(() => database.prepare("DELETE FROM skill_invocation_facts WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.invocation)).toThrow(/append-only|abort/i);
    } finally {
      database.close();
    }
  });

  it("Given learning candidates and commands When replayed Then exact idempotency replays and conflicts are rejected", () => {
    const database = createDatabase();
    try {
      seedSkillLifecycle(database);
      const candidates = new LearningCandidateRepository(database);
      const commands = new LearningCommandRepository(database);

      expect(candidates.create(candidate())).toMatchObject({ id: IDS.candidate, run_id: IDS.run, goal_loop_id: IDS.loop, status: "needs_review" });
      expect(() => candidates.create({ ...candidate(), id: IDS.commandA, source_event_id: IDS.missingEvent })).toThrow(/source event|scope/i);
      expect(() => candidates.create({ ...candidate(), id: IDS.commandA, source_event_id: IDS.otherEvent })).toThrow(/source event|scope/i);
      expect(() => insertRawMalformedLearningSourceEvent(database, "01LZZ3NDEKTSV4RRFFQ69L5FAV")).toThrow(/learning source event|envelope|abort/i);
      expect(() => insertRawLearningSourceEventWithInvalidActorId(database, "01CZZ3NDEKTSV4RRFFQ69C5FAV")).toThrow(/learning source event|envelope|abort/i);
      expect(() => insertRawLearningSourceEventWithInvalidCursor(database, "01DZZ3NDEKTSV4RRFFQ69D5FAV")).toThrow(/learning source event|envelope|abort/i);
      expect(() => insertRawLearningSourceEventWithMissingGoalLoop(database, "01EZZ3NDEKTSV4RRFFQ69E5FAV")).toThrow(/learning source event|goal|loop|scope|abort/i);
      expect(() => insertRawLearningSourceEventWithStaleCursor(database, "01FZZ3NDEKTSV4RRFFQ69F5FAV")).toThrow(/learning source event|cursor|scope|abort/i);
      seedSiblingGoalLoop(database);
      seedSourceEvent(database, IDS.siblingLoopEvent, IDS.run, 2, IDS.skill, IDS.siblingLoop);
      expect(() => candidates.create({ ...candidate(), id: IDS.commandA, source_event_id: IDS.siblingLoopEvent })).toThrow(/source event|loop|scope/i);
      seedSourceEvent(database, IDS.foreignSkillEvent, IDS.run, 3, "skill-other-qa");
      expect(() => candidates.create({ ...candidate(), id: IDS.commandA, source_event_id: IDS.foreignSkillEvent })).toThrow(/source event|skill|scope/i);
      seedSourceEvent(database, IDS.missingSkillEvent, IDS.run, 4, "skill-missing-qa");
      expect(() => candidates.create({ ...candidate(), id: IDS.commandA, source_event_id: IDS.missingSkillEvent, proposed_skill_id: "skill-missing-qa" })).toThrow(/proposed skill|skill|scope/i);
      expect(() => insertRawCandidate(database, { id: IDS.commandA, source_event_id: IDS.otherEvent })).toThrow(/source event|scope|abort/i);
      expect(() => insertRawCandidate(database, { id: IDS.commandA, source_event_id: IDS.foreignSkillEvent })).toThrow(/source event|skill|scope|abort/i);
      expect(() => insertRawCandidate(database, { id: IDS.commandA, source_event_id: IDS.missingSkillEvent, proposed_skill_id: "skill-missing-qa" })).toThrow(/proposed skill|skill|scope|constraint|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01HZZ3NDEKTSV4RRFFQ69H5FAV", { lesson: "Read /Users/zq/private/SKILL.md", diff: "Safe diff.", evidenceRef: "artifact://progress/c21/raw.json" })).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01ZJZ3NDEKTSV4RRFFQ69J5FAV", { lesson: "Read /private/nexora/SKILL.md", diff: "Safe diff.", evidenceRef: "artifact://progress/c21/raw.json" })).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01ZKZ3NDEKTSV4RRFFQ69K5FAV", { lesson: "Read C:/nexora/private/SKILL.md", diff: "Safe diff.", evidenceRef: "artifact://progress/c21/raw.json" })).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01ZSZ3NDEKTSV4RRFFQ69S5FAV", { lesson: String.raw`Read \\server\share\secret.txt`, diff: "Safe diff.", evidenceRef: "artifact://progress/c21/raw.json" })).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01ZTZ3NDEKTSV4RRFFQ69T5FAV", { lesson: "Use vault:providers/openai-api-key", diff: "Safe diff.", evidenceRef: "artifact://progress/c21/raw.json" })).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01ZUZ3NDEKTSV4RRFFQ69U5FAV", { lesson: "Safe lesson.", diff: "Fetch smb://server/share/secret.txt", evidenceRef: "artifact://progress/c21/raw.json" })).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01JZZ3NDEKTSV4RRFFQ69J5FAV", { lesson: "Safe lesson.", diff: "Store password=abcd1234 in lesson.", evidenceRef: "artifact://progress/c21/raw.json" })).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01ZLZ3NDEKTSV4RRFFQ69L5FAV", { lesson: "Safe lesson.", diff: "Use eyJhbGciOiJIUzI1NiJ9.payload.signature in docs.", evidenceRef: "artifact://progress/c21/raw.json" })).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01KZZ3NDEKTSV4RRFFQ69K5FAV", { lesson: "Safe lesson.", diff: "Safe diff.", evidenceRef: "vault://providers/openai-api-key" })).toThrow(/evidence|ref|descriptor|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01ZHZ3NDEKTSV4RRFFQ69H5FAV", { lesson: "Safe lesson.", diff: "Safe diff.", evidenceRef: "artifact://vault:providers/openai-api-key" })).toThrow(/evidence|ref|descriptor|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01NZZ3NDEKTSV4RRFFQ69N5FAV", { lesson: "Safe lesson.", diff: "Safe diff.", evidenceRef: "workspace://Skills/.." })).toThrow(/evidence|ref|descriptor|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01ZQZ3NDEKTSV4RRFFQ69Q5FAV", { lesson: "Safe lesson.", diff: "Safe diff.", evidenceRef: "artifact://progress/token=abcd1234" })).toThrow(/evidence|ref|descriptor|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01ZPZ3NDEKTSV4RRFFQ69P5FAV", { lesson: "Safe lesson.", diff: "Safe diff.", evidenceRef: "workspace://D:/private/SKILL.md" })).toThrow(/evidence|ref|descriptor|abort/i);
      expect(() => insertRawCandidateWithUnsafeText(database, "01ZRZ3NDEKTSV4RRFFQ69R5FAV", { lesson: "Safe lesson.", diff: "Safe diff.", evidenceRef: "workspace://D:\\private\\SKILL.md" })).toThrow(/evidence|ref|descriptor|abort/i);
      expect(() => insertRawCandidateWithEvidenceRefs(database, "01ZMZ3NDEKTSV4RRFFQ69M5FAV", [])).toThrow(/evidence|ref|descriptor|abort/i);
      expect(() => insertRawCandidateWithEvidenceRefs(database, "01ZNZ3NDEKTSV4RRFFQ69N5FAV", Array.from({ length: 33 }, (_value, index) => `artifact://progress/c21/raw-${index}.json`))).toThrow(/evidence|ref|descriptor|abort/i);
      expect(() => candidates.create({ ...candidate(), id: IDS.commandA, workspace_id: IDS.otherWorkspace })).toThrow(/scope|run|goal/i);
      const first = commands.record(command(IDS.commandA, "learn:c21:visual-qa", "learn"));
      const replay = commands.record(command(IDS.commandB, "learn:c21:visual-qa", "learn"));

      expect(replay).toEqual(first);
      expect(() => commands.record(command(IDS.commandB, "learn:c21:visual-qa", "quarantine"))).toThrow(/idempotency/i);
      seedOtherGoalLoop(database);
      expect(() => database.prepare("UPDATE learning_candidates SET goal_loop_id = ? WHERE workspace_id = ? AND id = ?").run("01BZZ3NDEKTSV4RRFFQ69B5FAV", IDS.workspace, IDS.candidate)).toThrow(/run|goal|scope|abort/i);
      expect(commands.list(IDS.workspace)).toHaveLength(1);
      expect(() => insertRawNonRollbackCommandWithRollbackTarget(database, "01UZZ3NDEKTSV4RRFFQ69U5FAV")).toThrow(/rollback|command|abort/i);
      expect(() => insertRawNoOpRollbackInstallation(database, "01YWZ3NDEKTSV4RRFFQ69Y5FAV")).toThrow(/rollback|current|version|abort/i);
      expect(() => updateRawNoOpRollbackInstallation(database, "01ZWZ3NDEKTSV4RRFFQ69Z5FAV")).toThrow(/rollback|current|version|abort/i);
      expect(() => insertRawCommandWithUnsafeReason(database, "01VZZ3NDEKTSV4RRFFQ69V5FAV", "Use secret://skills/private-token.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawCommandWithUnsafeReason(database, "01ZOZ3NDEKTSV4RRFFQ69O5FAV", "Use /private/nexora/SKILL.md as the rollback source.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawCommandWithUnsafeReason(database, "01ZTZ3NDEKTSV4RRFFQ69T5FAV", "Use credential:providers/openai-api-key as the rollback source.")).toThrow(/text|secret|path|abort/i);
      expect(() => insertRawCommandWithUnsafeReason(database, "01ZUZ3NDEKTSV4RRFFQ69U5FAV", "Fetch smb://server/share/secret.txt before rollback.")).toThrow(/text|secret|path|abort/i);
      expect(() => database.prepare("UPDATE learning_commands SET reason = 'mutated' WHERE workspace_id = ? AND command_id = ?").run(IDS.workspace, IDS.commandA)).toThrow(/append-only|abort/i);
    } finally {
      database.close();
    }
  });

  it("Given raw C21 rows When normalized columns and payload disagree Then reads cannot return drifted descriptors", () => {
    const database = createDatabase();
    try {
      seedSkillLifecycle(database);
      new SkillInstallationRepository(database).install(installation(IDS.versionApproved));
      new SkillInvocationFactRepository(database).record(invocation("allowed", HASH));
      new LearningCandidateRepository(database).create(candidate());
      new LearningCommandRepository(database).record(command(IDS.commandA, "learn:c21:visual-qa", "learn"));

      expect(() => insertRawDriftedVersion(database)).toThrow(/payload|column|skill version|abort/i);
      expect(() => insertRawDriftedSource(database)).toThrow(/payload|column|skill source|abort/i);
      expect(() => insertRawDriftedScan(database)).toThrow(/payload|column|skill scan|abort/i);
      expect(() => insertRawDriftedReview(database)).toThrow(/payload|column|skill review|abort/i);
      expect(() => insertRawDriftedInstallation(database)).toThrow(/payload|column|skill installation|abort/i);
      expect(() => insertRawDriftedInvocation(database)).toThrow(/payload|column|skill invocation|abort/i);
      expect(() => insertRawDriftedCandidate(database)).toThrow(/payload|column|learning candidate|abort/i);
      expect(() => insertRawDriftedCommand(database)).toThrow(/payload|column|learning command|abort/i);
      expect(() => updateRawDriftedInstallationPayload(database)).toThrow(/payload|column|skill installation|abort/i);
      expect(() => updateRawDriftedCandidatePayload(database)).toThrow(/payload|column|learning candidate|abort/i);
    } finally {
      database.close();
    }
  });

  it("Given an installed skill When revoked quarantined and rolled back Then illegal reinstalls remain blocked", () => {
    const database = createDatabase();
    try {
      seedSkillLifecycle(database);
      const installations = new SkillInstallationRepository(database);
      const installed = installations.install(installation(IDS.versionSecondApproved));
      const quarantined = installations.update({ ...installed, status: "quarantined", quarantine_reason: "Critical scan finding.", updated_at: LATER }, 1);
      expect(() => installations.update({ ...quarantined, status: "rolled_back", rollback_to_version_id: IDS.versionSecondApproved, updated_at: LATER }, 2)).toThrow(/rollback|current|version/i);
      expect(() => installations.update({ ...quarantined, status: "rolled_back", rollback_to_version_id: IDS.versionDraft, updated_at: LATER }, 2)).toThrow(/approved|snapshot|rollback|version/i);
      const rolledBack = installations.update({ ...quarantined, status: "rolled_back", rollback_to_version_id: IDS.versionApproved, updated_at: LATER }, 2);

      expect(quarantined.status).toBe("quarantined");
      expect(rolledBack.rollback_to_version_id).toBe(IDS.versionApproved);
      expect(() => installations.update({ ...rolledBack, status: "installed", quarantine_reason: null, rollback_to_version_id: null, updated_at: LATER }, 3)).toThrow(/transition|version|installed/i);
      expect(() => database.prepare("UPDATE skill_installations SET status = 'installed' WHERE workspace_id = ? AND id = ?").run(IDS.workspace, IDS.install)).toThrow(/transition|abort/i);
    } finally {
      database.close();
    }
  });
});

function currentMigrationVersions(): readonly number[] {
  return Array.from({ length: CORE_MIGRATION_VERSION }, (_unused, index) => index + 1);
}

function createDatabase(): SqliteDatabase {
  const database = openDatabase(":memory:");
  migrate(database, { now: () => TIME });
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'Demo', 1, ?, ?)").run(IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO workspaces(id, name, schema_version, created_at, updated_at) VALUES (?, 'Other', 1, ?, ?)").run(IDS.otherWorkspace, TIME, TIME);
  database.prepare("INSERT INTO agents(id, workspace_id, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, '{}', 1, ?, ?)").run(IDS.agent, IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO goals(id, workspace_id, title, objective, definition_of_done_json, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'Goal', 'Objective', '[\"done\"]', '{}', 1, ?, ?)").run(IDS.goal, IDS.workspace, TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'ready', 'ticket:c21', '{}', 1, ?, ?)").run(IDS.ticket, IDS.workspace, IDS.goal, TIME, TIME);
  database.prepare("INSERT INTO tickets(id, workspace_id, goal_id, status, idempotency_key, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'ready', 'ticket:c21:other', '{}', 1, ?, ?)").run(IDS.otherTicket, IDS.workspace, IDS.goal, TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.run, IDS.workspace, IDS.ticket, JSON.stringify(runPayload(IDS.run, IDS.ticket)), TIME, TIME);
  database.prepare("INSERT INTO runs(id, workspace_id, ticket_id, status, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, 1, ?, ?)").run(IDS.otherRun, IDS.workspace, IDS.otherTicket, JSON.stringify(runPayload(IDS.otherRun, IDS.otherTicket)), TIME, TIME);
  database.prepare("INSERT INTO gateways(id, workspace_id, name, kind, descriptor_version, requested_version, actual_version, protocol_version, capabilities_json, health, status, enabled, execution_location, endpoint_ref, data_classification, last_heartbeat_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'Gateway C21', 'custom', '1.0.0', NULL, NULL, 1, '[\"sessions\"]', 'healthy', 'connected', 1, 'local', NULL, 'internal', ?, '{}', 1, ?, ?)").run(IDS.gateway, IDS.workspace, TIME, TIME, TIME);
  database.prepare("INSERT INTO channels(id, workspace_id, gateway_id, name, kind, descriptor_version, status, enabled, capabilities_json, credential_ref, endpoint_ref, allowlist_mode, data_classification, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, 'Channel C21', 'custom', '1.0.0', 'connected', 1, '[\"sessions\"]', NULL, NULL, 'deny_by_default', 'internal', '{}', 1, ?, ?)").run(IDS.channel, IDS.workspace, IDS.gateway, TIME, TIME);
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'background', 'active', 'turn-2', NULL, ?, '{}', 1, ?, ?)").run(IDS.session, IDS.workspace, IDS.gateway, IDS.channel, IDS.agent, IDS.run, TIME, TIME, TIME);
  new GoalLoopRepository(database).create(goalLoop());
  seedSourceEvent(database, IDS.event, IDS.run, 0);
  return database;
}

function seedSkillLifecycle(database: SqliteDatabase): void {
  const skills = new SkillRepository(database);
  const versions = new SkillVersionRepository(database);
  const sources = new SkillSourceRepository(database);
  const scans = new SkillScanRepository(database);
  const reviews = new SkillReviewRepository(database);

  skills.create(draftSkill());
  versions.create(version(IDS.versionApproved, "approved"));
  versions.create(version(IDS.versionSecondApproved, "approved"));
  versions.create(version(IDS.versionDraft, "draft"));
  sources.record(source());
  sources.record(sourceForVersion("01TZZ3NDEKTSV4RRFFQ69T5FAV", IDS.versionSecondApproved));
  scans.record(scan());
  scans.record(scanForVersion("01VZZ3NDEKTSV4RRFFQ69V5FAV", IDS.versionSecondApproved));
  reviews.record(review());
  reviews.record(reviewForVersion("01WZZ3NDEKTSV4RRFFQ69W5FAV", IDS.versionSecondApproved, "01VZZ3NDEKTSV4RRFFQ69V5FAV"));
  skills.update(skill(), 1);
}

function seedOtherSkillLifecycle(database: SqliteDatabase): void {
  const skillId = "skill-other-qa";
  const versionId = "01XZZ3NDEKTSV4RRFFQ69X5FAV";
  const scanId = "01AZZ3NDEKTSV4RRFFQ69A5FAV";
  const skillPayload = JSON.stringify({ ...draftSkill(), id: skillId, name: "Other QA", description: "Other reviewed skill.", capabilities: ["qa:other"], tags: [] });
  const versionPayload = JSON.stringify({ ...version(versionId, "approved"), skill_id: skillId, semver: "1.0.0", snapshot_ref: "artifact://skills/other-qa/1.0.0/SKILL.md", diff_summary: "Other approved version." });
  const scanPayload = JSON.stringify({ ...scanForVersion(scanId, versionId), skill_id: skillId });
  database.prepare("INSERT INTO skills(id, workspace_id, name, description, status, current_version_id, approved_version_id, capabilities_json, tags_json, quarantine_reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'Other QA', 'Other reviewed skill.', 'draft', NULL, NULL, '[\"qa:other\"]', '[]', NULL, 1, ?, 1, ?, ?)").run(skillId, IDS.workspace, skillPayload, TIME, TIME);
  database.prepare("INSERT INTO skill_versions(id, workspace_id, skill_id, semver, status, source_hash, snapshot_hash, snapshot_ref, diff_hash, diff_summary, approved_at, approved_by, revoked_at, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, '1.0.0', 'approved', ?, ?, 'artifact://skills/other-qa/1.0.0/SKILL.md', ?, 'Other approved version.', ?, 'owner:michael', NULL, NULL, 1, ?, 1, ?, ?)").run(versionId, IDS.workspace, skillId, HASH, HASH, DIFF_HASH, TIME, versionPayload, TIME, TIME);
  database.prepare("INSERT INTO skill_scans(id, workspace_id, skill_id, version_id, source_hash, status, findings_json, secret_findings, scanned_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'passed', '[]', 0, ?, 1, ?, 1, ?, ?)").run(scanId, IDS.workspace, skillId, versionId, HASH, TIME, scanPayload, TIME, TIME);
}

function seedOtherGoalLoop(database: SqliteDatabase): void {
  const otherLoopId = "01BZZ3NDEKTSV4RRFFQ69B5FAV";
  const otherSessionId = "01CZZ3NDEKTSV4RRFFQ69C5FAV";
  const budget = { max_tokens: 10_000, max_cost_usd: 1 };
  const payload = {
    id: otherLoopId,
    workspace_id: IDS.workspace,
    schema_version: 1,
    created_at: TIME,
    updated_at: TIME,
    goal_id: IDS.goal,
    run_id: IDS.otherRun,
    session_id: otherSessionId,
    parent_loop_id: null,
    root_loop_id: otherLoopId,
    status: "running",
    objective: "Other loop",
    definition_of_done: ["done"],
    max_turns: 5,
    turn_count: 1,
    budget,
    deadline_at: DEADLINE,
    continuation_cursor: "turn-1",
    judge: { done: false, reason: "Continue." },
    descriptor_only: true,
  };
  database.prepare("INSERT INTO sessions(id, workspace_id, gateway_id, channel_id, agent_id, run_id, external_session_ref, mode, status, cursor, last_message_id, last_event_at, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'background', 'active', 'turn-1', NULL, ?, '{}', 1, ?, ?)").run(otherSessionId, IDS.workspace, IDS.gateway, IDS.channel, IDS.agent, IDS.otherRun, TIME, TIME, TIME);
  database.prepare("INSERT INTO goal_loops(id, workspace_id, goal_id, run_id, session_id, parent_loop_id, root_loop_id, status, objective, definition_of_done_json, max_turns, turn_count, budget_json, deadline_at, continuation_cursor, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, 'running', 'Other loop', ?, 5, 1, ?, ?, 'turn-1', 1, ?, 1, ?, ?)").run(otherLoopId, IDS.workspace, IDS.goal, IDS.otherRun, otherSessionId, otherLoopId, JSON.stringify(["done"]), JSON.stringify(budget), DEADLINE, JSON.stringify(payload), TIME, TIME);
}

function seedSiblingGoalLoop(database: SqliteDatabase): void {
  const definition = ["done"];
  const budget = { max_tokens: 10_000, max_cost_usd: 1 };
  const payload = { ...goalLoop(), id: IDS.siblingLoop, root_loop_id: IDS.siblingLoop, objective: "Sibling loop", definition_of_done: definition, budget };
  database.prepare("INSERT INTO goal_loops(id, workspace_id, goal_id, run_id, session_id, parent_loop_id, root_loop_id, status, objective, definition_of_done_json, max_turns, turn_count, budget_json, deadline_at, continuation_cursor, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, 'running', 'Sibling loop', ?, 5, 1, ?, ?, 'turn-1', 1, ?, 1, ?, ?)").run(IDS.siblingLoop, IDS.workspace, IDS.goal, IDS.run, IDS.session, IDS.siblingLoop, JSON.stringify(["done"]), JSON.stringify({ max_tokens: 10_000, max_cost_usd: 1 }), DEADLINE, JSON.stringify(payload), TIME, TIME);
}

function insertRawApprovedVersionWithoutSnapshotRef(database: SqliteDatabase, versionId: string): void {
  database.prepare("INSERT INTO skill_versions(id, workspace_id, skill_id, semver, status, source_hash, snapshot_hash, snapshot_ref, diff_hash, diff_summary, approved_at, approved_by, revoked_at, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, '1.2.0', 'approved', ?, ?, NULL, ?, 'Approved hash without snapshot ref.', ?, 'owner:michael', NULL, NULL, 1, ?, 1, ?, ?)").run(versionId, IDS.workspace, IDS.skill, HASH, HASH, DIFF_HASH, TIME, rawVersionPayload({ versionId, semver: "1.2.0", snapshotRef: null, diffSummary: "Approved hash without snapshot ref." }), TIME, TIME);
}

function insertRawApprovedVersionWithSnapshotRef(database: SqliteDatabase, input: { readonly version_id: string; readonly snapshot_ref: string }): void {
  const semver = rawSemverForVersion(input.version_id);
  database.prepare("INSERT INTO skill_versions(id, workspace_id, skill_id, semver, status, source_hash, snapshot_hash, snapshot_ref, diff_hash, diff_summary, approved_at, approved_by, revoked_at, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'approved', ?, ?, ?, ?, 'Raw approved version.', ?, 'owner:michael', NULL, NULL, 1, ?, 1, ?, ?)").run(input.version_id, IDS.workspace, IDS.skill, semver, HASH, HASH, input.snapshot_ref, DIFF_HASH, TIME, rawVersionPayload({ versionId: input.version_id, semver, snapshotRef: input.snapshot_ref, diffSummary: "Raw approved version." }), TIME, TIME);
}

function insertRawApprovedVersionWithUnsafeDiff(database: SqliteDatabase, versionId: string, diffSummary: string): void {
  const semver = rawSemverForVersion(versionId);
  database.prepare("INSERT INTO skill_versions(id, workspace_id, skill_id, semver, status, source_hash, snapshot_hash, snapshot_ref, diff_hash, diff_summary, approved_at, approved_by, revoked_at, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'approved', ?, ?, 'artifact://skills/raw/unsafe/SKILL.md', ?, ?, ?, 'owner:michael', NULL, NULL, 1, ?, 1, ?, ?)").run(versionId, IDS.workspace, IDS.skill, semver, HASH, HASH, DIFF_HASH, diffSummary, TIME, rawVersionPayload({ versionId, semver, snapshotRef: "artifact://skills/raw/unsafe/SKILL.md", diffSummary }), TIME, TIME);
}

function updateRawApprovedVersionUnsafeDiff(database: SqliteDatabase, diffSummary: string): void {
  const payload = JSON.stringify({ ...version(IDS.versionApproved, "approved"), diff_summary: diffSummary, updated_at: LATER });
  database.prepare("UPDATE skill_versions SET diff_summary = ?, payload_json = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(diffSummary, payload, LATER, IDS.workspace, IDS.versionApproved);
}

function rawVersionPayload(input: { readonly versionId: string; readonly semver: string; readonly snapshotRef: string | null; readonly diffSummary: string }): string {
  return JSON.stringify({
    ...version(input.versionId, "approved"),
    semver: input.semver,
    snapshot_ref: input.snapshotRef,
    diff_summary: input.diffSummary,
  });
}

function rawSemverForVersion(versionId: string): string {
  return `1.2.${versionId.charCodeAt(2)}`;
}

function updateRawSkillPointers(database: SqliteDatabase, versionId: string): void {
  const payload = JSON.stringify({ ...skill(), current_version_id: versionId, approved_version_id: versionId });
  database.prepare("UPDATE skills SET status = 'active', current_version_id = ?, approved_version_id = ?, payload_json = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(versionId, versionId, payload, LATER, IDS.workspace, IDS.skill);
}

function insertRawActiveSkillWithUntrustedPointer(database: SqliteDatabase): void {
  const skillId = "skill-raw-bypass";
  const payload = JSON.stringify({ ...skill(), id: skillId, name: "Raw Bypass", current_version_id: IDS.versionDraft, approved_version_id: IDS.versionDraft });
  database.prepare("INSERT INTO skills(id, workspace_id, name, description, status, current_version_id, approved_version_id, capabilities_json, tags_json, quarantine_reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, 'Raw Bypass', 'Attempts raw active pointer bypass.', 'active', ?, ?, '[\"qa:visual\"]', '[]', NULL, 1, ?, 1, ?, ?)").run(skillId, IDS.workspace, IDS.versionDraft, IDS.versionDraft, payload, TIME, TIME);
}

function updateRawSkillCurrentPointerOnly(database: SqliteDatabase, versionId: string): void {
  const payload = JSON.stringify({ ...skill(), current_version_id: versionId, approved_version_id: IDS.versionApproved });
  database.prepare("UPDATE skills SET current_version_id = ?, payload_json = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(versionId, payload, LATER, IDS.workspace, IDS.skill);
}

function updateRawSkillPayloadPointerDrift(database: SqliteDatabase, versionId: string): void {
  const payload = JSON.stringify({ ...skill(), current_version_id: versionId, approved_version_id: versionId });
  database.prepare("UPDATE skills SET payload_json = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(payload, LATER, IDS.workspace, IDS.skill);
}

function updateRawApprovedVersionToDraft(database: SqliteDatabase): void {
  const payload = JSON.stringify({ ...version(IDS.versionApproved, "draft"), updated_at: LATER });
  database.prepare("UPDATE skill_versions SET status = 'draft', snapshot_hash = NULL, snapshot_ref = NULL, approved_at = NULL, approved_by = NULL, payload_json = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(payload, LATER, IDS.workspace, IDS.versionApproved);
}

function insertRawSkillWithUnsafeText(database: SqliteDatabase, id: string, description: string): void {
  const name = "Raw Drive Path";
  database.prepare(`
    INSERT INTO skills(id, workspace_id, name, description, status, current_version_id, approved_version_id, capabilities_json, tags_json, quarantine_reason, descriptor_only, payload_json, schema_version, created_at, updated_at)
    VALUES (
      ?, ?, ?, ?, 'draft', NULL, NULL, '["qa:visual"]', '[]', NULL, 1,
      json_object(
        'id', ?,
        'workspace_id', ?,
        'schema_version', 1,
        'created_at', ?,
        'updated_at', ?,
        'name', ?,
        'description', ?,
        'status', 'draft',
        'current_version_id', NULL,
        'approved_version_id', NULL,
        'capabilities', json('["qa:visual"]'),
        'tags', json('[]'),
        'quarantine_reason', NULL,
        'descriptor_only', json('true')
      ),
      1, ?, ?
    )
  `).run(id, IDS.workspace, name, description, id, IDS.workspace, TIME, TIME, name, description, TIME, TIME);
}

function skill(): object {
  return { id: IDS.skill, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, name: "Visual QA", description: "Captures reusable visual QA rules.", status: "active", current_version_id: IDS.versionApproved, approved_version_id: IDS.versionApproved, capabilities: ["qa:visual"], tags: ["qa"], quarantine_reason: null, descriptor_only: true };
}

function draftSkill(): object {
  return { ...skill(), status: "draft", current_version_id: null, approved_version_id: null };
}

function version(id: string, status: "approved" | "draft"): object {
  return { id, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: IDS.skill, semver: semverForVersion(id), status, source_hash: HASH, snapshot_hash: status === "approved" ? HASH : null, snapshot_ref: status === "approved" ? `artifact://skills/visual-qa/${semverForVersion(id)}/SKILL.md` : null, diff_hash: DIFF_HASH, diff_summary: "Adds a visual QA learning rule.", approved_at: status === "approved" ? TIME : null, approved_by: status === "approved" ? "owner:michael" : null, revoked_at: null, rollback_to_version_id: null, descriptor_only: true };
}

function semverForVersion(id: string): string {
  if (id === IDS.versionApproved) return "1.0.0";
  if (id === IDS.versionSecondApproved) return "1.1.0";
  return "2.0.0";
}

function source(): object {
  return sourceForVersion(IDS.source, IDS.versionApproved);
}

function sourceForVersion(id: string, versionId: string): object {
  return { id, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: IDS.skill, version_id: versionId, source_kind: "workspace", source_ref: `workspace://Skills/visual-qa/${semverForVersion(versionId)}/SKILL.md`, source_hash: HASH, diff_hash: DIFF_HASH, diff_summary: "Adds a reusable visual QA correction.", descriptor_only: true };
}

function scan(): object {
  return scanForVersion(IDS.scan, IDS.versionApproved);
}

function scanForVersion(id: string, versionId: string): object {
  return { id, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: IDS.skill, version_id: versionId, source_hash: HASH, status: "passed", findings: [], secret_findings: 0, scanned_at: TIME, descriptor_only: true };
}

function review(): object {
  return reviewForVersion(IDS.review, IDS.versionApproved, IDS.scan);
}

function reviewForVersion(id: string, versionId: string, scanId: string): object {
  return { id, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: IDS.skill, version_id: versionId, scan_id: scanId, decision: "approve", reviewer_ref: "owner:michael", reason: "Reviewed source hash and approved snapshot.", approved_snapshot_hash: HASH, decided_at: TIME, descriptor_only: true };
}

function installation(versionId: string): object {
  return { id: IDS.install, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, skill_id: IDS.skill, version_id: versionId, status: "installed", approved_snapshot_hash: HASH, installed_at: TIME, revoked_at: null, quarantine_reason: null, rollback_to_version_id: null, descriptor_only: true };
}

function invocation(status: "allowed" | "blocked", snapshotHash: string | null): object {
  return { id: IDS.invocation, workspace_id: IDS.workspace, schema_version: 1, created_at: LATER, updated_at: LATER, skill_id: IDS.skill, version_id: IDS.versionApproved, installation_id: IDS.install, run_id: IDS.run, goal_loop_id: IDS.loop, status, snapshot_hash: snapshotHash, reason: status === "allowed" ? "Installed version matches the approved snapshot." : "Skill installation is not approved.", descriptor_only: true };
}

function candidate(): object {
  return { id: IDS.candidate, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, run_id: IDS.run, goal_loop_id: IDS.loop, source_event_id: IDS.event, proposed_skill_id: IDS.skill, lesson: "Fresh visual QA evidence is required before marking a UI stage complete.", proposed_diff_summary: "Adds the visual QA evidence rule to the skill.", evidence_refs: ["artifact://progress/c20/visual-qa-summary.json"], status: "needs_review", descriptor_only: true };
}

function command(commandId: string, idempotencyKey: string, kind: "learn" | "quarantine"): object {
  if (kind === "learn") {
    return { schema_version: 1, command_id: commandId, workspace_id: IDS.workspace, kind, idempotency_key: idempotencyKey, expected_revision: null, installation_revision: null, candidate_id: IDS.candidate, skill_id: null, version_id: null, reason: "Capture the correction as a reusable skill update.", rollback_to_version_id: null, descriptor_only: true, created_at: LATER };
  }
  return { schema_version: 1, command_id: commandId, workspace_id: IDS.workspace, kind, idempotency_key: idempotencyKey, expected_revision: 1, installation_revision: 1, candidate_id: null, skill_id: IDS.skill, version_id: IDS.versionApproved, reason: "Capture the correction as a reusable skill update.", rollback_to_version_id: null, descriptor_only: true, created_at: LATER };
}

function runPayload(runId: string, ticketId: string): object {
  return { id: runId, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, ticket_id: ticketId, execution_location: "local", status: "running", budget: { max_tokens: 10_000, max_cost_usd: 1 }, memory_snapshot: { snapshot_id: IDS.workspace, version: 1 }, connector_versions: { deterministic: "1.0.0" } };
}

function goalLoop(): object {
  return { id: IDS.loop, workspace_id: IDS.workspace, schema_version: 1, created_at: TIME, updated_at: TIME, goal_id: IDS.goal, run_id: IDS.run, session_id: IDS.session, parent_loop_id: null, root_loop_id: IDS.loop, status: "running", objective: "Learn from corrections.", definition_of_done: ["Learning candidate is reviewed."], max_turns: 5, turn_count: 1, budget: { max_tokens: 10_000, max_cost_usd: 1 }, deadline_at: DEADLINE, continuation_cursor: "turn-1", judge: { done: false, reason: "Continue." }, descriptor_only: true };
}

type RawInstallationRecord = {
  readonly id: string;
  readonly version_id: string;
  readonly snapshot_hash: string;
};

function insertRawInstallation(database: SqliteDatabase, record: RawInstallationRecord): void {
  const payload = JSON.stringify({ ...installation(record.version_id), id: record.id, approved_snapshot_hash: record.snapshot_hash });
  database.prepare("INSERT INTO skill_installations(id, workspace_id, skill_id, version_id, status, approved_snapshot_hash, installed_at, revoked_at, quarantine_reason, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'installed', ?, ?, NULL, NULL, NULL, 1, ?, 1, ?, ?)").run(record.id, IDS.workspace, IDS.skill, record.version_id, record.snapshot_hash, TIME, payload, TIME, TIME);
}

type RawTrustFactRecord = {
  readonly id: string;
  readonly skill_id: string;
  readonly version_id: string;
};

function insertRawSource(database: SqliteDatabase, record: RawTrustFactRecord): void {
  database.prepare("INSERT INTO skill_sources(id, workspace_id, skill_id, version_id, source_kind, source_ref, source_hash, diff_hash, diff_summary, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'workspace', 'workspace://Skills/raw/SKILL.md', ?, ?, 'Raw source.', 1, '{}', 1, ?, ?)").run(record.id, IDS.workspace, record.skill_id, record.version_id, HASH, DIFF_HASH, TIME, TIME);
}

function insertRawSourceWithUnsafeRef(database: SqliteDatabase, id: string, sourceRef: string): void {
  const payload = JSON.stringify({ ...source(), id, source_ref: sourceRef });
  database.prepare("INSERT INTO skill_sources(id, workspace_id, skill_id, version_id, source_kind, source_ref, source_hash, diff_hash, diff_summary, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'workspace', ?, ?, ?, 'Raw source.', 1, ?, 1, ?, ?)").run(id, IDS.workspace, IDS.skill, IDS.versionApproved, sourceRef, HASH, DIFF_HASH, payload, TIME, TIME);
}

function insertRawSourceWithUnsafeDiff(database: SqliteDatabase, id: string, diffSummary: string): void {
  const sourceRef = "workspace://Skills/raw/SKILL.md";
  const payload = JSON.stringify({ ...source(), id, source_ref: sourceRef, diff_summary: diffSummary });
  database.prepare("INSERT INTO skill_sources(id, workspace_id, skill_id, version_id, source_kind, source_ref, source_hash, diff_hash, diff_summary, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'workspace', ?, ?, ?, ?, 1, ?, 1, ?, ?)").run(id, IDS.workspace, IDS.skill, IDS.versionApproved, sourceRef, HASH, DIFF_HASH, diffSummary, payload, TIME, TIME);
}

function insertRawScan(database: SqliteDatabase, record: RawTrustFactRecord): void {
  database.prepare("INSERT INTO skill_scans(id, workspace_id, skill_id, version_id, source_hash, status, findings_json, secret_findings, scanned_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'passed', '[]', 0, ?, 1, '{}', 1, ?, ?)").run(record.id, IDS.workspace, record.skill_id, record.version_id, HASH, TIME, TIME, TIME);
}

function insertRawDirtyPassedScan(database: SqliteDatabase, scanId: string): void {
  const findings = [{ severity: "critical", code: "SECRET_REF", message: "reviewed finding" }];
  const payload = JSON.stringify({ ...scanForVersion(scanId, IDS.versionApproved), findings });
  database.prepare("INSERT INTO skill_scans(id, workspace_id, skill_id, version_id, source_hash, status, findings_json, secret_findings, scanned_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'passed', ?, 0, ?, 1, ?, 1, ?, ?)").run(scanId, IDS.workspace, IDS.skill, IDS.versionApproved, HASH, JSON.stringify(findings), TIME, payload, TIME, TIME);
}

function insertRawFailedScan(database: SqliteDatabase, scanId: string): void {
  const findings = [{ severity: "high", code: "REVIEW_REQUIRED", message: "failed scan finding" }];
  const payload = JSON.stringify({ ...scanForVersion(scanId, IDS.versionApproved), status: "failed", findings });
  database.prepare("INSERT INTO skill_scans(id, workspace_id, skill_id, version_id, source_hash, status, findings_json, secret_findings, scanned_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'failed', ?, 0, ?, 1, ?, 1, ?, ?)").run(scanId, IDS.workspace, IDS.skill, IDS.versionApproved, HASH, JSON.stringify(findings), TIME, payload, TIME, TIME);
}

function insertRawScanWithUnsafeFinding(database: SqliteDatabase, scanId: string, message: string): void {
  const findings = [{ severity: "high", code: "REVIEW_REQUIRED", message }];
  const payload = JSON.stringify({ ...scanForVersion(scanId, IDS.versionApproved), status: "failed", findings });
  database.prepare("INSERT INTO skill_scans(id, workspace_id, skill_id, version_id, source_hash, status, findings_json, secret_findings, scanned_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'failed', ?, 0, ?, 1, ?, 1, ?, ?)").run(scanId, IDS.workspace, IDS.skill, IDS.versionApproved, HASH, JSON.stringify(findings), TIME, payload, TIME, TIME);
}

type RawReviewRecord = RawTrustFactRecord & {
  readonly scan_id: string;
};

function insertRawReview(database: SqliteDatabase, record: RawReviewRecord): void {
  database.prepare("INSERT INTO skill_reviews(id, workspace_id, skill_id, version_id, scan_id, decision, reviewer_ref, reason, approved_snapshot_hash, decided_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'approve', 'owner:michael', 'Raw review.', ?, ?, 1, '{}', 1, ?, ?)").run(record.id, IDS.workspace, record.skill_id, record.version_id, record.scan_id, HASH, TIME, TIME, TIME);
}

function insertRawReviewWithUnsafeReason(database: SqliteDatabase, id: string, reason: string): void {
  const payload = JSON.stringify({ ...review(), id, reason });
  database.prepare("INSERT INTO skill_reviews(id, workspace_id, skill_id, version_id, scan_id, decision, reviewer_ref, reason, approved_snapshot_hash, decided_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'approve', 'owner:michael', ?, ?, ?, 1, ?, 1, ?, ?)").run(id, IDS.workspace, IDS.skill, IDS.versionApproved, IDS.scan, reason, HASH, TIME, payload, TIME, TIME);
}

type RawCandidateRecord = {
  readonly id: string;
  readonly source_event_id: string;
  readonly proposed_skill_id?: string;
};

function insertRawCandidate(database: SqliteDatabase, record: RawCandidateRecord): void {
  const proposedSkillId = record.proposed_skill_id ?? IDS.skill;
  const payload = JSON.stringify({ ...candidate(), id: record.id, source_event_id: record.source_event_id, proposed_skill_id: proposedSkillId });
  database.prepare("INSERT INTO learning_candidates(id, workspace_id, run_id, goal_loop_id, source_event_id, proposed_skill_id, lesson, proposed_diff_summary, evidence_refs_json, status, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'needs_review', 1, ?, 1, ?, ?)").run(record.id, IDS.workspace, IDS.run, IDS.loop, record.source_event_id, proposedSkillId, "Raw learning candidate.", "Raw diff summary.", JSON.stringify(["artifact://progress/c21/raw.json"]), payload, TIME, TIME);
}

function insertRawCandidateWithUnsafeText(database: SqliteDatabase, id: string, input: { readonly lesson: string; readonly diff: string; readonly evidenceRef: string }): void {
  const evidenceRefs = [input.evidenceRef];
  const payload = JSON.stringify({ ...candidate(), id, lesson: input.lesson, proposed_diff_summary: input.diff, evidence_refs: evidenceRefs });
  database.prepare("INSERT INTO learning_candidates(id, workspace_id, run_id, goal_loop_id, source_event_id, proposed_skill_id, lesson, proposed_diff_summary, evidence_refs_json, status, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'needs_review', 1, ?, 1, ?, ?)").run(id, IDS.workspace, IDS.run, IDS.loop, IDS.event, IDS.skill, input.lesson, input.diff, JSON.stringify(evidenceRefs), payload, TIME, TIME);
}

function insertRawCandidateWithEvidenceRefs(database: SqliteDatabase, id: string, evidenceRefs: readonly string[]): void {
  const payload = JSON.stringify({ ...candidate(), id, evidence_refs: evidenceRefs });
  database.prepare("INSERT INTO learning_candidates(id, workspace_id, run_id, goal_loop_id, source_event_id, proposed_skill_id, lesson, proposed_diff_summary, evidence_refs_json, status, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'Safe lesson.', 'Safe diff.', ?, 'needs_review', 1, ?, 1, ?, ?)").run(id, IDS.workspace, IDS.run, IDS.loop, IDS.event, IDS.skill, JSON.stringify(evidenceRefs), payload, TIME, TIME);
}

function seedSourceEvent(database: SqliteDatabase, eventId: string, runId: string, sequence: number, skillId: string = IDS.skill, goalLoopId: string = IDS.loop): void {
  const payload = LearningSourceEventSchema.parse({
    event_id: eventId,
    event_type: "learning.source",
    schema_version: 1,
    occurred_at: TIME,
    workspace_id: IDS.workspace,
    scope: { kind: "run", id: runId },
    trace_id: IDS.workspace,
    run_id: runId,
    attempt_id: null,
    step_id: null,
    actor: { type: "system", id: null },
    payload: { descriptor_only: true, proposed_skill_id: skillId, goal_loop_id: goalLoopId, continuation_cursor: "turn-1" },
    redactions: [],
    sequence,
  });
  database.prepare("INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, ?, 'learning.source', ?, ?, ?, NULL, NULL, ?, 1)").run(eventId, IDS.workspace, runId, sequence, TIME, TIME, IDS.workspace, JSON.stringify(payload));
}

function insertRawMalformedLearningSourceEvent(database: SqliteDatabase, eventId: string): void {
  const payload = { event_id: eventId, workspace_id: IDS.workspace, run_id: IDS.run, sequence: 4, event_type: "learning.source", occurred_at: TIME, received_at: TIME, trace_id: IDS.workspace, payload: { descriptor_only: true, proposed_skill_id: IDS.skill, goal_loop_id: IDS.loop, continuation_cursor: "turn-1" }, schema_version: 1 };
  database.prepare("INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, 4, 'learning.source', ?, ?, ?, NULL, NULL, ?, 1)").run(eventId, IDS.workspace, IDS.run, TIME, TIME, IDS.workspace, JSON.stringify(payload));
}

function insertRawLearningSourceEventWithInvalidActorId(database: SqliteDatabase, eventId: string): void {
  const payload = rawLearningSourceEvent(eventId, 4, { type: "system", id: { nested: "actor" } }, "turn-1");
  database.prepare("INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, 4, 'learning.source', ?, ?, ?, NULL, NULL, ?, 1)").run(eventId, IDS.workspace, IDS.run, TIME, TIME, IDS.workspace, JSON.stringify(payload));
}

function insertRawLearningSourceEventWithInvalidCursor(database: SqliteDatabase, eventId: string): void {
  const payload = rawLearningSourceEvent(eventId, 5, { type: "system", id: null }, { cursor: "turn-1" });
  database.prepare("INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, 5, 'learning.source', ?, ?, ?, NULL, NULL, ?, 1)").run(eventId, IDS.workspace, IDS.run, TIME, TIME, IDS.workspace, JSON.stringify(payload));
}

function insertRawLearningSourceEventWithMissingGoalLoop(database: SqliteDatabase, eventId: string): void {
  const payload = rawLearningSourceEvent(eventId, 6, { type: "system", id: null }, "turn-1", "01MZZ3NDEKTSV4RRFFQ69M5FAV");
  database.prepare("INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, 6, 'learning.source', ?, ?, ?, NULL, NULL, ?, 1)").run(eventId, IDS.workspace, IDS.run, TIME, TIME, IDS.workspace, JSON.stringify(payload));
}

function insertRawLearningSourceEventWithStaleCursor(database: SqliteDatabase, eventId: string): void {
  const payload = rawLearningSourceEvent(eventId, 7, { type: "system", id: null }, "turn-stale");
  database.prepare("INSERT INTO events(event_id, workspace_id, run_id, sequence, event_type, occurred_at, received_at, trace_id, attempt_id, step_id, payload_json, schema_version) VALUES (?, ?, ?, 7, 'learning.source', ?, ?, ?, NULL, NULL, ?, 1)").run(eventId, IDS.workspace, IDS.run, TIME, TIME, IDS.workspace, JSON.stringify(payload));
}

function rawLearningSourceEvent(eventId: string, sequence: number, actor: object, continuationCursor: unknown, goalLoopId: string = IDS.loop): object {
  return {
    event_id: eventId,
    event_type: "learning.source",
    schema_version: 1,
    occurred_at: TIME,
    workspace_id: IDS.workspace,
    scope: { kind: "run", id: IDS.run },
    trace_id: IDS.workspace,
    run_id: IDS.run,
    attempt_id: null,
    step_id: null,
    actor,
    payload: { descriptor_only: true, proposed_skill_id: IDS.skill, goal_loop_id: goalLoopId, continuation_cursor: continuationCursor },
    redactions: [],
    sequence,
  };
}

function insertRawNonRollbackCommandWithRollbackTarget(database: SqliteDatabase, commandId: string): void {
  const payload = JSON.stringify({
    schema_version: 1,
    command_id: commandId,
    workspace_id: IDS.workspace,
    kind: "install",
    idempotency_key: "skill:install:c21:raw-rollback-target",
    expected_revision: 1,
    installation_revision: null,
    candidate_id: null,
    skill_id: IDS.skill,
    version_id: IDS.versionApproved,
    reason: "Install approved snapshot.",
    rollback_to_version_id: IDS.versionApproved,
    descriptor_only: true,
    created_at: LATER,
  });
  database.prepare("INSERT INTO learning_commands(command_id, workspace_id, kind, idempotency_key, expected_revision, installation_revision, candidate_id, skill_id, version_id, reason, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at) VALUES (?, ?, 'install', 'skill:install:c21:raw-rollback-target', 1, NULL, NULL, ?, ?, 'Install approved snapshot.', ?, 1, ?, 1, ?)").run(commandId, IDS.workspace, IDS.skill, IDS.versionApproved, IDS.versionApproved, payload, LATER);
}

function insertRawNoOpRollbackInstallation(database: SqliteDatabase, id: string): void {
  const payload = JSON.stringify({ ...installation(IDS.versionApproved), id, status: "rolled_back", rollback_to_version_id: IDS.versionApproved });
  database.prepare("INSERT INTO skill_installations(id, workspace_id, skill_id, version_id, status, approved_snapshot_hash, installed_at, revoked_at, quarantine_reason, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'rolled_back', ?, ?, NULL, NULL, ?, 1, ?, 1, ?, ?)").run(id, IDS.workspace, IDS.skill, IDS.versionApproved, HASH, TIME, IDS.versionApproved, payload, TIME, TIME);
}

function updateRawNoOpRollbackInstallation(database: SqliteDatabase, id: string): void {
  insertRawQuarantinedInstallation(database, id);
  const payload = JSON.stringify({ ...installation(IDS.versionApproved), id, status: "rolled_back", quarantine_reason: "Critical scan finding.", rollback_to_version_id: IDS.versionApproved, updated_at: LATER });
  database.prepare("UPDATE skill_installations SET status = 'rolled_back', rollback_to_version_id = ?, payload_json = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(IDS.versionApproved, payload, LATER, IDS.workspace, id);
}

function insertRawCommandWithUnsafeReason(database: SqliteDatabase, commandId: string, reason: string): void {
  const payload = JSON.stringify({ ...command(commandId, `skill:quarantine:c21:${commandId}`, "quarantine"), reason });
  database.prepare("INSERT INTO learning_commands(command_id, workspace_id, kind, idempotency_key, expected_revision, installation_revision, candidate_id, skill_id, version_id, reason, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at) VALUES (?, ?, 'quarantine', ?, 1, 1, NULL, ?, ?, ?, NULL, 1, ?, 1, ?)").run(commandId, IDS.workspace, `skill:quarantine:c21:${commandId}`, IDS.skill, IDS.versionApproved, reason, payload, LATER);
}

function insertRawDriftedVersion(database: SqliteDatabase): void {
  database.prepare("INSERT INTO skill_versions(id, workspace_id, skill_id, semver, status, source_hash, snapshot_hash, snapshot_ref, diff_hash, diff_summary, approved_at, approved_by, revoked_at, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES ('01BZZ3NDEKTSV4RRFFQ69B5FAV', ?, ?, '9.9.9', 'draft', ?, NULL, NULL, ?, 'Drifted version.', NULL, NULL, NULL, NULL, 1, ?, 1, ?, ?)").run(IDS.workspace, IDS.skill, HASH, DIFF_HASH, JSON.stringify({ ...version("01BZZ3NDEKTSV4RRFFQ69B5FAV", "draft"), skill_id: "skill-other-qa", semver: "9.9.9", diff_summary: "Drifted version." }), TIME, TIME);
}

function insertRawDriftedSource(database: SqliteDatabase): void {
  database.prepare("INSERT INTO skill_sources(id, workspace_id, skill_id, version_id, source_kind, source_ref, source_hash, diff_hash, diff_summary, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES ('01CZZ3NDEKTSV4RRFFQ69C5FAV', ?, ?, ?, 'workspace', 'workspace://Skills/raw/SKILL.md', ?, ?, 'Drifted source.', 1, ?, 1, ?, ?)").run(IDS.workspace, IDS.skill, IDS.versionApproved, HASH, DIFF_HASH, JSON.stringify({ ...source(), id: "01CZZ3NDEKTSV4RRFFQ69C5FAV", skill_id: "skill-other-qa", source_ref: "workspace://Skills/raw/SKILL.md", diff_summary: "Drifted source." }), TIME, TIME);
}

function insertRawDriftedScan(database: SqliteDatabase): void {
  database.prepare("INSERT INTO skill_scans(id, workspace_id, skill_id, version_id, source_hash, status, findings_json, secret_findings, scanned_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES ('01DZZ3NDEKTSV4RRFFQ69D5FAV', ?, ?, ?, ?, 'passed', '[]', 0, ?, 1, ?, 1, ?, ?)").run(IDS.workspace, IDS.skill, IDS.versionApproved, HASH, TIME, JSON.stringify({ ...scan(), id: "01DZZ3NDEKTSV4RRFFQ69D5FAV", skill_id: "skill-other-qa" }), TIME, TIME);
}

function insertRawDriftedReview(database: SqliteDatabase): void {
  database.prepare("INSERT INTO skill_reviews(id, workspace_id, skill_id, version_id, scan_id, decision, reviewer_ref, reason, approved_snapshot_hash, decided_at, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES ('01EZZ3NDEKTSV4RRFFQ69E5FAV', ?, ?, ?, ?, 'approve', 'owner:michael', 'Drifted review.', ?, ?, 1, ?, 1, ?, ?)").run(IDS.workspace, IDS.skill, IDS.versionApproved, IDS.scan, HASH, TIME, JSON.stringify({ ...review(), id: "01EZZ3NDEKTSV4RRFFQ69E5FAV", skill_id: "skill-other-qa", reason: "Drifted review." }), TIME, TIME);
}

function insertRawDriftedInstallation(database: SqliteDatabase): void {
  database.prepare("INSERT INTO skill_installations(id, workspace_id, skill_id, version_id, status, approved_snapshot_hash, installed_at, revoked_at, quarantine_reason, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES ('01FZZ3NDEKTSV4RRFFQ69F5FAV', ?, ?, ?, 'revoked', ?, ?, ?, NULL, NULL, 1, ?, 1, ?, ?)").run(IDS.workspace, IDS.skill, IDS.versionApproved, HASH, TIME, LATER, JSON.stringify({ ...installation(IDS.versionApproved), id: "01FZZ3NDEKTSV4RRFFQ69F5FAV", status: "revoked", revoked_at: LATER, skill_id: "skill-other-qa" }), TIME, TIME);
}

function insertRawDriftedInvocation(database: SqliteDatabase): void {
  database.prepare("INSERT INTO skill_invocation_facts(id, workspace_id, skill_id, version_id, installation_id, run_id, goal_loop_id, status, snapshot_hash, reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES ('01HZZ3NDEKTSV4RRFFQ69H5FAV', ?, ?, ?, ?, ?, ?, 'blocked', NULL, 'Drifted invocation.', 1, ?, 1, ?, ?)").run(IDS.workspace, IDS.skill, IDS.versionApproved, IDS.install, IDS.run, IDS.loop, JSON.stringify({ ...invocation("blocked", null), id: "01HZZ3NDEKTSV4RRFFQ69H5FAV", skill_id: "skill-other-qa", reason: "Drifted invocation." }), TIME, TIME);
}

function insertRawDriftedCandidate(database: SqliteDatabase): void {
  database.prepare("INSERT INTO learning_candidates(id, workspace_id, run_id, goal_loop_id, source_event_id, proposed_skill_id, lesson, proposed_diff_summary, evidence_refs_json, status, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES ('01IZZ3NDEKTSV4RRFFQ69I5FAV', ?, ?, ?, ?, ?, 'Drifted candidate.', 'Drifted diff.', ?, 'needs_review', 1, ?, 1, ?, ?)").run(IDS.workspace, IDS.run, IDS.loop, IDS.event, IDS.skill, JSON.stringify(["artifact://progress/c21/raw.json"]), JSON.stringify({ ...candidate(), id: "01IZZ3NDEKTSV4RRFFQ69I5FAV", proposed_skill_id: "skill-other-qa", lesson: "Drifted candidate.", proposed_diff_summary: "Drifted diff.", evidence_refs: ["artifact://progress/c21/raw.json"] }), TIME, TIME);
}

function insertRawDriftedCommand(database: SqliteDatabase): void {
  database.prepare("INSERT INTO learning_commands(command_id, workspace_id, kind, idempotency_key, expected_revision, installation_revision, candidate_id, skill_id, version_id, reason, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at) VALUES ('01JZZ3NDEKTSV4RRFFQ69J5FAV', ?, 'learn', 'learn:c21:drifted', NULL, NULL, ?, NULL, NULL, 'Drifted command.', NULL, 1, ?, 1, ?)").run(IDS.workspace, IDS.candidate, JSON.stringify({ ...command("01JZZ3NDEKTSV4RRFFQ69J5FAV", "learn:c21:drifted", "learn"), kind: "quarantine", candidate_id: IDS.candidate, reason: "Drifted command." }), TIME);
}

function updateRawDriftedInstallationPayload(database: SqliteDatabase): void {
  database.prepare("UPDATE skill_installations SET payload_json = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(JSON.stringify({ ...installation(IDS.versionApproved), skill_id: "skill-other-qa", updated_at: LATER }), LATER, IDS.workspace, IDS.install);
}

function updateRawDriftedCandidatePayload(database: SqliteDatabase): void {
  database.prepare("UPDATE learning_candidates SET payload_json = ?, updated_at = ? WHERE workspace_id = ? AND id = ?").run(JSON.stringify({ ...candidate(), proposed_skill_id: "skill-other-qa", updated_at: LATER }), LATER, IDS.workspace, IDS.candidate);
}

type RawInvocationRecord = {
  readonly id: string;
  readonly goal_loop_id: string;
};

function insertRawInvocation(database: SqliteDatabase, record: RawInvocationRecord): void {
  const payload = JSON.stringify(record);
  database.prepare("INSERT INTO skill_invocation_facts(id, workspace_id, skill_id, version_id, installation_id, run_id, goal_loop_id, status, snapshot_hash, reason, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)").run(record.id, IDS.workspace, IDS.skill, IDS.versionApproved, IDS.install, IDS.run, record.goal_loop_id, "allowed", HASH, "Mismatched run and goal loop.", payload, LATER, LATER);
}

function insertRawInstallationWithUnsafeReason(database: SqliteDatabase, id: string, quarantineReason: string): void {
  const payload = JSON.stringify({ ...installation(IDS.versionApproved), id, status: "quarantined", quarantine_reason: quarantineReason });
  database.prepare("INSERT INTO skill_installations(id, workspace_id, skill_id, version_id, status, approved_snapshot_hash, installed_at, revoked_at, quarantine_reason, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'quarantined', ?, ?, NULL, ?, NULL, 1, ?, 1, ?, ?)").run(id, IDS.workspace, IDS.skill, IDS.versionApproved, HASH, TIME, quarantineReason, payload, TIME, TIME);
}

function insertRawQuarantinedInstallation(database: SqliteDatabase, id: string): void {
  const payload = JSON.stringify({ ...installation(IDS.versionApproved), id, status: "quarantined", quarantine_reason: "Critical scan finding." });
  database.prepare("INSERT INTO skill_installations(id, workspace_id, skill_id, version_id, status, approved_snapshot_hash, installed_at, revoked_at, quarantine_reason, rollback_to_version_id, descriptor_only, payload_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'quarantined', ?, ?, NULL, 'Critical scan finding.', NULL, 1, ?, 1, ?, ?)").run(id, IDS.workspace, IDS.skill, IDS.versionApproved, HASH, TIME, payload, TIME, TIME);
}
