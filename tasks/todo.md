# Nexora Agent OS Plan Tracking

## 2026-08-29 Hermes Agent OS 深度对标研究

- [x] 读取并分级 `agentos.guide` Hermes/Agent OS 相关页面，提取九部分栈、三层/五层/七层蓝图、Goal Mode、Mission Control、Skills、NotebookLM、Oracle/Astros、SEO Loop 等能力。
- [x] 核对官方 Hermes 上游 README 的 CLI、Gateway、模型/Provider、Skills/Learning、Cron、Subagents/RPC 和 Backend 能力边界。
- [x] 核对视频 `qMvkdMzuYjs` 的公开身份元数据（标题为 `Hermes Agent OS FREE Course (3 HOURS)`）；初次研究时 YouTube 直达页、字幕和章节因连接重置不可直接读取，限制已记录并在 2026-08-30 补充研究中修正。
- [x] 审计 Nexora 生产包、Mission Control 路由和 `demo/`，区分已实现、部分实现、Demo 夹具和缺失能力。
- [x] 形成九部分栈 × 七层蓝图 × 生产代码的差距矩阵与分阶段落地方案。
- [ ] 用户确认首个实现切片与真实外部连接范围后再开始代码改动。

**研究事实源：** `docs/hermes-agent-os-research-2026-08-29.md`

## 2026-08-30 YouTube 视频直接证据补充

- [x] 通过 `yt-dlp` 直接读取 `qMvkdMzuYjs` 元数据、原始描述、16 个章节和自动字幕；确认时长 `3:00:24`、上传日期 `2026-08-14`、频道 `@JulianGoldieSEO`。
- [x] 下载英文/简体中文/繁体中文自动字幕；英文 VTT 约 10,865 个 cue block，去重文本约 5,433 行；对关键术语进行章节级上下文核验。
- [x] 抽样检查每章起点和中段 storyboard tile（32 张），确认 Hermes 控制台、Memory Galaxy、Lead/Outreach、Skills、Computer Use、Jarvis、Mission Control、SEO 和 VPS 等画面类型；未把低分辨率 storyboard 当作逐帧播放证据。
- [x] 使用官方 NousResearch Hermes README 交叉确认上游 Gateway、Provider、Skills/Learning、Cron、Subagents/RPC 和多种 Backend；区分上游事实与 Julian Goldie Agent OS 组装层的作者演示。
- [x] 形成逐章、逐模块、证据等级、Nexora 覆盖矩阵和 C17-C28 实施顺序：`docs/hermes-agent-os-video-analysis-2026-08-30.md`。
- [ ] 用户确认首个实现切片与真实外部连接范围后再开始代码改动。

### 视频补充 Review

- 直接视频证据已覆盖 16 章：Oracle、Lead Machine、Outreach、Pets、社区构建、Learn、Computer Use、Jarvis、Mission Control、Agent OS 理由、Desktop 对比、AI SEO、团队/VPS、现场构建和 Q&A。
- “免费、一键、24/7、近 3,000 pets、排名第一、最快、几分钟完成”等被标为 B/C，不作为 Nexora 的成本、SLO、安全或质量保证。
- 本轮没有接入外部账号、付费 API、邮箱、CMS、桌面控制或真实 NotebookLM；只增加研究文档和追踪记录。

## C17-C18 / Runtime Registry 与 Provider Catalog（本轮）

范围：实现 workspace-scoped 的 Runtime、Provider、Backend、Tool/MCP descriptor 事实模型、持久化、Control API 和 Mission Control Registry 页面；只注册/查看能力，不执行真实 runtime、模型、MCP 或外部连接器。

- [x] C17.1 先写 contracts schema RED：RuntimeDescriptor、运行时 kind/capability/health、严格版本和 workspace scope。
- [x] C17.2 先写 persistence RED：migration、表约束、workspace/version 唯一性、读取/列表/更新仓储。
- [x] C17.3 先写 API RED：Registry 查询/注册路由、Owner 写权限、run:read 读权限、幂等和错误脱敏。
- [x] C17.4 先写 Mission Control RED：Registry route、导航、runtime/provider/backend/tool 分组、健康/能力/位置/实际版本状态。
- [x] C17.5 实现 C17 Runtime Registry contracts、migration、repositories、service 和 routes。
- [x] C18.1 实现 Provider/Model、Backend、Tool/MCP contracts、migration 和 repositories。
- [x] C18.2 实现统一 Catalog API、requested/actual 字段展示和 descriptor 版本冲突处理。
- [x] C18.3 实现 Registry 页面，遵循现有 DESIGN.md、响应式、键盘和只读外部边界。
- [x] C18.4 运行 contracts/persistence/API/mission-control 测试、typecheck、lint、build 和视觉 QA。
- [x] C18.5 完成安全/代码审查，更新 `tasks/agent-os-progress.md`、ADR/runbook，并创建 scoped C17/C18 commit。

### C17-C18 Execution Check-in / 2026-08-30

- [x] Stabilize requested/actual runtime contract fields and migration version 8 assertions.
- [x] Add repository/API update semantics with `If-Match`, idempotency conflict handling, and provider reference validation.
- [x] Make Registry UI evidence-complete for requested/actual, health, capability, location, and descriptor-only boundaries.
- [x] Run complete unit/integration/type/build/security/visual verification and write the stage handoff.

## C19 / Gateway、Channels、Sessions（下一阶段）

范围：实现 workspace-scoped 的 Gateway、Channel、Session control-plane 事实模型与 API/UI。覆盖 Telegram、Discord、Slack、WhatsApp、Signal、Web/API 的声明式 adapter descriptor；session cursor、消息幂等、delivery receipt、allowlist、pause/steer/resume；不连接真实外部账号、不发送网络消息。

- [x] C19.1 先写 contracts RED：GatewayDescriptor、ChannelDescriptor、Session、MessageEnvelope、DeliveryReceipt、SessionCommand/状态机；严格 schema、workspace scope、cursor 与幂等键约束。
- [x] C19.2 先写 persistence RED：migration 9、gateway/channel/session/message/delivery/allowlist 表约束、唯一键、cursor checkpoint、workspace 隔离和不可覆盖事实。
- [x] C19.3 先写 API RED：Gateway/Channels/Sessions 查询与注册路由、Owner 写权限、run:read 读权限、`Idempotency-Key`、`If-Match`、scope-safe errors。
- [x] C19.4 先写 orchestration RED：pause/steer/resume 状态转移、消息幂等去重、cursor 断线恢复、delivery receipt 重放/冲突和 allowlist 默认拒绝。
- [x] C19.5 先写 Mission Control RED：Gateway/Channels/Sessions route、导航、连接/队列/会话状态、cursor/delivery/allowlist 证据和 descriptor-only 边界。
- [x] C19.6 实现 contracts、migration、typed repositories、service、routes 与 session command helpers；所有事实写入带 workspace/session scope 与 revision。
- [x] C19.7 实现 Mission Control 页面，复用现有 DESIGN.md 状态原语与五项移动导航；移动端不呈现不可读的宽表格。
- [x] C19.8 完成 targeted RED/GREEN、全量 lint/typecheck/test/integration/e2e/build、API HTTP smoke、视觉 QA 与安全审查；保存 `artifacts/progress/c19/verification.log` 和 ADR/runbook。
- [x] C19.9 更新 `tasks/agent-os-progress.md` 交接，记录真实外部连接未授权的边界，并创建只含 C19 实现与证据的 scoped commit `174c288f6365eeab879d08e6cad9f04c28029a78`。

### C19 Revalidation / Continue 2026-08-30

- [x] 复核仓库约束、lessons、当前任务清单、Git 状态、C19 文件、现有验证日志与 C17/C18/C19 提交事实；确认 C17/C18/C19 均没有独立 scoped commit。
- [x] 运行用户指定的完整 C19 focused 命令（包含 Gateway 页面测试），记录真实退出码、测试文件数和测试数量；失败时先定位根因。
- [x] 复核 C19 contracts、migration、repositories、service/routes、Mission Control wiring 和测试覆盖，重点检查 scope、RBAC、幂等、cursor、allowlist、secret redaction、外部副作用边界。
- [x] 如有缺口，先写回归测试再做最小修复；修复后重跑 focused 验证。
- [x] 运行 lint、typecheck、full Vitest、integration、e2e 和 Mission Control build，保存完整输出与退出码。
- [x] 启动/复用 API 与 Mission Control，使用真实浏览器访问 `/gateway?workspace=ws-demo`，完成 1440x900 与 390x844 DOM/交互/溢出 QA，生成新鲜 PNG 并验证签名、尺寸；若工具不可用记录限制。
- [x] 完成独立代码/安全复核；若独立审查工具不可用，记录限制并以本地审查清单和验证证据替代，不伪造独立通过。
- [x] 更新 `tasks/agent-os-progress.md`、本清单末尾 Review、`artifacts/progress/c19/verification.log` 及必要文档；仅在所有门通过后将 C19 标记为 `[x]`。
- [x] 仅暂存 C19 implementation/tests/ADR/runbook/verification 文件，运行 `git diff --cached --check`，创建单一 C19 scoped commit `174c288f6365eeab879d08e6cad9f04c28029a78` 并记录完整 SHA。
- [x] C19 收口后，建立 C20 追踪项并先写/运行跨轮 continuation、Judge JSON、max turns、`/goal resume`、`/subgoal`、pause/resume、deadline/budget、Judge failure、restart/orphan recovery 和 scope 的 RED 测试；不实现真实外部连接。

### C19 Final Revalidation / Current Continuation 2026-08-31

- [x] Re-run the focused C19 suite from the current worktree and record fresh exit code, files, and tests: PASS, exit 0, 4 files / 49 tests, `artifacts/progress/c19/current-verification/c19-focused-resume-20260901-081622.log`.
- [x] Re-run the full verification matrix from the current worktree and record fresh command outputs: lint 309 files, typecheck, full Vitest 92 files / 464 tests, integration 13 files / 36 tests, E2E 6 tests, and Mission Control build all exit 0.
- [x] Produce fresh 1440x900 and 390x844 Gateway browser QA screenshots from the current source and verify PNG dimensions: `c19-manual-qa-summary-20260901-081751.json`, desktop 1440x900, post-actions 1440x900, mobile 390x844, invalid workspace 390x844.
- [x] Dispatch fresh independent visual, code-quality, and security reviews against the current diff and screenshots: independent code and security reviews found no blocking findings; residual risks recorded for later stages.
- [x] Update C19 fact sources only after automation, visual QA, and independent review all pass.
- [x] Create the scoped C19 commit with only implementation, tests, docs, and verification evidence, then record the full SHA: `174c288f6365eeab879d08e6cad9f04c28029a78`.
- [x] Begin C20 with RED tests only after C19 is committed.

### C19 Execution Check-in / 2026-08-30

- [x] 记录 C17/C18 基线 SHA、未提交工作区边界和 C19 设计假设。
- [x] 先运行 contracts/persistence/API/UI RED 测试，确认失败原因是缺失 C19 能力而非测试装配问题。
- [x] 每条实现线完成后运行其 focused GREEN 测试，再统一运行完整验证矩阵。
- [x] 完成独立代码审查、视觉 QA 和安全边界复核后才可标记 C19 完成。

#### Contracts + Persistence ownership (/root/c19_contracts_persistence)

