# Nexora Agent OS UI 图谱图集（中文）

> 本图集是实现规格，不是已实现 UI 的声明。令牌、组件与状态以 [Nexora 设计系统中文文档](../DESIGN.zh-CN.md) 为准；产品交互以 [Nexora Agent OS 中文 UI 规范](nexora-agent-os-ui-design.zh-CN.md) 为准。尺寸来自中文 [DESIGN](../DESIGN.zh-CN.md)，英文 [DESIGN.md](../DESIGN.md) 仅作术语对照。

## 1. 产品与证据主链

```mermaid
flowchart LR
    Intent["Cowork 意图 / Create 命令"] --> Goal["Goal / 完成定义"]
    Goal --> Ticket["Ticket / 执行单元"]
    Ticket --> Run["Run / 运行"]
    Run --> Attempt["Attempt / Step / Event"]
    Attempt --> Artifact["Artifact 版本"]
    Artifact --> Judge["独立 Judge"]
    Judge --> Review["人工 Review（需要时）"]
    Review --> Receipt["验证回执 / 结果"]
    Receipt --> Memory["有来源记忆 / 规则"]
    Memory -. 后续上下文 .-> Intent
```

| 实现注释 | 规定 |
|---|---|
| 区域 | 意图入口、持久对象链、证据回链；每个节点可深链。 |
| 尺寸/响应式 | 桌面横向展示；移动端改为垂直步骤列表，节点不丢失。 |
| 主操作 | 从当前节点打开下游对象或证据检查器。 |
| 安全约束 | 对话状态不是事实源；副作用仅由持久事件、当前策略和回执确认。 |

## 2. 桌面 App Shell 几何

```mermaid
flowchart LR
    Nav["导航 232px\n（>=1440px）"] --> Canvas["主画布\nfluid / route scroll owner"]
    Top["顶栏 56px\n范围、搜索、Create、同步"] --> Canvas
    Canvas --> Rail["证据栏 336px（可选）\n上下文、策略、下一步"]
    Canvas -. 1024-1439 .-> Drawer["证据抽屉\n可调整宽度"]
    Canvas -. <768 .-> Sheet["单窗格 + Sheet\n底部五项导航"]
```

| 实现注释 | 规定 |
|---|---|
| 区域 | 固定导航、56px 顶栏、主画布、按路由启用的证据栏。 |
| 尺寸/响应式 | >=1440：232px + 336px rail；1024-1439：216px + 抽屉；768-1023：64px 图标栏；<768：单窗格。 |
| 主操作 | 顶栏 `Create` 或路由主按钮；跳过导航仍可到达标题。 |
| 安全约束 | 主内容只有一个滚动所有者；证据抽屉不遮住正在编辑的确认字段。 |

## 3. Mission Control 信息布局

```mermaid
flowchart TB
    Header["范围 / 搜索 / Create"]
    Attention["Needs Attention\n严重度、年龄、下一安全动作"]
    Active["Active Runs\n阶段、预算、暂停"]
    Lower["Goals + Recent Artifacts\n可钻取列表"]
    Rail["Run Health\n模型路由\nApproval Queue"]
    Header --> Attention --> Active --> Lower
    Lower -. 证据检查器 .-> Rail
```

| 实现注释 | 规定 |
|---|---|
| 区域 | 顶部范围栏；关注项优先；运行中；目标/制品；右侧健康与批准。 |
| 尺寸/响应式 | 宽屏 12 列；窄桌面 rail 改抽屉；移动端按关注、运行、目标堆叠。 |
| 主操作 | 打开关注项、暂停获准运行、进入 Review 或创建工作。 |
| 安全约束 | 计数必须链接到明细；禁止无范围的“运行全部”；暂停需显示副作用影响。 |

## 4. Quick Cowork 到 Run

```mermaid
sequenceDiagram
    participant O as Operator
    participant C as Quick Cowork
    participant P as Policy
    participant R as Run
    participant E as Evidence
    O->>C: 描述结果并确认工作区
    C->>P: 重新评估范围、工具、风险
    P-->>C: 推荐配置 / R0-R3
    C->>R: 提交幂等命令
    R-->>C: Accepted + command_id
    R->>E: 写入 Attempt / Step / Event
    C-->>O: 进度摘要 + Open Run
```

| 实现注释 | 规定 |
|---|---|
| 区域 | 对话时间线、配置芯片、命令提交、Run 深链、证据事件。 |
| 尺寸/响应式 | 桌面可开上下文抽屉；移动端保留 composer 与 Run 深链，复杂配置进 Sheet。 |
| 主操作 | `Start` 提交命令；状态先显示 Accepted/Queued，不伪装完成。 |
| 安全约束 | 服务端再次评估策略；确认不可扩大范围；幂等键在飞行中禁用重复提交。 |

