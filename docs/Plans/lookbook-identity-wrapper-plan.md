# Plan — Identity Lookbook Wrapper

## Architecture Intent Block

Fountain 文档只产出身份候选；`ProjectData.roles` 继续作为身份索引事实源。身份卡是 Flow 中的身份入口，Lookbook 索引与媒体均继续作为普通 Flow 节点存在，并通过带关系类型的普通 Flow link 构成包装边界。Lookbook 组件只投影视图，不另建持久化媒体集合。

## Work Breakdown

1. 建立可测试的 Fountain 身份候选解析与幂等同步函数。
2. 在剧本文档提交路径中同步身份、身份卡、索引档案和边界连接。
3. 增加 Lookbook 全屏投影视图及身份卡双击入口。
4. 增加单测并运行 typecheck/test/build。

## Verification Plan

- 解析测试：标准/中文角色与场景、占位符过滤、去重。
- 同步测试：首次创建、重复同步幂等、既有身份复用、节点与 link 唯一。
- 静态验证：TypeScript strict。
- 集成验证：全量测试与 Vite 生产构建。

## Rollback Points

- 同步逻辑集中于独立 utility，可从提交回调移除而不影响编辑器。
- Lookbook 是独立 overlay，可移除入口而不改变既有节点数据。
- 新增字段均为 optional，旧项目无需迁移即可读取。