- [x] Define strict Gateway/Channel/Session/Message/Delivery/Allowlist contracts and RED tests.
- [x] Add migration 0009 tables, registration, and schema assertions with workspace-scoped constraints.
- [x] Add typed repositories with idempotent message/delivery semantics, cursor checkpoints, allowlist default-deny, and state updates.
- [x] Export repositories/contracts and run focused RED/GREEN plus typecheck verification.

Ownership review: focused contracts/persistence/API gateway tests pass (13 tests), contracts+persistence suites pass (122 tests), `pnpm typecheck` and `pnpm lint` exit 0. No real external connector or network side effect was added.

### C19 Review

- [x] Current focused validation: required 4-file C19 command passes 4 files / 49 tests; oracle RED/GREEN regression is recorded in `artifacts/progress/c19/current-verification/`.
- [x] Current full validation: `pnpm lint` 309 files, `pnpm typecheck`, full Vitest 92 files / 464 tests, integration 13 files / 36 tests, E2E 6 tests, and Mission Control build all exit 0.
- [x] Browser QA: fresh Playwright/browser captures at `artifacts/progress/c19/current-verification/c19-manual-qa-gateway-desktop-20260901-081751.png` and `artifacts/progress/c19/current-verification/c19-manual-qa-gateway-mobile-20260901-081751.png`; `file` verifies 1440x900 and 390x844 PNGs.
- [x] Independent visual QA: fresh browser summary `c19-manual-qa-summary-20260901-081751.json` PASS; no overflow, no invalid ARIA IDs, no external UI requests.
- [x] Code/security review: independent code and independent security reviewers found no blocking findings after the cross-workspace authorization-order fix; residual non-blocking risks are tracked for future hardening.
- [x] Boundary: C19 remains descriptor/control-plane only; no real Telegram, Discord, Slack, WhatsApp, Signal, Web/API provider, MCP, credential read, outbound message, or external side effect was attempted.

## C20 / Goal Mode、Loop、Judge（收口阶段）

范围：实现 Goal Mode control-plane semantics 的测试优先切片，覆盖跨轮 continuation、auxiliary Judge JSON、max turns、`/goal resume`、`/subgoal`、pause/resume、deadline/budget、Judge failure、restart/orphan recovery、run/session scope，以及 CLI、API、Mission Control 的一致控制面语义。C20 不扩大到真实外部连接器、NotebookLM、浏览器控制、语音或业务 SaaS。

- [x] C20.1 写 contracts/domain RED：GoalLoopDescriptor、GoalContinuation、JudgeDecision `{ done, reason }`、turn limits、budget/deadline、subgoal 和 pause/resume 状态约束。
- [x] C20.2 写 persistence/orchestration RED：跨重启恢复 continuation、orphan recovery、run/session scope 和 Judge failure 不得宣称成功。
- [x] C20.3 写 CLI/API RED：`/goal resume`、`/subgoal`、pause/resume/max-turns/budget/deadline 控制命令必须保持 descriptor-only 语义。
- [x] C20.4 写 Mission Control RED：Goal Mode 页面/控制面语义可见，不执行真实外部 side effect。
- [x] C20.5 运行 C20 RED suite，确认失败原因是缺失 C20 实现而非测试装配错误。
- [x] C20.6 实现 contracts、SQLite migration 11、typed repositories、orchestration controller、API route、CLI parser 和 Mission Control Goal Mode 页面。
- [x] C20.7 修复审查阻塞项：Judge `done=false` 生成 continuation 并恢复 running；continuation/command payload 与列一致性由 SQL trigger 强制；secret guard 覆盖裸 `token=abcd1234`。
- [x] C20.8 完成 focused 验证、全量 lint/typecheck/test/integration/e2e/build、真实浏览器 1440x900 与 390x844 视觉 QA、独立代码/安全复核和本地安全扫描。
- [x] C20.9 更新 `artifacts/progress/c20/verification.log`、ADR-0015、Goal Mode runbook、任务事实源和 lessons；真实外部连接、NotebookLM、浏览器控制、语音和业务 SaaS 仍保持禁止。
- [x] C20.10 创建单一 scoped C20 commit `05c4a51baec221f83db821b83ed14fe5626cbc7a`，记录完整 SHA 后再进入 C21。

### C20 Review

- [x] Focused C20 validation PASS：`pnpm exec vitest run packages/contracts/src/goal-loop.test.ts packages/persistence/src/c20-goal-loop.test.ts apps/api/src/routes/goal-mode.test.ts apps/mission-control/src/app/goal-mode-api.test.ts apps/mission-control/src/pages/goal-mode.test.tsx apps/mission-control/src/app/router.test.tsx apps/cli/src/goal-mode.test.ts packages/orchestration/src/goal-loop.test.ts tests/integration/goal-loop-recovery.test.ts --reporter=dot`，exit 0，9 files / 74 tests。
- [x] Full verification PASS：`pnpm lint` 322 source files、`pnpm typecheck`、full Vitest 100 files / 534 tests、integration 14 files / 37 tests、E2E 6 tests、Mission Control build 全部 exit 0。
- [x] Visual QA PASS：`/goal-mode?workspace=ws-demo` fresh PNGs at 1440x900、post-Judge 1440x900、390x844 mobile、390x844 mobile controls；无横向溢出，无非法 ARIA refs，五项移动导航和 descriptor-only/no external boundary 可见。
- [x] Independent review PASS：scope/RBAC/idempotency/optimistic concurrency/SQL trigger/append-only continuation facts/cursor replay/secret redaction/no real external calls 均无 blocking finding。
- [x] Evidence paths：`artifacts/progress/c20/verification.log`、`artifacts/progress/c20/current-verification/`、`docs/adr/0015-goal-mode-loop-judge.md`、`docs/runbooks/goal-mode-operations.md`。
- [x] Scoped commit：`05c4a51baec221f83db821b83ed14fe5626cbc7a`（`feat: add goal mode loop and judge control plane`）。

## C21 / Skills、Learning、Approved Snapshot（当前阶段）

范围：实现 Skills/Learning control-plane descriptor，覆盖 skill entity、version、source hash、scan、review、approve/install/revoke/quarantine、rollback、`/learn` 控制命令和 Mission Control 可见状态。C21 只记录和审批 descriptor/snapshot，不执行真实 MCP、不读取真实 URL/PDF/凭据、不安装外部 skill、不产生外部副作用。

- [x] C21.1 写 contracts RED：SkillDescriptor、SkillVersion、SkillSource、SkillScan、SkillReview、SkillInstallation、SkillInvocationFact、LearningCandidate、LearningCommand；严格 schema、workspace scope、source hash、approved snapshot、quarantine 与 secret-safe diff。
- [x] C21.2 写 persistence RED：migration 12、skills/versions/sources/scans/reviews/installations/invocation facts/learning candidates 表约束，唯一键、外键、append-only 审计、workspace scope、revoke/quarantine 和 rollback 语义。
- [x] C21.3 写 API RED/GREEN：Skills/Learning 查询与控制路由，Owner 写权限、`run:read` 读权限、`Idempotency-Key`、`If-Match`、scope-safe error、secret/path redaction。
- [x] C21.4 写 CLI RED/GREEN：`/learn`、approve/install/revoke/quarantine/rollback 命令解析为 descriptor-only 请求，不执行本地文件或外部读取。
- [x] C21.5 写 Mission Control RED/GREEN：Skills/Learning 页面、导航、scan/review/install/quarantine/rollback 状态、approved snapshot 边界和移动端响应式布局。
- [x] C21.6 运行 C21 RED suite，确认失败原因是缺失 C21 实现而非测试装配错误。
- [x] C21.7 实现 contracts、SQLite migration 12、typed repositories、service/routes、CLI parser 和 Mission Control 页面。
- [x] C21.8 完成 focused 验证、全量 lint/typecheck/test/integration/e2e/build、真实浏览器 1440x900 与 390x844 视觉 QA、本地安全扫描和代码/安全复核。
  - [x] C21.8a 修复独立安全复核 blocker：run/goal scope、重复安装、rollback 目标、`/learn` 完整幂等、凭据/path-like ref、caller-supplied status、installation revision 和 approve/revoke UI 控件。
  - [x] C21.8b 重新运行 C21 focused 与全量验证矩阵，并保存 fresh exit code、测试文件数和测试数量。
  - [x] C21.8c 重新生成 Skills/Learning 1440x900、390x844 和交互后截图，验证 PNG 格式/尺寸与移动端无溢出。
  - [x] C21.8d 独立代码审查发现 P1 no-op rollback persistence parity，已用 RED/GREEN 修复；后续独立复核和安全 reviewer 因平台线程上限/连接中断未完成，限制已记录，本地安全清单无 blocking finding。
- [x] C21.9 更新 `artifacts/progress/c21/verification.log`、ADR/runbook、任务事实源和 lessons；C21 保持 descriptor/control-plane 边界。
- [x] C21.10 创建单一 scoped C21 commit `51ab5e76a6a9a57736f03281c34e33afc297adce`，记录完整 SHA 后再进入 C22。

### C21 Review Blocker Remediation / 2026-09-02

- [x] C21.R1 用 RED 测试复现 traversal-shaped internal refs、CLI `/learn` status 外泄、未绑定 `source_event_id` 和同 skill 多 active install。
- [x] C21.R2 最小修复 contracts、CLI、migration、repository/service 和 Mission Control visual seed，不扩大到真实 MCP、URL/PDF、凭据读取或外部副作用。
- [x] C21.R3 重跑 C21 focused 与全量验证矩阵，保存 fresh exit code、测试文件数和测试数量。
- [x] C21.R4 重做 Skills/Learning 真实浏览器视觉 QA，验证 PNG 格式/尺寸、移动端无溢出和真实 DOM/API 控件。
- [x] C21.R5 独立代码审查 P1 已修复；复核/安全子代理因平台限制未完成，本地代码与安全复核清单 PASS，限制写入验证日志。

### C21 Review

- [x] Focused C21 validation PASS：`pnpm exec vitest run packages/contracts/src/skills.test.ts packages/contracts/src/envelope.test.ts packages/persistence/src/c21-skills-learning.test.ts packages/event-store/src/event-store.test.ts apps/api/src/routes/skills-learning.test.ts apps/cli/src/skills-learning.test.ts apps/mission-control/src/app/skills-learning-api.test.ts apps/mission-control/src/pages/skills-learning.test.tsx --reporter=dot`，exit 0，8 files / 75 tests。
- [x] Full verification PASS：`pnpm lint` 335 source files、`pnpm typecheck`、full Vitest 106 files / 584 tests、integration 14 files / 37 tests、E2E 6 tests、Mission Control build、production audit 全部 exit 0。
- [x] Visual QA PASS：`/skills?workspace=ws-demo` fresh PNGs at 1440x900、post-actions 1440x900、390x844 mobile、390x844 invalid workspace；无横向溢出，无非法 ARIA refs，五项移动导航、real DOM controls 和 no-external-connection boundary 可见。
- [x] Code/security review：独立审查发现的 no-op rollback P1 已修复；本地 scope/RBAC/idempotency/optimistic concurrency/SQL trigger/append-only/approved snapshot/secret redaction/no external call 清单 PASS；独立安全 reviewer 受线程上限限制未完成。
- [x] Evidence paths：`artifacts/progress/c21/verification.log`、`artifacts/progress/c21/current-verification/`、`docs/adr/0016-skills-learning-approved-snapshot.md`、`docs/runbooks/skills-learning-operations.md`。
- [x] Scoped commit：`51ab5e76a6a9a57736f03281c34e33afc297adce`（`feat: add skills learning approved snapshots`）。

