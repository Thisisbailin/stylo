# Plan — LookBook Booklet Wrapper

## Architecture Intent Block

```text
Canvas + Flow project
  ├─ identityCard
  │   └─ lookbookIndexNodeId ─────────────┐
  ├─ media/text member nodes              │
  └─ typed lookbook-membership links      │
                                         ▼
                               mdText index document
                               lookbookBook.entries[]
                               { nodeId, spreadIndex, layout }
                                         │
                                         ▼
                              full-screen booklet projection
                              cover ⇄ spread ⇄ page turn
                              direct drag / resize / edit
```

内容与关系由 Flow 拥有，书册版式由附带索引文档拥有。UI 不手写图结构，所有节点创建、索引写入和 revision 更新由纯事务完成。

## Work Breakdown

1. [x] 建立 index-owned `LookbookBookState`，实现旧 member-owned layout 的兼容投影。
2. [x] 实现确定性跨页编排、页内归一化坐标、跨页移动与显式整本重排事务。
3. [x] 保持图片/文本创建为真实 Flow 节点与 typed membership link，并在同一次 revision 更新索引文档。
4. [x] 重写活跃 LookBook 为封面/打开/合上/双页/翻页的全屏 Canvas 包装器。
5. [x] 删除属性检查器与顶栏动作群；把新增、导入、编排、适配、旋转、层级和跨页操作收入右键菜单。
6. [x] 实现纸面直接拖动、rAF 缩放、文本直编；透明 PNG 使用 sticker surface。
7. [x] 增加所有权、事务、兼容、手工布局保护、PNG 与渲染架构测试。
8. [x] 运行浏览器桌面尺寸真实交互验收：创建身份、打开书册、右键添加文本、合上/打开、离开后重新进入并确认内容仍在。
9. [x] 完整生产门禁与文档归档；并行 Cinewor 未跟踪代码造成的全仓 strict/test 编译阻塞已隔离记录。

## Verification Plan

- 所有权：新写入只进入索引 `lookbookBook`；成员不新增 `lookbookLayout`。
- 稳定性：手工 layout 后新增文本/图片，原条目坐标与 zIndex 不变。
- 事务：图片/文本节点、membership link、索引条目与 revision 原子更新。
- 交互：返回 Flow、右键菜单、页内文本、封面开合、重新进入持久化、前后翻页。
- PNG：alpha color type 4/6 与 tRNS 解析；sticker CSS 无棋盘纹、无表面框。
- 性能：drag transform、resize rAF、pointer listener cleanup、memoized item rendering。
- 门禁：`git diff --check`、`npm run typecheck`、`npm test`、`npm run build`、`npm audit --audit-level=high`。

## Rollback Points

- 活跃入口仍可切回旧 `LookbookLeafPanel`，Flow 内容不受影响。
- `lookbookBook.version` 允许未来 schema migration；旧 `lookbookLayout` 保留为只读兼容字段。
- 新增内容仍是普通 Flow 节点与标准连接，不需要媒体数据迁移。
