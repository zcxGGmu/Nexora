# Nexora Agent OS Development Progress

> 这是 Nexora Agent OS 的唯一开发进度清单。实施细节以 [Agent OS Implementation Plan](/Users/zq/Desktop/ai-projs/posp/Nexora/docs/superpowers/plans/2026-08-23-agent-os-implementation.md) 为准；C10-C16 的产品/UI 决策以 [中文 Nexora Agent OS Frontend UI Design](/Users/zq/Desktop/ai-projs/posp/Nexora/docs/nexora-agent-os-ui-design.zh-CN.md)、[中文 DESIGN](/Users/zq/Desktop/ai-projs/posp/Nexora/DESIGN.zh-CN.md) 和 [中文 UI/布局图册](/Users/zq/Desktop/ai-projs/posp/Nexora/docs/nexora-agent-os-ui-diagrams.zh-CN.md) 为准；英文文档是术语和来源对照；本文件只记录执行状态、验证证据、阻塞原因和 commit 结果。

新会话交接入口：[docs/current-session-handoff.zh-CN.md](/Users/zq/Desktop/ai-projs/posp/Nexora/docs/current-session-handoff.zh-CN.md)。

## 1. 当前状态

| 字段 | 当前值 |
|---|---|
| 项目 | Nexora Agent OS |
| 进度状态 | `c20_commit_pending` |
| 当前阶段 | `C20` Goal Mode / Loop / Judge 已完成实现、自动化验证、视觉 QA 和独立审查；正在创建 scoped commit。 |
| 当前工作 | C20 只剩 scoped staging、`git diff --cached --check`、commit 和 SHA 回写；C21 尚未开始，真实外部连接继续禁止。 |
| 当前分支 | `codex/agent-os-implementation` |
| 计划版本 | `2026-08-23-agent-os-implementation` |
| 前端设计版本 | `nexora-agent-os-ui-design.zh-CN` + `DESIGN.zh-CN.md` + `nexora-agent-os-ui-diagrams.zh-CN.md`；C10-C16 的必读契约 |
| 最后更新 | 2026-09-01 |
| 已完成 commit | C19 `174c288f6365eeab879d08e6cad9f04c28029a78`（gateway channels sessions control plane）；C17/C18 `58b80300e4fce98bfeeac75998d2f5d503df3961`（runtime registry and provider catalog）；C16 `bcda211cb7c0954f7cace82aceac5fe89f74a25a`（release hardening/full QA）；`ca8f256544d789afcf37c4070e09f674df92a111`（C15 observability/recovery/security operations）；`0fe5eb3004404946f1c9a7251ac657830eb25acc`（C14 durable schedules）；`fad5c6cf45f9d36d3c2570078aa0bd0343c74c1e`（C13 hardening）；C13 base 为 `240e7f1deea5ce0cfe8ae8973faf66922658aa84`、C12 为 `b3dd32e03371eaf5f609fd4e942c0f2fe5f84d1b` |
| 事实源 | SQLite：运行域和事件；Markdown vault：Memory、SOP、receipt 摘要和 Artifact 文件 |
| 首版范围 | 本地 Web Mission Control、deterministic adapter、本地 subprocess adapter、SEO draft workflow；不自动发布 |

## 2. 使用规则

### 2.1 状态标记

- `[ ]` 未开始或未满足完成条件。
- `[~]` 进行中；必须在“当前工作”中写明正在处理的子项。
- `[x]` 已完成；必须同时存在实现证据、自动化验证、人工 QA 和 commit SHA。
- `[!]` 被阻塞；必须填写阻塞原因、影响范围、已尝试动作和下一步，不允许用 `[!]` 代替调查。
- `[>]` 明确延期到后续阶段；必须写出原因和不会影响的验收范围。

### 2.2 更新规则

1. 同一时间只允许一个 `Cxx` 阶段处于 `[~]`；未完成前不得开始下一个阶段。
2. 每个子项完成后立即勾选，并在阶段的 Evidence Log 追加命令、时间、结果和文件路径。
3. 任何代码编辑前，先确认对应阶段的“准备检查”完成；任何 commit 前，先完成自动化测试、人工 QA 和代码审查。
4. `[x]` 的最低条件是：
   - 计划中列出的文件和契约已实现；
   - 阶段自动化验证命令退出码为 0；
   - 对应 Manual QA Gate 已实际观察并保存证据；
   - 安全影响、迁移/回滚和已知限制已记录；
   - commit message 与计划一致，并记录完整 commit SHA。
5. 测试失败时先记录根因和影响，再修复；禁止删除/削弱测试、放宽权限或把失败路径改成成功状态。
6. 若需要改变目录、schema、依赖顺序、风险边界或首版非目标，先更新实施计划和 ADR，再继续执行，并在本文件的变更记录中说明。
7. 所有高风险外部动作只允许在 deterministic/mock connector 中验证；真实发布、付款、外联、删除和生产变更继续保持禁用。
8. 每次恢复工作先阅读本文件“当前状态”和最近的 Evidence Log，再运行 `git status --short --branch`、`git log -5 --oneline` 和阶段 smoke test。

### 2.3 C10-C16 前端设计前置条件

1. 开始 C10-C16 的任何子项前，先阅读 `docs/nexora-agent-os-ui-design.zh-CN.md`、`DESIGN.zh-CN.md` 和 `docs/nexora-agent-os-ui-diagrams.zh-CN.md` 的相关章节；英文文档用于术语/来源对照，实现不得把其中的未实现能力伪装为可用。
2. C10 必须先完成 `/design-system` primitive showcase，并在 375px、768px、1024px、1440px 验证长内容、错误、脱敏、离线与键盘状态，再组合产品页面。
3. C11-C16 复用已验证原语；新增 token、状态、交互、响应式规则、无障碍约束或接受的设计债务，必须先更新 `DESIGN.md`，再写页面代码和测试。
4. 与 UI 规格存在冲突时，优先保持 scope、R0-R3、Review、Artifact 版本和 receipt 的控制面约束；在实施计划、ADR 和本文件的变更记录中记录经批准的偏离。

### 2.4 每阶段收口模板

每个阶段必须填完以下字段，才可以把阶段标题从 `[~]` 改为 `[x]`：

```text
Owner:
Started at:
Completed at:
Commit:
Automated verification:
Manual QA Gate:
Security impact:
Migration/rollback:
Evidence paths:
Known limitations:
```

## 3. 总览矩阵

## 2.5 Hermes Agent OS 对齐切片（Demo）

本切片只验证产品表面与状态语义，不声称已连接 Hermes Gateway 或真实外部渠道。YouTube 页面无法直接读取，视频仅以 noembed 身份信息确认；具体能力依据 Agent OS 公开页面与 Hermes 官方文档。

| 状态 | 交付主题 | 公开能力映射 | 验收 |
|---|---|---|---|
| `[x]` | H1 进度与来源边界 | One Screen / Local + Private | 任务清单与来源说明已更新 |
| `[x]` | H2 Runtime Control Room 数据 | Gateway、Channels、Sessions、Provider、Backend、MCP | Demo 可导航并显示健康/风险/队列状态 |
| `[x]` | H3 Learning + Automation | Memory、Skills、Cron、Goal Mode | 可查看 staged review、quarantine、occurrence 并执行夹具动作 |
| `[x]` | H4 真实页面验证 | AionUI WebUI/Workspace 形态 + Nexora 状态矩阵 | build、HTTP、桌面/390px 浏览器证据已保存 |
| `[x]` | H5 审查收口 | 控制面边界与移动安全约束 | 代码审查问题、skip-link 和 Registry IA 已修复 |

### Hermes 对齐 Evidence Log

| 日期 | 命令/动作 | 结果 | 证据路径 | 记录人 |
|---|---|---|---|---|
| 2026-08-24 | 公开资料复核与来源边界 | 已确认：Gateway、Memory、Skills、Cron、Tools/MCP、Messaging、Security 能力；YouTube 原始页面不可直接验证 | `.omo/evidence/` 与本文件上方说明 | root |
| 2026-08-25 | H1-H4 Demo 对齐实现与真实页面 QA | PASS；Gateway/Channels/Sessions/Skills/Learning/Models/Backends/Registry/Tools & MCP/Schedules 已实现；1440px 与 390px 页面和交互已验证 | `.omo/evidence/hermes-alignment/manual-qa.md`、`desktop-schedules-1440x900-fresh.jpg`、`mobile-gateway-390x844.jpg` | root |
| 2026-08-25 | 独立代码审查第一轮 | WATCH；已修复停止按钮、occurrence 状态、页面标题焦点和导航拦截问题，等待新鲜审查结论 | `.omo/evidence/hermes-alignment-code-review.md` | hermes_code_review_current |
| 2026-08-25 | 门禁复审与视觉契约修复 | 初轮 REVISE：桌面 skip-link 残片、移动 More 缺 Registry、截图扩展名错误、移动触控尺寸和 shell 尺寸偏离；已修复代码与 IA，截图已按 JPEG 类型重命名 | `.omo/evidence/hermes-alignment-gate-review.md`、`.omo/evidence/hermes-alignment-clone-fidelity.md`、`.omo/evidence/hermes-alignment/desktop-schedules-1440x900-fresh.jpg` | root |
| 2026-08-25 | Fresh gate review | APPROVE；Registry、skip-link、44px 移动控件、桌面 shell、CJK wrapping、Stop/Occurrence 动作均复核通过 | `.omo/evidence/hermes-alignment-gate-review.md` | hermes_final_gate |

| 状态 | Commit | 交付主题 | 依赖 | QA Gate | 证据目录 | 回滚边界 |
|---|---|---|---|---|---|---|
| `[x]` | C00 | workspace、配置、health | 无 | G0 | `artifacts/progress/c00/` | 删除新底座文件，保留设计文档 |
| `[x]` | C01 | contracts、错误码、envelope | C00 | G1 | `artifacts/progress/c01/` | 回退 contracts 包，不改数据库 |
| `[x]` | C02 | SQLite schema、迁移、repositories | C01 | G1 | `artifacts/progress/c02/` | 回滚 `0001_core.sql` 和 domain 包 |
| `[x]` | C03 | Event Store、投影、cursor | C02 | G2 | `artifacts/progress/c03/` | 保留原始 DB，移除投影实现 |
| `[x]` | C04 | RBAC、scope、risk、egress、redaction | C02 | G3 | `artifacts/progress/c04/` | 回退 policy 包，禁止继续运行高风险 connector |
| `[x]` | C05 | queue、lease、fencing、recovery | C03+C04 | G4 | `artifacts/progress/c05/` | 停 worker，保留 queue/events 以便恢复 |
| `[x]` | C06 | deterministic/local runtime adapter | C05 | G5 | `artifacts/progress/c06/` | 禁用 adapter registry，保留协议 contracts |
| `[x]` | C07 | Memory vault、Artifact、provenance | C02+C03+C04 | G6 | `artifacts/progress/c07/` | 保留 vault snapshot，停止写入而不删除内容 |
| `[x]` | C08 | connector contract、Review、idempotency | C03+C04+C07 | G7 | `artifacts/progress/c08/` | quarantine connector，保留 review/audit facts |
| `[x]` | C09 | Control API、commands、queries、SSE | C05+C06+C07+C08 | G8 | `artifacts/progress/c09/` | 关闭 API routes，不修改事实表 |
| `[x]` | C10 | Mission Control shell、scope、状态矩阵 | C09 | G8 | `artifacts/progress/c10/` | 回退 UI routes/components，保留 API |
| `[x]` | C11 | Run/Goal/Review/Artifact/Memory UI | C10 | G8 | `artifacts/progress/c11/` | 回退页面，保留 API 和事件 |
| `[x]` | C12 | SEO draft workflow、Judge、handoff | C06+C07+C08+C11 | G9 | `artifacts/progress/c12/` | 禁用 workflow registration，不删除草稿 |
| `[x]` | C13 | remote adapter、snapshot、egress receipt | C04+C05+C06+C07 | G10 | `artifacts/progress/c13/` | base commit `240e7f1` + hardening commit `fad5c6c`; remote dispatcher and durable egress receipt verified |
| `[x]` | C14 | schedules、occurrences、misfire、overlap | C03+C05+C12 | G11 | `artifacts/progress/c14/` | commit `0fe5eb3004404946f1c9a7251ac657830eb25acc`; 禁用 scheduler loop，保留 occurrence/audit rows |
| `[x]` | C15 | observability、backup、quarantine、audit export | C08+C09+C13+C14 | G12 | `artifacts/progress/c15/` | 关闭增强运维组件，不影响核心事件事实 |
| `[x]` | C16 | Docker、CI、全量 QA、release handoff | C00-C15 | G13 | `artifacts/progress/c16/` | 不发布 release 镜像，保留 QA 报告；Docker runtime build 待 CI |

> C10-C16 共同前置条件：对应阶段开始前已按本文件 2.3 阅读并应用中文 UI 规格、中文 DESIGN 和中文图册；任何偏离均有 ADR、计划变更和验证证据。