## C22 / Obsidian、OMI、Journal（下一阶段）

范围：实现 vault bridge、OMI/Journal descriptor、daily journal、graph/FTS index、memory candidate 和 writeback approval 控制面。C22 只处理本地 descriptor、索引和审批事实；默认只读，不连接真实 Obsidian/OMI/MCP，不读取真实凭据，不写回用户 vault，未经批准不产生外部副作用。

- [x] C22.1 写 contracts RED/GREEN：VaultBridgeDescriptor、JournalEntryDescriptor、JournalSource、GraphIndexSnapshot、MemoryCandidate、WritebackRequest/Decision；严格 schema、workspace scope、source hash、descriptor-only、secret-safe refs。
- [x] C22.2 写 persistence RED/GREEN：migration 13、vault/journal/graph/memory/writeback 表约束，唯一键、外键、append-only facts、workspace scope、默认只读、写回需批准。
- [x] C22.3 写 API/CLI RED/GREEN：vault/journal 查询、journal candidate、memory candidate、writeback request/approve/reject；Owner 写权限、`run:read` 读权限、`Idempotency-Key` 和 `If-Match`。
- [x] C22.4 写 Mission Control RED/GREEN：Obsidian/OMI/Journal 页面、graph/FTS/memory/writeback 状态、移动端响应式和 no external connection 边界。
- [x] C22.5 运行 C22 RED suite，确认失败原因是缺失 C22 实现而非测试装配错误。
- [x] C22.6 实现 contracts、SQLite migration、typed repositories、service/routes、CLI parser 和 Mission Control 页面。
- [x] C22.7 完成 focused 验证、全量 lint/typecheck/test/integration/e2e/build、真实浏览器视觉 QA、本地安全扫描和代码/安全复核；vault policy parity、CLI/API timestamp idempotency、Unicode whitespace、unknown payload keys、writeback version jump、default-ignorable refs、encoded secret blockers、target-root binding 和 safe idempotency key 均已 RED/GREEN 修复；最终独立 subagent 复核受平台线程上限阻塞，已记录并完成本地代码/安全复核替代。
- [x] C22.8 更新 verification log、ADR/runbook、任务事实源和 lessons；C22 scoped commit `12451447dfbfcf9fd466988d99017bf896caf7c7` 已创建。

### C22 Security Review Remediation / Current Continuation

- [x] C22.R1 写 RED 覆盖 append-only 根事实 update/delete、terminal writeback mutation/delete、`journal://` reference grammar 和 accepted status URLs 的 live GET 路由。
- [x] C22.R2 最小修复 migration triggers、typed repositories、contracts reference scheme 和 Journal API status routes；保持 descriptor-only，无真实 vault/writeback/connector 副作用。
- [x] C22.R3 重跑 C22 focused suite 与 full verification matrix，记录 exit code、测试文件数和测试数量。
- [x] C22.R4 重做 `/journal?workspace=ws-demo` 1440x900 和 390x844 真实浏览器视觉 QA，保存新鲜 PNG 并验证尺寸。
- [x] C22.R5 完成代码/安全复核；fresh 安全复核返回两个 P1：writeback `target_ref` 未绑定 vault `root_ref`，以及 `Idempotency-Key` 可携带 secret/path-shaped 内容进入持久化和 accepted `command_id`，均已修复并复验；最终 subagent 复核因 `agent thread limit reached` 不可用，使用本地审查清单和 fresh focused/full/visual 证据替代。
  - [x] C22.R5a 写 API、CLI、raw-SQL 和 contracts RED 覆盖 writeback target-root 绑定、safe idempotency key、vault allowed source kinds raw-SQL parity 和 writeback canonical hash。
  - [x] C22.R5b 在 repository/migration/request-context/CLI parser/journal service 中修复，保持 descriptor-only 且不改变真实外部连接边界。
  - [x] C22.R5c 重跑 C22 focused、full matrix、visual QA、代码/安全复核；subagent 独立复核受平台线程上限限制，限制已写入 verification log。

### C22 Review

- [x] Focused C22 validation PASS：`pnpm exec vitest run packages/contracts/src/journal.test.ts packages/persistence/src/c22-journal.test.ts apps/api/src/routes/journal.test.ts apps/cli/src/index.test.ts apps/cli/src/journal.test.ts apps/mission-control/src/app/journal-api.test.ts apps/mission-control/src/pages/journal.test.tsx apps/mission-control/src/app/router.test.tsx apps/mission-control/src/pages/goal-mode.test.tsx --reporter=dot`，exit 0，9 files / 54 tests；fresh evidence `artifacts/progress/c22/current-verification/full-matrix-final-20260903-005153/c22-focused.log`。
- [x] Full verification PASS：`pnpm lint` 350 source files、`pnpm typecheck`、full Vitest 113 files / 630 tests、integration 14 files / 37 tests、E2E 6 tests、Mission Control build 全部 exit 0；fresh summary `artifacts/progress/c22/current-verification/full-matrix-final-20260903-005153/summary.log`。
- [x] Visual QA PASS：`/journal?workspace=ws-demo` fresh PNGs `c22-journal-desktop-final-rerun-20260902T170407Z.png`、`c22-journal-desktop-post-actions-final-rerun-20260902T170407Z.png`、`c22-journal-mobile-final-rerun-20260902T170407Z.png` 经 `/usr/bin/file` 验证为 1440x900、1440x900、390x844；无横向溢出，无非法 ARIA refs，无宽表格，五项移动导航、real DOM controls 和 no-external-connection boundary 可见；observed 401 -> local bootstrap 204 -> scoped reads 200、writeback request 202、approve 202。
- [x] Code/security review：独立代码审查发现 cross-vault writeback candidate raw SQL blocker、vault policy parity blocker、CLI/API timestamp idempotency blocker、SQLite `LIKE` case-insensitive descriptor-ref blocker、Unicode whitespace、unknown payload keys、writeback version jump、default-ignorable refs、encoded secret markers、target-root binding 和 idempotency key hygiene gaps，均已用 contracts/service/migration trigger/CHECK 和 RED/GREEN regression 修复；最终 subagent 复核受平台线程上限限制，本地 scope/RBAC/idempotency/optimistic concurrency/SQL/append-only/cursor-free replay/secret/no-external-call/API-UI wiring 审查无 blocking finding。
- [x] Evidence paths：`artifacts/progress/c22/verification.log`、`artifacts/progress/c22/current-verification/`、`docs/adr/0017-obsidian-omi-journal-control-plane.md`、`docs/runbooks/journal-operations.md`。
- [x] Scoped commit：`12451447dfbfcf9fd466988d99017bf896caf7c7`（`feat: add journal vault control plane`）。

## C23 / Browser、Computer Use（当前阶段）

范围：实现 Browser/Computer Use 的 control-plane descriptors、sandbox policy、allowlist、human approval、screenshot/action receipts 和 stop/takeover 语义。C23 仍为 descriptor/control-plane only；默认拒绝外部网络、桌面操作和文件系统副作用，禁止读取凭据或连接真实 provider/MCP。

- [x] C23.1 写 contracts RED/GREEN：BrowserSessionDescriptor、ComputerUseSessionDescriptor、SandboxPolicy、TargetAllowlist、HumanApproval、ActionIntent、ActionReceipt、ScreenshotReceipt、Takeover/Pause/Stop command。
- [x] C23.2 写 persistence RED/GREEN：migration 14、typed repositories、append-only action/screenshot receipts、allowlist 默认拒绝、approval gate、workspace/run/session scope、optimistic versioning。
- [x] C23.3 写 API/CLI RED/GREEN：Owner 写、`run:read` 读、Idempotency-Key、If-Match、denied action 不产生 receipt、错误响应不泄露 secret/path。
- [x] C23.4 写 Mission Control RED/GREEN：Browser/Computer Use 页面、desktop/mobile responsive、approval/stop/takeover/acknowledge controls、descriptor-only boundary、no real external side effect。
- [x] C23.5 运行 focused RED/GREEN，确认失败原因是 C23 实现缺失和后续 review blocker，而非装配错误。
- [x] C23.6 修复代码/安全审查 blocker：raw SQL target/host parity、expired allowlist receipt recheck、encoded/default-ignorable secret markers、wildcard domain bypass、acknowledgement idempotency/duplicate ack，以及 action receipt `screenshot_id` same workspace/session/action 绑定。
- [x] C23.7 运行 C23 focused 验证、全量 lint/typecheck/test/integration/e2e/build、`pnpm audit --audit-level=high`，保存 fresh exit code、测试文件数和测试数量。
- [x] C23.8 完成 `/browser-computer?workspace=ws-demo` 真实浏览器 1440x900、post-actions 1440x900、390x844 视觉 QA，验证 PNG 格式/尺寸、移动端无溢出、五项底部导航、真实 DOM 控件和 no-external-connection 边界。
- [x] C23.9 完成独立代码复审和安全复核；post-fix reviewers 均无 blocking finding，raw `current-verification` 不批量提交。
- [x] C23.10 更新 `artifacts/progress/c23/verification.log`、ADR-0018、Browser/Computer runbook、任务事实源和 lessons；C23 保持 descriptor/control-plane 边界。

### C23 Review

- [x] Focused C23 validation PASS：`pnpm exec vitest run packages/contracts/src/browser-computer.test.ts packages/persistence/src/c23-browser-computer.test.ts apps/api/src/routes/browser-computer.test.ts apps/cli/src/browser-computer.test.ts apps/mission-control/src/pages/browser-computer.test.tsx --reporter=dot`，exit 0，5 files / 39 tests；fresh evidence `artifacts/progress/c23/current-verification/c23-focused-post-screenshot-scope-20260903T193049.log`。
- [x] Full verification PASS：`pnpm lint` 362 source files、`pnpm typecheck`、full Vitest 118 files / 669 tests、integration 14 files / 37 tests、E2E 6 tests、Mission Control build、`pnpm audit --audit-level=high` 全部 exit 0；fresh summary `artifacts/progress/c23/current-verification/full-matrix-post-screenshot-scope-20260903T193119/summary.log`。
- [x] Visual QA PASS：`/browser-computer?workspace=ws-demo` fresh PNGs `c23-browser-computer-desktop-20260903T193322.png`、`c23-browser-computer-desktop-post-actions-20260903T193322.png`、`c23-browser-computer-mobile-20260903T193322.png` 经 `file` 验证为 1440x900、1440x900、390x844；summary 确认无横向溢出、无非法 ARIA refs、五项移动导航、Pause/Stop/Takeover/Approve/Acknowledge 控件、descriptor-only 和 no-external-connection 边界可见，仅访问 `127.0.0.1:4310`/`4313`。
- [x] Code/security review：独立代码审查发现 action receipt 可引用不存在 screenshot 的 CRITICAL blocker，已用 repository guard、SQLite trigger 和 RED/GREEN raw SQL/repository regression 修复；post-fix 独立代码复审与安全复核均无 blocking finding；本地 `git diff --check` 与 `pnpm audit --audit-level=high` exit 0。
- [x] Evidence paths：`artifacts/progress/c23/verification.log`、`artifacts/progress/c23/current-verification/`、`docs/adr/0018-browser-computer-use-control-plane.md`、`docs/runbooks/browser-computer-operations.md`。
- [x] Scoped commit：`3a4652aaed9b0a313460a6753865311aeca13959`（`feat: add browser computer control plane`）。

## C24 / Voice、Jarvis（下一阶段）

