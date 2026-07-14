# Verify — LookBook Editorial Canvas

## Outcome

LookBook 已从只读翻页展示切换为可写的桌面视觉画布。领域层、文件适配层和交互层分离；图片/文本创建、连接、版式和 revision 由纯事务负责。严格类型检查、103 项全量测试、生产构建和 diff 检查通过。本地桌面尺寸浏览器完成真实交互检查；隔离 Electron 实例可启动，但 macOS 锁屏阻止 Computer Use 获取窗口图像。

## AC → Evidence Mapping

| Acceptance criterion | Evidence |
| --- | --- |
| 宽高比自适应版式 | `buildAdaptiveLookbookLayouts` 纯函数测试覆盖横、方、竖图；本地 UI 自动编排将 16:9 图片与文本卡并排。 |
| 拖动、缩放、层级、fit | `LookbookBoardItem` 使用 transform drag、rAF resize、pointer cleanup；检查器在本地 UI 可见并可操作。 |
| 拖图创建 Flow 图片节点 | `addLookbookImageAssets` 一次 revision 创建批量节点；测试确认 `image` 输出连接身份卡 `image` 输入。 |
| 文本卡创建与回写 | 本地 UI 创建“视觉笔记”，编辑为“雨夜服装逻辑”后 Flow 中出现真实文本节点；事务测试确认 membership link。 |
| PNG alpha | IHDR color type 4/6 与 tRNS 单测；透明图默认 `contain`，UI 使用主题化棋盘底。 |
| 输入边界 | 12 文件、20 MiB/文件、80 MiB/批次、4000 万像素与 3 并发解码限制。 |
| 身份入口完整 | 工具栏新建“新角色”同时出现身份节点与 LookBook 索引；领域测试验证角色、索引、连接和 revision。 |
| 主题与无障碍 | UI 只消费 `--app-*` 变量；主要图标按钮有稳定 aria-label，fit 使用 `aria-pressed`，支持 reduced motion。 |

## Verification Commands

- `git diff --check` → PASS
- `npm run typecheck` → PASS
- `npm test` → PASS，103/103
- `npm run build` → PASS，7216 modules transformed
- Local Browser `http://127.0.0.1:3001/?app=1` → PASS：身份打开、文本创建/编辑、检查器、自动编排、响应式按钮名称
- Isolated Electron `STYLO_DESKTOP_URL=http://127.0.0.1:3001 ... --user-data-dir=/tmp/stylo-lookbook-codex-20260714` → STARTED；Computer Use 因 macOS 锁屏无法读取窗口

## Evidence Block

- **Motivation:** 将只读翻页展示升级为与 Flow 一致的可编辑视觉工作区。
- **Impact:** LookBook 版式模型、图片导入、节点事务、有效 Flow 媒体端口、身份创建入口、活跃 UI、主题样式与测试。
- **Plan:** 纯函数领域层、浏览器图片适配层、交互视图层分离。
- **Verify:** 类型、103 项测试、生产构建、diff、1147×768 本地桌面浏览器；Electron 视觉检查因锁屏受阻并已记录。
- **Rollback:** 切回旧入口；可选版式元数据无需迁移。
