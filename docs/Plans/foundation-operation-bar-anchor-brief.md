# Mission Brief — Foundation Operation Bar Anchor

## Objective

让 Flow 画布底部的整条操作栏在 Foundation 收起、展开及不同视口宽度下始终锚定于应用视口底部正中央。Foundation 的详情轨道从操作栏上方向上展开，不再通过移动主操作栏为详情轨道腾出空间。

## Out of scope

- 不改变 Foundation 的轴数据、项目数据或 Agent 状态。
- 不重做操作栏按钮、菜单和视觉主题。
- 不引入第三方依赖或新的全局布局状态。

## Inputs / Outputs

- 输入：Foundation 展开状态、桌面或窄屏视口、安全区底部 inset。
- 输出：展开前后相同的主操作栏水平中心与底部锚点；独立的 Foundation 详情轨道在主操作栏上方显示。

## Acceptance Criteria

1. 收起与展开状态使用同一个 `bottom` 锚点，不发生 74px 的垂直跳动。
2. 主操作栏以整个应用视口的水平中心定位，不以 Agent 面板或剩余画布宽度为中心。
3. Foundation 详情轨道从主操作栏上方展开，且不遮挡主操作栏。
4. 桌面、平板和不超过 760px 的窄屏规则保持同一定位语义。
5. 样式契约有自动化回归测试；类型检查、全量测试和生产构建通过。

## Risks

- 旧规则在样式文件中有多轮覆盖：回归测试必须锁定最终生效的操作栏样式段。
- 窄屏详情轨道宽度接近视口：保持既有横向安全边距，不改变内容滚动策略。
- macOS 安全区：底部锚点继续通过 `env(safe-area-inset-bottom)` 计算。

## Platform Difference

Web 与 Electron 共用同一 DOM 和 CSS；安全区由 CSS 环境变量适配，无平台分支。