范围：实现 Voice/Jarvis control-plane descriptors、STT/VAD/TTS/wake word/Wall mode/interrupt/recording policy/voiceprint policy/transcript lifecycle 的测试优先切片。C24 仍保持 descriptor/control-plane only，默认不读取麦克风、不播放音频、不连接真实语音 provider、不读取凭据、不产生外部副作用。

- [x] C24.1 写 contracts RED/GREEN：VoiceSessionDescriptor、AudioPolicy、WakeWordDescriptor、TranscriptDescriptor、VoiceCommand、Interrupt/Pause/Resume、retention/delete/export policy。
- [x] C24.2 写 persistence RED/GREEN：migration 15、typed repositories、append-only transcript/command facts、workspace/run/session scope、budget/deadline、optimistic versioning。
- [x] C24.3 写 API/CLI RED/GREEN：Owner 写、`run:read` 读、Idempotency-Key、If-Match、`/voice`/`/jarvis` 控制命令保持 descriptor-only。
- [x] C24.4 写 Mission Control RED/GREEN：Voice/Jarvis 页面、desktop/mobile responsive、wake/interrupt/delete/export controls、no microphone/provider boundary。
- [x] C24.5 运行 focused RED/GREEN，确认失败原因是 C24 实现缺失和后续 raw-SQL / idle-resume review blocker，而非装配错误；当前 C24 focused suite PASS，7 files / 52 tests。
- [x] C24.6 运行 full verification matrix：`pnpm lint`、`pnpm typecheck`、full Vitest、integration、e2e、Mission Control build 和安全扫描；fresh matrix 全部 exit 0，unit 124 files / 714 tests，integration 14 files / 37 tests，E2E 6 tests。
- [x] C24.7 完成 `/voice-jarvis?workspace=ws-demo` 真实浏览器 1440x900 与 390x844 视觉 QA，保存新鲜 PNG 并验证格式/尺寸；desktop、post-actions、mobile 无横向溢出，移动底部导航 5 项。
- [x] C24.8 完成代码/安全复核：post-fix 独立代码和安全审查均无 blocking/high finding；本轮 fresh subagent 复核因 `agent thread limit reached` 无法启动，已记录限制并完成本地 scope/RBAC/idempotency/optimistic concurrency/SQL trigger/append-only/secret/no-external-call/API-UI wiring 清单。
- [x] C24.9 更新 `artifacts/progress/c24/verification.log`、ADR/runbook、任务事实源和 lessons；新增 command-backed state transition 和 normalized DB parity lessons。
- [ ] C24.10 创建单一 scoped C24 commit，记录完整 SHA 后再进入 C25。

### C24 Review Blocker Remediation / Current Continuation

- [x] C24.R1 写 RED 覆盖 audio policy / wake word payload parity、voice session update immutable/secret drift、`current_transcript_id` create/update scope。
- [x] C24.R2 最小修复 migration、typed repositories 和 API service；保持 descriptor/control-plane only，不读取麦克风、不播放音频、不连接 provider。
- [x] C24.R3 重跑 C24 focused suite、typecheck 和完整验证矩阵，记录 fresh exit code、测试文件数和测试数量。
- [x] C24.R4 重做 `/voice-jarvis?workspace=ws-demo` 1440x900、post-actions 和 390x844 真实浏览器视觉 QA，验证 PNG 格式和尺寸。
- [x] C24.R5 完成 post-fix 独立代码/安全复核；idle-resume raw SQL blocker 已 RED/GREEN 修复，post-fix reviewer 无 blocking/high finding，本轮 fresh reviewer dispatch 因平台线程上限不可用并已记录。

### C24 Review

- [x] Focused C24 validation PASS：`pnpm exec vitest run packages/contracts/src/voice-jarvis.test.ts packages/persistence/src/c24-voice-jarvis.test.ts apps/api/src/routes/voice-jarvis.test.ts apps/cli/src/voice-jarvis.test.ts apps/mission-control/src/app/voice-jarvis-api.test.ts apps/mission-control/src/pages/voice-jarvis.test.tsx apps/mission-control/src/app/router.test.tsx --reporter=dot`，exit 0，7 files / 52 tests；fresh evidence `artifacts/progress/c24/current-verification/c24-focused-current-20260903T202014Z.log`。
- [x] Full verification PASS：`pnpm lint` 375 source files、`pnpm typecheck`、full Vitest 124 files / 714 tests、integration 14 files / 37 tests、E2E 6 tests、Mission Control build、`pnpm audit --audit-level=high` 全部 exit 0；fresh summary `artifacts/progress/c24/current-verification/full-matrix-current-20260903T202133Z/summary.log`。
- [x] Visual QA PASS：`/voice-jarvis?workspace=ws-demo` fresh PNGs `c24-voice-jarvis-desktop-20260903T202312Z.png`、`c24-voice-jarvis-desktop-post-actions-20260903T202312Z.png`、`c24-voice-jarvis-mobile-20260903T202312Z.png` 经 `file` 验证为 1440x900、1440x900、390x844；summary 确认无横向溢出、无非法 ARIA refs、五项移动导航、Wake/Interrupt/Pause/Delete transcript/Export transcript 控件、descriptor-only/no-external/no-microphone 边界可见。
- [x] Code/security review：review blocker 包括 raw SQL unsafe refs、payload parity、immutable descriptor/session drift、`current_transcript_id` scope、workspace-global command idempotency 和 idle resume forgery，均已用 contracts/service/repository/migration triggers 和 RED/GREEN regressions 修复；post-fix 独立代码/安全审查无 blocking/high finding；本轮 fresh reviewer dispatch 受 `agent thread limit reached` 限制，本地清单与 `git diff --check`/`pnpm audit` 无 blocker。
- [x] Evidence paths：`artifacts/progress/c24/verification.log`、`artifacts/progress/c24/current-verification/`、`docs/adr/0019-voice-jarvis-control-plane.md`、`docs/runbooks/voice-jarvis-operations.md`。
- [ ] Scoped commit：pending post-commit SHA capture（`feat: add voice jarvis control plane`）。

## Review

- 证据等级已分为 A（页面/上游直接陈述）、B（作者 live/demo 或个案）、C（营销/推断），未把免费、10X、24/7、成员数量等宣传数字当作工程保证。
- 当前结论：Nexora 已覆盖可靠控制平面核心，但尚未实现官网九部分中的 OpenClaw Studio、AI Avatar、HyperFrames 视频、NotebookLM、MCP 协议、真实语音/浏览器、Antigravity 团队后端、模型路由和 Obsidian/OMI 集成。
- 实现闸门：先由用户选择首个纵向切片；在确认前只提交研究与设计事实，不扩大到未经授权的外部账号、付费 API 或公开发布。

计划来源：`docs/agent-os-design.md`，并参考其中对 `qMvkdMzuYjs`（Hermes Agent OS FULL COURSE）的证据边界说明。

- [x] 完成仓库、设计规格、AionUi 对比资料和来源限制的只读调研
- [x] 固定 TypeScript 单栈、SQLite 事实源、Markdown Memory、Runtime Adapter 的总体实现边界
- [x] 编写 17 个分阶段 commit 的详细实施计划
- [x] 为每个阶段定义文件边界、自动化测试、人工 QA 和退出条件
- [x] 执行规格覆盖、依赖一致性、占位符和提交边界自审
- [x] 生成可持续更新的 C00-C16 开发进度清单、质量门、QA 门和交接模板
- [x] 形成融合 Agent OS 与 AionUI 的完整前端 UI 规格和可复用设计系统契约
- [x] 将设计系统与前端 UI 规格转换为中文，并补充 UI 设计图与响应式布局图

## 可运行 UI Demo

- [x] 在 `demo/` 创建零后端依赖的 Mission Control 前端 Demo，并复用 `DESIGN.zh-CN.md` 的 token、密度和响应式约束。
- [x] 实现桌面应用外壳：范围切换、搜索、Create、分组导航、Needs Attention、Active Runs、Goals/Artifacts 与证据栏。
- [x] 实现 AionUI 风格的 Quick Cowork：工作区、Agent、模型、MCP/Skill 上下文芯片，以及 Accepted/Queued 的真实提交反馈。
- [x] 实现 Run Detail 与 Review Center 演示交互：事件证据、预算/运行时、R3 载荷哈希、审批/拒绝与回执状态。
- [x] 实现 768px 以下单窗格、五项移动导航和不伪造桌面复杂审核的“在桌面继续”约束说明。
- [x] 启动 Demo；已改为 macOS 用户级 `launchctl` 托管，确认 5173 listener 与 HTML/JS HTTP smoke 通过。
- [x] 运行独立代码审阅并修复 R3 移动端、审核包、理由回执、焦点管理和 Artifact 状态记录问题。
- [x] 完成 Codex in-app browser 真实 DOM/交互/截图 QA；独立 Playwright Chromium 仍不可用，限制记录在 `.omo/evidence/hermes-alignment/manual-qa.md`。

## Hermes Agent OS 对齐切片（本轮）

- [x] H1 更新进度事实源与验收标准，明确视频不可直接验证的来源边界。
- [x] H2 扩展 Gateway、Channels、Sessions、Skills、Learning、Models、Backends、Tools & MCP 的夹具数据与导航。
- [x] H3 实现 Hermes Control Room 页面和操作交互：连接健康、队列/断路器、会话队列、Skill quarantine、Learning review、Cron 操作。
- [x] H4 运行 `npm run build`、`node --check`、HTTP smoke，并尝试真实浏览器验证桌面与移动断点。
- [x] H5 完成独立代码审查、视觉 QA 和文档收口；若 Chromium 不可用，保留明确阻塞证据，不伪造通过。

### 本轮验收标准

1. Hermes 运行时能力可在 Demo 中被看见：Gateway 健康、渠道状态、后台 Session、Skill trust、学习队列、Cron 触发、Provider/Backend/MCP 健康均有可导航表面。
2. 高风险行为仍是控制面动作：暂停/恢复/触发只更新夹具状态并显示回执，不能暗示已连接真实外部服务；R3 审核语义与移动端只读约束不回归。
3. 页面在 1440px 与 390px 下保持可扫描，移动端继续使用五项底部导航，不把桌面控制台压缩成不可读的横向表格。
4. 自动化命令退出码为 0；HTTP 返回 HTML/JS；真实浏览器无法启动时，必须记录原因和替代验证范围。

### 本轮收口

- Fresh gate review：APPROVE，报告见 `.omo/evidence/hermes-alignment-gate-review.md`。
- 旧的 `mobile-schedules-390x844.jpg` 文件元数据显示为 1440x900，不作为当前证据引用；有效移动证据使用 `mobile-gateway-390x844.jpg`。

主计划：[docs/superpowers/plans/2026-08-23-agent-os-implementation.md](/Users/zq/Desktop/ai-projs/posp/Nexora/docs/superpowers/plans/2026-08-23-agent-os-implementation.md)

持续进度清单：[tasks/agent-os-progress.md](/Users/zq/Desktop/ai-projs/posp/Nexora/tasks/agent-os-progress.md)

前端 UI 规格：[docs/nexora-agent-os-ui-design.md](/Users/zq/Desktop/ai-projs/posp/Nexora/docs/nexora-agent-os-ui-design.md)

设计系统契约：[DESIGN.md](/Users/zq/Desktop/ai-projs/posp/Nexora/DESIGN.md)

中文设计系统契约：[DESIGN.zh-CN.md](/Users/zq/Desktop/ai-projs/posp/Nexora/DESIGN.zh-CN.md)

