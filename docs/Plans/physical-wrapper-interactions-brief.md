# Mission Brief — 实体包装器交互与节点仿真

Objective:
- 让全屏 Lookbook 具备封面、内页跨页与封底三个明确状态；第一页向前翻回封面，最后一页向后翻到封底。
- 让 Lookbook 画布节点呈现为真实摄影集装帧，并以单击切换合上/微开状态，同时收起或展开其 `lookbook-membership` 成员。
- 让剧本文档节点呈现为稿纸：单页为单张稿纸，多页 Manus 链的根节点为带回形针的一沓稿纸，并可单击收起/展开后续 `screenplay-page` 页面。

Out-of-scope:
- 不改变 Lookbook 内容节点的数据所有权、排序或索引文档格式。
- 不删除旧 `identityCard`、`mdText` 或既有项目兼容逻辑。
- 不为普通非包装连线提供批量收起能力。

Inputs / Outputs (contracts):
- 输入：Flow 节点、`lookbook-membership` 与 `screenplay-page` 连线、Lookbook 页数和布局索引。
- 持久状态：包装器节点 `data.wrapperCollapsed?: boolean`；缺省为展开，保证旧项目成员继续可见。
- 运行时投影：计算每个包装器的成员数量、剧本根页身份和被收起节点集合；仅改变画布可见性，不删除节点和连线。
- 输出：Lookbook 视图 `front | spread(index) | back`；画布节点的 closed/open 外观与成员可见性。

Acceptance Criteria (AC):
- AC1：Lookbook 第一跨页的“上一页”可用并返回封面；最后跨页的“下一页”可用并进入封底；封底可返回最后跨页。
- AC2：键盘左右键与按钮遵守同一状态机，过渡期间不会重复触发，页码提示能区分封面/跨页/封底。
- AC3：Lookbook 单击切换 `wrapperCollapsed`；收起时仅隐藏其直接 `lookbook-membership` 成员，展开后原位置恢复。
- AC4：Lookbook 节点为非方形竖向摄影集硬壳封面；使用前两张连接图片形成封面画面，只有一张时使用单图构图，无图时有明确占位。
- AC5：Manus 多页链仅由根页包装后续页；根页单击可收展，后续页面不成为新的包装器；单页稿纸不显示纸叠或回形针。
- AC6：Lookbook 与 Manus 双击分别打开其全屏编辑器，单击收展不会误触发双击动作。
- AC7：旧项目没有 `wrapperCollapsed` 时保持展开，节点和连线数据不丢失。

Constraints:
- 只动画 `transform` 与 `opacity`，提供 `prefers-reduced-motion` 降级。
- 不引入新依赖；复用已安装 React、Framer Motion、Phosphor 与 XYFlow。
- 收起是视觉投影，Agent/执行器仍可读取完整 Flow。
- 控件保留可访问名称，键盘左右键和 Esc 行为不回退。

Dependencies & Risks:
- 风险：单击与双击冲突。规避：单击延迟提交，双击取消待执行的收展。
- 风险：错误隐藏普通引用节点。规避：Lookbook 只认 `lookbook-membership`；Manus 只认有向 `screenplay-page` 后代。
- 风险：循环或脏链导致遍历失控。规避：成员遍历使用 visited 集合并限制在 scriptPage 节点。

Platform Differences via Platform Layer:
- 本次为共享 React/XYFlow 桌面界面，无 macOS/iPadOS/iOS 原生差异；Electron 与 Web 复用同一实现。
