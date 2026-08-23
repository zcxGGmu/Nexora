# Nexora Agent OS Development Progress

> 这是 Nexora Agent OS 的唯一开发进度清单。实施细节以 [Agent OS Implementation Plan](/Users/zq/Desktop/ai-projs/posp/Nexora/docs/superpowers/plans/2026-08-23-agent-os-implementation.md) 为准；C10-C16 的产品/UI 决策以 [中文 Nexora Agent OS Frontend UI Design](/Users/zq/Desktop/ai-projs/posp/Nexora/docs/nexora-agent-os-ui-design.zh-CN.md)、[中文 DESIGN](/Users/zq/Desktop/ai-projs/posp/Nexora/DESIGN.zh-CN.md) 和 [中文 UI/布局图册](/Users/zq/Desktop/ai-projs/posp/Nexora/docs/nexora-agent-os-ui-diagrams.zh-CN.md) 为准；英文文档是术语和来源对照；本文件只记录执行状态、验证证据、阻塞原因和 commit 结果。

## 1. 当前状态

| 字段 | 当前值 |
|---|---|
| 项目 | Nexora Agent OS |
| 进度状态 | `planning_complete`，实现尚未开始 |
| 当前阶段 | `C00` 待开始 |
| 当前工作 | 尚未开始；下一项为 C00.1 分支和工作树检查 |
| 当前分支 | `main`；执行 C00 前创建 `codex/agent-os-implementation` |
| 计划版本 | `2026-08-23-agent-os-implementation` |
| 前端设计版本 | `nexora-agent-os-ui-design.zh-CN` + `DESIGN.zh-CN.md` + `nexora-agent-os-ui-diagrams.zh-CN.md`；C10-C16 的必读契约 |
| 最后更新 | 2026-08-24 |
| 已完成 commit | 无 |
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

| 状态 | Commit | 交付主题 | 依赖 | QA Gate | 证据目录 | 回滚边界 |
|---|---|---|---|---|---|---|
| `[ ]` | C00 | workspace、配置、health | 无 | G0 | `artifacts/progress/c00/` | 删除新底座文件，保留设计文档 |
| `[ ]` | C01 | contracts、错误码、envelope | C00 | G1 | `artifacts/progress/c01/` | 回退 contracts 包，不改数据库 |
| `[ ]` | C02 | SQLite schema、迁移、repositories | C01 | G1 | `artifacts/progress/c02/` | 回滚 `0001_core.sql` 和 domain 包 |
| `[ ]` | C03 | Event Store、投影、cursor | C02 | G2 | `artifacts/progress/c03/` | 保留原始 DB，移除投影实现 |
| `[ ]` | C04 | RBAC、scope、risk、egress、redaction | C02 | G3 | `artifacts/progress/c04/` | 回退 policy 包，禁止继续运行高风险 connector |
| `[ ]` | C05 | queue、lease、fencing、recovery | C03+C04 | G4 | `artifacts/progress/c05/` | 停 worker，保留 queue/events 以便恢复 |
| `[ ]` | C06 | deterministic/local runtime adapter | C05 | G5 | `artifacts/progress/c06/` | 禁用 adapter registry，保留协议 contracts |
| `[ ]` | C07 | Memory vault、Artifact、provenance | C02+C03+C04 | G6 | `artifacts/progress/c07/` | 保留 vault snapshot，停止写入而不删除内容 |
| `[ ]` | C08 | connector contract、Review、idempotency | C03+C04+C07 | G7 | `artifacts/progress/c08/` | quarantine connector，保留 review/audit facts |
| `[ ]` | C09 | Control API、commands、queries、SSE | C05+C06+C07+C08 | G8 | `artifacts/progress/c09/` | 关闭 API routes，不修改事实表 |
| `[ ]` | C10 | Mission Control shell、scope、状态矩阵 | C09 | G8 | `artifacts/progress/c10/` | 回退 UI routes/components，保留 API |
| `[ ]` | C11 | Run/Goal/Review/Artifact/Memory UI | C10 | G8 | `artifacts/progress/c11/` | 回退页面，保留 API 和事件 |
| `[ ]` | C12 | SEO draft workflow、Judge、handoff | C06+C07+C08+C11 | G9 | `artifacts/progress/c12/` | 禁用 workflow registration，不删除草稿 |
| `[ ]` | C13 | remote adapter、snapshot、egress receipt | C04+C05+C06+C07 | G10 | `artifacts/progress/c13/` | 默认 local-only，禁止隐式 remote fallback |
| `[ ]` | C14 | schedules、occurrences、misfire、overlap | C03+C05+C12 | G11 | `artifacts/progress/c14/` | 禁用 scheduler loop，保留 occurrence/audit rows |
| `[ ]` | C15 | observability、backup、quarantine、audit export | C08+C09+C13+C14 | G12 | `artifacts/progress/c15/` | 关闭增强运维组件，不影响核心事件事实 |
| `[ ]` | C16 | Docker、CI、全量 QA、release handoff | C00-C15 | G13 | `artifacts/progress/c16/` | 不发布 release 镜像，保留 QA 报告 |