中文 UI 规格：[docs/nexora-agent-os-ui-design.zh-CN.md](/Users/zq/Desktop/ai-projs/posp/Nexora/docs/nexora-agent-os-ui-design.zh-CN.md)

中文 UI/布局图册：[docs/nexora-agent-os-ui-diagrams.zh-CN.md](/Users/zq/Desktop/ai-projs/posp/Nexora/docs/nexora-agent-os-ui-diagrams.zh-CN.md)

后续迭代约束：每次只推进一个 `Cxx` 阶段；完成实现、自动化验证、对应人工 QA Gate 和代码审查后，记录完整 commit SHA，再进入下一阶段。进度清单是状态事实源，实施计划是范围和设计事实源。

## Review

- 规格覆盖：已把设计文档的 E0-E12、Run 状态机、事件账本、RBAC/scope、幂等、Review、Memory、Artifact、前端状态矩阵、SEO 首条工作流、远程出境、Schedule 和生产加固映射到计划任务。
- 依赖审查：执行顺序固定为 `C00 -> C01 -> C02 -> C03 -> C04 -> C05 -> C06 -> C07 -> C08 -> C09 -> C10 -> C11 -> C12 -> C13 -> C14 -> C15 -> C16`；所有跨包类型先在 `packages/contracts` 版本化。
- 提交审查：每个 commit 都有独立绿色验证命令和可回滚范围；禁止在单个 commit 中同时引入 UI、运行时副作用和生产连接器。
- 风险结论：首版只支持本地 Web Mission Control、一个可执行本地 adapter、一个 deterministic test adapter 和不自动发布的 SEO 草稿工作流；Tauri、移动受限视图、远程 worker、真实 SaaS connector 作为后续阶段。
- 来源边界（历史记录）：初次计划阶段 YouTube 原始页面返回连接重置；2026-08-30 已通过 `yt-dlp` 补齐原始元数据、章节、自动字幕和 storyboard 抽样。视频营销表述仍不作为性能、成本或安全承诺。
- 进度清单：已生成 `tasks/agent-os-progress.md`，包含 C00-C16 子任务、Q01-Q14 跨阶段质量门、G0-G13 人工 QA、阻塞记录、变更记录和交接模板。
- 前端契约：C10-C16 必须以中文 UI 规格、中文 DESIGN 和中文图册的路由、状态、交互、布局与验收清单为产品决策输入，并遵守英文契约中相同的 tokens、原语、响应式与无障碍规则；英文文档作为术语和来源对照，偏离前先记录 ADR 和计划变更。
- 中文交付：C10-C16 实施优先阅读中文设计系统、中文 UI 规格和中文图册；英文文档继续作为术语与来源对照，不得因翻译而改变 route、schema、状态 token、R0-R3 或审计语义。
- 中文交付收口：`3450f15` 已提交中文设计系统、中文 UI 规格、UI/布局图册和跟踪入口；结构/链接/Mermaid QA 与独立 HEAVY 审阅通过。当前 Demo 已可运行，生产 C00-C16 尚未开始。
- Demo 交付记录：当前 Demo 位于 `demo/`，使用 Vanilla JS + Vite + lucide；H1-H5 Hermes 对齐、构建、语法、HTTP 和 Codex in-app browser QA 已通过。Playwright Chromium standalone 仍不可用，限制已记录但不阻塞本地 Demo 交接。
- Demo 安全审阅收口：R3 在移动端只读并硬拦截决策；桌面审核包含 payload hash、Reviewer、到期、成本、出站、回滚和 Judge；批准需完整字段、理由和当前哈希确认；拒绝/请求修改均生成回执；理由在重新渲染前转义。

## C16 Closeout Plan / 2026-08-29

- [x] 复核 C16 staged implementation 与用户已有 `tasks/`、`demo/`、`.omo/`、设计文档和 assets 边界。
- [x] 先补失败断言：release seed 必须同时提供 MemoryVault 读取路径和用户可浏览的 `vault/release-qa.md` active 文件。
- [x] 实现最小 seed fixture 修补，运行 targeted C16 tests，更新 `artifacts/progress/c16/verification.log` 的最终测试数字。
- [x] 串行运行 lint、typecheck、full Vitest、integration、Mission Control build、E2E、Compose config、seed/fault smoke，并复核 launchd 5173 不变。
- [x] 请求独立代码审查，修复文件 symlink 写穿 HIGH 问题；仅保留 worker liveness-only 低风险建议。
- [x] 运行 staged diff 检查，创建唯一 C16 implementation commit；提交后再更新追踪文件并记录完整 SHA、结果、限制和剩余项。

## C00 / Bootstrap Workspace and Health

- [x] C00.1 记录已有工作区状态并维持 `demo/` 服务不受影响。
- [x] C00.2 建立 Node 22 pnpm TypeScript workspace、严格编译配置和包清单。
- [x] C00.3 先创建 config 与 health 的 Given/When/Then 测试并取得 RED 证据。
- [x] C00.4 实现 Zod 环境解析、脱敏配置错误和 Fastify health route。
- [x] C00.5 实现可停止的 worker idle 日志与可见的 React/Vite shell。
- [x] C00.6 编写 README、ADR-0001 与本地配置样例。
- [x] C00.7 生成 lockfile，运行 frozen install、typecheck 和全量测试。
- [x] C00.8 启动 API、worker、web，保存 health、启动日志和命令证据。
- [x] C00.9 审计 diff、依赖和敏感值，提交仅含 C00 新文件的变更。

## C00 Review

- [x] RED/GREEN 测试、安装、类型检查和 G0 启动验证均有证据：`artifacts/progress/c00/`。
- [x] 仅 C00 源码、配置、README、ADR、lockfile 与证据进入 `4efdb06358e1ee433039201e2d63858bd64a471f`；`tasks/`、`demo/`、`.omo/` 和既有文档保持未暂存。
- [x] 代码/安全/视觉/目标审查通过；Playwright journey、worker signal 自动化和 Node 22 原生验证记录为后续 hardening 或环境限制，未扩大 C00 范围。

Review result: PASS. C00 is complete and C01 is the next stage.

## C01 / Versioned Contracts and Error Semantics

- [x] C01.1 确认 C00 `4efdb06358e1ee433039201e2d63858bd64a471f` 存在，且基线 typecheck、4 个测试均通过。
- [x] C01.2 先写失败测试：ULID/Clock、错误响应、核心 schemas、EventEnvelope、RuntimeEnvelope 与旧版本拒绝。
- [x] C01.3 实现 branded IDs、可注入 Clock、ISO 时间和 schema version 常量。
- [x] C01.4 实现统一错误码和脱敏错误响应 schema。
- [x] C01.5 实现 Agent、Goal、Ticket、Run/Attempt/Step、Artifact/Receipt、Review schemas。
- [x] C01.6 实现 EventEnvelope、RuntimeEnvelope 和 ConnectorDescriptor，严格拒绝未知字段与不支持版本。
- [x] C01.7 更新 README schema/error 语义并创建 ADR-0002。
- [x] C01.8 执行 contracts 测试、全局 typecheck、全量测试并保存 RED/GREEN 证据。
- [x] C01.9 完成 G1 validation-only probe：完整合法 Goal 返回 200，未知字段与旧版本返回脱敏 `SCHEMA_INVALID`；无持久化。
- [x] C01.10 依次完成规格、代码质量和安全审查；首轮安全发现均已修复。
- [x] C01.11 创建单一 scoped C01 commit `afff377f44ecea047951d5120347ad62db941fc2`，回写完整 SHA 与阶段收口模板。

## C01 Review

- [x] 所有跨包对象均从 `@nexora/contracts` 导出，未复制状态字符串。
- [x] 合法/非法 payload、缺失 workspace、未知字段、旧 schema/protocol version 和错误脱敏均有测试。
- [x] C01 commit 不包含 `tasks/`、`demo/`、`.omo/` 或既有未跟踪设计文档。

## C02 / SQLite Schema and Domain Repositories

实施前计划（先写入任务事实源）：

- [x] C02.1 复核 C01 `afff377f44ecea047951d5120347ad62db941fc2`、Node/pnpm 基线和未提交工作区边界。
- [x] C02.2 先写迁移、约束、repository 和状态机的失败测试，保存 RED 证据。
- [x] C02.3 创建 `packages/persistence` package，配置 Node 22.13+ 内置 SQLite、迁移 runner 和测试临时数据库。
- [x] C02.4 编写 `0001_core.sql`：workspace、agent、goal、ticket、run、attempt、step、artifact、receipt、review、idempotency 表、版本列、scope 索引和唯一约束。
- [x] C02.5 实现事务化 migration up/down 与参数化 repository 基础层。
- [x] C02.6 实现各领域 repository，所有写入校验 workspace、runtime Zod schema、`expected_version`、幂等键和不可覆盖 Attempt/Receipt。
- [x] C02.7 创建 `packages/domain` 的 Run 状态机，覆盖 queued/running/paused/waiting_review/partial/failed/succeeded/cancelled 合法转移并拒绝非法转移。
- [x] C02.8 写 migration、唯一键、乐观并发、scope 隔离、Attempt 保留和状态机测试。
- [x] C02.9 完成 G1 SQLite smoke：迁移、写入、查询完整 Goal/Ticket/Run/Step/Artifact/Review 关系并保存 evidence；无真实 connector。
- [x] C02.10 完成 persistence/domain typecheck、全量测试、安全审查和迁移回滚检查。
- [x] C02.11 创建单一 scoped C02 commit `92f0054936076e021f3992a12b462dbc9382020f`，更新进度清单和 Review。

## C02 Review

- [x] 迁移 up/down 可重复执行，外键、唯一键、scope 索引和 expected-version 更新有测试。
- [x] repository 只接受 `@nexora/contracts` 的类型，所有 SQL 参数化且无动态表名拼接。
- [x] Attempt、Receipt、Event 事实不可覆盖；幂等键冲突返回集中错误码。
- [x] C02 commit 不包含 UI、Demo、`.omo/` 或 C03+ 事件投影实现。

## C03 / Append-only Event Store and Projections

实施前计划（先写入任务事实源；本文件不混入 C03 scoped commit）：

- [x] C03.1 复核 C02 `92f0054936076e021f3992a12b462dbc9382020f`、现有 SQLite/repository/health 形态和未提交工作区边界。
- [x] C03.2 先写失败测试：events/projection_checkpoints migration、append 去重/顺序、分页 cursor、投影重建和 health projection lag。
- [x] C03.3 新增 `packages/event-store` package，导出 EventStore、cursor helpers、projection reducer 和 projection health 查询。
- [x] C03.4 扩展 core migration/schema：`events`、`projection_checkpoints` 表、索引和 rollback/validate 表清单；不提供历史事件 update/delete API。
- [x] C03.5 实现 `append(event, expectedSequence)`，在事务内校验 workspace/run scope、event_id 唯一、sequence 单调和 expected sequence。
- [x] C03.6 实现 Run/Step/Artifact/Review 投影 reducer、checkpoint 更新和 `rebuildProjection(runId)` 幂等重建。
- [x] C03.7 实现 `listEvents(runId, after, limit)`、`next_cursor`、`last_event_id`、cursor 过期错误和 consumer event_id 去重/断线补拉 helper。
- [x] C03.8 将 projection lag 接入 API health route，保留无数据库配置时的 C00 响应形态。
- [x] C03.9 写 ADR-0004 与 G2 smoke evidence，运行 event-store 单测、integration、typecheck、full test 和 Demo 5173 smoke。
- [x] C03.10 创建单一 scoped C03 commit `2e9d9b5695787b247246c65d1c465cd57a4391d3`，确保不暂存 `tasks/`、`demo/`、`.omo/` 或既有设计文档。

