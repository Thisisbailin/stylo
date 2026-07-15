# Mission Brief — Lookbook 3D 包装器、页级编排与 Design System Lab

Objective:
- 将 Lookbook 包装器放大到与 Manus 同级的实体尺寸，并重做为具有封面、书脊、页芯和明确开合角度的 3D Hardcover Photobook 控件。
- Lookbook 封面只使用第一张已连接图片；空封面仍保留可识别的出版物构图。
- 为 Lookbook 与 Manus 的成员收起/展开增加连续动效，成员节点向包装器汇聚或从包装器展开，图数据不删除。
- 消除 Lookbook 翻页时从下方弹起的异常感，保持书体舞台尺寸稳定，只做横向与透明度过渡。
- 支持页级拖放：拖动内容时出现底部分页缩略图，可把内容放到指定页；落位后内容必须吸附并限制在单页范围内。
- 在 Lab 中新增 Design System 模块占位，用于后续统一 tokens、组件、动效和可访问性规范。

Out-of-scope:
- 不实现真实纸张弯曲、WebGL 翻页或复杂光照模拟。
- 不改变 Lookbook 成员的 Flow 连接关系、身份索引文档所有权或媒体存储方式。
- Design System Lab 本轮不提供可编辑 token、主题导出或代码生成。

Inputs / Outputs (contracts):
- 输入：Lookbook/Manus 包装器状态、成员节点坐标、Lookbook `pageCount`、索引条目 `spreadIndex + layout`。
- 运行时输出：包装器成员动效状态 `collapsing | expanding` 与相对位移；结束后仍由 `wrapperCollapsed` 决定可见性。
- 页级输出：指定绝对 `pageIndex`，换算为 `spreadIndex` 与左右页；布局经页内约束函数吸附后持久化。
- Lab 输出：新增 `designSystemLab` 模块键、入口卡片与只读占位界面。

Acceptance Criteria (AC):
- AC1：Lookbook 与 Manus 包装器模型尺寸均为约 286×356，视觉层级相当；Lookbook 只读取第一张连接图片。
- AC2：Lookbook 合上时为完整硬壳摄影集，展开时封面绕书脊产生清晰但克制的 3D 开角，页芯可见；支持 reduced-motion。
- AC3：Manus 多页包装器的开合状态更清晰；Lookbook/Manus 收起时成员节点在隐藏前向包装器汇聚，展开时从包装器位置淡入展开，连线同步淡出/淡入。
- AC4：全屏 Lookbook 的封面、内页、封底共享固定舞台，切换不发生纵向位移或缩放弹跳；内页素材不再使用纵向入场。
- AC5：拖动内页内容时显示所有页的底部缩略图；目标页高亮，释放后跳转到目标跨页并持久化到指定页。
- AC6：拖动、缩放、跨页移动或旧布局归一化后，内容的 x/y/width/height 均不越过所属单页边界。
- AC7：Design System Lab 可从 Lab 列表打开和关闭，明确标记为占位模块并列出后续规范范围。
- AC8：旧 Lookbook 索引继续可读；缺少页级元数据时由 `spreadIndex + x` 推导所属页，无数据迁移阻断。

Constraints:
- 动画只修改 transform 与 opacity，不动画布局尺寸；不引入新依赖。
- 保留键盘翻页、Esc、关闭按钮及可访问名称。
- 封面/页缩略图不使用第二张图片，不读取外部资源。
- 包装器成员动效必须清理 timer，不能污染持久 Flow 坐标。

Dependencies & Risks:
- 风险：React Flow 外层 transform 与成员动效冲突。规避：只动画节点内部 `.node-card-base`，外层坐标 transform 不覆盖。
- 风险：拖动时切页导致被拖节点卸载。规避：拖动期间只高亮缩略图，释放后一次性持久化并跳转。
- 风险：已有超宽布局跨越书脊。规避：页内约束函数按所属页缩小并吸附，不修改连接或节点内容。
- 风险：工作区存在用户未提交改动。规避：只对目标行做局部补丁，保留 Manus 入口和媒体节点等并行修改。

Platform Differences via Platform Layer:
- 本次为共享 React / Electron UI；Web 与桌面端复用同一实现，无原生平台差异。