## 4. 阶段详细清单

### C00 / Bootstrap Workspace and Health

**阶段状态：** `[x]` 已完成
**目标：** 新环境可安装、启动 API/worker/web，并通过 `/v1/health` 观察底座状态。
**依赖：** 无
**计划提交：** `chore: bootstrap Nexora control plane`

- [x] C00.1 创建 `codex/agent-os-implementation` 分支；确认 `main` 工作树干净或记录已有用户改动。
- [x] C00.2 创建 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.editorconfig`、`.gitignore`、`.env.example`、`.nvmrc`。
- [x] C00.3 创建 `apps/api`、`apps/worker`、`apps/mission-control` 的 package manifest 和启动入口。
- [x] C00.4 在 `packages/config/src/env.ts` 用 Zod 校验 `NEXORA_DATA_DIR`、host、port、log level、auth mode，并验证错误输出不含 secret。
- [x] C00.5 在 `apps/api/src/routes/health.ts` 注册 `/v1/health`，返回 API/version/DB/queue 检查状态。
- [x] C00.6 为 health route 和 env parser 写测试，验证 HTTP 200、缺失配置非零退出、响应不泄露 secret。
- [x] C00.7 更新 README 的安装、启动、测试、目录和架构说明；写 ADR-0001。
- [x] C00.8 首次生成 lockfile 时运行 `pnpm install`；lockfile 提交后运行 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test --run`。
- [x] C00.9 启动 API/worker/web，执行 `curl http://127.0.0.1:4310/v1/health`，保存 JSON 和启动日志到 `artifacts/progress/c00/`。
- [x] C00.10 完成 G0：浏览器打开空壳首页，health 端点可访问，worker 可停止且不会产生任务。
- [x] C00.11 运行代码审查清单：无任意 shell、无硬编码密钥、无跨包循环依赖。
- [x] C00.12 创建 C00 commit，记录完整 SHA；填写阶段收口模板并将 C00 改为 `[x]`。

**自动化命令：** `pnpm install && pnpm install --frozen-lockfile && pnpm typecheck && pnpm test --run`
**人工 QA：** G0
**证据目录：** `artifacts/progress/c00/`

**Evidence Log：**

| 日期 | 命令/动作 | 结果 | 证据路径 | 记录人 |
|---|---|---|---|---|
| 2026-08-23 | 计划建立 | 未开始 | `tasks/agent-os-progress.md` | root |
| 2026-08-25 | C00 RED/GREEN、安装、类型/测试、API/worker/web G0 验证 | PASS；浏览器 React runtime 回归已修复，PNG 截图已验证 | `artifacts/progress/c00/` | c00_implementer |
| 2026-08-25 | C00 scoped commit 与收口审查 | PASS；仅 C00 源码、配置、README、ADR、lockfile 和证据进入 `4efdb06`；未暂存 `tasks/`、`demo/`、`.omo/` 或既有文档 | `artifacts/progress/c00/review.md`、`git show --stat 4efdb06` | root |

**阻塞记录：** 当前无阻塞。

**阶段收口：**

```text
Owner: root
Started at: 2026-08-25
Completed at: 2026-08-25 17:39 CST
Commit: 4efdb06 (4efdb06358e1ee433039201e2d63858bd64a471f)
Automated verification: pnpm install --frozen-lockfile; pnpm typecheck; pnpm test --run (2 files, 4 tests); pnpm test:integration (no tests, passWithNoTests); pnpm --filter @nexora/mission-control build
Manual QA Gate: G0 PASS; API health JSON, worker idle/SIGINT, Mission Control DOM/console and fresh PNG evidence in artifacts/progress/c00/
Security impact: loopback-first defaults; field-only environment errors; no secrets in health/log evidence; no privileged routes or connectors
Migration/rollback: no database migration; remove C00 files from 4efdb06 while retaining existing Demo/docs work
Evidence paths: artifacts/progress/c00/verification.log; health.json; api-startup.log; worker-startup.log; config-redaction.log; mission-control-recovery.md; mission-control-shell-fresh.png; review.md
Known limitations: host Node 25.9.0 emitted an engine warning instead of using required Node 22; Playwright journeys and automated worker signal tests are deferred to later planned stages
```

### C01 / Versioned Contracts and Error Semantics

**阶段状态：** `[x]` 已完成
**目标：** 所有跨包对象、错误码、事件和 RuntimeEnvelope 有稳定 schema version。
**依赖：** C00
**计划提交：** `feat: add versioned domain contracts and error semantics`

- [x] C01.1 确认 C00 commit 已存在且 `pnpm typecheck`、`pnpm test --run` 为绿色。
- [x] C01.2 创建 `packages/contracts/src/ids.ts` 和 `clock.ts`，统一 ULID、Clock、时间序列化。
- [x] C01.3 创建 Agent、Goal、Ticket、Run、Artifact、Review、Runtime、Connector schemas；所有持久化对象包含 workspace、schema version、timestamps。
- [x] C01.4 实现错误码集合和统一错误响应：`code`、`message`、`retryable`、`required_action`、`trace_id`、`details`。
- [x] C01.5 实现 EventEnvelope：event/trace/run/attempt/step IDs、actor、scope、payload、redactions、sequence。
- [x] C01.6 写合法 payload、非法字段、缺失 workspace、旧 protocol version、错误脱敏测试。
- [x] C01.7 更新 README 的 schema version 和 async command 语义；写 ADR-0002。
- [x] C01.8 运行 contracts 测试、全局 typecheck、全量测试并保存 RED/GREEN 证据。
- [x] C01.9 保存 schema test 输出到 `artifacts/progress/c01/`，完成 G1 validation-only probe 的合法 payload、未知字段和旧版本检查。
- [x] C01.10 代码审查确认后续模块只能从 `@nexora/contracts` 导入，不能复制状态字符串；已修复安全审查发现。
- [x] C01.11 创建 C01 scoped commit，记录完整 SHA 并更新总览矩阵。

**自动化命令：** `pnpm --filter @nexora/contracts test --run && pnpm typecheck`
**人工 QA：** G1
**证据目录：** `artifacts/progress/c01/`

**阻塞记录：** 当前无阻塞。

**阶段执行记录：**

```text
Owner: root / c01_contracts_implementer
Started at: 2026-08-25 23:46 CST
Baseline: C00 4efdb06358e1ee433039201e2d63858bd64a471f; pnpm typecheck PASS; pnpm test --run PASS (2 files, 4 tests)
Scope: packages/contracts, README schema/error documentation, ADR-0002, artifacts/progress/c01
Commit: afff377f44ecea047951d5120347ad62db941fc2
Completed at: 2026-08-26 00:43 CST
Automated verification: `pnpm install --frozen-lockfile`; contracts 4 files/72 tests; `pnpm typecheck`; full suite 6 files/76 tests; `pnpm audit --prod --audit-level=high`; `git diff --check` all passed. Host Node 25.9.0 emitted the expected Node 22 engine warning.
Manual QA Gate: G1 PASS for validation-only probe; complete Goal fixture returned 200, unknown field and old schema returned 400 with redacted `SCHEMA_INVALID`; no persistence or creation route claimed. Demo `5173` remained HTTP 200.
Security impact: strict nested schemas, bounded error strings/details, calendar-valid UTC timestamps, canonical ULIDs, finite budget/timeout bounds, constrained references and connector versions; no auth/persistence/connector execution introduced.
Migration/rollback: no database migration; remove the contracts package/README/ADR/evidence from this commit to roll back, leaving C00 and existing Demo/docs untouched.
Evidence paths: `artifacts/progress/c01/tdd-red.log`; `artifacts/progress/c01/g1-schema-probe.log`; `artifacts/progress/c01/verification.log`; `artifacts/progress/c01/review.md`; `.omo/evidence/c01-amended-verification-88396f0.md`.
Known limitations: G1 is validation-only and real Agent/Goal/Ticket creation/persistence is deferred to C09; dynamic connector map remains shape-constrained but lifecycle/authorization/redaction enforcement is later-stage work; Node 22 native verification unavailable on current Node 25.9.0 host.
```

### C02 / SQLite Schema and Domain Repositories

**阶段状态：** `[x]` 已完成
**目标：** SQLite 成为领域状态事实源，迁移、唯一约束和状态机可重建。
**依赖：** C01
**计划提交：** `feat: add sqlite domain schema and repositories`

- [x] C02.1 确认 contracts schema 已冻结并通过 C01 收口。
- [x] C02.2 创建 `packages/persistence/src/db.ts`、`schema.ts` 和 `migrations/0001_core.sql`。
- [x] C02.3 创建 workspace、agent、goal、ticket、run、attempt、step、artifact、receipt、review、idempotency 表及索引/唯一约束。
- [x] C02.4 创建各 domain repository；写入经过事务、`expected_version`、runtime Zod 校验和 workspace scope。
- [x] C02.5 创建 `packages/domain/src/run-state.ts`，覆盖 queued/running/paused/waiting_review/partial/failed/succeeded/cancelled 合法转移。
- [x] C02.6 写 migrate up/down、唯一键、乐观并发、Attempt/Receipt 不覆盖和非法状态转移测试。
- [x] C02.7 更新配置中的 DB path/migration mode；写 ADR-0003。
- [x] C02.8 运行 `pnpm db:migrate`、persistence/domain 测试和 `pnpm typecheck`。
- [x] C02.9 从 SQLite 查询完整 Goal/Ticket/Run/Step/Artifact/Review 关系，保存验证结果到 `artifacts/progress/c02/`。
- [x] C02.10 完成 G1 SQLite migration smoke，确认没有真实 connector。
- [x] C02.11 审查迁移回滚、SQL 参数化、事务范围、幂等并发和默认数据库约束。
- [x] C02.12 创建 C02 commit，记录完整 SHA。

**自动化命令：** `pnpm db:migrate && pnpm --filter @nexora/persistence test --run && pnpm --filter @nexora/domain test --run && pnpm typecheck`
**人工 QA：** G1
**证据目录：** `artifacts/progress/c02/`

**阻塞记录：** 当前无阻塞。

**阶段执行记录：**

```text
Owner: root
Started at: 2026-08-26 00:45 CST
Scope: packages/persistence, packages/domain, config DB settings, root db:migrate script, README, ADR-0003, artifacts/progress/c02
Commit: 92f0054936076e021f3992a12b462dbc9382020f
Completed at: 2026-08-26 01:47 CST
Automated verification: frozen install, contracts 72 tests, persistence 6 tests, domain 17 tests, full suite 10 files/100 tests, typecheck, audit and diff check all passed. Host Node 25.9.0 emitted the expected Node 22 engine warning.
Manual QA Gate: G1 SQLite smoke passed; file-backed migration, validate-only mode, WAL and foreign_keys observed.
Security impact: parameterized SQL, foreign keys, explicit NOT NULL identifiers, runtime Zod validation, optimistic versions and transactional idempotency; no API auth/connector/egress behavior introduced.
Migration/rollback: C02 migration 0001 is reversible via tested rollback helper; rollback drops only C02 core tables, leaving C00 and Demo untouched.
Evidence paths: `artifacts/progress/c02/tdd-red.log`; `artifacts/progress/c02/verification.log`; `artifacts/progress/c02/g1-sqlite-smoke.log`; `artifacts/progress/c02/review.md`; `.omo/evidence/C02-code-review.md`.
Known limitations: Node 22.13+ is required for built-in `node:sqlite`; host remains Node 25.9.0 with engine warning. Exhaustive state/repository integration coverage, Event Store/projections, policy enforcement, queue recovery, API creation and backup/restore remain later stages.
```

### C03 / Append-only Event Store and Projections

**阶段状态：** `[x]` 已完成
**目标：** 事件不可变、可分页、可去重、可投影重建，SSE 断线可续传。
**依赖：** C02
**计划提交：** `feat: add append-only event store and projections`