> C10-C16 共同前置条件：对应阶段开始前已按本文件 2.3 阅读并应用中文 UI 规格、中文 DESIGN 和中文图册；任何偏离均有 ADR、计划变更和验证证据。

## 4. 阶段详细清单

### C00 / Bootstrap Workspace and Health

**阶段状态：** `[ ]` 未开始  
**目标：** 新环境可安装、启动 API/worker/web，并通过 `/v1/health` 观察底座状态。  
**依赖：** 无  
**计划提交：** `chore: bootstrap Nexora control plane`

- [ ] C00.1 创建 `codex/agent-os-implementation` 分支；确认 `main` 工作树干净或记录已有用户改动。
- [ ] C00.2 创建 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.editorconfig`、`.gitignore`、`.env.example`、`.nvmrc`。
- [ ] C00.3 创建 `apps/api`、`apps/worker`、`apps/mission-control` 的 package manifest 和启动入口。
- [ ] C00.4 在 `packages/config/src/env.ts` 用 Zod 校验 `NEXORA_DATA_DIR`、host、port、log level、auth mode，并验证错误输出不含 secret。
- [ ] C00.5 在 `apps/api/src/routes/health.ts` 注册 `/v1/health`，返回 API/version/DB/queue 检查状态。
- [ ] C00.6 为 health route 和 env parser 写测试，验证 HTTP 200、缺失配置非零退出、响应不泄露 secret。
- [ ] C00.7 更新 README 的安装、启动、测试、目录和架构说明；写 ADR-0001。
- [ ] C00.8 首次生成 lockfile 时运行 `pnpm install`；lockfile 提交后运行 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test --run`。
- [ ] C00.9 启动 API/worker/web，执行 `curl http://127.0.0.1:4310/v1/health`，保存 JSON 和启动日志到 `artifacts/progress/c00/`。
- [ ] C00.10 完成 G0：浏览器打开空壳首页，health 端点可访问，worker 可停止且不会产生任务。
- [ ] C00.11 运行代码审查清单：无任意 shell、无硬编码密钥、无跨包循环依赖。
- [ ] C00.12 创建 C00 commit，记录完整 SHA；填写阶段收口模板并将 C00 改为 `[x]`。

**自动化命令：** `pnpm install && pnpm install --frozen-lockfile && pnpm typecheck && pnpm test --run`  
**人工 QA：** G0  
**证据目录：** `artifacts/progress/c00/`

**Evidence Log：**

| 日期 | 命令/动作 | 结果 | 证据路径 | 记录人 |
|---|---|---|---|---|
| 2026-08-23 | 计划建立 | 未开始 | `tasks/agent-os-progress.md` | root |

**阻塞记录：** 当前无阻塞。

### C01 / Versioned Contracts and Error Semantics

