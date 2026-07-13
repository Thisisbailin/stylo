# Mission Brief — Canvas Content Locator

## Objective

当用户把 Flow 画布拖到没有任何可见节点的区域时，显示一个方向明确、可键盘操作的引导控件；点击后平滑回到包含节点的内容区域，并持久化恢复后的视口。

同时对“Agent 显示写入但画布无结果”做证据化诊断，区分视口偏离、运行结果冲突和工具结果语义问题。

## Out of scope

- 本轮不改变 Agent 写入的原子提交架构、工具预算或冲突合并策略。
- 不删除或迁移用户现有节点、对话或会话数据。
- 不新增第三方依赖。

## Inputs / Outputs

- 输入：React Flow viewport、画布可见尺寸、Agent dock 遮挡宽度、节点矩形。
- 输出：当前视口是否无节点、最近节点所在主方向，以及“返回节点区域”操作。
- 返回操作：调用 React Flow `fitView`，随后同步并持久化最终 viewport。

## Acceptance Criteria

1. 有至少一个节点达到最小可见面积时不显示引导。
2. 所有节点都在视口外时显示引导，并给出左/右/上/下方向。
3. 点击引导后以短动画适配全部非隐藏节点，并保存最终视口。
4. 零节点项目不显示误导性控件；Agent dock 占用区域不计入有效可见区。
5. 控件继承应用主题，支持键盘、读屏和 reduced-motion。
6. 几何判定有独立单测；strict typecheck、全量测试和生产构建通过。

## Risks

- 节点首次挂载时尚未测量：无有效尺寸时保持隐藏，并在下一帧/节点变更后复算。
- 大量节点下频繁拖动画布：节点矩形只在节点集合变化时计算，移动过程中仅做轻量矩形相交。
- Agent 面板遮挡左侧画布：把 dock 宽度作为视口左侧 inset。

## Platform Difference

- Web 与 Electron 共用 React Flow 实现，无单独平台分支。