- [x] C03.1 确认 C02 migration 和 domain state machine 均为绿色。
- [x] C03.2 增加 `events`、`projection_checkpoints` 表；禁止历史 Event update/delete API。
- [x] C03.3 实现 `append(event, expectedSequence)`，校验 event_id、sequence、workspace scope 和事务原子性。
- [x] C03.4 实现 Run/Step/Artifact/Review 投影 reducer 和 `rebuildProjection(runId)`。
- [x] C03.5 实现 `listEvents(runId, after, limit)`、next cursor、last event ID 和 cursor expired 错误。
- [x] C03.6 实现 SSE consumer 的 event_id 去重和断线补拉。
- [x] C03.7 写重复事件、乱序、投影失败、重建、已有 Artifact 不重复创建测试。
- [x] C03.8 将 projection lag 纳入 health route。
- [x] C03.9 运行 event-store 单测、integration test 和 typecheck，保存 `artifacts/progress/c03/`。
- [x] C03.10 完成 G2：断开 SSE、恢复连接、验证事件顺序和 last_event_id。
- [x] C03.11 审查 append-only 约束、游标过期处理和投影重建幂等性；写 ADR-0004。
- [x] C03.12 创建 C03 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/event-store test --run && pnpm test:integration && pnpm typecheck`
**人工 QA：** G2
**证据目录：** `artifacts/progress/c03/`

**阻塞记录：** 当前无阻塞。

**阶段执行记录：**

```text
Owner: root
Started at: 2026-08-26 09:04 CST
Scope: packages/event-store, persistence migration/schema, contracts event/error exports, API health projection lag, ADR-0004, artifacts/progress/c03
Commit: 2e9d9b5695787b247246c65d1c465cd57a4391d3
Completed at: 2026-08-26 09:34 CST
Automated verification: frozen install, contracts 72 tests, event-store 8 tests, persistence 6 tests, API health 3 tests, full suite 13 files/110 tests, integration placeholder, typecheck, db:migrate, git diff --check all passed. Host Node 25.9.0 emitted the expected Node 22 engine warning.
Manual QA Gate: G2 PASS; paged event read returned first two events, reconnect cursor returned the third event in order, duplicate replay was deduped, four projection checkpoints rebuilt, and projection lag was 0.
Security impact: events table is append-only with update/delete triggers and recursive triggers enabled to block INSERT OR REPLACE bypass; strict cursor parsing rejects malformed suffixes; event append validates run scope and sequence inside a transaction; health route reports live projection lag when supplied.
Migration/rollback: 0002_event_store.sql adds only events/projection_checkpoints and indexes/triggers; ordered migrator applies 0001 then 0002 and tested rollback drops C03 tables with core tables.
Evidence paths: `artifacts/progress/c03/verification.log`; `artifacts/progress/c03/g2-event-reconnect-smoke.log`; `docs/adr/0004-event-store-and-projections.md`.
Known limitations: C03 provides event ledger, cursor helpers, projection checkpoints and health lag only; durable queue, policy, actual SSE HTTP route, richer read projections, worker recovery and API command creation remain later stages.
```

### C04 / Policy, Scope, Risk, Egress, and Redaction

**阶段状态：** `[x]` 已完成
**目标：** API、worker、connector 三层共同执行角色、scope、风险和数据出境策略。
**依赖：** C02；可并行使用 C03 已定义的事件类型，但必须在 C03 收口后合并。
**计划提交：** `feat: add policy scope and risk enforcement`

- [x] C04.1 确认 C02/C03 的 contracts、EventEnvelope 和 repository 已可用。
- [x] C04.2 创建 Owner/Operator/Reviewer/Viewer/Agent 角色和 R0-R3 风险决策矩阵。
- [x] C04.3 实现 `assertScope`，在 API handler、worker command handler、connector executor 三处调用。
- [x] C04.4 实现 local/remote、provider、region、data classification 的 egress allow/deny policy。
- [x] C04.5 实现统一 secret redaction，覆盖日志、错误、Event payload、Artifact preview 和截图数据。
- [x] C04.6 将 `scope.denied`、`policy.denied`、`secret.redacted` 写入事件账本。
- [x] C04.7 写越权、R3 无审批、prompt injection 不改变策略、SSRF/path traversal、secret sentinel 测试。
- [x] C04.8 运行 policy 单测、`tests/integration/policy-boundary.test.ts` 和 typecheck。
- [x] C04.9 完成 G3：Site A Agent 请求 Site B Memory，尝试 R3 connector，确认无外部调用。
- [x] C04.10 审查策略默认拒绝、错误信息不泄密、remote 最小快照规则；写 ADR-0005。
- [x] C04.11 创建 C04 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/policy test --run && pnpm test:integration && pnpm typecheck`
**人工 QA：** G3
**证据目录：** `artifacts/progress/c04/`

**阻塞记录：** 当前无阻塞。

**阶段收口：**

```text
Owner: Codex
Started at: 2026-08-26
Completed at: 2026-08-26
Commit: 057180340535a629415d5f55b8faebbb11d0c55d
Automated verification: pnpm install --frozen-lockfile; pnpm --filter @nexora/policy test --run; pnpm --filter @nexora/contracts test --run; pnpm --filter @nexora/persistence test --run; pnpm test --run; pnpm test:integration; pnpm typecheck; NEXORA_DATA_DIR=$(mktemp -d) pnpm db:migrate; git diff --staged --check
Manual QA Gate: G3 smoke in artifacts/progress/c04/g3-policy-boundary-smoke.log confirms Site A scope denial, forged approval denial, IPv6 egress denial, R3 connector denial, and zero external calls.
Security impact: Adds default-deny RBAC/scope/risk/egress/redaction policy primitives, canonical payload hash validation, R3 Owner/Reviewer approval constraints, remote no-IPv6/no-private-host egress checks, and secret redaction audit paths.
Migration/rollback: No DB migration; rollback by reverting policy package, contract policy schema changes, ADR-0005, integration test, and C04 evidence.
Evidence paths: artifacts/progress/c04/, docs/adr/0005-policy-and-data-boundary.md
Known limitations: DNS resolution is represented as caller-supplied resolved IP evidence until connector executor/network layer exists; C04 does not wire policy into real API/worker routes because those surfaces arrive in C05+.
```

## C04 Review

- [x] Scope, risk, egress and redaction logic implemented as pure policy package and shared contract schemas.
- [x] R3 approval cannot be forged by Agent/rejected/malformed reviewer input and must use canonical `sha256:<64 hex>` payload hash.
- [x] Remote egress rejects non-HTTPS schemes, private/link-local hosts, IPv6 literals, IPv4-mapped IPv6, unresolved hosts and invalid resolved IP evidence before external calls.
- [x] C04 commit excludes `tasks/`, `demo/`, `.omo/` and existing design-doc work.

### C05 / Durable Queue, Lease, Fencing, and Recovery

**阶段状态：** `[x]` 已完成
**目标：** worker 可安全领取、续租、接管和恢复 Step，且旧 worker 不能写入新状态。
**依赖：** C03、C04
**计划提交：** `feat: add durable orchestration queue and recovery`

- [x] C05.1 确认事件、policy、domain repositories 已收口，记录基线 SHA。
- [x] C05.2 增加 `queue_jobs`、`leases` 表和 durable enqueue transaction。
- [x] C05.3 实现 30 秒 lease、heartbeat、renew、expiry 和 recovery candidate。
- [x] C05.4 实现 fencing token；队列终态写入与 worker Event/Artifact/Receipt 回调均先验证 token 与当前 lease 匹配。
- [x] C05.5 实现 Attempt 创建、retry failed step only、指数退避、权限错误不重试。
- [x] C05.6 实现 cancel 状态传播和 `cancel_requested`/`cancel_unknown`。
- [x] C05.7 实现 token/cost/duration budget gate，超预算阻止新 Step。
- [x] C05.8 注入 worker crash、lease expiry、旧 worker late event、cancel race、partial success（队列分支保留失败事实）和 budget exceeded 测试。
- [x] C05.9 启动两个 worker，验证同一 Step 只有一个有效 fencing token，保存日志到 `artifacts/progress/c05/`。
- [x] C05.10 完成 G4：模拟 worker crash、等待 lease 过期、重启，确认 Run 从最后已提交队列事实恢复。
- [x] C05.11 审查队列事务隔离、workspace lease scope、lease 时钟、幂等 key 和旧 token 的拒绝路径；写 ADR-0006。
- [x] C05.12 创建 C05 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/orchestration test --run && pnpm test:integration && pnpm typecheck`
**人工 QA：** G4
**证据目录：** `artifacts/progress/c05/`

**阻塞记录：** 当前无阻塞。

**阶段收口：**

```text
Owner: Codex
Started at: 2026-08-26
Completed at: 2026-08-26
Commit: ac4b40d480e1e7709d85f833ef7fd570ac76ca4c
Automated verification: pnpm install --frozen-lockfile; pnpm typecheck; pnpm test --run (23 files/170 tests); pnpm test:integration (2 files/4 tests); pnpm audit --prod --audit-level=high; migration smoke [1,2,3]
Manual QA Gate: G4 PASS; shared SQLite smoke observed worker A token 1 expiry, worker B token 2 completion, old token late write rejected, final queue status completed
Security impact: workspace-scoped claims/recovery; atomic compare-and-set queue/lease transitions; fencing-protected terminal/reschedule writes; no arbitrary shell/network/connector execution; cancellation unknown is explicit
Migration/rollback: migration 0003 adds queue_jobs/leases; rollback helper drops only C05 tables before C04 event/policy facts; stop workers before rollback
Evidence paths: artifacts/progress/c05/, docs/adr/0006-durable-queue-and-fencing.md
Known limitations: C05 exposes orchestration primitives and worker loop but does not yet compose the Control API, runtime adapters, or real Event/Artifact/Receipt repositories; those are C06-C09 surfaces
```

### C06 / Deterministic and Local Runtime Adapters

**阶段状态：** `[x]` 已完成
**目标：** 标准 RuntimeEnvelope 能连接 deterministic fixture 和受限 local subprocess。
**依赖：** C05
**计划提交：** `feat: add deterministic and local runtime adapters`

- [x] C06.1 确认 queue/recovery smoke 通过，记录 C05 SHA `ac4b40d480e1e7709d85f833ef7fd570ac76ca4c`。
- [x] C06.2 实现 RuntimeAdapter interface：capabilities/start/send/cancel/health/collect。
- [x] C06.3 为 hello/start/event/heartbeat/resume/cancel/cancel_ack/close 定义 protocol version、message_id、sequence、cursor、deadline、lease/fencing 字段。
- [x] C06.4 实现 deterministic adapter fixture：success、judge fail、timeout、partial、review-needed 五种脚本。
- [x] C06.5 实现 local subprocess adapter：allowlist executable、固定 cwd、逐行 JSON stdout、脱敏 stderr、无任意 shell。
- [x] C06.6 实现 resume、protocol mismatch、process crash、cancel timeout 和 unknown cancel。
- [x] C06.7 写 adapter contract、旧 fencing token、secret scan、fixture E2E 测试。
- [x] C06.8 运行 adapter 测试、runtime integration 和 typecheck。
- [x] C06.9 完成 G5：启动 fixture Run，执行 pause/resume/cancel，检查 timeline 和 receipt。
- [x] C06.10 审查进程边界、命令 allowlist、输出大小/超时和日志 redaction；写 ADR-0007。
- [x] C06.11 创建 C06 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/runtime-adapters test --run && pnpm test:integration && pnpm typecheck`
**人工 QA：** G5
**证据目录：** `artifacts/progress/c06/`

**阻塞记录：** 当前无阻塞。

**阶段收口：**

```text
Owner: Codex
Started at: 2026-08-26
Completed at: 2026-08-26
Commit: 5e3b88be35289edaa344c7491495d4f389bb05bf
Automated verification: pnpm install --frozen-lockfile; pnpm typecheck; pnpm test --run (29 files/209 tests); pnpm test:integration (3 files/5 tests); pnpm --filter @nexora/runtime-adapters test --run (4 files/35 tests); pnpm audit --prod --audit-level=high; Mission Control build
Manual QA Gate: G5 PASS; deterministic fixture paused at cursor 1, resumed through tool/artifact/completed, cancel acknowledged, business_status remained pending_quality_gate
Security impact: absolute executable allowlist, fixed cwd, shell=false, strict JSON envelopes, scope/fencing checks, sequence/idempotency checks, bounded output, stderr redaction; no network or connector execution
Migration/rollback: no database migration; remove runtime-adapters package, runtime payload schemas, ADR/evidence and PROTOCOL_MISMATCH contract additions
Evidence paths: artifacts/progress/c06/, docs/adr/0007-runtime-adapter-protocol.md
Known limitations: local-only adapters; pause is represented by stopping collection and resume cursor; Control API/runtime-to-domain event wiring remains C09
```

### C07 / Memory Vault, Artifact Store, and Provenance

**阶段状态：** `[x]` 已完成
**目标：** Memory 有 scope/version/provenance，Artifact 不可变且能反查 Run/Ticket/Receipt。
**依赖：** C02、C03、C04
**计划提交：** `feat: add scoped memory vault and artifact provenance`

- [x] C07.1 确认 workspace root、policy scope 和 Event Store 已收口。
- [x] C07.2 创建 vault 目录：About、Sites、Agents、Skills、Tickets、Reports、Artifacts、Runs。
- [x] C07.3 实现 vault path resolver，拒绝 `..`、绝对路径、符号链接逃逸和跨 workspace 读取。
- [x] C07.4 实现 `read(scope, path)`，返回 content、note version、source refs、trust state。
- [x] C07.5 实现 `write(path, baseVersion, content)`，冲突生成候选版本并进入 Review。
- [x] C07.6 实现 snapshots、rollback、provenance、source receipt 和 `[unverified]` 标记。
- [x] C07.7 实现 immutable Artifact Store：content hash、version、metadata、preview 和 receipt refs。
- [x] C07.8 写 scope denial、path traversal、memory conflict、rollback、Artifact provenance 测试。
- [x] C07.9 运行 memory/artifact 单测、provenance integration 和 typecheck。
- [x] C07.10 完成 G6：两个 Run 修改同一 Memory note，观察冲突 Review 和版本 diff。
- [x] C07.11 审查 vault 备份、敏感字段、内容 hash、文件权限和失败写入恢复；写 ADR-0008。
- [x] C07.12 创建 C07 commit，记录完整 SHA。

