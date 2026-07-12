# Verify — Identity Lookbook Wrapper

## AC -> Evidence Mapping

- AC1 / 自动同步人物与场景：`tests/lookbookIdentities.test.ts` 覆盖标准 Fountain、中文编辑器标记、占位符过滤和人物/场景生成。
- AC2 / 唯一身份卡与索引：测试覆盖首次同步、重复同步、唯一节点和唯一 `lookbook-membership` 边界。
- AC3 / 双击入口与退出：TypeScript 严格检查覆盖 React Flow 双击事件契约；Lookbook 提供返回按钮与 Escape 监听，并带 effect cleanup。
- AC4 / 成员投影：测试覆盖正向/反向连接的档案、图片、视频节点，并过滤非成员类型；UI 提供四类媒体与空状态呈现。
- AC5 / 保留既有身份：测试覆盖 exact-match 复用，保留用户摘要、描述和 verified 状态。
- AC6 / 工程闸门：`npm run typecheck`、`npm test`、`npm run build` 通过。
- 翻页视觉修订：新增封面/跨页/封底状态、方向键和按钮翻页、连接顺序投影；数据层索引从可见页面中过滤。
- 身份卡修订：隔离类型检查覆盖紧凑身份卡，单测覆盖首个连接图片与可见成员顺序。

## Build Matrix

- TypeScript strict：pass
- Node test runner：pass（34 tests）
- Vite production build：pass
- 浏览器实屏穿透：blocked by existing invitation-code gate；未读取或猜测凭据。门禁前页面可启动，发现的重复 Flow project key 警告来自既有用户状态，与本次 Lookbook 变更无关。

## Platform Difference Checks

- 桌面布局：双栏封面、非对称图像网格、双列动态内容。
- 窄屏规则：`max-width: 860px` 下切为单栏，使用 `100dvh`，无固定宽度横向溢出。
- 可访问性：dialog/aria-modal、显式返回按钮、Escape 退出、reduced-motion 关闭入场动画。

## Evidence Block

- Motivation: 将 Foundation 的角色/场景包装职责下沉为按身份独立打开的 Lookbook。
- Impact: Fountain 文档提交、统一身份索引、Flow 节点/连线、身份卡端口、全屏专注视图。
- Plan: 解析与同步工具 -> 提交路径 -> Lookbook 投影视图 -> 测试与构建。
- Verify: strict typecheck、34 项测试、production build。
- Rollback: 移除提交路径中的同步调用与身份卡双击入口即可停用；新增数据字段全部 optional，旧项目兼容。
