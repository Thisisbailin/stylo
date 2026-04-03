# Qalam Knowledge 架构设计

## 1. 模块定位

`Knowledge` 模块不是用户功能模块，也不是 `NodeFlow` 的一个节点类型扩展。

它的严格定位是：

> **Qalam Agent 的长期记忆数据层。**

这意味着：

- 它服务于 Agent 的持续学习、修正、沉淀与检索
- 它不直接面向用户操作
- 它不以 UI 组件或画布形式作为本体
- 它不是工作流执行层
- 它不是 `NodeFlow` 的一部分

`Knowledge` 的本体是底层知识数据，而不是节点卡片、列表面板或地图画布。

## 2. 架构层级

Qalam 的相关底层应当理解为如下层级：

### 2.1 Canonical Source Layer

项目的确定起点。

主要包括：

- 原始剧本文本
- episode
- scene
- 用户导入的 guide / reference
- 其他明确的项目源资料

这一层的职责是：

- 提供不可随意篡改的源事实
- 作为 Knowledge 的锚点来源
- 作为 Agent 知识修正时的回溯依据

这一层不是 Agent 的长期记忆本体。

### 2.2 Knowledge Core

这是 Agent 的长期记忆数据层，也是本架构的核心。

它负责：

- 沉淀知识条目
- 记录知识之间的关系
- 保存知识与源事实的锚点
- 允许 Agent 持续补全、修正、淘汰旧知识

Knowledge Core 的本体是：

- `entry`
- `relation`
- `anchor`
- `map`

其中：

- `entry` 是第一实体
- `relation` 是 entry 之间的关系记录
- `anchor` 是知识与外部事实/对象的可追溯绑定
- `map` 是大量 entry 与 relation 形成的知识视图

### 2.3 Agent Runtime Layer

Agent 通过 tools 或内部 memory 接口读写 Knowledge Core。

这一层负责：

- 检索知识
- 创建知识
- 修正知识
- 将新的观察沉淀为知识
- 将冲突或过期知识标记为 superseded / rejected

### 2.4 NodeFlow / UI Layer

`NodeFlow` 属于面向用户的上层设施。

它服务于：

- 用户创作工作流
- 生成流程组织
- 资产连接与执行
- 结构化创作可视化

它不是 Knowledge 的本体。

在开发和调试阶段，可以**借用** `NodeFlow` 的 panel / flow 基础设施，将 `Knowledge` 投影为可视结构，以避免底层知识系统黑盒化。

但这种关系必须始终保持为：

> `Knowledge Core` 为真相  
> `NodeFlow Debug Projection` 为投影

而不能反过来让 `NodeFlow` 定义 `Knowledge`。

## 3. 核心判断

### 3.1 Knowledge 不是 Understanding 的改名

`Knowledge` 的含义比 “understanding” 更深一层。

原因：

- Agent 在项目中不是一次性理解后结束
- 它会持续学习
- 会持续补全
- 会持续修正
- 会不断建立更高阶关系

因此，这不再只是一次性“理解结果”，而是可持续演进的知识网络。

### 3.2 Knowledge 是长期记忆，不是工作流节点

Knowledge 虽然也具有“图”的形态，但它的图是**数据组织形式**，不是 `NodeFlow` 那种表层具体设施。

不要将：

- `knowledge map`
- `node flow`
- `ReactFlow node`

视为同一种东西。

它们属于不同层次：

- `knowledge map` 是认知结构
- `node flow` 是用户工作流设施
- `flow node` 是表层可视组件

### 3.3 Entry 是第一实体

Knowledge 的唯一第一实体是 `entry`。

`relation` 不是与 entry 平权的第二种“知识实体”，而是 entry 与 entry 之间的原子关系记录。  
`map` 也不是独立本体，而是 entry 与 relation 的投影。

因此：

- `entry` 是本体
- `relation` 是关系
- `map` 是视图

### 3.4 Knowledge 不是用户可写资料库

用户不直接操作 Knowledge Core。

用户的主要操作对象仍然应当是：

- 剧本
- NodeFlow
- 分镜
- 角色资料
- 生成节点
- 资产

Knowledge 只服务于：

- Agent 的长期记忆
- Agent 的知识沉淀
- Agent 的认知修正
- 开发者调试观察

## 4. 核心数据模型

## 4.1 KnowledgeEntry

Knowledge 的最小原子单位。