**阶段状态：** `[ ]` 未开始  
**目标：** 所有跨包对象、错误码、事件和 RuntimeEnvelope 有稳定 schema version。  
**依赖：** C00  
**计划提交：** `feat: add versioned domain contracts and error semantics`

- [ ] C01.1 确认 C00 commit 已存在且 `pnpm typecheck`、`pnpm test --run` 为绿色。
- [ ] C01.2 创建 `packages/contracts/src/ids.ts` 和 `clock.ts`，统一 ULID、Clock、时间序列化。
- [ ] C01.3 创建 Agent、Goal、Ticket、Run、Artifact、Review、Runtime、Connector schemas；所有对象包含 workspace、schema version、timestamps。
- [ ] C01.4 实现错误码集合和统一错误响应：`code`、`message`、`retryable`、`required_action`、`trace_id`、`details`。
- [ ] C01.5 实现 EventEnvelope：event/trace/run/attempt/step IDs、actor、scope、payload、redactions、sequence。
- [ ] C01.6 写合法 payload、非法字段、缺失 workspace、旧 protocol version、错误脱敏测试。
- [ ] C01.7 更新 README 的 schema version 和 async command 语义；写 ADR-0002。
- [ ] C01.8 运行 `pnpm --filter @nexora/contracts test --run && pnpm typecheck`。
- [ ] C01.9 保存 schema test 输出到 `artifacts/progress/c01/`，完成 G1 的 curl schema error 检查。
- [ ] C01.10 代码审查确认后续模块只能从 `@nexora/contracts` 导入，不能复制状态字符串。
- [ ] C01.11 创建 C01 commit，记录完整 SHA 并更新总览矩阵。

**自动化命令：** `pnpm --filter @nexora/contracts test --run && pnpm typecheck`  
**人工 QA：** G1  
**证据目录：** `artifacts/progress/c01/`

**阻塞记录：** 当前无阻塞。

### C02 / SQLite Schema and Domain Repositories

**阶段状态：** `[ ]` 未开始  
**目标：** SQLite 成为领域状态事实源，迁移、唯一约束和状态机可重建。  
**依赖：** C01  
**计划提交：** `feat: add sqlite domain schema and repositories`

- [ ] C02.1 确认 contracts schema 已冻结并通过 C01 收口。
- [ ] C02.2 创建 `packages/persistence/src/db.ts`、`schema.ts` 和 `migrations/0001_core.sql`。
- [ ] C02.3 创建 workspace、agent、goal、ticket、run、attempt、step、artifact、receipt、review、idempotency 表及索引/唯一约束。
- [ ] C02.4 创建各 domain repository；写入必须经过事务、`expected_version` 和 workspace scope。
- [ ] C02.5 创建 `packages/domain/src/run-state.ts`，覆盖 queued/running/paused/waiting_review/partial/failed/succeeded/cancelled 合法转移。
- [ ] C02.6 写 migrate up/down、唯一键、乐观并发、Attempt 不覆盖和非法状态转移测试。
- [ ] C02.7 更新配置中的 DB path/migration mode；写 ADR-0003。
- [ ] C02.8 运行 `pnpm db:migrate`、persistence/domain 测试和 `pnpm typecheck`。
- [ ] C02.9 删除内存状态后从 SQLite 查询完整 Goal/Ticket/Run/Step/Artifact/Review 关系，保存查询结果到 `artifacts/progress/c02/`。
- [ ] C02.10 完成 G1 的 API/schema 和迁移 smoke，确认没有真实 connector。
- [ ] C02.11 审查迁移回滚、SQL 注入边界、事务范围和默认数据库权限。
- [ ] C02.12 创建 C02 commit，记录完整 SHA。

**自动化命令：** `pnpm db:migrate && pnpm --filter @nexora/persistence test --run && pnpm --filter @nexora/domain test --run && pnpm typecheck`  
**人工 QA：** G1  
**证据目录：** `artifacts/progress/c02/`

**阻塞记录：** 当前无阻塞。

### C03 / Append-only Event Store and Projections