Owner: Codex
Started at: 2026-08-27
Completed at: 2026-08-27
Commit: `e82e62a97bce4590f238c8a74d7f8955d7ef8df4`
Automated verification: `pnpm --filter @nexora/memory test --run`、`pnpm --filter @nexora/artifacts test --run`、`pnpm --filter @nexora/contracts test --run`、`pnpm --filter @nexora/persistence test --run`、`pnpm test --run`、`pnpm test:integration`、`pnpm typecheck`、`NEXORA_DATA_DIR=$(mktemp -d) pnpm db:migrate`、`pnpm audit --prod --audit-level=high`、`pnpm --filter @nexora/mission-control build` all passed.
Manual QA Gate: G6 conflict smoke saved at `artifacts/progress/c07/g6-memory-conflict-smoke.log`; demo `curl -fsS -I http://127.0.0.1:5173/` returned HTTP 200.
Security impact: Vault paths reject traversal, absolute paths and symlink escapes; memory/artifact facts keep source refs, trust state, content hash and scoped RBAC actions.
Migration/rollback: Migration version 4 adds `memory_notes`、`memory_versions`、`memory_snapshots`、`artifact_versions`; rollback drops C07 tables before earlier core tables.
Evidence paths: `artifacts/progress/c07/verification.log`、`artifacts/progress/c07/g6-memory-conflict-smoke.log`、`docs/adr/0008-memory-and-artifact-boundaries.md`.
Known limitations: Host Node is still `v25.9.0` while project engines require `>=22.13.0 <23.0.0`, so pnpm emits the known engine warning; C07 provides local persistence primitives, not connector execution or Control API wiring.

**自动化命令：** `pnpm --filter @nexora/memory test --run && pnpm --filter @nexora/artifacts test --run && pnpm test:integration && pnpm typecheck`
**人工 QA：** G6
**证据目录：** `artifacts/progress/c07/`

**阻塞记录：** 当前无阻塞。

### C08 / Connector Contracts and Review Gate

**阶段状态：** `[x]` 已完成
**目标：** 所有工具通过 typed Connector 生命周期，R2/R3 动作可预览、精确审批、幂等执行和验证。
**依赖：** C03、C04、C07
**计划提交：** `feat: add connector contracts and review gates`

- [ ] C08.1 确认 Artifact version、Event receipt、policy decision 和 idempotency repository 可用。
- [ ] C08.2 定义 Connector descriptor、validate/preview/authorize/execute/verify/rollback 接口。
- [ ] C08.3 实现 mock draft connector，只写内部 Artifact，不访问网络。
- [ ] C08.4 实现 `idempotency_key + request_hash` 复用、冲突 409、unknown side effect reconcile。
- [ ] C08.5 实现 Review Decision，绑定 reviewer、scope、artifact_version、review_version、payload_hash。
- [ ] C08.6 实现 Approve、Reject、Request changes、Approve with edits 的事件和版本语义。
- [ ] C08.7 写无审批 R3、重复 approve、stale payload、unknown side effect、拒绝原因测试。
- [ ] C08.8 运行 connectors/review integration、security tests 和 typecheck。
- [ ] C08.9 完成 G7：修改已审批 payload 一个字符，确认 Approve disabled 和 `REVIEW_STALE`。
- [ ] C08.10 审查 connector 无任意 HTTP/shell、verify 不把 request sent 当成功、rollback 能力显式声明；写 ADR-0009。
- [ ] C08.11 创建 C08 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/connectors test --run && pnpm test:integration && pnpm typecheck`
**人工 QA：** G7
**证据目录：** `artifacts/progress/c08/`

**阻塞记录：** 当前无阻塞。
### C09 / Control API and Event Streaming

**阶段状态：** `[x]` 已完成
**目标：** 不依赖 UI 即可创建对象、启动 deterministic Run、查询状态、订阅事件和提交 Review。
**依赖：** C05、C06、C07、C08
**计划提交：** `feat: expose control plane commands and event streams`

- [ ] C09.1 确认 API composition 所需 repository、policy、orchestrator、adapter、connector 均已导出稳定接口。
- [ ] C09.2 实现 Agent/Goal/Ticket 写命令；校验 Authorization、Idempotency-Key、traceparent、schema_version、If-Match。
- [ ] C09.3 实现 Run create/pause/resume/retry/cancel，异步返回 202、command_id、run_id、attempt_id、status_url、events_url。
- [ ] C09.4 实现 Agents/Goals/Tickets/Runs/Artifacts/Receipts/Reviews/Memory/Health 查询，按 workspace 脱敏且不泄露跨 workspace 存在性。
- [ ] C09.5 实现 Review decision 和 Memory resolve API，处理 409 stale/conflict。
- [ ] C09.6 实现 SSE cursor、Last-Event-ID、分页、按 Step 过滤和补拉后 live stream。
- [ ] C09.7 写 route tests 和 API integration：202、409、scope denial、SSE reconnect、cancel/retry、Review stale。
- [ ] C09.8 运行 `pnpm test:integration`、API tests、typecheck 和 API smoke。
- [ ] C09.9 完成 G8：使用 curl 完成 Agent -> Goal -> Ticket -> Run -> Event -> Review 的完整链路。
- [ ] C09.10 审查异步命令不能用 HTTP 200 伪装完成、错误响应不泄密、写命令具备幂等和审计事件；写 ADR-0010。
- [ ] C09.11 创建 C09 commit，记录完整 SHA。

**自动化命令：** `pnpm test:integration && pnpm typecheck`
**人工 QA：** G8
**证据目录：** `artifacts/progress/c09/`

**阻塞记录：** 当前无阻塞。

### C10 / Mission Control Shell and Shared UI State

**阶段状态：** `[x]` 已完成
**目标：** Mission Control 首屏、全局 scope、路由深链和统一 Loading/Offline/Error 状态可用。
**依赖：** C09
**计划提交：** `feat: add mission control shell and state matrix`

- [ ] C10.0 阅读中文 UI 规格、中文 `DESIGN` 和中文 UI/布局图册，记录本阶段采用的路由、原语、状态、布局尺寸和任何 ADR 偏离；先建立 `/design-system` showcase 验收范围。
- [ ] C10.1 确认 C09 API health、查询和 SSE 在浏览器跨域/本地模式下可访问。
- [ ] C10.2 创建 React/Vite router、TanStack Query client、SSE client 和 scope context。
- [ ] C10.3 实现 Mission Control、Inbox、Goals、Tickets、Runs、Review、Artifacts、Memory、Settings 路由。
- [ ] C10.4 落地设计 tokens：背景、surface、border、text、success/info/warning/danger、focus、spacing、radius、44px touch target。
- [ ] C10.5 实现 Needs Attention、Active Runs、Goals、Recent Artifacts、Health/Review rail 首屏布局。
- [ ] C10.6 实现 Loading、Empty、Offline、Error、Permission denied、Partial success 状态组件。
- [ ] C10.7 实现 URL 恢复 scope/filter/tab/cursor、scope 切换清空旧列表、SSE event_id 去重。
- [ ] C10.8 写 UI 单测：深链、scope、SSE 去重、状态组件、键盘和 hit target。
- [ ] C10.9 运行 UI tests、全局 typecheck 和 web build，保存输出到 `artifacts/progress/c10/`。
- [ ] C10.10 完成 G8：浏览器首屏 5 秒内定位失败/审批/Active Run 和下一步动作。
- [ ] C10.11 审查无空白页、无无限 Spinner、状态不只靠颜色、focus ring 和移动响应式；写 ADR-0011。
- [ ] C10.12 创建 C10 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/mission-control test --run && pnpm --filter @nexora/mission-control build && pnpm typecheck`
**人工 QA：** G8
**证据目录：** `artifacts/progress/c10/`

**阻塞记录：** 当前无阻塞。

### C11 / Run, Goal, Review, Artifact, and Memory Workspaces

**阶段状态：** `[x]` 已完成
**目标：** Operator 和 Reviewer 可以通过 UI 观察、恢复、审查和交接一个 Run。
**依赖：** C10
**计划提交：** `feat: add run goal review artifact and memory workspaces`

