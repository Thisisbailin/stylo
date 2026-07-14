# Mission Brief — LookBook Editorial Canvas

## Objective

将当前只读翻页册重构为桌面端可编辑视觉画布。LookBook 继续以 Flow 节点和连接为内容真相，但拥有独立、持久化的编辑版式：图片按原始比例自适应排版，用户可拖动、缩放、调整层级与适配方式；拖入图片会原子创建并连接 `imageInput` 节点；新增文本卡会创建并连接普通文本节点。

PNG 必须保留透明像素，并识别 PNG alpha/tRNS 信息，以透明棋盘底而非裁切底色呈现。整体视觉复用 Account Theme 的 app variables，面向桌面鼠标/触控板操作，并提供流畅但克制的空间动效。

## Out of scope

- 不改变 Flow 画布节点本身的位置和尺寸。
- 不引入新的媒体存储服务或第三方依赖。
- 不删除现有旧版 LookBook 组件；活跃入口切换到新编辑画布。
- 不在本轮增加视频/音频剪辑能力。

## Inputs / Outputs

- 输入：身份卡节点、直接连接的档案/图片/音频/视频节点、用户拖入的本地图片、用户创建的文本卡。
- 输出：更新后的 `ProjectData.flow`，包含新节点、`lookbook-membership` 连接、递增 revision，以及成员节点上的 `lookbookLayout` 元数据。
- 版式坐标使用相对画布宽度的归一化值；纵向可扩展，避免窗口尺寸改变后布局漂移。
- PNG 输入保留原始 data URL，并记录 MIME、尺寸与透明通道能力。

## Acceptance Criteria

1. 图片初始版式根据宽高比生成：横图、方图、竖图得到不同但确定的尺寸，并可自动重排且不依赖 DOM。
2. 用户拖动、缩放、调整层级和 `cover/contain` 后，版式写入成员节点而不修改 Flow 节点坐标。
3. 拖入合法图片会在一次 ProjectData 事务内创建 `imageInput` 节点，并通过真实 `image` 端口连接身份卡；多文件导入只递增一次 revision。
4. 新增文本卡会创建一个可编辑的 `text` 节点及身份连接；卡片标题/正文可持久化。
5. PNG IHDR alpha 色型与 tRNS chunk 可被纯函数识别；透明 PNG 默认使用 `contain` 并显示透明底纹。
6. 文件类型、文件大小和解码错误以界面内错误呈现，不产生半完成节点。
7. 空状态、导入中、错误、选中、拖动、缩放和 reduced-motion 状态完整。
8. LookBook 使用应用主题变量，不硬编码独立深色主题；桌面宽度优先，窄窗口安全降级。
9. strict typecheck、全量测试、生产构建通过，并在隔离 Electron 中验证关键交互与至少两种主题。

## Constraints

- 不新增依赖；使用现有 React、Framer Motion 与 Phosphor Icons。
- 连续拖动只使用 transform；版式仅在 drag end 写入 React 状态。
- resize 过程通过 requestAnimationFrame 直接更新目标元素，pointer up 后单次提交。
- 单文件上限 20 MiB、单次最多 12 张/80 MiB、单图最多 4000 万像素，并限制 3 路并发解码，避免 data URL 和位图无界占用内存。
- 图片内容只在浏览器本地读取，不上传、不记录文件路径。

## Dependencies and Risks

- 项目当前以 data URL 保存图片，大图会增大项目体积；通过输入上限和明确错误规避。
- 旧成员没有 `lookbookLayout`；投影层提供确定性自动版式，无需迁移即可兼容。
- 浏览器对 PNG 已原生保留 alpha；额外解析只用于语义和默认展示策略，解析失败不得阻止合法 PNG 解码。

## Platform Differences

Web 与 Electron 共用 React/CSS。Electron 作为本轮桌面主验证环境；窄屏只保证安全单列和可滚动，不设计移动端高级手势。