**阶段状态：** `[ ]` 未开始  
**目标：** 事件不可变、可分页、可去重、可投影重建，SSE 断线可续传。  
**依赖：** C02  
**计划提交：** `feat: add append-only event store and projections`

- [ ] C03.1 确认 C02 migration 和 domain state machine 均为绿色。
- [ ] C03.2 增加 `events`、`projection_checkpoints` 表；禁止历史 Event update/delete API。
- [ ] C03.3 实现 `append(event, expectedSequence)`，校验 event_id、sequence、workspace scope 和事务原子性。
- [ ] C03.4 实现 Run/Step/Artifact/Review 投影 reducer 和 `rebuildProjection(runId)`。
- [ ] C03.5 实现 `listEvents(runId, after, limit)`、next cursor、last event ID 和 cursor expired 错误。
- [ ] C03.6 实现 SSE consumer 的 event_id 去重和断线补拉。
- [ ] C03.7 写重复事件、乱序、投影失败、重建、已有 Artifact 不重复创建测试。
- [ ] C03.8 将 projection lag 纳入 health route。
- [ ] C03.9 运行 event-store 单测、integration test 和 typecheck，保存 `artifacts/progress/c03/`。
- [ ] C03.10 完成 G2：断开 SSE、恢复连接、验证事件顺序和 last_event_id。
- [ ] C03.11 审查 append-only 约束、游标过期处理和投影重建幂等性；写 ADR-0004。
- [ ] C03.12 创建 C03 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/event-store test --run && pnpm test:integration && pnpm typecheck`  
**人工 QA：** G2  
**证据目录：** `artifacts/progress/c03/`

**阻塞记录：** 当前无阻塞。

### C04 / Policy, Scope, Risk, Egress, and Redaction

**阶段状态：** `[ ]` 未开始  
**目标：** API、worker、connector 三层共同执行角色、scope、风险和数据出境策略。  
**依赖：** C02；可并行使用 C03 已定义的事件类型，但必须在 C03 收口后合并。  
**计划提交：** `feat: add policy scope and risk enforcement`

- [ ] C04.1 确认 C02/C03 的 contracts、EventEnvelope 和 repository 已可用。
- [ ] C04.2 创建 Owner/Operator/Reviewer/Viewer/Agent 角色和 R0-R3 风险决策矩阵。
- [ ] C04.3 实现 `assertScope`，在 API handler、worker command handler、connector executor 三处调用。
- [ ] C04.4 实现 local/remote、provider、region、data classification 的 egress allow/deny policy。
- [ ] C04.5 实现统一 secret redaction，覆盖日志、错误、Event payload、Artifact preview 和截图数据。
- [ ] C04.6 将 `scope.denied`、`policy.denied`、`secret.redacted` 写入事件账本。
- [ ] C04.7 写越权、R3 无审批、prompt injection 不改变策略、SSRF/path traversal、secret sentinel 测试。
- [ ] C04.8 运行 policy 单测、`tests/integration/policy-boundary.test.ts` 和 typecheck。
- [ ] C04.9 完成 G3：Site A Agent 请求 Site B Memory，尝试 R3 connector，确认无外部调用。
- [ ] C04.10 审查策略默认拒绝、错误信息不泄密、remote 最小快照规则；写 ADR-0005。
- [ ] C04.11 创建 C04 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/policy test --run && pnpm test:integration && pnpm typecheck`  
**人工 QA：** G3  
**证据目录：** `artifacts/progress/c04/`

**阻塞记录：** 当前无阻塞。

### C05 / Durable Queue, Lease, Fencing, and Recovery

**阶段状态：** `[ ]` 未开始  
**目标：** worker 可安全领取、续租、接管和恢复 Step，且旧 worker 不能写入新状态。  
**依赖：** C03、C04  
**计划提交：** `feat: add durable orchestration queue and recovery`

