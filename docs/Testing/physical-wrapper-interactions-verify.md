# Verify — 实体包装器交互与节点仿真

## AC -> Evidence Mapping

- AC1（首尾合册）：通过。`LookbookStudioPanel` 使用 `front | spread(index) | back` 判别状态；应用内浏览器实测封面可进入第一跨页，第一跨页向前返回封面，最后跨页向后进入封底，封底可返回最后跨页。
- AC2（统一导航）：通过。按钮与 `ArrowLeft` / `ArrowRight` 复用同一 `turnTo` 状态机；应用内浏览器实测封底按左键返回最后跨页；组件源码测试断言封面、跨页、封底和首尾按钮可访问名称。
- AC3（Lookbook 收展）：通过。应用内浏览器真实单击后 `data-wrapper-state` 从 `open` 变为 `closed`，直接 `lookbook-membership` 索引节点从画布消失；再次单击恢复。`tests/wrapperProjection.test.ts` 验证普通连线节点不受影响，图数据不删除。
- AC4（摄影集装帧）：通过。画布实测 Lookbook 为竖向硬壳摄影集，浏览器渲染尺寸约 `113 × 139.1`（当前 Flow 缩放下），对应模型尺寸 `236 × 292`；空封面使用竖向画面窗，源码支持前两张连接图片。`tests/lookbookWorkspace.test.ts` 锁定 React Flow 外层宽度覆盖，防止再次被全局 `320px` 撑成方形。
- AC5（Manus 稿纸包装）：通过。画布实测单页显示为单张稿纸，渲染尺寸约 `136.4 × 169.8`，对应模型尺寸 `286 × 356`；纯函数测试验证只有剧本链根页包装后续页，并能安全处理脏循环链。多页根节点样式包含纸叠与回形针，单页不显示纸叠和回形针。
- AC6（单击/双击仲裁）：通过。`FlowSurface` 使用 210ms 单击仲裁，双击会取消待执行的收展；应用内浏览器实测 Lookbook 双击打开全屏模块，单击只收展；剧本文档双击进入 Manus。
- AC7（旧项目兼容）：通过。`wrapperCollapsed` 为 optional，缺省按展开处理；单测验证展开状态不隐藏节点，收展只影响运行时可见性投影。

## Automated Gates

- `npm run typecheck`：通过。
- `npm test`：通过，165/165。
- `npm run build`：通过，Vite 生产构建完成；仅保留既有的大 chunk 提示。
- `git diff --check`：通过。

## Browser / Runtime Notes

- 实际画布确认：Lookbook 为非方形竖向装帧，单页 Manus 为单张纸；首尾合册、键盘导航、Lookbook 收展与双击打开路径均已完成交互验证。
- 最后一轮复核期间，开发服务器收到任务范围外的 `node-workspace/components/stylo/StyloChatContent.tsx` 热更新，随后该组件出现 Hooks 顺序错误并使页面空白；服务器日志同时仍有既有的 `flow-project-main` 重复 key 警告。本次没有修改这两个范围外问题，生产构建、类型检查和全量测试仍全部通过。

## Platform Difference Checks

- 共享 Web / Electron React 界面：通过。
- 无本次功能相关的 macOS、iPadOS、iOS 原生分支。

## Instruction Coverage

- IC = 1.0（7/7 AC 已实现并由单测、源码断言或应用内浏览器交互覆盖）。

## Evidence Block

- Motivation: 让 Lookbook 和 Manus 在画布中成为可收展的实体包装器，并修正 Lookbook 的首尾合册语义。
- Impact: Flow 运行时可见性投影、Lookbook/剧本文档节点叶组件、Lookbook 全屏视图状态机与样式；Flow 数据所有权和索引格式不变。
- Plan: 纯函数投影 → 点击仲裁与持久状态 → 首尾状态机 → 实体装帧样式 → 自动化与浏览器验证。
- Verify: 类型检查、165 项测试、生产构建、差异检查和关键浏览器路径均通过。
- Rollback: `wrapperCollapsed` 为可选字段；投影、交互、状态机和样式分层，可独立回退且无需数据迁移。