## C03 Review

- [x] append-only 约束经 SQL/API surface 审查：没有更新或删除历史 Event 的导出路径，且 `INSERT OR REPLACE` 被 recursive triggers 阻断。
- [x] projection rebuild 只从 events 重算，checkpoint 幂等更新；C03 未写入 Artifact/Review 事实行。
- [x] cursor 与 SSE consumer 语义覆盖断线补拉、重复 event_id 去重、过期 cursor 和 malformed cursor。
- [x] C03 commit 不包含用户已有 `tasks/`、`demo/`、`.omo/` 或设计文档未提交改动。

Review result: PASS. C03 is complete at `2e9d9b5695787b247246c65d1c465cd57a4391d3`; C04 is the next stage.

## C04 / Policy, Scope, Risk, Egress, and Redaction

实施前计划（先写入任务事实源；本文件不混入 C04 scoped commit）：

- [x] C04.1 复核 C03 `2e9d9b5695787b247246c65d1c465cd57a4391d3`、contracts/EventEnvelope/event-store 可用性和未提交工作区边界。
- [x] C04.2 先写失败测试：RBAC 角色矩阵、scope 隔离、R3 审批门、egress allow/deny、secret redaction 和 policy-boundary integration。
- [x] C04.3 创建 `packages/policy` package，导出 role/scope/risk/egress/redaction/decision primitives。
- [x] C04.4 扩展 `packages/contracts`：补充 policy 事件类型、policy decision 字段、connector scope/egress metadata 和 review 风险字段。
- [x] C04.5 实现默认拒绝的 `assertScope`、risk review decision 和 egress policy，覆盖 API/worker/connector caller type。
- [x] C04.6 实现统一 secret redaction，返回 redacted value 与审计 findings；不在错误、payload 或 preview 中泄露 sentinel。
- [x] C04.7 追加 `scope.denied`、`policy.denied`、`secret.redacted` Event helper，确保事件 payload 已脱敏。
- [x] C04.8 补充 ADR-0005 与 `artifacts/progress/c04/` RED/GREEN、验证和 G3 smoke evidence。
- [x] C04.9 运行 policy 单测、integration boundary、contracts 单测、typecheck、full test、Demo 5173 smoke 和 diff 审查。
- [x] C04.10 完成独立代码审查并创建单一 scoped C04 commit `feat: add policy scope and risk enforcement`。

## C04 Review

- [x] Scoped commit `057180340535a629415d5f55b8faebbb11d0c55d` created with policy/contracts/tests/ADR/evidence only; `tasks/`、`demo/`、`.omo/` 和既有设计文档未进入 commit。
- [x] Review blockers fixed: forged R3 approval, rejected/malformed approval object, canonical payload hash, connector scope enforcement, remote SSRF/path traversal/private/IPv6 egress, cyclic redaction。
- [x] Verification evidence saved under `artifacts/progress/c04/`; G3 smoke confirms Site A/Site B denial, forged approval denial, IPv6 egress denial, R3 connector denial, and zero external calls。

Review result: PASS. C04 is complete at `057180340535a629415d5f55b8faebbb11d0c55d`; C05 is the next stage.

## C05 / Durable Queue, Lease, Fencing, Retry, Cancel, and Budget

实施前计划（任务记录不进入 C05 implementation commit）：

- [ ] C05.1 复核 C04 `057180340535a629415d5f55b8faebbb11d0c55d`、EventStore append-only API、SQLite 事务边界和未提交工作区；记录基线。
- [ ] C05.2 先写失败测试：queue_jobs/leases migration、幂等 enqueue、30 秒 lease、heartbeat/expiry、fencing token 和 stale lease 拒绝。
- [ ] C05.3 创建 `packages/orchestration` package，导出 DurableQueue、LeaseManager、AttemptManager、RetryPolicy、BudgetGate、RecoveryManager。
- [ ] C05.4 扩展 persistence schema/migration，所有 queue/lease 写入带 workspace/run/step scope、version 和 fencing 字段。
- [ ] C05.5 实现 retry/cancel/budget：仅重试失败 Step，网络错误指数退避最多 3 次，权限/策略错误不重试，取消区分 requested/cancelled/unknown，预算阻止新 Step。
- [ ] C05.6 实现 worker loop：原子 claim、心跳、lease takeover、旧 worker late event 拒绝、事件恢复和幂等完成。
- [ ] C05.7 注入 worker crash、lease expiry、双 worker 竞争、cancel race、partial success、budget exceeded 集成测试。
- [ ] C05.8 保存 `artifacts/progress/c05/` RED/GREEN、verification、G4 recovery smoke 和 ADR-0006；完成代码审查。
- [ ] C05.9 运行 orchestration 单测、recovery integration、全量 typecheck/test、Demo 5173 smoke；创建 scoped C05 commit。

## C05 Review

- [x] 同一 Step 同时只有一个有效 fencing token；旧 token 不得改变队列终态或 worker 写回。
- [x] worker crash/lease expiry/recovery、旧 worker late write、cancel race、retry、budget 和 workspace 隔离均有真实 SQLite 测试。
- [x] G4 手工 smoke、迁移 smoke、全量 typecheck/test/integration、audit 和 Demo 服务检查均通过。
- [x] scoped commit `ac4b40d480e1e7709d85f833ef7fd570ac76ca4c` 创建；tasks、demo、.omo 和既有设计文档未进入 commit。

Review result: PASS. C05 is complete at `ac4b40d480e1e7709d85f833ef7fd570ac76ca4c`; C06 is the next stage.

## C06 / Deterministic and Local Runtime Adapters

实施前计划（任务记录不进入 C06 implementation commit）：

- [x] C06.1 复核 C05 queue/recovery smoke 与 `ac4b40d480e1e7709d85f833ef7fd570ac76ca4c`。
- [x] C06.2 先写 RuntimeAdapter、envelope codec、deterministic 和 local process 红测试。
- [x] C06.3 固化 hello/start/event/heartbeat/resume/cancel/cancel_ack/close payload schemas 与 protocol mismatch 错误码。
- [x] C06.4 实现 deterministic 五种场景、cursor resume、cancel 和 runtime/business 状态分离。
- [x] C06.5 实现 allowlisted absolute executable、固定 cwd、shell=false、逐行 stdout、stderr redaction 和 output limits。
- [x] C06.6 覆盖 process crash、deadline、stale fencing/scope、duplicate/descending sequence、unknown event 和 cancel timeout。
- [x] C06.7 完成 runtime integration contract、G5 smoke、ADR-0007 与证据日志。
- [x] C06.8 运行 adapter/contracts 单测、全量 test、integration、typecheck、Mission Control build 和 audit。
- [x] C06.9 完成独立代码审查，修复 message id、session lifecycle、scope/fencing 和 process cleanup 问题。
- [x] C06.10 创建单一 scoped C06 commit `5e3b88be35289edaa344c7491495d4f389bb05bf`，记录完整 SHA。

## C06 Review

- [x] deterministic/local adapter 通过 35 项单测；runtime contract integration 通过。
- [x] G5 观察到 pause cursor 1、resume 后有序 tool/artifact/completed timeline、cancel acknowledged，business_status 保持 pending_quality_gate。
- [x] 子进程边界包含绝对 allowlist、固定 cwd、shell=false、协议握手身份、scope/fencing、sequence/idempotency、输出和 stderr 上限。
- [x] scoped commit `5e3b88be35289edaa344c7491495d4f389bb05bf` 已创建；tasks、demo、.omo 和既有设计文档未进入 C06 commit。

Review result: PASS. C06 is complete at `5e3b88be35289edaa344c7491495d4f389bb05bf`; C07 is the next stage.

## C07 / Memory Vault, Artifact Store, and Provenance

实施前计划（任务记录不进入 C07 implementation commit）：

- [x] C07.1 复核 C06 `5e3b88be35289edaa344c7491495d4f389bb05bf`、workspace root、policy scope、Event Store 和未提交工作区边界。
- [x] C07.2 先写失败测试：vault path traversal/symlink、scope denial、memory conflict、snapshot rollback、artifact immutability/provenance 和 receipt redaction。
- [x] C07.3 创建 `packages/memory`，实现 vault layout、path resolver、scoped read/write、source refs、trust state、provenance 和 conflict candidate review 语义。
- [x] C07.4 创建 `packages/artifacts`，实现 immutable artifact content store、content hash/version metadata、preview、receipt refs 和 lineage 查询。
- [x] C07.5 扩展 persistence schema/migration：`memory_notes`、`memory_versions`、`artifact_versions`，保持可回滚且不覆盖 C02 artifact rows。
- [x] C07.6 实现 snapshots、rollback、`[unverified]` 标记和 source receipt 摘要写入；失败写入不留下半成品。
- [x] C07.7 运行 memory/artifacts 单测、provenance integration、typecheck、full tests、Demo 5173 smoke 和 G6 conflict smoke。
- [x] C07.8 完成 scoped review、ADR-0008 和 C07 commit `feat: add scoped memory vault and artifact provenance`，不暂存 `tasks/`、`demo/`、`.omo/` 或既有设计文档。

## C07 Review

- [x] Memory Vault 支持 scoped read/write、safe path resolver、source refs、trust state、snapshot/rollback 和 stale-write conflict candidate review。
- [x] Artifact Store 支持 immutable content-addressed versions、metadata preview、receipt refs 和 Run/Ticket/Agent lineage 查询。
- [x] Persistence migration `0004_memory_artifacts.sql` 已接入 schema version 4，新增版本表保持 append-only trigger，不覆盖 C02 artifact rows。
- [x] 追加 regression：重复 stale write 与后续 clean write 共用 append-only note version 序列，避免 candidate 版本碰撞。
- [x] C07 evidence 已保存到 `artifacts/progress/c07/verification.log` 与 `artifacts/progress/c07/g6-memory-conflict-smoke.log`。
- [x] Scoped commit `e82e62a97bce4590f238c8a74d7f8955d7ef8df4` 创建；`tasks/`、`demo/`、`.omo/` 和既有设计文档未进入 C07 commit。

Review result: PASS. C07 is complete at `e82e62a97bce4590f238c8a74d7f8955d7ef8df4`; C08 is the next stage.

## C08 / Connector Contracts and Review Gate

实施前计划（任务记录不进入 C08 implementation commit）：