- [ ] C11.1 确认 C10 路由、tokens、状态矩阵和 API query hooks 已稳定。
- [ ] C11.2 实现 Run Detail：trigger、Ticket、Agent、model、tools、budget、location、timeline、attempts、artifacts、receipts、recovery actions。
- [ ] C11.3 实现 Goal -> Milestone -> Ticket -> Run 层级和 Kanban 状态；拖拽不隐式执行 Agent，提供键盘状态菜单。
- [ ] C11.4 实现 Review Evidence、Payload Diff、Decision Sheet 和二次确认。
- [ ] C11.5 实现 Artifact `Preview/Diff/Source/Receipt` tabs 和 Memory provenance/conflict/rollback UI。
- [ ] C11.6 实现 Pause/Resume/Stop/Retry failed step 的 optimistic version 和错误恢复动作。
- [ ] C11.7 写 Operator/Reviewer Playwright journey：创建 Goal/Ticket、运行、查看 Artifact、Review、Request changes/Approve。
- [ ] C11.8 运行 UI tests、Playwright、键盘/ARIA smoke，保存 screenshots/traces 到 `artifacts/progress/c11/`。
- [ ] C11.9 完成 G8：刷新、后退、深链、SSE 重连不重复命令或通知。
- [ ] C11.10 审查 reviewer/operator 权限、Review stale 禁用、部分成功显示和错误原因；记录 UI review 结论。
- [ ] C11.11 创建 C11 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/mission-control test --run && pnpm test:e2e -- operator-reviewer.spec.ts && pnpm typecheck`
**人工 QA：** G8
**证据目录：** `artifacts/progress/c11/`

**阻塞记录：** 当前无阻塞。

### C12 / SEO Draft Workflow with Independent Judge

**阶段状态：** `[x]` 已完成
**目标：** 从 GSC fixture 到 SEO draft、source receipt、JudgeResult 和 pending Review，且不自动发布。
**依赖：** C06、C07、C08、C11
**计划提交：** `feat: add auditable seo draft workflow`

- [ ] C12.1 确认 deterministic adapter、Memory/Artifact provenance、Review gate 和 UI journey 均为绿色。
- [ ] C12.2 定义 `seo_draft_v1` workflow schema：trigger、site scope、inputs、steps、quality gates、budget、retry、unknown side effect policy。
- [ ] C12.3 实现 GSC read-only fixture，附带抓取时间、source file 和 receipt。
- [ ] C12.4 实现 draft writer，写 Markdown Artifact；不调用真实 CMS、indexing 或外部发布 API。
- [ ] C12.5 实现 independent Judge：source present、数字可追溯、无虚构指标、canonical/link 检查。
- [ ] C12.6 实现结构化 handoff：from/to agent、ticket、scope、artifact refs、memory refs、constraints、expiry。
- [ ] C12.7 实现 judge fail -> fix、source missing、3 次失败停止和 Review pending 测试。
- [ ] C12.8 运行 workflow integration、Playwright SEO journey 和 typecheck。
- [ ] C12.9 完成 G9：从 UI 创建 SEO Goal/Ticket，自动生成 draft、Receipt、JudgeResult，Run 停在 `waiting_review`。
- [ ] C12.10 审查首版没有自动 publish/index、每条结论可追溯、handoff 过期会 blocked；写 `docs/runbooks/seo-draft-workflow.md`。
- [ ] C12.11 创建 C12 commit，记录完整 SHA。

**自动化命令：** `pnpm vitest run tests/integration/seo-draft-workflow.test.ts && pnpm test:e2e -- seo-draft-review.spec.ts && pnpm typecheck`
**人工 QA：** G9
**证据目录：** `artifacts/progress/c12/`

**阻塞记录：** 当前无阻塞。

### C13 / Remote Adapter and Egress Receipt

**阶段状态：** `[x]` 已完成
**目标：** local/remote 是明确选择，remote 只接收最小脱敏 snapshot，并记录出境证据。
**依赖：** C04、C05、C06、C07
**计划提交：** `feat: add remote runtime adapter and egress receipts`

- [x] C13.1 确认 remote 仍是显式 opt-in，默认 local-only。
- [x] C13.2 创建 remote worker server、snapshot builder 和 adapter；不挂载完整 vault，不携带 secret。
- [x] C13.3 复用 hello/start/event/heartbeat/resume/cancel/close，强制短期 token、protocol version、cursor、deadline、fencing token。
- [x] C13.4 写 egress receipt：location/provider/region/data classification/redaction count/policy decision/snapshot hash。
- [x] C13.5 切换 local/remote 时创建新 Attempt，保留旧 Attempt 和失败证据。
- [x] C13.6 注入网络断开、remote crash、旧 token、scope denial、provider denial、snapshot secret scan。
- [x] C13.7 运行 remote integration、recovery tests 和 typecheck。
- [x] C13.8 完成 G10：断网时显示 paused/queued，不得静默 fallback；恢复后从 cursor/lease 恢复。
- [x] C13.9 审查最小数据原则、token 生命周期、region/data classification 记录和 remote worker 日志。
- [x] C13.10 创建 ADR-0012、runbook，并创建 C13 commit，记录完整 SHA。

**自动化命令：** `pnpm vitest run tests/integration/remote-egress.test.ts tests/integration/remote-recovery.test.ts && pnpm typecheck`
**人工 QA：** G10
**证据目录：** `artifacts/progress/c13/`

**阻塞记录：** 当前无阻塞。

## C13 Review

- [x] Remote execution is explicit opt-in; API run/attempt/queue metadata preserve `local` or `remote` placement and retries keep the same location.
- [x] Remote snapshot is strict, bounded, canonical-hashed, redacted, and scanned; vault/chat history/secret refs do not cross the boundary.
- [x] Runtime protocol validates envelope scope/fencing and short-lived token claims; transport failures map to `CONNECTOR_UNAVAILABLE` with no local fallback.
- [x] Egress receipt preserves location/provider/region/classification/redaction count/policy decision/snapshot hash; unsafe remote URL/IP evidence is denied.
- [x] Explicit location switch creates a new queued Attempt linked with `previous_attempt_id`; failed local evidence remains unchanged.
- [x] Verification evidence saved under `artifacts/progress/c13/verification.log`; G10 recovery smoke recorded.
- [x] Targeted C13 tests: 2 files / 6 tests; full suite: 73 files / 345 tests; integration: 9 files / 25 tests; typecheck, Mission Control build, audit, and demo HTTP smoke passed.
- [x] Scoped C13 commit `240e7f1deea5ce0cfe8ae8973faf66922658aa84` is created; task files and existing demo/design documents remain excluded.
- [!] Independent review found no worker dispatcher from API `payload.kind = "remote"` to `RemoteRuntimeAdapter`, so an API-created remote queue job has no execution path.
- [!] Egress receipt creation is schema/in-memory only; no durable egress receipt table/repository/query path is wired.
- [!] Current tests do not prove the API-to-worker remote journey or durable receipt persistence; direct adapter/server fixture coverage is insufficient for the full C13 exit criterion.

**Review result：** FAIL for full C13 exit criteria. The protocol fixture is green, but C13 remains in hardening until the three blockers above are fixed and re-verified.

### Handoff 2026-08-28 / C13 Remote Worker and Egress

- 当前状态：`[~]` C13 protocol fixture、自动化验证、G10 recovery smoke、ADR/runbook 和 scoped commit 已完成；独立复核发现三项硬化缺口，暂不进入 C14。
- 本次完成：新增 remote worker Fastify message boundary、短期 capability token fixture、最小脱敏 snapshot/canonical hash/secret scan、RemoteRuntimeAdapter、egress receipt/policy hardening、Attempt location lineage，以及 API queue placement propagation。
- 验证结果：目标 remote tests 2 files/6 tests、全量 tests 73 files/345 tests、integration 9 files/25 tests、`pnpm typecheck`、Mission Control build、`pnpm audit --prod --audit-level=high`、5173 demo smoke 全部通过；Node 25 engine warning 已记录。
- 已知限制：`token_secret` 是 in-process deterministic fixture；生产 remote worker 应替换为 origin-held asymmetric signing/mTLS，并由部署配置提供 lease-bound token expiry。
- 最近 commit SHA：`240e7f1deea5ce0cfe8ae8973faf66922658aa84`（`feat: add remote runtime adapter and egress receipts`）。
- 复核结论：该 commit 不是完整 C13 交付；需补 API-to-worker remote dispatcher、durable egress receipt persistence/query 和对应端到端测试。
- 证据路径：`artifacts/progress/c13/verification.log`、`artifacts/progress/c13/red.log`、`docs/adr/0012-remote-worker-and-data-egress.md`、`docs/runbooks/remote-worker-recovery.md`。

### C13 Hardening Review 2026-08-29

- [x] API-created remote queue jobs now have an explicit worker dispatcher path: `payload.kind = "remote"` is parsed by `createRuntimeDispatcher`, converted into a minimal remote snapshot, and executed through `RemoteRuntimeAdapter` using the existing `WorkerHandler` seam.
- [x] Egress receipt durability is implemented through migration `0005_egress_receipts.sql`, `EgressReceiptRepository`, `QueryService.listEgressReceipts/getEgressReceipt`, `/v1/egress-receipts/:id`, and the existing `/v1/receipts` list surface.
- [x] No-fallback hardening is covered by a dispatcher-level transport failure regression: remote `CONNECTOR_UNAVAILABLE` is rescheduled/recoverable, preserves remote queue metadata, persists the egress receipt, and does not invoke the local adapter.
- [x] Fresh validation evidence is appended to `artifacts/progress/c13/verification.log`: focused hardening 2 files/3 tests, affected suite 10 files/22 tests, integration 10 files/27 tests, full test 75 files/348 tests, typecheck, Mission Control build, audit, launchd state and 5173 HTTP smoke.
- [>] `apps/worker/src/main.ts` remains an idle/config stub because the config package has no safe remote URL/provider/region/resolved-IP/signing-key contract; C13 hardening does not guess production remote secrets or deployment settings.
- [x] Scoped hardening implementation commit `fad5c6cf45f9d36d3c2570078aa0bd0343c74c1e` created as `feat: harden remote dispatcher and egress receipts`; `tasks/`, `demo/`, `.omo/`, design docs and assets remained excluded from the implementation commit.

**Review result：** PASS after hardening. C13 exit criteria are now satisfied; C14 is the next active stage.

### C14 / Durable Schedules and Occurrences

**阶段状态：** `[x]` 已完成
**目标：** Schedule 重启、misfire、时区、overlap 和 dedupe 行为由持久化状态重建。
**依赖：** C03、C05、C12
**计划提交：** `feat: add durable schedules and occurrences`

- [x] C14.1 创建 Schedule/ScheduleOccurrence contracts、表和 API route；UTC 存储、workspace timezone 展示。
- [x] C14.2 实现 cron/interval/manual scheduler、`next_fire_at`、`last_fire_at`、expression revision。
- [x] C14.3 实现 `run_once_after_recovery`、`skip_if_active`、`queue_after_active`、`cancel_previous`。
- [x] C14.4 实现 occurrence dedupe key 和多 scheduler 竞争创建。
- [x] C14.5 记录 `schedule.fired`，即使触发被权限、预算或 overlap policy 拒绝。
- [x] C14.6 写重启、misfire、DST ambiguous/skipped、overlap、disable、重复 enqueue 测试。
- [x] C14.7 运行 scheduler unit/integration、typecheck 和 API smoke。
- [x] C14.8 完成 G11：重启 scheduler，观察 occurrence rows、schedule events 和唯一 Run。
- [x] C14.9 审查时区数据库、DST 策略、scheduler lease 和 schedule scope；写 `docs/runbooks/scheduler-operations.md`。
- [x] C14.10 创建 C14 commit，记录完整 SHA：`0fe5eb3004404946f1c9a7251ac657830eb25acc`。

**自动化命令：** `pnpm vitest run packages/contracts/src/envelope.test.ts packages/contracts/src/schemas.test.ts packages/contracts/src/schedules.test.ts apps/worker/src/worker-loop.test.ts packages/orchestration/src/scheduler.test.ts tests/integration/recovery.test.ts tests/integration/schedule-recovery.test.ts --reporter=verbose`、`pnpm vitest run packages/persistence/src/schedules.test.ts packages/persistence/src/schema.test.ts packages/persistence/src/orchestration-schema.test.ts --reporter=verbose`、`pnpm typecheck`、`pnpm test:integration`、`pnpm --filter @nexora/mission-control build`、`pnpm test --run`
**人工 QA：** G11 completed via scheduler recovery integration plus launchd-managed 5173 HTTP smoke (`HTTP/1.1 200 OK`, PID 96501)
**证据目录：** `artifacts/progress/c14/`

**阻塞记录：** 当前无阻塞。

### C15 / Observability, Backup, Quarantine, and Audit Export

**阶段状态：** `[x]` 已完成
**目标：** 运行、成本、健康、备份、审计完整性和 connector quarantine 可观察、可恢复。
**依赖：** C08、C09、C13、C14
**计划提交：** `chore: add observability recovery and security operations`

- [x] C15.1 在本地事实边界实现 typed logger/trace records、health checks、metrics 和 cost fields；外部 OTEL/Prometheus collector 延后，不伪造未接入 backend。
- [x] C15.2 复用并验证 C13 receipt 的 actor/runtime/provider/model/location/memory/tools/result/side effects 字段。
- [x] C15.3 实现当前本地 slice 可由 SQLite 事实支持的 migration、queue backlog/status、run status、budget 和 egress receipt 指标；API p95、event lag、queue wait、Run duration、cost variance、connector success/timeout/auth failure 延后到专门 telemetry backend 阶段。
- [x] C15.4 实现 SQLite WAL checkpoint、DB snapshot、vault/artifact snapshot、hash manifest 和 restore script。
- [x] C15.5 实现 audit integrity hash、hash-chain export 和 tamper detection；projection rebuild 不在本轮变更事实/投影的范围内，延后处理。
- [x] C15.6 实现 connector quarantine、policy gate 和 Owner-only release；基于重复副作用或 audit failure 的自动触发延后，当前通过 runbook 进入隔离。
- [x] C15.7 写 observability、backup/restore、quarantine/security integration tests 和三个 runbook；完整 fault drill、secret scan、cost budget alert 延后到 release hardening。
- [x] C15.8 运行 observability、backup/restore、security tests、integration、typecheck、full test 和 Mission Control build。
- [x] C15.9 完成 G12：恢复 DB/vault/Artifact 备份，验证 migration、文件 hash 和审计完整性。
- [x] C15.10 审查备份 manifest 不含 secret 内容、归档不修改事件事实、quarantine 解除包含 Owner 和原因；三个 runbook 已写入。
- [x] C15.11 创建 C15 commit，记录完整 SHA：`ca8f256544d789afcf37c4070e09f674df92a111`。

**自动化命令：** `pnpm test:integration && pnpm vitest run tests/security/quarantine.test.ts tests/integration/backup-restore.test.ts tests/integration/observability.test.ts && pnpm typecheck && pnpm test --run && pnpm --filter @nexora/mission-control build`
**人工 QA：** G12 已完成：CLI backup/restore/audit smoke、tamper detection、quarantine Owner gate，以及 launchd-managed demo `HTTP/1.1 200 OK` 观察记录
**证据目录：** `artifacts/progress/c15/`

**阻塞记录：** 当前无阻塞。

**已知限制：** 当前 C15 保持本地 SQLite facts 边界，不引入 OTEL/Prometheus/Docker collector；高维延迟/错误率指标、自动 quarantine trigger 和 projection rebuild 延后到后续专门阶段。

**Commit：** `ca8f256544d789afcf37c4070e09f674df92a111`（`chore: add observability recovery and security operations`）

### C16 / Release Hardening and Full QA

**阶段状态：** `[x]` 已完成
**目标：** 新环境可复现启动，CI、全量测试、移动/无障碍/视觉和故障演练全部有证据。
**依赖：** C00-C15 全部收口
**计划提交：** `chore: harden release and complete agent os qa`

- [x] C16.1 创建 API/worker/web Dockerfile、Compose health checks 和 data volumes。
- [x] C16.2 创建 demo seed fixture：workspace、agent、goal、ticket、memory、draft workflow；创建 fault injection fixture。
- [x] C16.3 将 schema/domain/adapter/connector/integration/security/E2E/visual/accessibility 命令接入 CI。
- [x] C16.4 写 Operator、Reviewer、Mobile Inbox、recovery、deep link、SSE reconnect、partial success、permission denied E2E。
- [x] C16.5 在 390x844 视口验证 Inbox 审批、暂停、恢复、重试和 receipt；复杂编辑转桌面。
- [x] C16.6 运行 axe、键盘 focus、ARIA、对比度、44px touch target 和 `prefers-reduced-motion` smoke。
- [x] C16.7 执行 worker crash、DB restore、connector outage、network loss recovery drill。
- [x] C16.8 运行最终命令：`pnpm lint && pnpm typecheck && pnpm test --run && pnpm test:integration && pnpm test:e2e`。
- [x] C16.9 将测试日志、screenshots/traces、audit export、restore report、manual QA checklist 写入 `artifacts/qa/c16-release/`。
- [x] C16.10 完成 G13；逐项核对实施方案 Definition of Done，任何缺口不得标记完成。
- [x] C16.11 更新 README、development/release/e2e runbooks，记录已知限制和下一阶段候选项。
- [x] C16.12 创建 C16 commit，记录完整 SHA，并把总览状态改为 `released_candidate`。

**自动化命令：** `pnpm lint && pnpm typecheck && pnpm test --run && pnpm test:integration && pnpm test:e2e`
**人工 QA：** G13
**证据目录：** `artifacts/progress/c16/` 和 `artifacts/qa/c16-release/`

**阻塞记录：** Docker daemon 在本机不可用，未执行镜像 build/up；已通过 `docker compose config`，并由 CI workflow 在 Node 22.13.0 环境执行完整 Docker/QA 门禁。

**Owner:** root
**Started at:** 2026-08-29 18:31 Asia/Shanghai
**Completed at:** 2026-08-29 20:42 Asia/Shanghai
**Commit:** `bcda211cb7c0954f7cace82aceac5fe89f74a25a`
**Automated verification:** `pnpm lint`、`pnpm typecheck`、`pnpm test --run`（83 files/386 tests）、`pnpm test:integration`（13/36）、Mission Control build、`pnpm test:e2e`（6/6）、`docker compose config` PASS；Node 25 engine warning已记录
**Manual QA Gate:** G13；390x844 Inbox/恢复/receipt、1440x900 Review、keyboard/ARIA/axe/44px/reduced-motion PASS；截图与 checklist 位于 `artifacts/qa/c16-release/manual/`
**Security impact:** Compose 默认 loopback、无外部后端；seed/fault 为本地确定性夹具；Topbar status ARIA 与 Inbox tab 键盘语义已修复
**Migration/rollback:** 不新增 SQLite migration；C16 可回退至 C15 commit，保留 C15 facts/backup/runbooks
**Evidence paths:** `artifacts/progress/c16/verification.log`、`artifacts/qa/c16-release/`、`.github/workflows/ci.yml`
**Known limitations:** 本机 Docker runtime build/up 需 CI 或启动 Docker daemon；C16 fixture 不执行真实外部副作用；QA PNG 保留为未跟踪本地证据；截图未包含 CJK glyph-level evidence；worker Compose healthcheck 目前是 PID liveness-only

## 5. 跨阶段质量检查

这些检查不是某一个 commit 的替代品，必须在对应阶段完成并在 C16 再次复核。
本轮复核已结合 C16 最终验证、fresh lint/typecheck/test/integration/build/E2E/compose config 结果与既有审查证据，Q01-Q14 现已全部收口。

- [x] Q01 所有 API、Event、RuntimeEnvelope、Connector input/output 都包含 `schema_version`，旧版本拒绝或显式迁移。
- [x] Q02 所有领域写入通过 domain command/repository，不允许 adapter、connector 或 UI 直接写任意数据库表。
- [x] Q03 所有 Run 都能从 Event + projection 重建，Run/Attempt/Step/Event 没有合并成一条聊天记录。
- [x] Q04 所有副作用操作都有 idempotency key；相同 key 不重复执行，不同 payload 返回冲突。
- [x] Q05 所有 lease 写入验证 fencing token；旧 worker 的 late event 被拒绝并记录 `STALE_LEASE`。
- [x] Q06 所有 R3 操作都有 preview、authorize、execute、verify；`side_effect_unknown` 冻结再次执行。
- [x] Q07 所有 Memory 事实带 source/provenance/trust state；冲突不静默覆盖，支持 snapshot/rollback。
- [x] Q08 所有 Artifact 可反查 Ticket、Run、Agent、输入、验证、Judge、Review 和外部 receipt。
- [x] Q09 所有 remote Run 的 receipt 包含 execution location、provider、region、data classification、redaction 和 snapshot hash。
- [x] Q10 所有日志、错误、Event、Artifact preview、截图和备份完成 secret redaction 扫描。
- [x] Q11 所有 UI 写操作区分 submitting/success/conflict/permission/offline，不能以 HTTP 200 直接显示业务成功。
- [x] Q12 所有页面有 Loading、Empty、Offline、Error、Permission denied、Partial success 可观察状态。
- [x] Q13 所有高风险审批显示 diff、证据、成本、风险、scope、payload hash 和精确 reviewer。
- [x] Q14 所有恢复演练同时核对内部 receipt 和外部状态，不能只检查 UI。

### Handoff 2026-08-29 / Release Candidate Closeout

- 当前状态：`[x]` Q01-Q14 已复核并收口；项目状态更新为 `released_candidate`。
- 本次完成：用 fresh 验证重新确认 lint、typecheck、full Vitest、integration、Mission Control build、Playwright E2E 和 `docker compose config`，并把跨阶段质量门全部置为完成。
- 下一步唯一动作：等待 CI / 具备 Docker daemon 的环境做 `docker compose build && docker compose up -d --wait`；若未来 worker 具备业务 heartbeat，再升级健康检查语义。
- 最近验证命令及结果：`pnpm lint`、`pnpm typecheck`、`pnpm test --run --reporter=dot`（83 files/386 tests）、`pnpm test:integration`（13 files/36 tests）、`pnpm --filter @nexora/mission-control build`、`pnpm test:e2e`（6/6）、`docker compose config` 全部 PASS；Node v25.9.0 engine warning 仍为预期。
- 最近 commit SHA：`bcda211cb7c0954f7cace82aceac5fe89f74a25a`
- 未解决问题：本机 Docker daemon 不可用，因此 Compose runtime build/up 仍由 CI 负责；worker healthcheck 仍是 PID liveness-only；QA PNG 仍保留为未跟踪本地证据。
- 证据路径：`artifacts/progress/c16/verification.log`、`artifacts/qa/c16-release/`、`.github/workflows/ci.yml`

## 6. 阻塞、偏差和变更记录

### 当前阻塞

| ID | 发现日期 | 阶段 | 问题 | 影响 | 已尝试动作 | 下一步 | 状态 |
|---|---|---|---|---|---|---|---|
| B-000 | 2026-08-23 | 无 | 当前没有实现阻塞；代码尚未开始 | 无 | 完成计划和清单自审 | 从 C00 开始 | closed |

### 计划变更记录

| 版本 | 日期 | 变更 | 原因 | 影响阶段 | 批准/证据 |
|---|---|---|---|---|---|
| 1.0 | 2026-08-23 | 从实施方案生成本进度清单 | 建立持续迭代的唯一状态入口 | C00-C16 | 清单自审通过 |
| 1.1 | 2026-08-23 | 接入 Agent OS × AionUI UI 规格与设计系统契约；按 C00-C16 重排阶段明细 | 让后续 UI 实施可追溯到明确的产品、交互和可访问性决策 | C10-C16 | 文档链接与独立审阅通过 |
| 1.2 | 2026-08-24 | 增加中文设计系统、中文 UI 规格和 UI/布局图册，并将中文文档设为 C10-C16 首选入口 | 降低实施语言门槛，同时保留英文原稿作为术语和来源对照 | C10-C16 | 中文文档结构、链接、Mermaid 图块 QA 通过；独立 HEAVY 审阅通过 |

## 7. 迭代交接模板

每次开发会话结束前追加一条简短记录，避免下一次从聊天上下文猜测状态：

```markdown
### Handoff YYYY-MM-DD / Cxx

