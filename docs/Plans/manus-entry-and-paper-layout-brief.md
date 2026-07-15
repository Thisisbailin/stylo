# Mission Brief — Manus 入口与连续稿纸布局

Objective:
- 将空画布与 Add Nodes 中的剧本入口统一为 Manus；一个项目存在任意 `scriptPage` 后，Add Nodes 不再显示第二个 Manus 入口。
- 后续稿纸只能在 Manus 包装器内创建，保持同一条 `screenplay-page` 序列与“一沓稿纸”的连续语义。
- Add Nodes 第一组为 Manus、Lookbook、Cinewor 占位、文件夹；输入组为文本、图片、声音、视频。
- Add Nodes 收敛成无滚动条的小型右键菜单式弹层。
- Manus 提供纵向连续、横向连续、底部缩略队列三种稿纸浏览模式，并移除专门的上一页/下一页按钮。
- 文本、图片、声音、视频空节点统一引导居中、材质、边框与间距。

Out-of-scope:
- 不迁移或重命名底层 `scriptPage` 节点类型，不改变 Fountain 文档格式。
- 不让 Lookbook、Cinewor 或系统文件夹的占位入口绕过既有创建规则。
- 不改变自动分页算法、Agent 剧本修改协议或稿纸节点之间的连接关系。

Inputs / Outputs (contracts):
- 输入：Flow 节点列表、`screenplay-page` 连线、当前 Manus 页序列与 Add Nodes 打开坐标。
- 入口输出：无剧本节点时显示一个 Manus 创建项；存在剧本节点时隐藏该项。
- 创建输出：Manus 内“新增稿纸”通过既有 `onSplitScriptDocument` 在当前页后插入空白 `scriptPage`。
- 布局输出：`vertical | horizontal | filmstrip` 三态；页序列不因布局切换发生数据变化。

Acceptance Criteria (AC):
- AC1：空画布 CTA 创建 `scriptPage`，用户文案为 Manus，不再默认创建文本节点。
- AC2：Add Nodes 第一组顺序为 Manus、Lookbook、Cinewor、文件夹；Manus 仅在项目无 `scriptPage` 时出现。
- AC3：输入组严格按文本、图片、声音、视频排列；普通文本不再属于剧本/文档组。
- AC4：Add Nodes 无内部滚动条，桌面宽度不超过 320px，条目为紧凑单列 context-menu 形态。
- AC5：Manus 内提供新增稿纸动作，新页写入同一页链并自动成为当前页。
- AC6：纵向模式一次渲染整条稿纸队列，页面上下连续排列并依靠主视口滚动。
- AC7：横向模式一次渲染整条稿纸队列，左右边缘 hover 后平滑定位相邻稿纸，无显式上一页/下一页按钮。
- AC8：第三种缩略队列模式在底部显示所有稿纸缩略项，点击可定位并激活指定稿纸。
- AC9：文本空节点引导居中；图片、声音、视频空节点使用同一实体表面、实线边框、图标尺寸和文案层级，不再出现虚线框。

Constraints:
- 继续使用 Phosphor 图标与既有 React/XYFlow/Framer Motion 依赖，不新增依赖。
- 布局动效只使用 transform/opacity，支持 `prefers-reduced-motion`。
- 仅在切换当前稿纸前提交当前草稿，避免滚动本身触发保存或节点重建。
- 保留工作区中其它未提交 Canvas/Lookbook 改动。

Dependencies & Risks:
- 风险：连续渲染多个完整编辑器造成开销。规避：当前稿纸使用编辑器，其它稿纸使用只读预览；节点 key 与顺序稳定。
- 风险：横向边缘误触。规避：使用短 hover intent 定时器，离开边缘立即取消。
- 风险：新增空白稿纸切断既有页链。规避：复用现有 split commit，由已有插入逻辑维护连接。
- 风险：菜单过高。规避：压缩条目至 context-menu 密度、隐藏冗余说明并取消内部滚动。

Platform Differences via Platform Layer:
- Web 与 Electron 共用 React 实现；指针 hover 导航只在具备 hover 的桌面环境显示，触控环境仍可直接横向滚动或使用缩略队列。