```ts
type KnowledgeEntry = {
  id: string;
  ref: string;
  kind: string;
  title: string;

  payload: Record<string, unknown>;
  meta?: Record<string, unknown>;

  status: "draft" | "working" | "accepted" | "superseded" | "rejected";
  confidence?: "low" | "medium" | "high";

  anchors: KnowledgeAnchor[];

  createdAt: number;
  updatedAt: number;
};
```

### 字段原则

- `id`
  内部稳定标识

- `ref`
  Agent 与工具共享的稳定引用

- `kind`
  开放命名空间类型，例如：
  - `character.fact`
  - `character.relationship`
  - `scene.constraint`
  - `theme.inference`
  - `design.decision`
  - `prompt.strategy`

- `title`
  用于快速识别知识单元，不承担完整语义

- `payload`
  条目的真实内容

- `meta`
  辅助元信息，不等于条目正文

- `status`
  知识生命周期状态

- `confidence`
  Agent 当前对该知识的确信程度

- `anchors`
  知识的来源锚点

### Entry 原子化原则

一个 `entry` 只表达一个稳定知识点。

不建议一开始就把这些做成单个超级条目：

- 完整人物大全
- 一整集分析总结
- 一整套导演方案
- 一整篇风格说明

应优先拆成更稳定的知识颗粒，例如：

- 一个角色事实
- 一个角色关系
- 一个场景约束
- 一个情绪判断
- 一个主题推断
- 一个设计决策
- 一个 prompt 策略

## 4.2 KnowledgeRelation

关系记录应保持极简。

```ts
type KnowledgeRelation = {
  id: string;

  fromEntryId: string;
  toEntryId: string;
  type: string;

  weight?: number;
  status?: "active" | "superseded";

  createdAt: number;
  updatedAt: number;
};
```

### 关系原则

`relation` 不是“第二种 entry”。

第一阶段不建议在 relation 上挂载：

- 大段正文
- 独立摘要
- 复杂 payload
- 用户展示专用字段
- UI 坐标信息

relation 应尽量只保留：

- 谁指向谁
- 关系类型
- 关系是否仍有效

### Relation Minimalism

Knowledge 关系必须足够轻，原因是：

- 长期记忆网络会逐渐变大
- Agent 高频需要做局部遍历
- 厚 relation 会迅速把系统变成难维护的半图谱平台

## 4.3 KnowledgeAnchor

Knowledge 必须可追溯。

```ts
type KnowledgeAnchor = {
  type: "script" | "episode" | "scene" | "guide" | "nodeflow" | "asset";
  ref: string;
  span?: string;
};
```

### Anchor 的作用

- 让知识可以回溯到源事实
- 让 Agent 修正旧知识时有依据
- 防止知识层漂移成“自我循环的幻觉仓库”

Knowledge 不应只存“结论”，而不存任何来源。

## 4.4 KnowledgeMap

`map` 是视图，不是独立真相。

```ts
type KnowledgeMapView = {
  revision: number;
  entries: KnowledgeEntry[];
  relations: KnowledgeRelation[];
};
```

### Map 的定位

Knowledge 的 map 代表：

- 某个局部认知区域
- 某个主题簇
- 某个实体邻域
- 某个任务上下文下的知识投影

它是数据组织形式，不是画布对象，不自带 UI 几何信息。

## 5. 架构原则

## 5.1 Memory First

Knowledge 的设计首先服务于 Agent 的长期记忆，而不是服务于用户可视化。

如果某个字段只对画布或展示有意义，就不应进入 Knowledge Core。

## 5.2 Entry First

所有设计从 `entry` 出发。

不要优先围绕：

- UI 节点
- 画布连线
- 展示卡片
- 用户视图

展开设计。

## 5.3 Anchor Everything

知识沉淀必须尽量带来源锚点。

即便是高层推断，也应尽量能追溯到：

- 剧本片段
- episode / scene
- guide
- NodeFlow 节点
- 已生成资产

## 5.4 Derived, Not Duplicated

能从 Knowledge Core 推导出的东西，不要再作为第二套真相存储。

例如：

- 角色资料卡是投影
- 场景卡片是投影
- 知识网络局部视图是投影
- Debug NodeFlow 视图也是投影

## 5.5 Correctable, Not Immutable

Knowledge 不是一次性写入后永远不变。

Agent 在长期运行中会：

- 新增知识
- 修正知识
- 弱化知识
- 废弃旧知识

因此必须天然支持：

- `superseded`
- `rejected`
- `confidence`
- 新旧知识并存一段时间

而不是只允许“覆盖写入”。

## 5.6 Read Small, Derive Big

Agent 不应默认吞整张知识图。

正确方式是：