- 当前状态：`[~]` / `[x]` / `[!]`
- 本次完成：
- 下一步唯一动作：
- 最近验证命令及结果：
- 最近 commit SHA：
- 未解决问题：
- 证据路径：
```

### Handoff 2026-08-24 / 中文 UI 文档交付

- 当前状态：`[x]` 中文设计系统、中文 UI 规格与 UI/布局图册已交付；C00-C16 实现尚未开始。
- 本次完成：新增 `DESIGN.zh-CN.md`、`docs/nexora-agent-os-ui-design.zh-CN.md`、`docs/nexora-agent-os-ui-diagrams.zh-CN.md`；英文原稿保留为术语和来源对照；跟踪入口已切换到中文实施契约。
- 下一步唯一动作：从 C00.1 创建 `codex/agent-os-implementation` 分支并开始 workspace/health 底座。
- 最近验证命令及结果：中文结构/链接/Mermaid/C00-C16 顺序验证 PASS；翻译结构对照 PASS；`git diff --check` PASS；独立 HEAVY gate review APPROVED。
- 最近 commit SHA：`3450f157e03b38ed7f086c4899b98e38db14d38a` (`docs: add Chinese Nexora UI specifications`)
- 未解决问题：仓库当前没有可运行前端，因此未执行浏览器视觉 QA；按计划延后至 C10 `/design-system` 实现后。
- 证据路径：`.omo/evidence/final-zh-docs-qa.json`、`.omo/evidence/translation-structure-final.json`、`.omo/evidence/final-zh-docs-gate-review.md`

### Handoff 2026-08-24 / UI Demo 交付

- 当前状态：`[~]` 已新增可打开的 Vite UI demo；真实浏览器视觉 QA 受本机 Chromium 下载阻塞。
- 本次完成：新增 `demo/index.html`、`demo/src/styles.css`、`demo/src/main.js`、`demo/src/data.js`、`demo/README.md`；覆盖 Mission Control、Quick Cowork、Run Detail、Review Center、Artifact 版本列表/证据摘要、Team Cockpit 和移动端五项导航。
- 下一步唯一动作：在可用 Chromium 环境补齐 1440px、768px、390px 浏览器截图和交互证据，然后再决定是否创建 demo commit。
- 最近验证命令及结果：`npm run build` PASS；`node --check demo/src/main.js` PASS；`node --check demo/src/data.js` PASS；`git diff --check -- tasks demo` PASS；独立代码审阅已完成并修复高优先级问题。
- 最近 commit SHA：本次未提交，等待用户确认是否提交。
- 未解决问题：YouTube 视频画面仍不可直接验证；真实浏览器截图因本机缺少可用 Chrome/Electron/wkhtmltoimage 且 Playwright 缓存未落地被记录为 blocked。
- 证据路径：`.omo/evidence/ui-demo-qa.md`。

### Handoff 2026-08-25 / Hermes 对齐与服务交接

- 当前状态：`[x]` Hermes Agent OS 对齐 Demo H1-H5 已完成；生产 C00-C16 尚未开始。
- 本次完成：Gateway、Channels、Sessions、Skills、Learning、Models、Backends、Registry、Tools & MCP、Schedules 页面与夹具交互；修复 Run Stop、Schedule occurrence、导航拦截、skip-link、移动 44px 控件、桌面 shell/CJK wrapping 和 Registry IA。
- 服务状态：macOS `launchctl` 任务 `com.nexora.agent-os-demo`，PID 96501，`state = running`；`127.0.0.1:5173` listener 正常，HTTP `200`。
- 下一步唯一动作：阅读 [docs/current-session-handoff.zh-CN.md](/Users/zq/Desktop/ai-projs/posp/Nexora/docs/current-session-handoff.zh-CN.md)，然后从 C00.1 创建 `codex/agent-os-implementation` 分支；不要继续从静态 Demo 猜测生产架构已实现。
- 最近验证命令及结果：`node --check src/main.js`、`node --check src/runtime.js`、`node --check src/data.js`、`npm run build`、`git diff --check`、`curl http://127.0.0.1:5173/` 全部 PASS；fresh gate review `APPROVE`。
- 最近 commit SHA：无新的 Demo/生产 commit；中文设计文档 commit `3450f157e03b38ed7f086c4899b98e38db14d38a`。
- 未解决问题：独立 Playwright Chromium 仍不可用；视频原始页面仍不可直接读取；生产 C00-C16 尚未开始。
- 证据路径：`.omo/evidence/hermes-alignment/manual-qa.md`、`.omo/evidence/hermes-alignment-gate-review.md`、`.omo/evidence/hermes-alignment/desktop-schedules-1440x900-fresh.jpg`、`.omo/evidence/hermes-alignment/mobile-gateway-390x844.jpg`。

### Handoff 2026-08-25 / C00 Bootstrap Workspace and Health

- 当前状态：`[x]` C00 实现、自动化验证、G0、审查和 scoped commit 已完成。
- 本次完成：pnpm Node 22 TypeScript workspace、Zod config boundary、Fastify health、idle worker、React/Vite shell、README、ADR-0001 和 C00 证据。
- 下一步唯一动作：从 C01.1 开始，先确认 C00 commit 与 contracts 前置检查。
- 最近验证命令及结果：`pnpm install`、`pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test --run`、Mission Control production build、API curl、worker SIGINT 和 in-app browser DOM/console 均 PASS。
- 最近 commit SHA：`4efdb06358e1ee433039201e2d63858bd64a471f`；C00 commit 不包含 `tasks/`、`demo/`、`.omo/` 或用户文档。
- 未解决问题：主机为 Node 25，项目正确要求 Node 22，因此 pnpm 只报告 engine warning；验证仍为绿色。
- 证据路径：`artifacts/progress/c00/`。

