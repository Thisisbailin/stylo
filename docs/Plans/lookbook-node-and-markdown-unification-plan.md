# Plan — Lookbook 节点与 Markdown 文本统一

Architecture Intent Block:
- 将 Lookbook 的身份语义从“卡片资料”提升为统一包装器节点，同时用兼容分支保留旧项目。
- 页数属于 Lookbook 索引文档，不创建伪 Flow 节点；内容节点与包装器继续通过连接关系关联。
- 文档能力统一落到 Markdown `text` 节点，`mdText` 只作为历史/系统兼容类型。

Work Breakdown (≤1 day each):
1. 扩展 Lookbook 索引状态与页数投影，增加新增页 mutation 与测试。
2. 新增 canonical `lookbook` 节点类型，更新自动创建、运行时映射、连接与标题解析。
3. 重绘 Lookbook Flow 封面节点，禁用 Add Node 人工创建入口。
4. 将用户档案创建入口改为 Markdown `text`，保留旧 `mdText` 渲染与导入。
5. 调整 Lookbook Studio：移除顶栏、增加右侧关闭/新增页按钮、验证空状态与翻页。

Verification Plan (by AC):
- 单元测试覆盖空白页持久化、页数推导、canonical 节点类型与 Markdown 文本创建。
- TypeScript strict typecheck。
- Vite production build。
- 应用内浏览器验证封面节点、置灰入口、打开/新增页/关闭完整交互与控制台错误。

Rollback Points:
- 页数扩展可通过移除可选 `pageCount` 与 UI 按钮回滚，不影响已有 entry。
- canonical 类型可回退自动创建为旧类型；兼容映射保持旧数据可用。
- 档案入口可回退创建 `mdText`，已有 Markdown `text` 仍可作为普通文本节点读取。