- [ ] C05.1 确认事件、policy、domain repositories 已收口，记录基线 SHA。
- [ ] C05.2 增加 `queue_jobs`、`leases` 表和 durable enqueue transaction。
- [ ] C05.3 实现 30 秒 lease、heartbeat、renew、expiry 和 recovery candidate。
- [ ] C05.4 实现 fencing token；所有 Event/Artifact/Receipt 写入验证 token 与当前 lease 匹配。
- [ ] C05.5 实现 Attempt 创建、retry failed step only、指数退避、权限错误不重试。
- [ ] C05.6 实现 pause/resume/cancel 状态传播和 `cancel_requested`/`cancel_unknown`。
- [ ] C05.7 实现 token/cost/duration budget gate，超预算阻止新 Step。
- [ ] C05.8 注入 worker crash、lease expiry、旧 worker late event、cancel race、partial success 测试。
- [ ] C05.9 启动两个 worker，验证同一 Step 只有一个有效 fencing token，保存日志到 `artifacts/progress/c05/`。
- [ ] C05.10 完成 G4：杀 worker、等待 lease 过期、重启，确认 Run 从最后事件恢复。
- [ ] C05.11 审查队列事务隔离、lease 时钟、幂等 key 和旧 token 的拒绝路径；写 ADR-0006。
- [ ] C05.12 创建 C05 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/orchestration test --run && pnpm test:integration && pnpm typecheck`  
**人工 QA：** G4  
**证据目录：** `artifacts/progress/c05/`

**阻塞记录：** 当前无阻塞。

### C06 / Deterministic and Local Runtime Adapters

**阶段状态：** `[ ]` 未开始  
**目标：** 标准 RuntimeEnvelope 能连接 deterministic fixture 和受限 local subprocess。  
**依赖：** C05  
**计划提交：** `feat: add deterministic and local runtime adapters`

- [ ] C06.1 确认 queue/recovery smoke 通过，记录 C05 SHA。
- [ ] C06.2 实现 RuntimeAdapter interface：capabilities/start/send/cancel/health/collect。
- [ ] C06.3 为 hello/start/event/heartbeat/resume/cancel/cancel_ack/close 定义 protocol version、message_id、sequence、cursor、deadline、lease/fencing 字段。
- [ ] C06.4 实现 deterministic adapter fixture：success、judge fail、timeout、partial、review-needed 五种脚本。
- [ ] C06.5 实现 local subprocess adapter：allowlist executable、固定 cwd、逐行 JSON stdout、脱敏 stderr、无任意 shell。
- [ ] C06.6 实现 resume、protocol mismatch、process crash、cancel timeout 和 unknown cancel。
- [ ] C06.7 写 adapter contract、旧 fencing token、secret scan、fixture E2E 测试。
- [ ] C06.8 运行 adapter 测试、runtime integration 和 typecheck。
- [ ] C06.9 完成 G5：启动 fixture Run，执行 pause/resume/cancel，检查 timeline 和 receipt。
- [ ] C06.10 审查进程边界、命令 allowlist、输出大小/超时和日志 redaction；写 ADR-0007。
- [ ] C06.11 创建 C06 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/runtime-adapters test --run && pnpm test:integration && pnpm typecheck`  
**人工 QA：** G5  
**证据目录：** `artifacts/progress/c06/`

**阻塞记录：** 当前无阻塞。

### C07 / Memory Vault, Artifact Store, and Provenance

**阶段状态：** `[ ]` 未开始  
**目标：** Memory 有 scope/version/provenance，Artifact 不可变且能反查 Run/Ticket/Receipt。  
**依赖：** C02、C03、C04  
**计划提交：** `feat: add scoped memory vault and artifact provenance`