- [x] C08.1 复核 C07 `e82e62a97bce4590f238c8a74d7f8955d7ef8df4`、Artifact version、Event receipt、policy decision 和 idempotency repository 可用性。
- [x] C08.2 先写失败测试：typed connector lifecycle、registry、idempotency reuse/conflict/unknown、R3 no-approval denial、stale payload 和 review decision reasons。
- [x] C08.3 创建 `packages/connectors`，定义 validate/preview/authorize/execute/verify/rollback lifecycle、descriptor registry 和 typed result/errors。
- [x] C08.4 实现 mock draft connector：只写内部 Artifact，不访问网络；R0/R1 可执行，R2/R3 必须先生成 pending review payload。
- [x] C08.5 实现 connector idempotency：相同 key + request hash 复用 receipt，不同 hash 返回 `IDEMPOTENCY_KEY_REUSED`，`side_effect_unknown` 冻结等待 reconcile。
- [x] C08.6 扩展 Review gate：Decision 绑定 reviewer、scope、artifact_version、review_version、payload_hash；Approve with edits 创建新版本语义；过期或 hash 变化返回 `REVIEW_STALE`。
- [x] C08.7 补充 ReviewRepository artifact/version 查询和 typed review requested/decided event schema，不放宽 base Event payload。
- [x] C08.8 运行 connectors/contracts/policy/persistence 单测、review-gate integration、typecheck、full tests、audit、Demo HTTP smoke 和 G7 stale payload smoke。
- [x] C08.9 写 ADR-0009、保存 `artifacts/progress/c08/` 证据并创建 scoped commit `feat: add connector contracts and review gates`，不暂存 `tasks/`、`demo/`、`.omo/` 或既有设计文档。

## C08 Review

- [x] Connector lifecycle、registry、review gate、idempotency 和 mock draft connector 已实现，并通过 contract/persistence/integration 覆盖。
- [x] Review gate 修复后只信任 repository 中按 `workspace_id/review_id/review_version` 读取的持久化决策，不再接受调用方注入的 review 对象。
- [x] 安全复核确认：runtime authorization 仍由模块私有 WeakMap 绑定，structuredClone/symbol-copy forgery、malformed expiry、expired review、payload hash stale 和 risk downgrade 均被阻断。
- [x] Idempotency 改为 artifact write 前预留 unknown side effect，写入成功后确认 receipt；失败路径保持冻结直到 reconcile。
- [x] 验证证据保存到 `artifacts/progress/c08/`；全量 `pnpm test --run` 通过 44 files / 247 tests，integration 通过 5 files / 8 tests，typecheck/audit/migrate/build/Demo smoke 均通过。
- [x] scoped commit `4484db4ea37ae61934f0432be86f26b8a41adfa7` 创建；`tasks/`、`demo/`、`.omo/` 和既有设计文档未进入 C08 commit。

Review result: PASS. C08 is complete at `4484db4ea37ae61934f0432be86f26b8a41adfa7`; C09 is the next stage.

## C09 / Control API Commands, Queries, and Event Streaming

实施前计划（任务记录不进入 C09 implementation commit）：

- [x] C09.1 复核 C08 `4484db4ea37ae61934f0432be86f26b8a41adfa7`、Control API 计划、API health skeleton、repositories、EventStore、DurableQueue/LeaseManager 和未提交工作区边界。
- [x] C09.2 先写失败测试：异步写命令 `202` 响应、Idempotency 冲突、workspace 404 脱敏、run pause/resume/cancel、SSE cursor/Last-Event-ID 补拉和 step 过滤。
- [x] C09.3 创建 API-local command/query/SSE services，使用 Zod 边界解析和现有 persistence/domain/event-store/orchestration 能力，不重建底层模型。
- [x] C09.4 注册 Control API routes：agents/goals/tickets/runs/artifacts/receipts/reviews/memory 查询，runs 写命令，review decision 和 memory resolve。
- [x] C09.5 最小扩展 orchestration：run-level cancel 和 paused/terminal run 不被 lease claim，保持 queue schema 不变。
- [x] C09.6 补充 ADR-0010、`artifacts/progress/c09/` RED/GREEN/verification/curl evidence。
- [ ] C09.7 运行目标 API 测试、orchestration 测试、integration、typecheck、full test、Demo 5173 smoke；完成独立代码/安全审查。
- [ ] C09.8 创建单一 scoped C09 commit `feat: expose control plane commands and event streams`，不暂存 `tasks/`、`demo/`、`.omo/` 或既有设计文档。
## C11 / Run Detail, Goal/Kanban, Review, Artifact, and Memory Workspaces

本轮执行计划（任务记录不进入 C11 implementation commit）：

- [ ] C11.1 为 Run Detail、Goal/Kanban、Review、Artifact、Memory 和交互契约先写 RED 测试。
- [ ] C11.2 实现 fixture-backed Run Detail 页面：trigger、Ticket、Agent、model/tools、budget、location、timeline、attempts、artifacts、receipts 和带副作用说明的 Pause/Stop/Retry。
- [ ] C11.3 实现 Goal/Ticket/Kanban 页面：Goal -> Milestone -> Ticket -> Run 层级、状态泳道、拖动不自动启动 Agent、键盘状态菜单替代路径。
- [ ] C11.4 实现 Review 页面：diff、source receipts、Judge、cost、risk、scope、reversibility、payload hash、stale/hash mismatch 禁止批准。
- [ ] C11.5 实现 Artifact 与 Memory 页面：固定版本 tabs、来源/回执、Memory provenance、trust、consumer、version diff、conflict 和 rollback。
- [ ] C11.6 添加 Operator/Reviewer E2E deep-link journey，确认刷新不重复命令、不伪造外部 side effect。
- [ ] C11.7 运行 mission-control tests、typecheck/build/full test/e2e、demo smoke、视觉 QA 和独立审查；创建 scoped C11 commit，排除 `tasks/`、`demo/`、`.omo/` 和既有设计文档。

## C16 / Release Hardening and Full QA（本轮）

本轮计划（任务追踪文件不进入 C16 implementation commit；不修改或重启 launchd 管理的 5173 Demo）：

- [ ] C16.1 先写 RED 测试，覆盖 Docker/Compose 文件存在且包含 API、worker、web、健康检查和 data volume；seed fixture 可重复写入 workspace/agent/goal/ticket/memory/draft workflow；fault fixture 可注入 timeout、crash、stale lease、projection failure、connector outage。
- [ ] C16.2 实现 `Dockerfile.api`、`Dockerfile.worker`、`Dockerfile.web`、`docker-compose.yml` 和 `.dockerignore`，固定 Node 22 基础镜像、pnpm frozen install、SQLite volume、API/web/worker healthcheck 与本地安全默认值。
- [ ] C16.3 实现 `tests/fixtures/seed-workspace.ts` 与 `tests/fixtures/fault-injection.ts`，提供 CLI/API 可复用的确定性 fixture；不引入外部后端依赖，不写入真实凭据或外部服务。
- [ ] C16.4 增加 `scripts/lint.mjs` 和根 `lint` 脚本，更新 `playwright.config.ts` 的可复现 webServer 与 `vitest.config.ts` 的 fixture/全量覆盖入口；创建 `.github/workflows/ci.yml` 接入 lint、typecheck、unit、integration、e2e 和 mission-control build。
- [ ] C16.5 先写并运行 RED，再实现 `tests/e2e/mobile-inbox.spec.ts`、`tests/e2e/recovery.spec.ts`、`tests/e2e/accessibility.spec.ts`，覆盖 390x844 Inbox 审批/暂停/恢复/重试/receipt、deep link 刷新不重复命令、部分成功/权限拒绝、键盘焦点/ARIA/44px touch target/减少动效 smoke。
- [ ] C16.6 创建 `docs/runbooks/development.md`、`docs/runbooks/release.md`、`docs/runbooks/e2e-journeys.md`，更新 README 的 Docker、seed、fault injection、backup/restore、security 和 QA 命令，明确 C15 本地事实边界与已知限制。
- [ ] C16.7 运行 targeted RED/GREEN、`pnpm lint`、`pnpm typecheck`、`pnpm test --run`、`pnpm test:integration`、`pnpm --filter @nexora/mission-control build`、`pnpm test:e2e`，并执行 seed/fault、Docker Compose config/build（可用时）、worker crash/DB restore/connector outage/network loss recovery drill；保持 5173 PID 不变。
- [ ] C16.8 保存完整证据到 `artifacts/progress/c16/` 与 `artifacts/qa/c16-release/`：测试日志、CI config 检查、Playwright screenshots/traces、390x844/桌面手工 QA、audit export、restore report、fault drill report 和 scope review。
- [ ] C16.9 对照 C16/G13 与 Definition of Done 完成独立代码/安全审查，确认 implementation diff 不含 `tasks/`、`demo/`、`.omo/`、设计文档或 assets，记录 Node 25 engine warning 和任意 pre-existing 限制。
- [ ] C16.10 创建单一 scoped implementation commit `chore: harden release and complete agent os qa`，完整记录 SHA；提交后更新 `tasks/agent-os-progress.md`、`tasks/todo.md`、`tasks/lessons.md` 的收口/Handoff，但不将追踪文件加入该 commit。

## C12 / SEO Draft Workflow with Independent Judge

本轮执行计划（任务记录不进入 C12 implementation commit）：

- [ ] C12.1 复核 C11 `0c2e5c1`、deterministic adapter、Memory/Artifact provenance、Review gate、UI routes 和未提交工作区边界。
- [ ] C12.2 先写 RED 测试：`seo_draft_v1` schema、GSC fixture receipt、draft writer、independent Judge、handoff expiry、3 次失败停止、UI workflow journey。
- [ ] C12.3 创建 `packages/workflows`，定义 workflow definition、engine、SEO template、handoff contract 和导出边界。
- [ ] C12.4 扩展 `packages/connectors`：只读 GSC fixture、Markdown draft writer、independent Judge；禁止真实 CMS、indexing、网络发布。
- [ ] C12.5 扩展 deterministic adapter 的 workflow stations，使 SEO 流程产出 draft、source receipt、JudgeResult，并停在 `waiting_review`。
- [ ] C12.6 扩展 Mission Control Workflow 页面和 Workflow Run 页面，展示站点列表、质量门、来源、Judge、Review pending 与 no-publish 边界。
- [ ] C12.7 运行 workflow integration、SEO Playwright journey、mission-control tests/build、typecheck/full tests、Demo 5173 smoke、G9 manual smoke、视觉 QA 和独立审查。
- [ ] C12.8 写 `docs/runbooks/seo-draft-workflow.md`、保存 `artifacts/progress/c12/` 证据并创建 scoped C12 commit，排除 `tasks/`、`demo/`、`.omo/` 和既有设计文档。

## C13 / Remote Adapter, Minimal Snapshot, and Egress Receipt

本轮执行计划（任务记录不进入 C13 implementation commit）：

- [x] C13.1 复核 C12 `b3dd32e03371eaf5f609fd4e942c0f2fe5f84d1b`、runtime/policy/memory contracts、C13 文件边界和未提交工作区；确认 5173 Demo 由 launchd 托管。
- [x] C13.2 先写 RED 测试：最小 snapshot 脱敏/secret scan、remote envelope 必填字段、短期 token、egress receipt、local/remote Attempt 切换和恢复故障。
- [x] C13.3 实现 `apps/remote-worker` server、snapshot builder 和 remote adapter；默认 local-only，禁止完整 vault、secret 和聊天上下文进入远程请求。
- [x] C13.4 扩展 runtime envelope/protocol、policy egress、memory provenance 和 contracts runtime，记录位置/provider/region/classification/redaction/snapshot hash。
- [x] C13.5 实现断线、crash、旧 token、scope/provider denial、snapshot 泄露扫描和 cursor/lease resume；远程不可用不得隐式 fallback。
- [x] C13.6 运行 remote integration/recovery tests、typecheck、全量 tests、Demo 5173 smoke，并保存 G10 evidence。
- [x] C13.7 完成代码/安全审查，写 `docs/adr/0012-remote-worker-and-data-egress.md` 与 `docs/runbooks/remote-worker-recovery.md`。
- [x] C13.8 创建单一 scoped C13 commit `240e7f1deea5ce0cfe8ae8973faf66922658aa84`（`feat: add remote runtime adapter and egress receipts`），排除 `tasks/`、`demo/`、`.omo/` 和既有设计文档。