- 先读局部 entry
- 再读邻域 relation
- 再按需要构造局部 map

即：

- 小读取
- 小搜索
- 小修正
- 大结构为派生结果

## 5.7 No UI Leakage

Knowledge Core 里不应出现这些字段作为本体：

- `x / y`
- `parentId`
- `width / height`
- `view`
- ReactFlow / NodeFlow handles
- 节点组件状态

这些如果未来需要用于调试投影，应该存在于 projection 层，而不是本体层。

## 6. 与 NodeFlow 的关系

## 6.1 不是并列关系

Knowledge 比 NodeFlow 更底层。

NodeFlow 是面向用户的上层设施。  
Knowledge 是 Agent 的长期记忆数据层。

两者不并列，也不共享同一本体。

## 6.2 只允许 Projection，不允许反向定义

允许：

- 将 Knowledge 映射为调试节点
- 将 Knowledge 映射为调试连线
- 将 Knowledge 映射为可视化 map

不允许：

- 用 NodeFlow node 反向定义 KnowledgeEntry
- 用 NodeFlow link 反向定义 KnowledgeRelation
- 用画布几何结构决定知识本体结构

## 6.3 Debug Projection 的角色

为了避免底层知识系统黑盒化，可以提供一个 `Knowledge Inspector`。

这个 Inspector 可以：

- 借用 `NodeFlow` 的 panel / flow 承接能力
- 把 Knowledge 投影成可调试结构
- 让开发者直观看到 entry / relation / map

但它的严格定位必须是：

> 调试投影层  
> 不是知识本体  
> 不是用户产品面板

## 7. 模块结构建议

建议新增独立目录，而不是继续把 Knowledge 寄存在 `nodeflow/` 中：

```txt
knowledge/
  types.ts
  defaults.ts
  mutations.ts
  queries.ts
  maps.ts
  serialization.ts
  anchors.ts
  inspector/
    projection.ts
    KnowledgePanel.tsx
```

### 各模块职责

- `types.ts`
  Knowledge Core 的本体类型

- `defaults.ts`
  默认值与初始工厂

- `mutations.ts`
  entry / relation 的纯变更逻辑

- `queries.ts`
  局部读取、邻域遍历、检索

- `maps.ts`
  局部 map 的派生与构造

- `serialization.ts`
  持久化与导入导出

- `anchors.ts`
  source anchor 构造与解析

- `inspector/projection.ts`
  Knowledge -> Debug Projection 映射

- `inspector/KnowledgePanel.tsx`
  开发调试视图

## 8. 非目标

当前阶段 Knowledge 不负责：

- 用户直接编辑
- 用户产品化资料库
- 用户交互式知识画布
- 面向用户的角色库/场景库设计
- 与 NodeFlow 的深度双向联动

这些属于未来可能的投影层议题，不属于当前长期记忆本体设计范围。

## 9. 当前实现方向的指导

基于本架构，当前代码中的这些内容应视为过渡：

- `understanding` 命名
- `KnowledgeNodeData`
- `knowledge` 作为 `NodeType`
- `UnderstandingPanel`
- 通过 `plane / assetType / content` 表达理解资产本体

它们可以暂时存在于过渡期，但不应继续扩大为长期核心。

长期上：

- `understanding` 应退出命名体系
- `Knowledge` 应成为独立底层模块
- `UnderstandingPanel` 应让位于 `Knowledge Inspector`
- NodeFlow 中的 `knowledge` 节点应仅保留为调试投影，而不是本体

## 10. 实施路线

### Phase 1

先定义 `Knowledge Core` 最小数据模型：

- `KnowledgeEntry`
- `KnowledgeRelation`
- `KnowledgeAnchor`
- `KnowledgeMapView`

### Phase 2

建立基础读写能力：

- 新建 entry
- 更新 entry
- 标记 superseded / rejected
- 新建 relation
- 查询局部邻域

### Phase 3

建立持久化与 revision 机制：

- `revision`
- 导入导出
- 冲突检测

### Phase 4

建立 `Knowledge Inspector`

- 先提供开发调试视图
- 允许借用 NodeFlow 可视化壳
- 但保持单向 projection

### Phase 5

最后才考虑上层 Agent tools 如何正式接入新的 Knowledge Core。

## 11. 一句话总纲

> Knowledge 不是给用户操作的图形工作流。  
> 它是 Qalam Agent 的长期记忆数据层。  
> 它以 entry、relation、anchor 和 map 组织知识，  
> 可以被调试性地投影到 NodeFlow，  
> 但绝不能被 NodeFlow 反向定义。