- [ ] C07.1 确认 workspace root、policy scope 和 Event Store 已收口。
- [ ] C07.2 创建 vault 目录：About、Sites、Agents、Skills、Tickets、Reports、Artifacts、Runs。
- [ ] C07.3 实现 vault path resolver，拒绝 `..`、绝对路径、符号链接逃逸和跨 workspace 读取。
- [ ] C07.4 实现 `read(scope, path)`，返回 content、note version、source refs、trust state。
- [ ] C07.5 实现 `write(path, baseVersion, content)`，冲突生成候选版本并进入 Review。
- [ ] C07.6 实现 snapshots、rollback、provenance、source receipt 和 `[unverified]` 标记。
- [ ] C07.7 实现 immutable Artifact Store：content hash、version、metadata、preview 和 receipt refs。
- [ ] C07.8 写 scope denial、path traversal、memory conflict、rollback、Artifact provenance 测试。
- [ ] C07.9 运行 memory/artifact 单测、provenance integration 和 typecheck。
- [ ] C07.10 完成 G6：两个 Run 修改同一 Memory note，观察冲突 Review 和版本 diff。
- [ ] C07.11 审查 vault 备份、敏感字段、内容 hash、文件权限和失败写入恢复；写 ADR-0008。
- [ ] C07.12 创建 C07 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/memory test --run && pnpm --filter @nexora/artifacts test --run && pnpm test:integration && pnpm typecheck`  
**人工 QA：** G6  
**证据目录：** `artifacts/progress/c07/`

**阻塞记录：** 当前无阻塞。

### C08 / Connector Contracts and Review Gate

**阶段状态：** `[ ]` 未开始  
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

**阶段状态：** `[ ]` 未开始  
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

**阶段状态：** `[ ]` 未开始  
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

**阶段状态：** `[ ]` 未开始  
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

**阶段状态：** `[ ]` 未开始  
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

**阶段状态：** `[ ]` 未开始  
**目标：** local/remote 是明确选择，remote 只接收最小脱敏 snapshot，并记录出境证据。  
**依赖：** C04、C05、C06、C07  
**计划提交：** `feat: add remote runtime adapter and egress receipts`

- [ ] C13.1 确认 remote 仍是显式 opt-in，默认 local-only。
- [ ] C13.2 创建 remote worker server、snapshot builder 和 adapter；不挂载完整 vault，不携带 secret。
- [ ] C13.3 复用 hello/start/event/heartbeat/resume/cancel/close，强制短期 token、protocol version、cursor、deadline、fencing token。
- [ ] C13.4 写 egress receipt：location/provider/region/data classification/redaction count/policy decision/snapshot hash。
- [ ] C13.5 切换 local/remote 时创建新 Attempt，保留旧 Attempt 和失败证据。
- [ ] C13.6 注入网络断开、remote crash、旧 token、scope denial、provider denial、snapshot secret scan。
- [ ] C13.7 运行 remote integration、recovery tests 和 typecheck。
- [ ] C13.8 完成 G10：断网时显示 paused/queued，不得静默 fallback；恢复后从 cursor/lease 恢复。
- [ ] C13.9 审查最小数据原则、token 生命周期、region/data classification 记录和 remote worker 日志。
- [ ] C13.10 创建 ADR-0012、runbook，并创建 C13 commit，记录完整 SHA。

**自动化命令：** `pnpm vitest run tests/integration/remote-egress.test.ts tests/integration/remote-recovery.test.ts && pnpm typecheck`  
**人工 QA：** G10  
**证据目录：** `artifacts/progress/c13/`

**阻塞记录：** 当前无阻塞。

### C14 / Durable Schedules and Occurrences

**阶段状态：** `[ ]` 未开始  
**目标：** Schedule 重启、misfire、时区、overlap 和 dedupe 行为由持久化状态重建。  
**依赖：** C03、C05、C12  
**计划提交：** `feat: add durable schedules and occurrences`

- [ ] C14.1 创建 Schedule/ScheduleOccurrence contracts、表和 API route；UTC 存储、workspace timezone 展示。
- [ ] C14.2 实现 cron/interval/manual scheduler、`next_fire_at`、`last_fire_at`、expression revision。
- [ ] C14.3 实现 `run_once_after_recovery`、`skip_if_active`、`queue_after_active`、`cancel_previous`。
- [ ] C14.4 实现 occurrence dedupe key 和多 scheduler 竞争创建。
- [ ] C14.5 记录 `schedule.fired`，即使触发被权限、预算或 overlap policy 拒绝。
- [ ] C14.6 写重启、misfire、DST ambiguous/skipped、overlap、disable、重复 enqueue 测试。
- [ ] C14.7 运行 scheduler unit/integration、typecheck 和 API smoke。
- [ ] C14.8 完成 G11：重启 scheduler，观察 occurrence rows、schedule events 和唯一 Run。
- [ ] C14.9 审查时区数据库、DST 策略、scheduler lease 和 schedule scope；写 `docs/runbooks/scheduler-operations.md`。
- [ ] C14.10 创建 C14 commit，记录完整 SHA。

**自动化命令：** `pnpm --filter @nexora/orchestration test --run && pnpm vitest run tests/integration/schedule-recovery.test.ts && pnpm typecheck`  
**人工 QA：** G11  
**证据目录：** `artifacts/progress/c14/`

**阻塞记录：** 当前无阻塞。

### C15 / Observability, Backup, Quarantine, and Audit Export

**阶段状态：** `[ ]` 未开始  
**目标：** 运行、成本、健康、备份、审计完整性和 connector quarantine 可观察、可恢复。  
**依赖：** C08、C09、C13、C14  
**计划提交：** `chore: add observability recovery and security operations`

- [ ] C15.1 实现 structured logger、trace fields、health checks、metrics 和 cost fields。
- [ ] C15.2 确保 receipt 能回答 actor/runtime/provider/model/location/memory/tools/result/side effects 五类问题。
- [ ] C15.3 实现 API p95、event lag、queue wait、Run duration、cost variance、connector success/timeout/auth failure 指标。
- [ ] C15.4 实现 SQLite WAL checkpoint、DB snapshot、vault snapshot、Artifact hash manifest 和 restore script。
- [ ] C15.5 实现 event projection rebuild、audit integrity hash 和 tamper detection。
- [ ] C15.6 实现 connector `quarantined` 状态；重复高风险副作用或 audit integrity failure 自动隔离，Owner 才能解除。
- [ ] C15.7 写 API/DB/queue/connector/network 故障演练、secret scan、restore smoke、cost budget alert 测试。
- [ ] C15.8 运行 observability、backup/restore、security tests 和 typecheck。
- [ ] C15.9 完成 G12：恢复 DB/vault/Artifact 备份，验证事件投影和审计完整性。
- [ ] C15.10 审查备份中无 secret、归档不修改事件事实、quarantine 有解除原因；写三个 runbook。
- [ ] C15.11 创建 C15 commit，记录完整 SHA。

**自动化命令：** `pnpm test:integration && pnpm vitest run tests/security/quarantine.test.ts tests/integration/backup-restore.test.ts tests/integration/observability.test.ts && pnpm typecheck`  
**人工 QA：** G12  
**证据目录：** `artifacts/progress/c15/`

**阻塞记录：** 当前无阻塞。

### C16 / Release Hardening and Full QA

**阶段状态：** `[ ]` 未开始  
**目标：** 新环境可复现启动，CI、全量测试、移动/无障碍/视觉和故障演练全部有证据。  
**依赖：** C00-C15 全部收口  
**计划提交：** `chore: harden release and complete agent os qa`

- [ ] C16.1 创建 API/worker/web Dockerfile、Compose health checks 和 data volumes。
- [ ] C16.2 创建 demo seed fixture：workspace、agent、goal、ticket、memory、draft workflow；创建 fault injection fixture。
- [ ] C16.3 将 schema/domain/adapter/connector/integration/security/E2E/visual/accessibility 命令接入 CI。
- [ ] C16.4 写 Operator、Reviewer、Mobile Inbox、recovery、deep link、SSE reconnect、partial success、permission denied E2E。
- [ ] C16.5 在 390x844 视口验证 Inbox 审批、暂停、恢复、重试和 receipt；复杂编辑转桌面。
- [ ] C16.6 运行 axe、键盘 focus、ARIA、对比度、44px touch target 和 `prefers-reduced-motion` smoke。
- [ ] C16.7 执行 worker crash、DB restore、connector outage、network loss recovery drill。
- [ ] C16.8 运行最终命令：`pnpm lint && pnpm typecheck && pnpm test --run && pnpm test:integration && pnpm test:e2e`。
- [ ] C16.9 将测试日志、screenshots/traces、audit export、restore report、manual QA checklist 写入 `artifacts/qa/c16-release/`。
- [ ] C16.10 完成 G13；逐项核对实施方案 Definition of Done，任何缺口不得标记完成。
- [ ] C16.11 更新 README、development/release/e2e runbooks，记录已知限制和下一阶段候选项。
- [ ] C16.12 创建 C16 commit，记录完整 SHA，并把总览状态改为 `released_candidate`。

**自动化命令：** `pnpm lint && pnpm typecheck && pnpm test --run && pnpm test:integration && pnpm test:e2e`  
**人工 QA：** G13  
**证据目录：** `artifacts/progress/c16/` 和 `artifacts/qa/c16-release/`

**阻塞记录：** 当前无阻塞。

## 5. 跨阶段质量检查

这些检查不是某一个 commit 的替代品，必须在对应阶段完成并在 C16 再次复核。

- [ ] Q01 所有 API、Event、RuntimeEnvelope、Connector input/output 都包含 `schema_version`，旧版本拒绝或显式迁移。
- [ ] Q02 所有领域写入通过 domain command/repository，不允许 adapter、connector 或 UI 直接写任意数据库表。
- [ ] Q03 所有 Run 都能从 Event + projection 重建，Run/Attempt/Step/Event 没有合并成一条聊天记录。
- [ ] Q04 所有副作用操作都有 idempotency key；相同 key 不重复执行，不同 payload 返回冲突。
- [ ] Q05 所有 lease 写入验证 fencing token；旧 worker 的 late event 被拒绝并记录 `STALE_LEASE`。
- [ ] Q06 所有 R3 操作都有 preview、authorize、execute、verify；`side_effect_unknown` 冻结再次执行。
- [ ] Q07 所有 Memory 事实带 source/provenance/trust state；冲突不静默覆盖，支持 snapshot/rollback。
- [ ] Q08 所有 Artifact 可反查 Ticket、Run、Agent、输入、验证、Judge、Review 和外部 receipt。
- [ ] Q09 所有 remote Run 的 receipt 包含 execution location、provider、region、data classification、redaction 和 snapshot hash。
- [ ] Q10 所有日志、错误、Event、Artifact preview、截图和备份完成 secret redaction 扫描。
- [ ] Q11 所有 UI 写操作区分 submitting/success/conflict/permission/offline，不能以 HTTP 200 直接显示业务成功。
- [ ] Q12 所有页面有 Loading、Empty、Offline、Error、Permission denied、Partial success 可观察状态。
- [ ] Q13 所有高风险审批显示 diff、证据、成本、风险、scope、payload hash 和精确 reviewer。
- [ ] Q14 所有恢复演练同时核对内部 receipt 和外部状态，不能只检查 UI。

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

## 8. 完成判定

只有同时满足以下条件，才可把整个清单标记为 `released_candidate`：

1. C00-C16 全部为 `[x]`，没有未解释的 `[!]`。
2. Q01-Q14 全部为 `[x]`，或在发布记录中明确记录不适用原因。
3. 实施方案中的 Definition of Done 七项全部有自动化或故障演练证据。
4. G0-G13 全部有人工观察记录，且截图、日志、trace、receipt 或 restore report 可定位。
5. 最终工作树、CI、README 和 runbook 一致；不存在未提交的实现文件或未解释的用户改动。
6. 最终 commit SHA、测试摘要、残余风险和后续非阻塞工作已写入本文件最后一条 Handoff。
