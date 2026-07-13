# Plan — Canvas Content Locator

## Architecture Intent Block

```text
React Flow nodes + viewport + canvas size
                  ↓
pure viewport visibility policy
                  ↓
CanvasContentLocator presentation
                  ↓ click
fitView → viewport state → project persistence
```

几何判断保持为无 React 依赖的纯函数；组件只负责呈现；`CreativeWorkspace` 负责 React Flow 命令和项目状态持久化。

## Work Breakdown

1. 建立节点矩形与可见视口相交策略，输出空视口及最近内容方向。
2. 实现主题化、可访问的方向引导控件。
3. 接入 `onMove` / `onMoveEnd`、ResizeObserver 与 `fitView`。
4. 增加纯函数测试并执行完整质量门禁。

## Verification Plan

- 几何单测覆盖：可见、完全离开、dock 遮挡、最近方向、零节点。
- 静态检查：`npm run typecheck`、`git diff --check`。
- 回归：`npm test`。
- 生产：`npm run build`。

## Rollback

- 删除 `CanvasContentLocator` 挂载和 `onMove` 观察即可恢复原视口行为；不涉及项目数据迁移。