### Handoff 2026-08-25 / C00 Closeout

- 当前状态：`[x]` C00 已完成，C01 尚未开始。
- 本次完成：创建 `chore: bootstrap Nexora control plane`，commit `4efdb06358e1ee433039201e2d63858bd64a471f`；写回阶段收口模板和 scoped review 结果。
- 下一步唯一动作：开始 C01.1，保持 C00 commit 不变并先建立 versioned contracts 的测试边界。
- 最近验证命令及结果：`pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test --run`、`pnpm test:integration`、`pnpm --filter @nexora/mission-control build` 均 PASS；5173 Demo 仍 HTTP 200。
- 最近 commit SHA：`4efdb06358e1ee433039201e2d63858bd64a471f`。
- 未解决问题：Node 22 未安装，当前用 Node 25.9.0 验证并产生 engine warning；C00 未提供 Playwright journey 或 worker signal 自动化测试，这些按计划后延。
- 证据路径：`artifacts/progress/c00/`、`tasks/todo.md` 的 C00 Review。

### Handoff 2026-08-26 / C03 Append-only Event Store and Projections

- 当前状态：`[x]` C03 实现、自动化验证、G2、代码审查和 scoped commit 已完成；进度状态为 `c03_complete`。
- 本次完成：新增 `packages/event-store`、`0002_event_store.sql`、append-only triggers、recursive trigger enforcement、cursor paging/expiry/dedupe、projection checkpoints/rebuild/lag、API health live projection lag 和 ADR-0004。
- 下一步唯一动作：从 C04.1 开始，实现 Policy、Scope、Risk、Egress 与 Redaction；先确认 C03 commit 和事件 envelope/repository 可用。
- 最近验证命令及结果：`pnpm install --frozen-lockfile`、contracts/event-store/persistence/API health tests、`pnpm test --run`、`pnpm test:integration`、`pnpm typecheck`、`pnpm db:migrate`、`git diff --check`、Demo `curl -I http://127.0.0.1:5173/` 全部 PASS；G2 event reconnect smoke PASS。
- 最近 commit SHA：`2e9d9b5695787b247246c65d1c465cd57a4391d3`；C03 commit 不包含 `tasks/`、`demo/`、`.omo/` 或既有设计文档未提交改动。
- 未解决问题：主机仍为 Node 25.9.0，项目要求 Node 22.13+ 且 `<23`，因此 pnpm 继续出现 engine warning；C03 未实现实际 SSE HTTP route、durable queue、policy 或 richer read projections，这些按计划后延。
- 证据路径：`artifacts/progress/c03/verification.log`、`artifacts/progress/c03/g2-event-reconnect-smoke.log`、`docs/adr/0004-event-store-and-projections.md`。

### Handoff 2026-08-26 / C04 Policy, Scope, Risk, Egress, and Redaction

- 当前状态：`[x]` C04 实现、自动化验证、G3、代码审查修复和 scoped commit 已完成；进度状态为 `c04_complete`。
- 本次完成：新增 `packages/policy`，扩展 contracts policy schema、Agent role/scope、Connector allowed scopes/egress、Review risk/policy decision；实现 RBAC、scope、R3 review gate、egress allow/deny、secret redaction 和 policy audit event helper；写 ADR-0005。
- 下一步唯一动作：从 C05.1 开始，实现 Durable Queue、Lease、Fencing、Retry、Cancel 与 Budget Gate；先读取 C05 计划并确认 C04 commit `057180340535a629415d5f55b8faebbb11d0c55d`。
- 最近验证命令及结果：`pnpm install --frozen-lockfile`、policy/contracts/persistence tests、`pnpm test --run`、`pnpm test:integration`、`pnpm typecheck`、`pnpm db:migrate`、`git diff --staged --check`、G3 smoke 和 Demo `curl -I http://127.0.0.1:5173/` 均 PASS。
- 最近 commit SHA：`057180340535a629415d5f55b8faebbb11d0c55d`；C04 commit 不包含 `tasks/`、`demo/`、`.omo/` 或既有设计文档未提交改动。
- 未解决问题：主机仍为 Node 25.9.0，项目要求 Node 22.13+ 且 `<23`，因此 pnpm 继续出现 engine warning；DNS/IP 解析目前作为 caller-supplied evidence，真实 connector executor 将在 C08+ 接入。
- 证据路径：`artifacts/progress/c04/`、`docs/adr/0005-policy-and-data-boundary.md`。

### Handoff 2026-08-26 / C05 Durable Queue, Lease, Fencing, and Recovery

- 当前状态：`[x]` C05 实现、自动化验证、G4、审查和 scoped commit 已完成；进度状态为 `c05_complete`。
- 本次完成：新增 `0003_orchestration.sql`、`@nexora/orchestration` durable queue/lease/fencing/retry/cancel/budget/recovery primitives、workspace-scoped worker loop、lease-guarded queue writes、orchestration event vocabulary 和 ADR-0006。
- 下一步唯一动作：从 C06.1 开始，先确认 C05 commit 与 recovery smoke，再实现 deterministic/local runtime adapters；不要把 C05 primitives 误当成已接入 Control API 或真实 runtime。
- 最近验证命令及结果：`pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test --run`（23 files/170 tests）、`pnpm test:integration`（2 files/4 tests）、`pnpm audit --prod --audit-level=high`、迁移 smoke、G4 shared SQLite recovery smoke 和 Demo `curl -I http://127.0.0.1:5173/` 全部 PASS。
- 最近 commit SHA：`ac4b40d480e1e7709d85f833ef7fd570ac76ca4c`（`feat: add durable orchestration queue and recovery`）。
- 未解决问题：C05 尚未将 queue/lease 写入接入 Control API，也未实现实际 Event/Artifact/Receipt repositories、runtime adapter 或 pause/resume API；这些按 C06-C09 计划后延。
- 证据路径：`artifacts/progress/c05/`、`docs/adr/0006-durable-queue-and-fencing.md`。

### Handoff 2026-08-26 / C06 Deterministic and Local Runtime Adapters

- 当前状态：`[x]` C06 实现、自动化验证、G5、审查和 scoped commit 已完成；进度状态为 `c06_complete`。
- 本次完成：新增 `@nexora/runtime-adapters`、strict runtime payload schemas、deterministic 五场景 fixture、allowlisted local subprocess adapter、协议错误码和 ADR-0007。
- 最近验证命令及结果：`pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test --run`（29 files/209 tests）、`pnpm test:integration`（3 files/5 tests）、adapter 单测（4 files/35 tests）、contracts 单测（5 files/76 tests）、Mission Control build、audit 和 G5 smoke 全部 PASS。
- 最近 commit SHA：`5e3b88be35289edaa344c7491495d4f389bb05bf`（message `feat: add deterministic and local runtime adapters`）。
- 未解决问题：C06 仍是 local-only adapter primitives；Control API 接入、真实 domain event/receipt wiring 和 pause/resume command 留到 C09。
- 证据路径：`artifacts/progress/c06/`、`docs/adr/0007-runtime-adapter-protocol.md`。

### Handoff 2026-08-27 / C07 Memory Vault, Artifact Store, and Provenance

- 当前状态：`[x]` C07 实现、自动化验证、G6 smoke、ADR 和 scoped commit 已完成；进度状态为 `c07_complete`。
- 本次完成：新增 `@nexora/memory`、`@nexora/artifacts`、memory contracts、artifact version metadata、migration v4、vault layout template、provenance integration 和 ADR-0008；修复重复 stale write candidate version 碰撞。
- 下一步唯一动作：从 C08.1 开始，确认 artifact version、Event receipt、policy decision 和 idempotency repository 可用，再实现 connector contract 与 Review Gate。
- 最近验证命令及结果：memory/artifacts/contracts/persistence 单测、`pnpm test --run`（37 files/221 tests）、`pnpm test:integration`（4 files/6 tests）、`pnpm typecheck`、migration smoke、audit、Mission Control build 和 Demo HTTP smoke 全部 PASS。
- 最近 commit SHA：`e82e62a97bce4590f238c8a74d7f8955d7ef8df4`（message `feat: add scoped memory vault and artifact provenance`）。
- 未解决问题：主机仍为 Node 25.9.0，项目要求 Node 22.13+ 且 `<23`，因此 pnpm 继续出现 engine warning；C07 尚未接入 connector execution 或 Control API。
- 证据路径：`artifacts/progress/c07/verification.log`、`artifacts/progress/c07/g6-memory-conflict-smoke.log`、`docs/adr/0008-memory-and-artifact-boundaries.md`。

### Handoff 2026-08-27 / C08 Connector Contracts and Review Gate

- 当前状态：`[x]` C08 实现、自动化验证、G7 stale payload smoke、代码/安全复核、ADR 和 scoped commit 已完成；进度状态为 `c08_complete`。
- 本次完成：新增 `@nexora/connectors`、connector request/preview/receipt contracts、review request/event contracts、descriptor registry、mock draft connector、repository-bound review gate、runtime authorization capability 和 connector idempotency begin/claim 流程。
- 下一步唯一动作：从 C09.1 开始，实现 Control API、SSE、Pause/Resume/Cancel 和 Run lifecycle；不要把 C08 mock connector 误当成外部网络 connector executor。
- 最近验证命令及结果：`pnpm --filter @nexora/connectors test --run --reporter=verbose`（4 files/18 tests）、`pnpm --filter @nexora/persistence test --run packages/persistence/src/repositories.test.ts --reporter=verbose`、`pnpm test --run`（44 files/247 tests）、`pnpm test:integration`（5 files/8 tests）、`pnpm typecheck`、`pnpm db:migrate`、`pnpm audit --prod --audit-level=high`、Mission Control build、Demo HTTP smoke、manual connector smoke、diff/no-excuse/export/size scans 均 PASS。
- 最近 commit SHA：`4484db4ea37ae61934f0432be86f26b8a41adfa7`（message `feat: add connector contracts and review gates`）。
- 未解决问题：主机仍为 Node 25.9.0，项目要求 Node 22.13+ 且 `<23`，因此 pnpm 继续出现 engine warning；C08 未实现 Control API route、review UI、remote connector execution 或 persistent external receipts，这些按计划后延。
- 证据路径：`artifacts/progress/c08/`、`docs/adr/0009-connector-review-and-idempotency.md`。

### Handoff 2026-08-29 / C16 Release Hardening and Full QA

- 当前状态：`[x]` C16 实现、自动化验证、G13、独立代码审查和 implementation commit 已完成；整体进度为 `c16_complete`，不宣称 production release。
- 本次完成：API/worker/web Dockerfile、Compose health checks/data volume、可重复 seed/fault fixtures、CI lint/typecheck/test/integration/build/Playwright/Docker 门禁、Inbox tab deep-link/ARIA/键盘行为、恢复与移动 QA 证据；修复最终 seed 文件 symlink 写穿问题。
- 下一步唯一动作：在具备 Docker daemon 的 CI/环境中运行 `docker compose build && docker compose up -d --wait`，并在未来 worker 具备业务 heartbeat 后升级 worker healthcheck；其余 C16 implementation scope 已收口。
- 最近验证命令及结果：`pnpm lint`（280 files）、`pnpm typecheck`、`pnpm test --run --reporter=dot`（83 files/386 tests）、`pnpm test:integration`（13 files/36 tests）、Mission Control build、`pnpm test:e2e`（6/6）、`docker compose config`、C16 targeted（6/6）和 seed CLI smoke 全部 PASS；Node v25.9.0 engine warning 已记录。
- 最近 commit SHA：`bcda211cb7c0954f7cace82aceac5fe89f74a25a`（`chore: harden release and complete agent os qa`）；commit 仅含 28 个 C16 implementation/evidence 文件，不含 `tasks/`、`demo/`、`.omo/`、设计文档、assets 或 QA PNG。
- 未解决问题：本机 Docker daemon 不可用，Compose runtime build/up 延后至 CI；worker healthcheck 当前仅证明 PID liveness；QA PNG 是未跟踪本地证据；截图未包含 CJK glyph-level evidence；C16 fixtures 不执行真实外部副作用。
- 服务状态：launchd `com.nexora.agent-os-demo` 保持 `state = running`、PID 96501，`127.0.0.1:5173` HTTP 200，未停止、替换或重启。
- 代码审查：独立 staged review `APPROVE`，无 CRITICAL/HIGH；报告保留 worker liveness-only 低风险建议。
- 证据路径：`artifacts/progress/c16/verification.log`、`artifacts/qa/c16-release/`、`.github/workflows/ci.yml`、`docs/runbooks/release.md`。

## 8. C17-C28 Hermes Agent OS 完整对标路线

> 本节是基于 `agentos.guide`、目标视频 `qMvkdMzuYjs` 和官方 Hermes README 的后续开发清单。它已经完成规划，但尚未开始实现；每个阶段仍需单独建立 RED 测试、实现、自动化验证、Manual QA、代码审查和 scoped commit。

