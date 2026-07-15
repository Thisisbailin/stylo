# Plan — 包装器端口、Lookbook 材质与收起稳定性修复

## Architecture Intent Block

包装器保留既有 Flow 关系作为数据事实；仅在画布投影层统一锚点、路由和动效。Lookbook 的物理材质由包装器自身图层承担，不复用原子节点 Card 表面。

## Work Breakdown

1. 将 Lookbook 输入端口归一为中心 `multi` 可见、typed handles 隐藏。
2. 为 Lookbook/Manus 包装关系增加单调曲线 edge type。
3. 提升 Lookbook CSS 覆盖优先级，移除 Card 外壳、密集纸纹与内部装饰性光影。
4. 为同一包装器开合加入短期交互锁并补足清理。
5. 统一文本节点默认标题和旧默认标题的显示投影。
6. 补充自动化断言、类型检查、构建和浏览器验收。

## 回滚点

- 成员边可回退为默认 edge type，不影响 link 数据。
- 端口仍保留原 typed handle id，视觉归一可独立回退。
- UI 材质调整仅位于 Lookbook 专属选择器。
