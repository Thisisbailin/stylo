# Mission Brief — 图片贴纸节点与 Agent 消息流收敛

Objective:
- 透明 PNG 在 Flow 图片节点中保留 alpha，以贴纸方式直接露出画布背景，不再被黑色矩形底板包裹。
- 图片节点右侧只保留替换、仿真人检测、展开三个图标入口；文件属性、存储状态与审核提示进入各自的小型展开面板。
- Agent 用户消息和普通回复不再显示头像或钢笔图标；工具详情默认折叠；流式增长期间外层消息区与当前消息块持续跟随最新内容。

Out-of-scope:
- 不改变图片源文件的像素内容，不为不含 alpha 的图片自动抠图。
- 不改变 Seedance 仿真人审核接口、Supabase Storage 所有权或删除生命周期。
- 不重做 Agent 消息数据模型、Markdown 渲染器或审批卡片。

Inputs / Outputs (contracts):
- 输入：ImageInput 节点图片文件、PNG 头信息、文件名/尺寸、Storage 状态、Seedance 审核状态与 Agent 消息时间线。
- 持久输出：图片上传时写入 `hasAlpha`；旧节点缺少该字段时仍按原图 alpha 正确合成。
- 视觉输出：透明图片节点无实体底板；右侧三枚可访问图标按钮按需展开属性或审核面板。
- 消息输出：用户和助手正文无前置图标；工具 `<details>` 初始闭合；当前流式消息尺寸变化会重新对齐底部。

Acceptance Criteria (AC):
- AC1：透明 PNG 导入后，透明区域直接显示 Canvas 网格/背景，图片节点外观为贴纸；普通 JPG/WebP 仍正常显示。
- AC2：新导入 PNG 会检测并持久化 `hasAlpha`，替换图片时同步刷新该值。
- AC3：图片右侧默认仅出现三枚无文本图标按钮，均有 tooltip/aria-label；替换按钮直接选文件。
- AC4：展开按钮显示文件名、尺寸、可编辑名称与 Storage 状态；面板可关闭且不触发节点拖动。
- AC5：仿真人按钮可发起审核，并将审核进度、失败原因或 asset URI 包进同一提示面板，不新增第四条状态 label。
- AC6：用户消息只显示气泡/正文，助手中途和正式回复直接显示正文，不出现用户头像或钢笔图标。
- AC7：工具消息详情默认折叠，即便它是当前最新消息也不会自动展开。
- AC8：消息新增或流式正文高度变化时，Agent 外层消息区和超高当前消息块都滚动至最新内容。

Constraints:
- 复用 Phosphor 图标；不添加依赖，不使用 emoji 代替界面图标。
- 动效只使用 `transform` 与 `opacity`；不引入荧光、发光或高对比装饰。
- 保留现有 Supabase 上传、替换清理和节点删除清理逻辑。
- 避免覆盖工作区内与本任务无关的未提交 Canvas/Lookbook 修改。

Dependencies & Risks:
- 风险：BaseNode 的伪元素底板仍会透过 PNG alpha。规避：只为 `imageInput` 覆盖 shell、body 与伪元素为透明。
- 风险：属性编辑器移入浮层后 mention picker 定位失效。规避：保留原 editor ref、caret 与定位链路，只移动容器。
- 风险：ResizeObserver 造成滚动循环。规避：合并到单个 animation frame，并只写 `scrollTop`。
- 风险：工具线程更新重建 `<details>`。规避：不传 `open`，交由浏览器保留用户主动展开状态，最新状态也不强制开启。

Platform Differences via Platform Layer:
- Web 与 Electron 共用 React/XYFlow 实现；无 macOS/iPadOS/iOS 原生分支。