### C13 Review

- [x] Remote opt-in, minimal snapshot, redaction/scan, canonical hash, egress receipt, token expiry, fencing, no-fallback recovery, and explicit Attempt switch are implemented.
- [x] Verification log and G10 recovery smoke are saved under `artifacts/progress/c13/`.
- [x] Targeted tests 6/6, full tests 345/345, integration 25/25, typecheck/build/audit/demo smoke passed.
- [x] Scoped commit `240e7f1deea5ce0cfe8ae8973faf66922658aa84` is the final C13 action; task files, demo, `.omo/`, and existing design-document changes remain excluded.
- [!] Full C13 exit is blocked: API remote queue jobs have no worker dispatcher to `RemoteRuntimeAdapter`.
- [!] Full C13 exit is blocked: egress receipts are not durably persisted or queryable from the control plane.
- [!] Full C13 exit is blocked: no API-to-worker remote journey or durable receipt regression test exists.

## C13 Hardening / Remote Dispatcher and Durable Egress Receipt

恢复计划（任务记录不进入 implementation commit）：

- [x] C13H.1 按交接文件顺序恢复上下文，并执行分支、HEAD、launchd 5173、listener、HTTP 只读检查。
- [x] C13H.2 写 RED/回归测试，证明 API-created `payload.kind = "remote"` 队列 job 必须被 worker dispatcher 执行到 `RemoteRuntimeAdapter`，且 egress receipt 必须落到可查询持久层。
- [x] C13H.3 实现最小 worker dispatcher：解析 queue payload、保持 local/remote 显式选择，remote 不 fallback local，runtime failures 映射为 queue/run 可恢复状态。
- [x] C13H.4 实现 durable egress receipt persistence/query：保存 location/provider/region/classification/redaction/snapshot hash/policy decision，并通过现有 receipt 查询 surface 可见。
- [x] C13H.5 运行目标 C13/API-worker journey、integration、typecheck、全量测试、Mission Control build、audit 和 5173 smoke；记录 Node 25 engine warning。
- [x] C13H.6 创建 scoped hardening implementation commit `fad5c6cf45f9d36d3c2570078aa0bd0343c74c1e`（`feat: harden remote dispatcher and egress receipts`），排除 `tasks/`、`demo/`、`.omo/`、设计文档和 assets 改动。

### C13 Hardening Review

- [x] `createRuntimeDispatcher` now bridges API-created remote queue payloads to `RemoteRuntimeAdapter` through the existing `WorkerHandler` seam without changing lease/fencing mechanics.
- [x] `egress_receipts` is a first-class durable table/repository/query surface and is visible via `/v1/egress-receipts/:id` plus the existing `/v1/receipts` list response.
- [x] Remote transport failure now has explicit regression coverage: `CONNECTOR_UNAVAILABLE` is recoverable and does not call the local adapter or emit fallback semantics.
- [x] Verification evidence updated in `artifacts/progress/c13/verification.log`: focused hardening, affected suite, typecheck, integration, full test, Mission Control build, audit, launchd status and 5173 HTTP smoke.
- [>] `apps/worker/src/main.ts` remains an idle/config stub because no deployment-safe remote URL/provider/region/resolved-IP/signing-key environment contract exists yet; no production remote secret/config was guessed in C13 hardening.
- [x] Scoped hardening implementation commit `fad5c6cf45f9d36d3c2570078aa0bd0343c74c1e` created; task tracking files remain unstaged and outside the implementation commit.

Review result: PASS after hardening. C13 is complete and C14 is the next active stage.

## C14 / Durable Schedules and Occurrences

本轮执行计划（任务记录不进入 C14 implementation commit）：

- [x] C14.1 复核 C13 hardening `fad5c6cf45f9d36d3c2570078aa0bd0343c74c1e`、Schedule 设计契约、现有 contracts/persistence/orchestration/API/worker 形态和未提交工作区边界。
- [x] C14.2 先写 RED 测试：Schedule/ScheduleOccurrence schema、UTC next/last fire、workspace timezone、revision、misfire、max catch-up、overlap、dedupe 和 restart recovery。
- [x] C14.3 扩展 `packages/contracts/src/schedules.ts` 与 persistence schema/migration，定义 durable schedules、occurrences、唯一 dedupe key 和 API-safe payload。
- [x] C14.4 实现 scheduler core：manual/interval/cron 触发、UTC `next_fire_at`/`last_fire_at`、expression revision、disabled schedule 和 persisted recovery。
- [x] C14.5 实现 misfire/overlap 策略：`run_once_after_recovery`、max catch-up、`skip_if_active`、`queue_after_active`、`cancel_previous`，并保证被拒绝触发也写 `schedule.fired`。
- [x] C14.6 接入 API route 与 worker scheduler loop，保持真实 scheduler 可禁用回滚，且不触碰 launchd 5173 Demo 服务。
- [x] C14.7 覆盖 G11：双 scheduler 实例不重复创建同一 occurrence/run，重启后由 DB 状态重建，DST ambiguous/skipped 时间有 occurrence 证据。
- [x] C14.8 写 `docs/runbooks/scheduler-operations.md`、保存 `artifacts/progress/c14/` RED/GREEN/verification 证据，运行 scheduler tests、integration、typecheck、Demo smoke 和审查。
- [x] C14.9 创建单一 scoped C14 commit `0fe5eb3004404946f1c9a7251ac657830eb25acc`（`feat: add durable schedules and occurrences`），排除 `tasks/`、`demo/`、`.omo/`、设计文档和 assets 改动；追踪文件单独保留。

### C14 Review

- [x] 每次 trigger 均生成 `schedule.fired` 事件，即使未创建 Run。
- [x] Schedule restart、misfire、overlap、disable、dedupe、scope/policy denial 和 DST edge 均有自动化覆盖。
- [x] 多 scheduler 竞争依赖持久化 occurrence dedupe key，而不是内存锁或进程局部状态。
- [x] Hardening: 拒绝无效 cron expression，避免 API 接受后 scheduler 被异常卡住。
- [x] Hardening: worker 成功完成 scheduled queue job 后更新 Run/Step/Attempt 终态，避免 `skip_if_active` 永久跳过。
- [x] Hardening: `end_at` 必须限制 fire 窗口，到期后 `next_fire_at` 置空。
- [x] Hardening: 只允许 `schedule.fired` event 使用 `run_id: null`；其它 event type 仍需非空 run scope。
- [x] Hardening: ScheduleOccurrence status 与 `run_id` 组合必须在 contract 层表达为合法状态。
- [x] Hardening: scheduler duplicate branch 不得在 occurrence 去重失败后留下 Run graph 副作用。
- [x] C14 implementation commit 不包含任务追踪、Demo、`.omo/`、设计文档或 assets 改动。

Review result: PASS after hardening. C14 is complete at `0fe5eb3004404946f1c9a7251ac657830eb25acc`; C15 is the next planned stage but has not been started.
## C15 / Observability, Recovery, Quarantine, and Audit Export

本轮执行计划（任务记录不进入 C15 implementation commit）：

- [x] C15.1 复核 C14 commit `0fe5eb3004404946f1c9a7251ac657830eb25acc`、C15 计划边界、现有 health/event-store/review/connector/persistence 形态和未提交工作区边界。
- [x] C15.2 先写 RED 测试：observability metrics/health、audit export integrity/tamper detection、backup/restore smoke、connector quarantine Owner-only release。
- [x] C15.3 创建 `@nexora/observability`：metrics、health summary、audit export/hash、backup manifest、cost/receipt summary。
- [x] C15.4 实现 backup/restore scripts：SQLite WAL checkpoint、DB snapshot、vault snapshot、artifact hash manifest、restore 后 migration/audit verification。
- [x] C15.5 实现 quarantine contract/service：connector 隔离、policy gate、Owner-only 带原因解除。
- [x] C15.6 接入 API health observable fields，复用现有 receipt 事实回答 actor/runtime/provider/model/location/memory/tools/result/side effects。
- [x] C15.7 写 runbooks：backup-restore、security-incident、connector-quarantine。
- [x] C15.8 运行 C15 targeted tests、integration、typecheck、full test、Mission Control build、demo smoke 和 audit scans。
- [x] C15.9 创建单一 scoped C15 commit `ca8f256544d789afcf37c4070e09f674df92a111`（`chore: add observability recovery and security operations`），排除 `tasks/`、`demo/`、`.omo/`、设计文档和 assets 改动；追踪文件单独保留。

### C15 Review

- [x] Health 和指标可下钻到 SQLite 事实，不伪造未实现 backend。
- [x] Backup manifest 不包含 secret 内容，并可恢复 DB/vault/artifact。
- [x] Audit integrity export 可检测 tamper；security runbook 指定检测后进入 quarantine。
- [x] Quarantined connector 不显示为可用；解除需要 Owner 和原因。
- [x] C15 implementation commit 不包含任务追踪、Demo、`.omo/`、设计文档或 assets 改动。

Review result: PASS. C15 is complete at `ca8f256544d789afcf37c4070e09f674df92a111`; C16 closeout is recorded below.

## C16 Review

- [x] C16 targeted RED/GREEN and full verification completed.
- [x] Independent visual gate finding fixed: Inbox tabs now filter and expose keyboard/ARIA state; fresh current-named desktop/mobile captures regenerated.
- [x] Docker Compose syntax validated; Docker daemon unavailable locally and explicitly recorded as a CI-only runtime check.
- [x] 5173 launchd service remained PID 96501 and was not restarted.
- [x] Code-review hardening: stable Inbox Hooks, URL tab restore/refresh, contract-valid and readable seed graph, stable refs/content hashes, symlink containment, `.env` Docker exclusions, CI Compose runtime smoke, and Inbox keyboard E2E.
- [x] C16 implementation commit SHA: `bcda211cb7c0954f7cace82aceac5fe89f74a25a`.

### C16 Review

- [x] Final serial verification: lint 280 files, typecheck, Vitest 83 files/386 tests, integration 13 files/36 tests, Mission Control build, Playwright 6/6, compose config, targeted C16 6/6, Inbox 4/4, and seed CLI smoke.
- [x] Independent code re-audit and both visual gates approved fresh evidence; file-symlink containment regression is covered; no CRITICAL/HIGH findings remain.
- [x] Remaining limitations recorded: Docker daemon unavailable locally so Compose image/runtime smoke is CI-only; worker healthcheck is PID liveness-only; current visual captures contain no CJK glyphs; QA PNGs remain untracked local evidence; C16 fixtures do not perform real external side effects.

Review result: PASS. C16 implementation is complete at `bcda211cb7c0954f7cace82aceac5fe89f74a25a`; tracking files remain outside the implementation commit.

## Release Candidate Closeout

- [x] 复核 `tasks/agent-os-progress.md` 的 Q01-Q14，确认其与 C16 证据和当前实现一致。
- [x] 重新运行 `pnpm lint`、`pnpm typecheck`、`pnpm test --run --reporter=dot`、`pnpm test:integration`、`pnpm --filter @nexora/mission-control build`、`pnpm test:e2e`、`docker compose config`，全部通过。
- [x] 更新总状态为 `released_candidate`，保留 Docker daemon 本机不可用、worker healthcheck liveness-only、QA PNG 未跟踪等已知限制。

Review result: PASS. Release candidate closeout is complete and the project is now tracked as `released_candidate`.