## 5. Run Detail 布局

```mermaid
flowchart LR
    Summary["Run 摘要\n状态 / 范围 / 风险 / 预算"] --> Timeline["Timeline\nAttempt > Step > Event"]
    Timeline --> Selected["选中事件 / Step\n输入输出与日志"]
    Selected --> Recovery["恢复动作\n暂停 / 重试 / 对账"]
    Summary --> Inspector["证据检查器\n模型、运行时、出站、回执"]
```

| 实现注释 | 规定 |
|---|---|
| 区域 | 摘要头、事件时间线、选中步骤面板、证据 rail、恢复区。 |
| 尺寸/响应式 | >=1440 并排；中等屏 rail 为抽屉；移动端先摘要后事件，日志为命名 reel。 |
| 主操作 | 打开事件证据；仅按策略允许暂停、恢复或重试。 |
| 安全约束 | `side_effect_unknown` 冻结重试并进入对账；事件游标恢复不重复计数。 |

## 6. Review Center / R3 决策与状态流

```mermaid
flowchart TB
    Queue["Review 队列\nR2 / R3 / 过期"] --> Sheet["决策面板\nDiff、目标、出站、回滚"]
    Sheet --> Hash{"载荷哈希与证据完整？"}
    Hash -- 否 --> Block["禁用决策\n刷新或请求修改"]
    Hash -- 是 --> Decision{"Reviewer 决策"}
    Decision -- 批准 --> Execute["执行并等待回执"]
    Decision -- 拒绝 --> Rejected["Rejected + 理由"]
    Decision -- 请求修改 --> NewVersion["新 Artifact 版本\n新哈希 / 新 Review"]
    Execute --> Receipt["Verified Receipt"]
```

| 实现注释 | 规定 |
|---|---|
| 区域 | 队列、证据标签页、哈希/过期检查、决策按钮、回执。 |
| 尺寸/响应式 | 桌面可同时看 diff 与检查器；移动端仅证据摘要与深链，R3 不压缩成三列。 |
| 主操作 | 通过完整检查后批准、拒绝或请求修改。 |
| 安全约束 | R3 必须精确当前 hash、范围、出站、成本、期限和 Reviewer；Judge 不等于批准。 |

## 7. Artifact 与 Memory 关系

```mermaid
flowchart LR
    Source["Run 输出 / 外部来源"] --> Version["Artifact vN\n固定 hash"]
    Version --> Preview["Preview / Diff / Source / Receipt"]
    Version --> Review["Review 决策绑定"]
    Receipt["Verified Receipt"] --> Memory["Memory 条目"]
    Memory --> Provenance["来源、信任、范围、消费者"]
    Provenance -. 允许的上下文 .-> Cowork["Quick Cowork"]
    Version -->|编辑| New["Artifact vN+1\n使旧批准失效"]
```

| 实现注释 | 规定 |
|---|---|
| 区域 | 制品版本头、渲染标签页、来源/回执、记忆来源与消费者。 |
| 尺寸/响应式 | 桌面支持 diff；移动端显示固定版本摘要，复杂 diff 转桌面。 |
| 主操作 | 打开版本、复制来源、从回执提议记忆或创建新版本。 |
| 安全约束 | 编辑始终产生新版本；记忆不能静默继承对话，敏感内容按范围脱敏。 |

## 8. Team / Workflow / Schedule

```mermaid
flowchart LR
    Team["Team Cockpit\n负责人 / 槽位 / 交接"] --> Ticket["子 Ticket"]
    Ticket --> Run["子 Run\n独立策略"]
    Workflow["Workflow 版本\n节点 / 质量门"] --> Occurrence["Schedule Occurrence"]
    Occurrence --> Run
    Run --> Judge["Judge / Review gate"]
    Judge --> Outcome["回执或修订"]
```

| 实现注释 | 规定 |
|---|---|
| 区域 | 团队槽位、任务交接、工作流版本、计划发生、运行历史。 |
| 尺寸/响应式 | 桌面可读图；平板显示有序 station 列表；移动端只看状态与发生记录。 |
| 主操作 | 分配子 Ticket、查看节点、暂停计划或打开某次 occurrence。 |
| 安全约束 | 负责人不继承全部权限；每个槽位单独策略；计划创建 durable occurrence，绝不重放旧对话。 |

## 9. 移动端五项 IA 与页面栈

