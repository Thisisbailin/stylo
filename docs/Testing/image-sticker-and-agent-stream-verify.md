# Verify — 图片贴纸节点与 Agent 消息流收敛

AC -> Evidence Mapping:
- AC1：本地运行时计算样式显示 `imageInput` 的 shell 背景、`::before` 背景与边框均为 `rgba(0, 0, 0, 0)`，伪元素阴影为 `none`；图片媒体层同样使用透明背景，PNG alpha 不再与黑底合成。
- AC2：`ImageInputNode` 在上传前读取 PNG bytes 并调用 `pngHasTransparency`，把结果写入 `hasAlpha`；既有 PNG 解析测试覆盖 alpha color type 与 `tRNS`。
- AC3：源码测试确认 populated image rail 只有 3 个 `image-input-icon-label`；按钮分别提供替换、仿真人检测和展开图片属性的 `aria-label` / `title`，无常驻文本。
- AC4：文件名、尺寸、可编辑名称和 Storage 状态被合并进 Info disclosure panel；原 `image-input-action-label` 与独立 storage status 行已移除。
- AC5：审核状态、消息、失败原因和 `assetUri` 均位于 Review control panel；审核动作仍复用既有 Seedance 与 Storage 清理链路。
- AC6：本地页面检查得到 `userMessageIconCount: 0`、`assistantLeadingIconCount: 0`；源码测试同时拒绝 user/assistant primary visual 在正文分支出现。
- AC7：工具线程 `<details>` 不再接收 `open`；当前消息的 `expanded` 只保留给思考状态，不会强制展开工具结果。
- AC8：消息容器使用同一帧合并函数同时写入 current block 与 outer log 的底部位置，并由 ResizeObserver 与 MutationObserver 覆盖流式高度和文本变化。本地页面的 log 为 `scrollTop 247.22 / max 247`，当前块 `overflow-y: auto`。

Verification Results:
- `npm run typecheck`: pass.
- `npm test`: pass, 165/165.
- `npm run build`: pass.
- `git diff --check`: pass.
- 本地应用浏览器：pass for transparent ImageInput shell, zero user/assistant leading icons, outer log bottom alignment, and current-block scroll contract.

Known Non-blocking Observations:
- 当前本地项目存在既有 Cloud Sync 冲突提示；视觉检查保持只读，没有选择本地/云端版本，也没有上传测试图片到用户的 Supabase。
- 当前画布中的 imageInput 为空节点，因此 alpha 像素合成由透明计算样式、既有 PNG parser 单测与源码路径共同验证；未制造云端测试垃圾数据。
- Vite 构建继续报告一个大于 500 kB 的既有 Cinewor vendor chunk warning，不影响构建成功。

Build Matrix:
- Web production bundle: pass.
- macOS Electron renderer: covered by shared Vite renderer build and local app-mode browser run.
- iPadOS/iOS: not applicable to this React/Electron workspace.

# Evidence Block
- Motivation: 让透明 PNG 成为真正的贴纸节点，并降低图片操作与 Agent 消息流的视觉噪音。
- Impact: ImageInput alpha metadata与节点 chrome、右侧 disclosure rail、Agent 正文图标策略、工具详情初始状态及消息自动滚动。
- Plan: 透明化 image node surface，压缩为三入口控件，把状态收进面板，移除正文图标，并观察流式 DOM 高度变化。
- Verify: 严格类型检查、165 项测试、生产构建、源码断言与本地运行时计算样式/滚动指标均通过。
- Rollback: `hasAlpha` 为 optional；图片 CSS、rail markup、消息图标和滚动观察器可分层独立回退，不涉及云端 schema。
