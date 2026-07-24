# Plan — PDF 输入节点与阅读标注

Architecture Intent Block:
- `pdfInput` 进入现有 NodeFlow 类型、默认值、序列化、项目包和 Foundation 媒体分类。
- PDF 二进制走现有项目私有对象存储；高亮与关联关系保留在项目 JSON 数据。
- 阅读器作为 Flow 覆盖层，通过节点 ID 读取当前 Store，并用 `updateNodeData` 原子更新高亮。
- 文本笔记关系完全复用可见 Flow 连线，不建立第二套关联索引。

Work Breakdown (≤1 day each):
1. 扩展 PDF 节点领域类型、默认值、句柄和资源打包契约。
2. 实现 PDF 节点上传状态、资源替换/清除和预览。
3. 实现双击阅读器、分页/缩放、高亮创建删除与关联笔记侧栏。
4. 接入所有创建入口和 Agent 基础节点契约。
5. 补充自动化测试、类型检查、构建与验证记录。

Verification Plan (by AC):
- AC1/AC3/AC4/AC5：组件契约测试与 TypeScript 类型检查。
- AC2：存储引用收集与 PDF 节点上传代码路径测试。
- AC6：真实最小 PDF Blob 的项目包往返测试。
- AC7：默认值、句柄、Foundation 和 NodeFlow model 单测。
- AC8：`npm run typecheck`、相关测试、`npm run build`。

Rollback Points:
- 删除 `pdfInput` 类型及其节点/阅读器组件即可回退 UI。
- 项目包 `pdfInput: ["pdf"]` 是增量映射；移除后旧项目 JSON 中该节点会被类型边界拒绝，不影响其他媒体。
- PDF 高亮仅存在节点数据中，回退不会修改或损坏原始 PDF。
