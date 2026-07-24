# Mission Brief — PDF 输入节点与阅读标注

Objective:
- 在输入节点中新增 `pdfInput`，与图片、音频、视频一起作为项目媒体资源保存。
- PDF 节点支持上传、替换、清除与双击打开。
- 提供基础 PDF 阅读器、按页导航和可持久化的矩形高亮。
- PDF 节点接受文本连接；连接的文本节点作为该 PDF 的 Markdown 笔记显示。

Out-of-scope:
- 不修改 PDF 原文件内容，不把高亮写回 PDF 二进制。
- 不实现 OCR、全文检索、批注协作冲突合并或高级 PDF 编辑。
- 不引入新的第三方依赖；阅读使用 Chromium 原生 PDF 渲染能力。

Inputs / Outputs (contracts):
- 输入：`application/pdf` 文件或 PDF URL。
- 节点数据：`pdf`、`filename`、`mimeType`、`storageBucket`、`storagePath`、`fileSize`、`highlights`。
- 高亮数据：页码、归一化矩形坐标、颜色与创建时间。
- 连接：文本节点 `text` 输出连接到 PDF 节点 `text` 输入。
- 项目包：PDF 二进制以 `media` 资源打包，导入后恢复为可阅读数据 URL。

Acceptance Criteria (AC):
- AC1：节点创建菜单和操作栏均可创建 PDF 输入节点。
- AC2：PDF 文件可上传至当前项目私有资源；替换和清除会更新节点数据。
- AC3：双击已载入 PDF 的节点打开阅读器；可翻页、缩放、关闭。
- AC4：高亮模式可在当前页绘制和删除高亮；结果持久化到项目节点数据。
- AC5：文本节点可连接到 PDF 节点；阅读器显示所有直接关联的 Markdown 笔记。
- AC6：项目包导出/导入可完整往返 PDF 媒体和高亮数据。
- AC7：节点类型、数据默认值、连接句柄、Foundation 媒体归类、Agent 基础节点契约保持一致。
- AC8：类型检查、测试和生产构建通过。

Constraints (perf/i18n/a11y/privacy):
- 单个 PDF 不超过 64 MB，与项目包单资源上限一致。
- PDF 使用项目私有存储；签名 URL 按项目范围刷新。
- 阅读器支持键盘关闭、按钮可访问名称和减少动态效果。
- 高亮坐标归一化，避免窗口尺寸变化破坏标注位置。

Dependencies & Risks:
- Chromium 原生 PDF 查看器在不同运行环境的工具栏外观可能略有差异。
- 原生查看器是嵌入内容；本阶段高亮为项目侧覆盖层，不写入 PDF 文件。
- 私有存储不可用时显示明确上传错误，不悄悄丢失到云端同步之外。

Platform Differences via Platform Layer:
- Web 与 Electron 共用 Chromium PDF 渲染路径。
- 不新增平台特有 API；文件选择和私有存储继续沿用现有媒体节点通道。
