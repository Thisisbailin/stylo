# Qalam 多项目隔离架构

## 目标

Qalam 的一次运行必须且只能属于一个 Flow Project。项目切换不得复用另一项目的对话、模型记忆、工具活动、审批状态、角色素材或异步执行结果。

## 核心不变量

1. `projectId` 是一次 Qalam run 的不可变作用域。
2. `sessionId` 必须包含项目作用域，格式为 `qalam:{encodedProjectId}:{encodedConversationId}`。
3. 客户端只向 Agent 发送当前项目的 FlowProject 快照，不发送其它项目的 Flow。
4. 服务端必须同时校验 `run.projectId`、`run.sessionId` 和 `projectData.activeFlowProjectId`。
5. Agent 工具只能绑定到该请求内的单项目 bridge，不得通过顶层 `flowProjects` 访问其它项目。
6. 返回结果的 `projectId` 与当前项目不同，客户端必须丢弃，不能合并 Flow。
7. 切换项目时取消旧 run，并清空全局 NodeFlow store 中的临时执行/审批状态。

## 状态归属

| 状态 | 作用域 | 实现 |
| --- | --- | --- |
| 对话列表与消息 | 项目 | `qalam_conversations_v2:{projectId}` |
| Agent session / 压缩记忆 | 项目 + 对话 | 带项目名前缀的 `sessionId` 与 D1 `session_key` |
| 工具活动摘要 | 项目 | `qalam_agent_tool_activity_v2:{projectId}` |
| Flow、角色、设计素材 | 项目 | `FlowProject.flow/roles/designAssets` |
| 生成审批、当前执行指针 | 当前挂载项目的临时态 | 项目切换时重置 |
| Provider、模型与工具开关 | 用户/应用 | 继续全局共享，不属于项目内容 |

`ProjectData.flow/roles/designAssets` 保留为当前项目的运行时投影。切换前写回当前 `FlowProject`，切换后从目标 `FlowProject` 装载，避免大范围重写现有 UI 和 store 接口。

## 项目切换顺序

1. 保存当前顶层投影到旧 `FlowProject`。
2. 设置新的 `activeFlowProjectId`。
3. 装载目标项目的 Flow、角色和设计素材到顶层投影。
4. 以新的 React `key` 重建 Qalam 和历史面板；旧组件卸载时 abort 当前请求。
5. 清空临时执行状态和待审批状态。
6. 新项目使用独立 localStorage key 和 sessionId。

旧请求即使在服务端完成，也会因组件已卸载、请求已取消和 `result.projectId` 校验而无法写入新项目。

## 迁移策略

- 旧的全局 Qalam 对话只迁移到第一个项目一次，之后删除旧 key。
- 旧多项目数据没有项目级 `roles/designAssets` 时，只把现有顶层内容归属给当前项目；其它项目初始化为空，避免猜测归属。
- 新创建项目从空角色/素材集合开始。

## 验证场景

- 项目 A 对话后切换 B：B 不显示 A 的对话、工具活动或历史观测数据。
- A 正在流式回答时切换 B：A 被取消，B 的 Flow 不发生变化。
- A 返回延迟的 `updatedNodeFlow`：因 projectId 不匹配被丢弃。
- 手工构造 B 的 projectId + A 的 sessionId：服务端返回 409。
- A 的角色/素材存在，B 为空：B 的 Agent 环境不能看到 A 的角色/素材。
- 切回 A：A 的 Flow、角色、素材和对话恢复。
