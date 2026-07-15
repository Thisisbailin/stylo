# Plan — 实体包装器交互与节点仿真

Architecture Intent Block:
- 用纯函数将“数据图谱”投影为“包装器成员与画布可见性”，不把隐藏状态写进成员节点，也不改变 Flow 执行语义。
- Lookbook 全屏视图使用判别联合状态，避免封面/封底被伪装成页码边界值。
- 视觉材质由节点叶组件与 CSS 负责；FlowSurface 只处理点击仲裁、持久状态和运行时投影。

Work Breakdown:
1. 包装器投影
   - 新增纯函数：Lookbook 直接成员、Manus 根页后代、隐藏集合、成员数。
   - 为 BaseNodeData 增加兼容的 optional 状态与运行时元数据。
   - 回滚点：移除投影与 optional 字段，旧 Flow 数据不需迁移。
2. 画布交互
   - Base nodes 写入 hidden 与包装器元数据。
   - 单击延迟切换收展；双击取消并打开 Lookbook/稿纸。
   - 回滚点：恢复原单击/双击处理器。
3. Lookbook 状态机
   - `front | spread(index) | back` 导航，统一按钮与键盘。
   - 使用平移/淡入过渡替代生硬页切换，封面和封底均可重新打开。
   - 回滚点：恢复 `isOpen + spreadIndex`。
4. 仿真节点视觉
   - Lookbook 改为竖向摄影集硬壳、封面图片窗和微开页芯。
   - Manus 根页使用纸叠与回形针；单页只显示单张稿纸。
   - 回滚点：CSS 与节点 markup 可独立回退。
5. 验证
   - 纯函数单测、Lookbook 源码架构断言、typecheck/build/diff-check。
   - 应用内浏览器验证封面→内页→封底、单击收展、双击打开及两类节点视觉。

Verification Plan (by AC):
- AC1/AC2：Lookbook Studio 组件测试断言 + 浏览器按钮/键盘实测。
- AC3/AC5/AC7：包装器投影纯函数测试，覆盖默认展开、收起、展开、循环链保护。
- AC4：实际画布截图检查单图/空图封面与 closed/open 状态。
- AC6：浏览器单击与双击路径；源码测试检查延迟仲裁与取消。
- 全局：`npm run typecheck`、目标测试、`npm run build`、`git diff --check`。

Rollback Points:
- 数据字段 optional 且默认展开，无迁移依赖。
- 视觉、状态机、投影与点击仲裁分层，任一层可单独回退。