| 状态 | 阶段 | 交付范围 | 依赖/退出条件 |
|---|---|---|---|
| `[x]` | C17 Runtime Registry | Hermes、OpenClaw、Claude、Codex、Antigravity、Deterministic、Local、Remote 的 descriptor、capability、health、requested/actual runtime | C16；descriptor-only registry、workspace scope、optimistic updates and UI evidence complete |
| `[x]` | C18 Provider/Backend/Tool Catalog | Provider/model/backend/MCP/tool registry、secret reference、egress policy、actual provider/model/cost/region | C17；descriptor catalog and owner-only idempotent updates complete; execution remains disabled |
| `[x]` | C19 Gateway/Channels/Sessions | Telegram、Discord、Slack、WhatsApp、Signal、Web/API 的 session、cursor、delivery、pause/steer/resume | C17+C18；workspace-scoped control plane、断线恢复、消息幂等、allowlist、delivery receipt complete；真实连接器仍未授权 |
| `[~]` | C20 Goal Mode/Loop/Judge | 跨轮 continuation、Judge JSON、max turns、subgoal、pause/resume、预算和 deadline | C17-C19；自动化验证、视觉 QA 和独立审查通过；等待 scoped commit SHA 回写 |
| `[ ]` | C21 Skills/Learning | Skill entity/version/install/quarantine/scan/approve/revoke、`/learn` | C18+C20；只运行 approved snapshot，source hash/diff/rollback 完整 |
| `[ ]` | C22 Obsidian/OMI/Journal | Vault bridge、MCP 只读优先、graph/FTS、daily journal、memory candidate | C18+C21；scope/secret scan，冲突可见，写回需批准 |
| `[ ]` | C23 Browser/Computer Use | 沙箱、域名/应用 allowlist、截图/action receipt、人工批准、stop/takeover | C18+C20；Mac/Windows/Linux 分平台验证，禁止 SSRF/越权 |
| `[ ]` | C24 Voice/Jarvis | STT/VAD/TTS、wake word、Wall mode、实时 interrupt、录音和声纹政策 | C18+C20+C22；测量延迟，支持删除/导出转录 |
| `[ ]` | C25 Studio/Media/NotebookLM/Avatar | MediaArtifact、render worker、Notebook source/generation、preview/share、AvatarProfile | C18+C22；provenance、moderation、重渲染、临时 URL 失效恢复 |
| `[ ]` | C26 Teams/Paperclip/Antigravity | Team/Member/Mailbox、parallel Attempt、依赖、merge/review、具体 CLI adapter | C17-C21；成员隔离、冲突、成本和合并证据可见 |
| `[ ]` | C27 Business Connectors | Oracle、GSC、WordPress、Hunter、Firecrawl、Google Workspace、Outreach | C18-C25；默认 draft/review，OAuth/退订/发布回滚，真实凭据显式授权 |
| `[ ]` | C28 VPS/Private/Mobile | Hermes/OpenClaw packaged deployment、backup/restore、Tailscale/Cloudflare、mobile approval | C19-C27；出境分类、密钥轮换、灾备、远程撤销可验证 |

**首个建议切片：** C17 + C18 的 fixture-first Registry。先落地“一个 Dashboard 管理多个 Agent/模型/工具”的事实模型，再接入邮箱、CMS、桌面控制、语音和 NotebookLM 等高风险副作用。

### Handoff 2026-08-30 / C17-C18 Runtime Registry and Provider Catalog

- 当前状态：`[x]` C17/C18 实现、RED/GREEN、全量自动化验证和 fresh visual QA 已完成；整体路线进入 `c19_ready`，不宣称已接入真实 Hermes、Provider、MCP 或外部连接器。
- Commit：`58b80300e4fce98bfeeac75998d2f5d503df3961`（`feat: add runtime registry and provider catalog`）。
- 本次完成：workspace-scoped Runtime/Provider/Model/Backend/Tool descriptor contracts、SQLite migration 8、typed repositories、owner-only idempotent registration/update、`If-Match` optimistic versioning、provider reference validation、unified Catalog API、Registry Mission Control route/page，以及 requested/actual runtime evidence。
- 安全边界：Registry 只记录声明事实；不会启动 runtime、调用 model、安装 MCP、发送网络请求或存储明文 secret。健康 badge 明确标注 `declared`；endpoint 只允许 secret reference。
- 自动化验证：`pnpm lint`（289 files）、`pnpm typecheck`、`pnpm test --run --reporter=dot`（87 files/402 tests）、`pnpm test:integration`（13 files/36 tests）、Mission Control build 均 PASS；Registry focused RED/GREEN 证据见 `artifacts/progress/c17-c18/verification.log`。
- 人工 QA Gate：Chromium cached executable fresh captures at 1440x900 and 390x844；四个面板 aria-labelledby 均为 slug-safe，移动端无横向溢出；独立 design-system pass APPROVE。当前 fixture 无 CJK 文案，CJK glyph-level check 延后到本地化内容切片。
- 代码审查：已修复 invalid ARIA IDs、11px metadata 和 ambiguous health badge 反馈；保留 reviewer artifacts in `.omo/evidence/`。
- 环境限制：主机 Node `v25.9.0` 超出项目 `<23` engine range，pnpm 仅发出 warning；Playwright package-managed headless shell `1200` 不可用，使用缓存 Chrome for Testing `151.0.7922.34` 完成截图。
- 下一步唯一动作：从 C19.1 开始，先写 Gateway/Channels/Sessions 的 session、cursor、delivery、allowlist 和消息幂等 RED 测试；真实 Telegram/Discord/Slack/WhatsApp/Signal 连接必须等显式凭据和出境策略授权后再接入。

### Handoff 2026-09-01 / C19 Gateway, Channels, and Sessions

- 当前状态：`[x]` C19 control-plane 实现、RED/GREEN、全量自动化验证、浏览器 QA、独立代码审查和独立安全复核已完成；不宣称已连接 Hermes Gateway 或任何真实外部渠道。
- Commit：`174c288f6365eeab879d08e6cad9f04c28029a78`（`feat: add gateway channels sessions control plane`）；C17/C18 基线为 `58b80300e4fce98bfeeac75998d2f5d503df3961`。
- 本次完成：Gateway/Channel descriptor、foreground/background Session、cursor checkpoint、消息幂等、append-only DeliveryReceipt、workspace allowlist 默认拒绝、pause/steer/resume 命令、Owner 写权限、`run:read` 读权限、`Idempotency-Key`、`If-Match`、Gateway API routes 和 Mission Control Gateway 页面。
- 持久化：SQLite migration 9 新增 `gateways`、`channels`、`sessions`、`session_messages`、`delivery_receipts`、`channel_allowlist`、`session_cursor_checkpoints`；migration 10 增加拓扑、allowlist、cursor 和 append-only hardening triggers。
- 自动化验证：required C19 focused PASS（4 files / 49 tests）；oracle RED/GREEN PASS；`pnpm lint` PASS（309 source files）；`pnpm typecheck` PASS；full Vitest PASS（92 files / 464 tests）；integration PASS（13 files / 36 tests）；E2E PASS（6 tests）；Mission Control build PASS。
- 视觉 QA：`node artifacts/progress/c19/current-verification/c19-manual-qa-runner.mjs` PASS；fresh screenshots `c19-manual-qa-gateway-desktop-20260901-081751.png`（1440x900）、`c19-manual-qa-gateway-post-actions-20260901-081751.png`（1440x900）、`c19-manual-qa-gateway-mobile-20260901-081751.png`（390x844）、`c19-manual-qa-gateway-invalid-workspace-20260901-081751.png`（390x844）均经 `file` 验证为 PNG。
- 审查结果：独立代码审查和独立安全复核均无 blocking finding；已修复 cross-workspace session existence oracle，新增 unauthorized existing/missing foreign session 返回同一 `403/SCOPE_DENIED` 的回归测试。
- 安全边界：Gateway/Channel endpoint 与 credential 仅允许 `secret://` reference；无 allowlist 的 outbound 消息返回 `POLICY_DENIED`、不写 delivery receipt、不执行网络调用；控制命令只改变本地声明状态并返回 accepted receipt；Mission Control 只调用本地 control API。
- 环境限制：主机 Node `v25.9.0` 超出项目 `<23` engine range，pnpm 仅发出 warning；TypeScript/YAML LSP 未安装；真实外部连接器、凭据读取和外部 side effect 仍未授权。
- 证据路径：`artifacts/progress/c19/verification.log`、`artifacts/progress/c19/current-verification/`、`docs/adr/0014-gateway-channels-sessions.md`、`docs/runbooks/gateway-operations.md`、`apps/api/src/routes/gateway.test.ts`、`packages/persistence/src/c19-repositories.test.ts`。
- 下一步唯一动作：创建 C19 scoped commit 后进入 C20 Goal Mode/Loop/Judge，先写跨轮 continuation、Judge JSON、max turns、subgoal、pause/resume、budget/deadline、Judge failure、restart/orphan recovery 和 scope 的 RED 测试；真实 Telegram/Discord/Slack/WhatsApp/Signal 连接继续保持显式授权门禁。

### Handoff 2026-09-01 / C20 Goal Mode, Loop, and Judge

- 当前状态：`[~]` C20 control-plane 实现、RED/GREEN、全量自动化验证、浏览器 QA、独立代码审查和安全复核已完成；scoped commit 正在创建中，不宣称已接入真实外部执行器或辅助 Judge provider。
- Commit：待 scoped commit 生成后回写；C19 基线为 `174c288f6365eeab879d08e6cad9f04c28029a78`。
- 本次完成：GoalLoopDescriptor、GoalContinuation、JudgeDecision `{ done, reason }`、turn/budget/deadline 限制、subgoal、pause/resume/steer、`/goal resume`、orphan recovery、run/session scope、CLI/API/Mission Control 一致控制面语义。
- 持久化：SQLite migration 11 新增 `goal_loops`、`goal_continuations`、`goal_loop_commands`；continuation 和 command payload/column 一致性由 triggers 强制，跨重启恢复只读取本地事实。
- 自动化验证：C20 focused PASS（9 files / 74 tests）；`pnpm lint` PASS（322 source files）；`pnpm typecheck` PASS；full Vitest PASS（100 files / 534 tests）；integration PASS（14 files / 37 tests）；E2E PASS（6 tests）；Mission Control build PASS。
- 视觉 QA：真实浏览器访问 `http://127.0.0.1:4313/goal-mode?workspace=ws-demo`；fresh PNGs `c20-goal-mode-desktop-1440x900-20260901-212327.png`、`c20-goal-mode-post-judge-20260901-212327.png`、`c20-goal-mode-mobile-390x844-20260901-212327.png`、`c20-goal-mode-mobile-controls-390x844-20260901-212327.png` 均经 `file` 验证尺寸。
- 审查结果：独立 C20 复核无 blocking finding；本地扫描未发现 C20 核心文件中的 `any`、`@ts-ignore`、`@ts-expect-error`、测试 `.skip/.only`、真实 Telegram/Discord/Slack/WhatsApp/Signal/Web/API/MCP 调用或明文 secret 泄露。
- 安全边界：C20 只记录 descriptor 和控制命令；Judge fixture 仅接受 JSON 决策事实，Judge failure 不会宣称成功；所有外部连接器、NotebookLM、浏览器控制、语音和业务 SaaS 仍未授权。
- 环境限制：主机 Node `v25.9.0` 超出项目 `<23` engine range，pnpm 仅发出 warning；Mission Control build 仍有第三方 `use client` bundler warning；浏览器 QA 使用本地 127.0.0.1 control-plane fixture。
- 证据路径：`artifacts/progress/c20/verification.log`、`artifacts/progress/c20/current-verification/`、`docs/adr/0015-goal-mode-loop-judge.md`、`docs/runbooks/goal-mode-operations.md`、`packages/orchestration/src/goal-loop.test.ts`、`apps/api/src/routes/goal-mode.test.ts`、`tests/integration/goal-loop-recovery.test.ts`。
- 下一步唯一动作：创建 C20 scoped commit 并回写完整 SHA；之后 C21 Skills/Learning 才能开始，且继续保持 approved snapshot、source hash/diff/rollback 和 quarantine 边界。

## 9. 完成判定

只有同时满足以下条件，才可把整个清单标记为 `released_candidate`：

1. C00-C16 全部为 `[x]`，没有未解释的 `[!]`。
2. Q01-Q14 全部为 `[x]`，或在发布记录中明确记录不适用原因。
3. 实施方案中的 Definition of Done 七项全部有自动化或故障演练证据。
4. G0-G13 全部有人工观察记录，且截图、日志、trace、receipt 或 restore report 可定位。
5. 最终工作树、CI、README 和 runbook 一致；不存在未提交的实现文件或未解释的用户改动。
6. 最终 commit SHA、测试摘要、残余风险和后续非阻塞工作已写入本文件最后一条 Handoff。
