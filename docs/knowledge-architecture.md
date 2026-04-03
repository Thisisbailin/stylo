# Qalam Knowledge 架构设计

## 1. 模块定位

`Knowledge` 模块的严格定位是：

> **Qalam Agent 的长期记忆数据层。**

它不是用户功能模块，不是资料库面板，不是 `NodeFlow` 的一个节点类型扩展，也不是工作流执行层。

这意味着：

- 它服务于 Agent 的长期学习、持续修正、知识沉淀与检索
- 它不直接面向用户操作
- 它不以 UI 组件或画布形式作为本体
- 它不由 `NodeFlow` 定义
- 它是比 `NodeFlow` 更底层的数据架构

`Knowledge` 的本体是底层知识数据，而不是节点卡片、列表面板或可视化画布。

## 2. 核心判断

## 2.1 Knowledge 是长期记忆，不是“理解结果”

`Knowledge` 不应被理解为某次分析后的静态理解结果。

Agent 在项目中的认知不是一次性完成的，它会持续：

- 学习
- 补全
- 修正
- 淘汰旧知识
- 建立更高阶关系

因此，Knowledge 表示的是 **可持续演进的知识网络**，而不是一次性的 understanding。

## 2.2 Knowledge 的设计理念是“图式”

Knowledge 的本质是网状的，但这里的“网状”不是指某种具体 UI 形态，而是指更底层的数据组织形式：

> **原子，以及原子关系。**

换句话说，Knowledge 的底层真相可以被抽象成最简洁的 `a-b` 元表示：

- `a` 是知识原子
- `b` 是另一个知识原子
- `a-b` 是它们之间的关系

大量这样的原子及其关系，自然折叠形成知识网络，也即 `map`。

因此，Knowledge 的“图式”不是额外的一层复杂图谱本体，而是：

- 原子
- 原子关系
- 由它们自然投影出的地图

## 2.3 Knowledge 与 NodeFlow 理念统一，但层级不同

`Knowledge` 和 `NodeFlow` 在设计理念上是一致的：

- 都遵循 `node -> link -> map`
- 都以“原子 + 关系 + 投影”为基础
- 都强调极简、原子化、可缩放

但两者不在同一层级。

- `Knowledge` 是更底层的 Agent 长期记忆数据层
- `NodeFlow` 是更上层的用户工作流设施

`NodeFlow` 为当前 `Knowledge` 的设计提供了实践经验，但不能反过来定义 `Knowledge` 的本体。

## 3. 架构层级

Qalam 的相关底层应理解为以下层级：

### 3.1 Canonical Source Layer

项目的确定起点。

主要包括：

- 原始剧本文本
- episode
- scene
- guide / reference
- 其他明确的项目源资料

这一层的职责是：

- 提供不可随意篡改的源事实
- 作为 Knowledge 的锚点来源
- 作为 Agent 修正知识时的回溯依据

这一层不是 Agent 的长期记忆本体。

### 3.2 Knowledge Core

这是 Agent 的长期记忆数据层，也是本架构的核心。

它负责：

- 沉淀知识原子
- 记录知识原子之间的关系
- 保存知识与源事实的锚点
- 允许 Agent 持续补全、修正、弱化、淘汰旧知识

Knowledge Core 的本体是：

- `knowledge node`
- `knowledge link`
- `knowledge map`

其中：

- `knowledge node` 是第一实体
- `knowledge link` 是节点之间的原子关系记录
- `knowledge map` 是大量节点与关系形成的投影

### 3.3 Agent Runtime Layer

Agent 通过 tools 或内部 memory 接口读写 Knowledge Core。

这一层负责：

- 检索知识
- 创建知识
- 修正知识
- 将新的观察沉淀为知识
- 将过期或冲突知识标记为 `superseded / rejected`

### 3.4 Debug / Inspector Layer

为了避免底层知识系统黑盒化，可以提供 `Knowledge Inspector`。

它的职责是：

- 展示当前 knowledge nodes
- 展示 knowledge links
- 展示局部或全局 knowledge map 投影
- 用于开发和调试观察

这一层可以借用 `NodeFlow` 的 panel / flow 承接能力，但必须始终保持：

> `Knowledge Core` 为真相  
> `Inspector Projection` 为投影

