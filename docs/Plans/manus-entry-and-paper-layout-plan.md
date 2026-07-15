# Plan — Manus 入口与连续稿纸布局

Architecture Intent Block:
- `scriptPage` 继续作为页级数据，Manus 作为唯一创建入口与序列包装器；入口条件由纯节点存在性决定，不新增持久 schema。
- 三种布局只投影同一个 `pageSequence`；当前页负责编辑，其余页以只读纸张预览存在，布局切换不改图谱。
- Add Nodes 的信息架构与空节点表面分别由 option model 和共享 CSS class 驱动，避免四种输入卡继续漂移。

Work Breakdown:
1. 创建入口收敛
   - 更新空画布 CTA、Add Nodes 分组/排序与 Manus 条件显示。
   - 给 ScriptFoundation 传入 `hasScriptPage`，连接创建菜单使用同一过滤结果。
   - 回滚点：恢复 scriptCreateOptions 与空画布文本入口。
2. Manus 内新增稿纸
   - 在 ScreenplayHeader 增加新稿纸动作。
   - 通过现有 split commit 创建空页并激活。
   - 回滚点：移除 header action，不影响既有 split/自动分页。
3. 三种稿纸布局
   - 扩展 arrangement 联合类型；纵向/横向渲染全序列，filmstrip 渲染当前页与底部缩略队列。
   - 横向添加 hover intent 边缘定位，删除 header 前后按钮。
   - 回滚点：恢复 active-only article 与两态 toggle。
4. Context menu 视觉
   - 移除 palette 内部 overflow，缩窄宽度、降低行高、隐藏冗余 hint。
   - 保留 disabled/hover/focus/active 状态及可访问名称。
5. 空输入节点统一
   - 文本 placeholder 空态居中。
   - 图片/音频/视频使用共享 `media-input-empty` 结构与实体背景，移除虚线和固定白色文案。
   - 回滚点：各节点空态 markup/CSS 可独立恢复。
6. 验证
   - 更新架构源码断言与 Manus 工作区测试；运行 typecheck、全量测试、build、diff-check。
   - 本地应用检查菜单尺寸、分组顺序、空卡表面及三种 Manus 布局。

Verification Plan (by AC):
- AC1-AC4：源码测试断言空 CTA 类型、option 顺序、条件过滤与最终 CSS 无 overflow。
- AC5：Manus 测试断言 `onSplitScriptDocument` 新页入口及激活路径。
- AC6-AC8：Manus 测试断言三态联合、全序列映射、edge hover 与 filmstrip locator；本地交互检查。
- AC9：节点源码/CSS 测试检查共享空态 class、实线边框与文本 placeholder 居中。
- 全局：`npm run typecheck`、`npm test`、`npm run build`、`git diff --check`。

Rollback Points:
- 不新增持久字段或迁移；入口、布局、菜单和空态均为独立 UI 层变更。
- 新稿纸继续使用既有 split contract，回退 UI 不影响已创建页链。
