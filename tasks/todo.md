# Nexora Agent OS Plan Tracking

计划来源：`docs/agent-os-design.md`，并参考其中对 `qMvkdMzuYjs`（Hermes Agent OS FULL COURSE）的证据边界说明。

- [x] 完成仓库、设计规格、AionUi 对比资料和来源限制的只读调研
- [x] 固定 TypeScript 单栈、SQLite 事实源、Markdown Memory、Runtime Adapter 的总体实现边界
- [x] 编写 17 个分阶段 commit 的详细实施计划
- [x] 为每个阶段定义文件边界、自动化测试、人工 QA 和退出条件
- [x] 执行规格覆盖、依赖一致性、占位符和提交边界自审
- [x] 生成可持续更新的 C00-C16 开发进度清单、质量门、QA 门和交接模板
- [x] 形成融合 Agent OS 与 AionUI 的完整前端 UI 规格和可复用设计系统契约
- [x] 将设计系统与前端 UI 规格转换为中文，并补充 UI 设计图与响应式布局图

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
- 来源边界：YouTube 原始页面在本机返回连接重置；计划只采用设计文档已记录的可访问索引/关联资料，不把视频中的营销表述当成性能、成本或安全承诺。
- 进度清单：已生成 `tasks/agent-os-progress.md`，包含 C00-C16 子任务、Q01-Q14 跨阶段质量门、G0-G13 人工 QA、阻塞记录、变更记录和交接模板。
- 前端契约：C10-C16 必须以中文 UI 规格、中文 DESIGN 和中文图册的路由、状态、交互、布局与验收清单为产品决策输入，并遵守英文契约中相同的 tokens、原语、响应式与无障碍规则；英文文档作为术语和来源对照，偏离前先记录 ADR 和计划变更。
- 中文交付：C10-C16 实施优先阅读中文设计系统、中文 UI 规格和中文图册；英文文档继续作为术语与来源对照，不得因翻译而改变 route、schema、状态 token、R0-R3 或审计语义。