```mermaid
flowchart TB
    Top["56px 顶栏：Start / 范围 / 同步"]
    Stack["单一页面栈\n当前目的地列表 -> 详情 -> evidence sheet"]
    Bottom["固定底栏（恰好五项）"]
    Top --> Stack --> Bottom
    Bottom --> Inbox["Inbox\n未解决数"]
    Bottom --> Runs["Runs\n活跃数"]
    Bottom --> Goals["Goals\n阻塞数"]
    Bottom --> Review["Review\n可操作数"]
    Bottom --> More["More\nCowork / 制品 / 记忆 / 团队 / 设置"]
```

| 实现注释 | 规定 |
|---|---|
| 区域 | 56px 顶栏、一个主滚动窗格、详情路由或 action sheet、五项固定底栏。 |
| 尺寸/响应式 | <768px；触控目标至少 44x44px、间距至少 8px；主内容不水平溢出。 |
| 主操作 | 顶栏 `Start` 打开 Quick Cowork；从列表进入深链详情。 |
| 安全约束 | More 不新增底栏项；R3 仅在证据摘要完整时操作，复杂编辑显示“在桌面继续”。 |

## 10. 响应式断点转换

```mermaid
flowchart LR
    Wide[">=1440\n232 nav + 56 top + 336 rail"] --> Desktop["1024-1439\n216 nav + rail drawer"]
    Desktop --> Tablet["768-1023\n64 icon rail + labelled drawer"]
    Tablet --> Mobile["<768\n单窗格 + 五项底栏 + sheet"]
```

| 实现注释 | 规定 |
|---|---|
| 区域 | 导航、内容列、证据栏、交互入口的断点策略。 |
| 尺寸/响应式 | 使用 intrinsic grid；375px 主内容无横向滚动，代码/diff/图仅在命名 reel 内滚动。 |
| 主操作 | 每个断点保留同一主动作，改变承载方式（并排、抽屉、sheet）。 |
| 安全约束 | 断点切换不丢筛选、选中 tab、范围或未提交草稿；Back 恢复 URL 状态。 |

## 11. Route Map

```mermaid
flowchart TB
    Shell["AppShell / scope"] --> MC["/mission-control"]
    Shell --> Cowork["/cowork/:conversationId?"]
    Shell --> Inbox["/inbox"]
    Shell --> Work["/goals | /tickets | /runs/:runId"]
    Shell --> Evidence["/review/:reviewId | /artifacts/:artifactId | /memory/:memoryId"]
    Shell --> Build["/teams/:teamId | /workflows/:workflowId? | /schedules/:scheduleId?"]
    Shell --> System["/registry/:kind? | /control-room | /settings/:section?"]
    MC -->|attention deep link| Work
    Cowork -->|Run / artifact| Work
    Work --> Evidence
    Build --> Work
```

| 实现注释 | 规定 |
|---|---|
| 区域 | Shell 统一范围与权限；工作台、工作、证据、构建、系统路由分组。 |
| 尺寸/响应式 | 路由内容遵循 App Shell 断点；移动端 More 承载非核心目的地。 |
| 主操作 | 深链打开具体对象并保留 `workspace/site/project`、筛选、游标、tab。 |
| 安全约束 | URL 是可恢复视图状态，不是授权来源；每次变更仍在服务端校验。 |

## 12. 共享状态生命周期

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Validating: submit
    Validating --> Denied: scope/policy
    Validating --> Accepted: 202 + command_id
    Accepted --> Queued
    Queued --> Running
    Running --> WaitingReview: R2/R3 gate
    WaitingReview --> Running: approved
    WaitingReview --> Rejected: rejected
    Running --> Partial: mixed step result
    Running --> Blocked: dependency/permission
    Running --> Completed: verified terminal event
    Running --> Unknown: side_effect_unknown
    Unknown --> Reconciling: inspect external state
    Reconciling --> Running: policy-safe retry
    Reconciling --> Blocked: unresolved
    Denied --> Draft: change scope/request access
    Rejected --> Draft: new payload/version
```

| 实现注释 | 规定 |
|---|---|
| 区域 | Draft、策略校验、命令接受、队列/运行、Review、终态与恢复。 |
| 尺寸/响应式 | 所有尺寸显示同一标签与图标；移动端以 StatePlane 卡片堆叠，状态不靠颜色单独表达。 |
| 主操作 | 用户只能触发当前状态允许的下一动作；完成须有验证终态事件。 |
| 安全约束 | 202/Accepted 不等于完成；离线不排队高风险批准；未知副作用先对账再重试。 |

## 实施检查清单

- [ ] 每个节点、行、计数均有范围、时间戳和证据深链。
- [ ] R3 决策面板在哈希、证据、期限、角色任一缺失时禁用批准。
- [ ] 375px、768px、1024px、1440px 验证滚动所有者、焦点顺序和五项移动导航。
- [ ] 所有状态同时提供可读标签、图标和下一安全动作；不得以颜色单独表达。