它不是知识本体，也不是用户产品面板。

## 4. 核心数据模型

## 4.1 KnowledgeNode

Knowledge 的唯一第一实体。

Knowledge Node 表示一个稳定的知识原子节点。

```ts
type KnowledgeNode = {
  id: string;
  ref: string;
  kind: string;

  package: {
    title: string;
    status: "draft" | "working" | "accepted" | "superseded" | "rejected";
    confidence?: "low" | "medium" | "high";
  };

  content: Record<string, unknown>;
  meta?: Record<string, unknown>;
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
  - `source.script`
  - `source.episode`
  - `source.scene`
  - `character.fact`
  - `scene.constraint`
  - `theme.inference`
  - `design.decision`
  - `prompt.strategy`

- `package`
  节点的略览层

- `content`
  节点的精读层真实内容

- `meta`
  辅助元信息，不等于正文

- `anchors`
  知识来源锚点

### 两层读取原则

Knowledge Node 天然支持两层动作：

1. `package layer`
  用于整体略览，快速知道“这是什么知识节点”

2. `content layer`
  用于精读，深入查看知识的具体内容

也就是：

- 先识别
- 再深读

这条原则与 `NodeFlow` 的读取理念一致。

### Knowledge Node 原子化原则

一个 `KnowledgeNode` 只表达一个稳定知识点。

不建议一开始就把这些做成单个超级节点：

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

## 4.2 KnowledgeLink

Knowledge Link 是知识节点之间的原子关系记录。

它不是与 `KnowledgeNode` 平权的第二种知识本体。

```ts
type KnowledgeLink = {
  id: string;

  fromNodeId: string;
  toNodeId: string;
  type: string;

  weight?: number;
  status?: "active" | "superseded";

  createdAt: number;
  updatedAt: number;
};
```

### Link 原则

第一阶段保持极简。

不要过早在 link 上挂载：

- 大段正文
- 独立摘要
- 复杂 payload
- UI 展示字段
- 几何位置

Knowledge Link 应尽量只保留：

- 谁指向谁
- 关系类型
- 关系是否仍有效

### 第一批关系类型建议

第一阶段建议只保留高度抽象的关系类型，例如：

- `derived_from`
- `describes`
- `supports`
- `contradicts`
- `contains`
- `references`

不要过早把关系类型做成厚重的本体系统。

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

Knowledge 的 map 表示由 knowledge nodes 和 knowledge links 形成的知识网络投影。

```ts
type KnowledgeMap = {
  revision: number;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
};
```

这里的关键不是“存很多地图实体”，而是：

> 一张知识网，在不同 lens 下投影出不同 map。

### Knowledge Map Lens

Knowledge 的 map 需要支持不同尺度的缩放和局部观察。

```ts
type KnowledgeMapLens = {
  id: string;
  kind: "full" | "local" | "anchor" | "kind" | "focus";
  focusNodeRefs?: string[];
  anchorRefs?: string[];
  nodeKinds?: string[];
  depth?: number;
};
```

这样：

- `full` 表示整张知识网
- `local` 表示围绕某个节点的局部邻域
- `anchor` 表示围绕某类源锚点的知识投影
- `kind` 表示某类知识节点的专题地图
- `focus` 表示当前任务上下文下的知识聚焦图

也就是说，Knowledge 的地图天然是可缩放的：

- 可以像地区地图
- 可以像城市地图
- 也可以像国家级投影

甚至可以形成 `map of map` 的多尺度投影体系。

但这些都不是新的本体，只是同一知识网在不同视野下的投影。

## 5. 架构原则

## 5.1 Memory First

Knowledge 的设计首先服务于 Agent 的长期记忆，而不是服务于用户可视化。

如果某个字段只对画布或展示有意义，就不应进入 Knowledge Core。

## 5.2 Node-Link-Map First

Knowledge 的底层真相也遵循：

- `node` 是本体
- `link` 是关系
- `map` 是投影

不要优先围绕：

- UI 节点
- 画布连线
- 展示卡片
- 用户视图

展开设计。

## 5.3 Package Before Content

知识节点必须天然支持两层读取：

- 先通过 `package` 略览
- 再通过 `content` 精读

不要让 Agent 一开始就吞入所有细节。

## 5.4 Anchor Everything

知识沉淀必须尽量带来源锚点。

即便是高层推断，也应尽量能追溯到：

- 剧本片段
- episode / scene
- guide
- NodeFlow 节点
- 已生成资产

## 5.5 Derived, Not Duplicated

能从 Knowledge Core 推导出的东西，不要再作为第二套真相存储。

例如：

- 局部知识地图是投影
- 调试视图是投影
- map lens 也是投影规则

## 5.6 Correctable, Not Immutable

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

## 5.7 Read Small, Derive Big

Agent 不应默认吞整张知识图。

正确方式是：

- 先读局部 knowledge node
- 再读邻域 knowledge links
- 再按需要构造局部 knowledge map

即：

- 小读取
- 小搜索
- 小修正
- 大结构为派生结果

## 5.8 One Graph, Many Lenses

Knowledge Core 只有一张知识网真相。

不同的地图、局部视图、专题视图，都来自不同 lens，而不是第二套独立地图存储。

## 5.9 No UI Leakage

Knowledge Core 里不应出现这些字段作为本体：

- `x / y`
- `parentId`
- `width / height`
- `view`
- ReactFlow / NodeFlow handles
- 节点组件状态
- 用户展示专用装饰字段

这些如果未来需要用于调试投影，应该存在于 projection 层，而不是本体层。

## 6. 与 NodeFlow 的关系

## 6.1 NodeFlow 不是 Knowledge 的本体

`NodeFlow` 属于面向用户的上层设施。

它服务于：

- 用户创作工作流
- 生成流程组织
- 资产连接与执行
- 结构化创作可视化

它不是 Knowledge 的本体。

## 6.2 NodeFlow 只是当前可借用的调试壳

在开发和调试阶段，可以借用 `NodeFlow` 的 panel / flow 承接能力，将 `Knowledge` 投影为可视结构，以避免底层知识系统黑盒化。

但这种关系必须始终保持为：

> `Knowledge Core` 为真相  
> `NodeFlow Debug Projection` 为投影

而不能反过来让 `NodeFlow` 定义 `Knowledge`。

## 6.3 理念同构，不是本体同构

`Knowledge` 与 `NodeFlow` 在理念上同构：

- 都遵循 `node -> link -> map`
- 都以图式组织数据
- 都强调极简、原子化、可缩放

但它们的本体并不相同：

- `KnowledgeNode` 不是 `NodeFlowNode`
- `KnowledgeLink` 不是 `NodeFlowLink`
- `KnowledgeMap` 不是画布 map

## 7. 模块结构建议

建议维持独立目录，而不是继续把 Knowledge 寄存在 `nodeflow/` 中：

```txt
knowledge/
  types.ts
  defaults.ts
  builders.ts
  anchors.ts
  mutations.ts
  queries.ts
  maps.ts
  serialization.ts
  inspector/
    projection.ts
    KnowledgePanel.tsx
