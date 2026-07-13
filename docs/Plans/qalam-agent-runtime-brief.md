# Mission Brief — Qalam Agent Runtime

## Objective

将 Qalam Agent 子系统重构为可并发隔离、可测试、可观测且可演进的分层架构，覆盖 Agents SDK 执行、DeepSeek 默认模型兼容、工具注册与预算、会话上下文和前端消息流。

## Out of scope

- 不升级或新增第三方依赖。
- 不修改图像、视频等非 Agent 业务模块。
- 不触发真实模型请求、不读取或写入任何 API Key。
- 不改变用户项目数据格式或现有人工审批语义。

## Inputs / Outputs

- 输入：`QalamRunInput`、项目/Flow 快照、Provider 配置、SDK `Session`、工具策略。
- 输出：顺序稳定的 `AgentRuntimeEvent` 流与单一 `QalamRunResult`。
- UI 输入：运行时事件；UI 输出：规范化、可增量更新的消息时间线。

## Acceptance Criteria

1. 每次运行拥有独立 SDK client/provider，不修改 SDK 全局默认状态。
2. DeepSeek 请求、响应和流式 reasoning 兼容逻辑集中、纯函数可测，并保持工具调用事务完整。
3. 工具能力、类别、副作用、缓存和预算由单一目录定义；注册器与预算器不再维护冲突名单。
4. 浏览器、内存与 D1 会话共享同一投影、裁剪和工具事务修复规则；本地会话有明确上限。
5. SDK 流事件投影与 React 消息状态归约可独立单测，重复/乱序终态不会生成重复消息。
6. 消息时间线构建为 O(n)，链接仅允许安全协议；加载、错误、工具运行和终态均可辨识。
7. TypeScript strict、Agent 新增测试、全量测试和生产构建通过。

## Constraints

- 保持 `@openai/agents` 0.5.x、React 18、Cloudflare Pages Functions 和 D1 兼容。
- 不记录敏感 prompt、项目全文或凭据到默认 trace。
- 单次运行必须可取消；失败工具必须向模型返回结构化、可恢复结果。
- 用户界面继承应用主题变量，维持高信息密度和键盘/读屏可访问性。

## Dependencies & Risks

- 非 OpenAI Provider 对 Responses/Chat Completions 字段支持不完全：通过 Provider profile 隔离。
- 历史会话可能包含不完整工具事务：读取和裁剪时统一修复，保持向后兼容。
- 流事件来自不同 Provider：先归一化为内部协议，再交给 React。

## Platform Differences

- Browser runtime 仅作为显式配置的本地执行路径；Edge runtime 保持默认安全边界。
- Browser 使用 LocalStorage Session；Edge 使用 D1 Session，但共享同一上下文策略。

