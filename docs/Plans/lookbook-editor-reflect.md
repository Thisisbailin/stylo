# Reflect — LookBook Booklet Wrapper

## What failed / nearly failed

- 旧实现把 `lookbookLayout` 写进每个素材节点，使包装器状态污染 Flow 成员；索引文档虽然存在，却不是版式事实来源。本轮将新写入迁到 index-owned `lookbookBook.entries`。
- 第一版重构仍保留了工具栏与属性检查器，视觉上是“专门的子应用”；新结构只保留全局品牌/返回，专业操作转入纸面直接交互与右键菜单。
- 透明 PNG 虽保留 alpha，却在 CSS 中主动绘制棋盘底，结果看起来仍是素材预览卡而不是贴纸；现移除底纹、边框和阴影。
- 增量验收发现“新增内容后整本重排”会覆盖用户手工调整。新增策略改为只生成新 entry，已有 entry 原样保留；只有明确选择自动编排才重排。
- 本地开发数据暴露了既有 Flow project key 重复警告。LookBook scoped logs 为零，本轮记录但不越界修改无关模块。

## Three concrete improvements next time

1. 在组件设计前先写清 wrapper/content/index 三者的数据所有权，禁止把视图状态随手塞进内容节点。
2. 为所有“新增”事务增加不变量：现有手工布局、内容与连接不得被隐式重写。
3. 视觉验收同时检查 DOM 层级与真实截图；仅看组件结构无法发现棋盘底、工具栏密度和返回控件位置问题。

## Lessons appended to context memory

- LookBook 是书册投影，不是第二个项目；Flow 拥有内容，索引文档拥有书页版式。
- 透明 PNG 在编辑器中应以成品贴纸呈现，透明通道的调试棋盘只能属于诊断工具。
- 高频交互过程不写 ProjectData：drag 使用 transform，resize 使用 rAF，结束时单次提交。
- 自动编排是显式破坏性版式操作；新增内容必须是增量、保留既有手工布局。
