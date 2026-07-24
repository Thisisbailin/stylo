# Plan — Pinoard 构思包装器

Architecture Intent Block:
- Pinoard 是图谱中的包装器节点，不是新的文档容器。文本事实继续只存在于普通 `text` 节点，成员资格由显式关系表达。
- Canvas projection、全屏 Pinoard projection 和 Agent presentation 三层分离：wrapper projection 负责折叠可见性，PinoardPanel 负责文本工作区，CreativeWorkspace 负责唯一 Agent 实例的位置。
- 全屏工作区只读取关系成员，不通过空间邻近猜测成员；中央内容只由 Agent 展开状态决定，不提供额外模式切换。

Work Breakdown:
1. 数据与图谱契约
   - 增加 `pinoard` NodeType、数据接口、默认值、handle/model/schema 支持与 `pinoard-membership` relation。
   - 扩展 wrapper projection 与单元测试。
   - 回滚点：移除新类型及 relation，不影响旧项目。
2. Canvas 入口与包装器节点
   - 添加 PinoardNode、Flow node mapping、Add Nodes 条件项、空画布默认入口。
   - 连接 Pinoard 与文本时规范化为成员关系。
   - 文本节点双击时解析所属 Pinoard；未归属则自动创建并连接，随后以该文本为当前节点打开。
   - 回滚点：Pinoard 可从 option model 与 nodeTypes 独立移除。
3. Pinoard 全屏工作区
   - 新建 PinoardPanel 与独立样式文件。
   - 始终保留一个当前文本主编辑 page；实现成员新增/编辑/删除、左右 rail 和窄屏退化。
   - 回滚点：Canvas 包装器仍能保留关系，即使全屏入口暂时关闭。
4. Agent 中枢投影
   - CreativeWorkspace 持有 active Pinoard 与当前文本节点。
   - 复用单个 StyloAgent；当 Agent 展开且 Pinoard 活跃时通过 `panelStyleOverride` 居中，折叠后恢复文本主编辑区，退出 Pinoard 后恢复标准停靠。
   - 回滚点：移除 override 即恢复标准 Agent 停靠。
5. 验证与审计
   - 更新 wrapper、workspace、menu 与 model 源码契约测试。
   - 运行 typecheck、全量测试、build、diff-check，并以本地浏览器检查主编辑态与 Agent 展开态布局。

Verification Plan (by AC):
- AC1-AC2：NodeType/default/model/handle 源码断言与 wrapperProjection 行为单测。
- AC3-AC5：菜单顺序、条件过滤、空 CTA、节点映射与文本双击自动包装源码测试。
- AC6-AC8：PinoardPanel 源码契约测试；新增/编辑/删除使用纯 helper 单测覆盖数据变化。
- AC6-AC7：本地运行时检查文本主编辑态与 Agent 中枢态布局；确认 Agent 仍只有一个实例。
- AC9：CSS 源码检查主题变量、Grid、窄屏规则和 reduced-motion。
- AC10：`npm run typecheck`、`npm test`、`npm run build`、`git diff --check`。

Rollback Points:
- 无数据库迁移、网络接口或依赖变化。
- `pinoard-membership` 是可忽略的可选 relation；旧客户端仍可把相关节点作为普通 Flow 节点读取。
- Pinoard 数据内容不被复制，回退包装器 UI 后文本节点与正文仍完整保留。