```

### 各模块职责

- `types.ts`
  Knowledge Core 本体类型

- `defaults.ts`
  默认值与初始工厂

- `builders.ts`
  Knowledge node / link 的最小构造规则

- `anchors.ts`
  source anchor 构造与解析

- `mutations.ts`
  knowledge node / link 的纯变更逻辑

- `queries.ts`
  局部读取、邻域遍历、检索

- `maps.ts`
  基于 lens 的 knowledge map 派生与构造

- `serialization.ts`
  持久化与导入导出

- `inspector/projection.ts`
  Knowledge -> Debug Projection 映射

- `inspector/KnowledgePanel.tsx`
  开发调试承接面板

## 8. 当前实施路线

### 第一阶段

先落地 Knowledge Core 的最小本体：

- `KnowledgeNode`
- `KnowledgeLink`
- `KnowledgeAnchor`
- `KnowledgeMap`

并从 Canonical Source Layer 种入第一批只读 source nodes。

### 第二阶段

补第一批 source links，让知识网真正开始形成：

- script -> episode
- episode -> scene
- guide -> source node

### 第三阶段

再引入 Agent 写入与修正：

- 新增 derived knowledge nodes
- 新增知识 links
- 基于 anchors 做知识修正与 supersede

### 第四阶段

最后再做 `Knowledge Inspector` 的图式调试投影，而不是反过来先设计用户面板。
