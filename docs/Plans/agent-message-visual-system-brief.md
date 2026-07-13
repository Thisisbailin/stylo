# Mission Brief — Agent Message Visual System and Rendering Audit

## Objective

为 Stylo Agent 消息流建立一套完整、可扩展的图标语义系统：用户消息、Agent 最终回答、思考/状态、工作阶段、审批以及每一种已注册工具都有清晰且独特的图标。图标沿用落地页的 Phosphor duotone 裸线风格与克制的信息排版；消息气泡和卡片则复用 Account Theme 模块的圆角、边框、panel surface 与 accent 变量，不使用发光或彩色徽章，并自动适配所有色彩主题。

同时全面审查并优化消息投影与渲染路径，确保工具请求/结果配对、工作阶段折叠、流式输出、滚动锚定、长对话离屏渲染和可访问性行为正常且高效。

## Out of scope

- 不改变 Agent 工具能力、工具预算、模型调用或消息传输协议。
- 不引入新图标库、虚拟列表依赖或外部服务。
- 不改变历史消息持久化格式。

## Inputs / Outputs

- 输入：`Message[]`、工具名称、消息状态、Foundation/Flow 主题 CSS 变量。
- 输出：稳定的消息时间线、消息/工具视觉描述、主题化图标组件和高效消息项渲染。
- 兼容：未知工具必须使用安全的通用工具图标，不得导致渲染失败。

## Acceptance Criteria

1. 用户、最终回答、状态/思考、工作阶段、审批和工具消息都有不同图标语义。
2. 当前注册的每一种工具都映射到唯一图标；工具目录新增工具而未补视觉映射时 TypeScript 或测试必须失败。
3. 图标使用现有 `@phosphor-icons/react`、统一 `duotone` 风格且保持无底板；消息表面遵循 Account Theme 的柔和圆角面板语言，无光晕或彩色徽章，并仅依赖应用主题变量与必要的错误状态色。
4. 工具请求/结果仍按 callId 配对；最终回答前工作阶段自动收起；审批保持独立且可操作。
5. 流式更新不会重复重绘未变化的历史消息，不会在一帧排队多个滚动回调。
6. 离屏历史消息启用浏览器原生渲染隔离，当前消息和展开交互保持即时可用。
7. 长消息序列投影有基准记录；strict typecheck、全量测试和生产构建通过。
8. 本地 Electron 至少验证浅色主题下工具图标、折叠阶段和最终回答布局；主题变量契约覆盖其他主题。
9. 消息流必须建立稳定的四级视觉层次：用户目标/最终回答与待决审批为主要信息，整轮工作摘要为次级信息，思考与工具明细为三级信息；有最终回答时不重复展示“内容已生成”状态。审批使用单层简洁主题卡，不叠加强调条或多层嵌套卡片。

## Constraints

- 性能：不在滚动事件中无条件写 React state；动画只使用 transform/opacity。
- 可访问性：图标装饰性隐藏，文字标签继续承担可访问名称；折叠控件保留原生 `details/summary`。
- 隐私：性能样本仅使用合成消息，不读取用户项目数据。

## Dependencies and Risks

- Phosphor 图标名称变更：依赖当前锁定版本并由 strict typecheck 验证。
- `content-visibility` 高度估算：使用 `contain-intrinsic-size: auto` 保留浏览器学习到的真实尺寸，降低滚动跳动。
- React.memo 比较器错误：只按底层消息对象引用和显示状态比较；流式消息更新会产生新对象，因此不会遗漏更新。

## Platform Difference

Web 与 Electron 共用 React/CSS 实现；桌面实机验证 Electron，Web 由相同组件与主题变量契约覆盖，无平台分支。
