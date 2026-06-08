# Qalam Knowledge 架构设计

## 1. 模块定位

`Knowledge` 模块的严格定位是：

> **Qalam Agent 的长期记忆数据层。**

它不是资料库面板，不是 `NodeFlow` 的一个节点类型扩展，也不是工作流执行层。

这意味着：

- 它服务于 Agent 的长期学习、持续修正、知识沉淀与检索
- 它不面向用户编辑
- 它可以面向用户观测
- 它不以 UI 组件或画布形式作为本体
- 它不由 `NodeFlow` 定义
- 它是比 `NodeFlow` 更底层的数据架构

`Knowledge` 的本体是底层知识数据，而不是节点卡片、列表面板或可视化画布。

但这并不意味着它必须完全隐藏。

在产品表层，`Knowledge` 将作为 `Nodes` 模块中的正式只读平面存在，用于让用户观察 Agent 当前的长期记忆状态，避免长期记忆系统黑箱化。

正式 `Knowledge Surface` 不提供任何手动 seed、手动写入或手动修正入口。Canonical Source Layer 应由底层初始化/同步逻辑幂等维护，而不是由用户在表层点击触发。

因此需要严格区分：

- `Knowledge Core`：Agent 的长期记忆数据层
- `Knowledge Surface`：用户可见但不可编辑的观测面
- `Mutation Lab`：仅限开发实验，不属于正式产品路径

这一层的设计目标不是替 Agent 预先规定“应该怎样理解剧本”，而是提供一套足够原子、足够抽象、足够开放的知识容器，让 Agent 能依据实际 source 自主沉淀、修正和扩展自己的知识网络。

因此当前还需要同时坚持：

- **Agent First, Schema Light**
- **Protected Mutation Boundaries**
- **Search Over Curated Signals, Not Raw JSON Noise**
- **Readable For Humans, Writable Only By Agent**
- **Knowledge Surface Is Read-Only**

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

这套图式的意义在于：

- 不预设固定知识分类体系
- 不预设固定理解步骤
- 不要求 Agent 按人类事先写死的模板理解文本

它只规定最小结构：

- 有知识原子
- 有原子关系
- 有从局部到整体的 map 投影

至于 Agent 最终沉淀出什么知识节点、建立什么关系、形成什么局部地图，应主要由 Agent 自身根据实际 source 判断，而不是由人工硬编码既定思路。

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

当前第一阶段只围绕剧本正文三层展开：

- `script`
- `episode`
- `scene`

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

Knowledge Core 提供的是 **结构约束**，不是 **知识规范**。

也就是说：

- 系统只提供最小的 node / link / map 容器
- 不强制规定“必须有人物关系、事件、节奏冲突、主题”等固定知识类别
- 不强制规定 Agent 必须按某种既定 schema 撰写知识

知识内容本身应尽量由 Agent 在 source 驱动下自由生成。

但这并不意味着接口边界可以松散。Knowledge Core 还必须提供最小但明确的保护：

- canonical-source 不能被直接覆写
- derived knowledge 的修正默认走 `supersede`
- link 不能指向不存在的 node
- 对外公共写入口应优先暴露命令式生命周期入口，而不是通用 upsert / remove
- 整快照替换与清空只应保留为显式 `dev-only` 调试入口，不应成为长期公共写接口

### 3.3 Agent Runtime Layer

Agent 通过 tools 或内部 memory 接口读写 Knowledge Core。

这一层负责：

- 检索知识
- 创建知识
- 修正知识
- 将新的观察沉淀为知识
- 将过期或冲突知识标记为 `superseded / rejected`

当前与上层 Agent 工具链的职责边界应明确为：

- `Knowledge` 资源层：
  既回答 canonical-source script backbone，也回答长期记忆读取
- `NodeFlow` 资源层：
  只回答当前工作画布结构与执行状态

但这里要强调的是，这三层不再代表三个彼此割裂的模块，而是同一个图式世界中的三个作用层级。

Qalam Agent 面对的不是“读文档系统 + 写知识系统 + 操作工作流系统”三套独立对象，而是同一个项目中心结构在不同层面的展开。

因此工具心智应统一理解为：

- `read`
  - 是统一的图式读取动作
  - 覆盖 `Knowledge / NodeFlow`
  - 读取的是同一项目世界在不同层级上的 `node / link / map` 事实
  - canonical source facts 已经内嵌在 `Knowledge` 的 canonical-source backbone 中
- `edit`
  - 属于 `Knowledge` 层
  - 本质上是在底层长期记忆图上编辑 `knowledge node / knowledge link`
  - 负责 Agent 的知识沉淀、修正与长期记忆演化
- `operate`
  - 属于 `NodeFlow` 层
  - 本质上是在表层工作流画布上操作 `nodeflow node / nodeflow link / nodeflow map`
  - 负责帮助用户推进当前工作流结构与执行流

也就是说，Agent 与用户并不是各自在不同系统中协作，而是围绕同一个中心画布世界的不同平面与层级协同工作。

未来如果重新开放 Agent 写入工具，`edit` 应属于 `Knowledge` 层，而不是回写到 `NodeFlow` 的旧知识节点心智。

## 3.3.1 工具协议

为了让 Agent 真正把 `Knowledge` 与 `NodeFlow` 视为同一个图式世界中的不同平面，工具协议也必须统一。

当前正式协议应理解为：

- `read`
  - 工具：
    - `list_project_resources`
    - `read_project_resource`
    - `search_project_resource`
  - 输入主轴：
    - `layer`
    - `entity`
    - `view`
  - 其中：
    - `layer ∈ { knowledge, nodeflow }`
    - `entity ∈ { node, link, map, approval }`
    - `view` 用于区分 `identity / detail / full / local / anchor / lens / lifecycle / timeline`

- `edit`
  - 工具：
    - `edit_knowledge_resource`
  - 输入主轴：
    - `entity`
    - `action`
  - 当前只允许：
    - `node`: `create / supersede`
    - `link`: `connect / unlink`

- `operate`
  - 工具：
    - `operate_project_resource`
  - 输入主轴：
    - `entity`
    - `action`
  - 当前只允许：
    - 在 `NodeFlow` 中对 node 执行 `create / update / move / remove`
    - 在 `NodeFlow` 中对 link 执行 `connect / unlink`

三者的输出协议也应统一收敛为：

- `target`
- `layer`
- `entity`
- `artifact`

其中 `artifact` 作为统一图式载荷，优先表达：

- `kind`
- `id`
- `ref`
- `title`
- `node_kind`
- `source`
- `destination`

这样，Agent 不再需要按旧架构记忆不同工具返回的割裂 shape，而是在同一套 `node / link / map` 语言里工作。

### 3.4 Knowledge Surface Layer

为了避免底层知识系统黑箱化，Qalam 需要提供正式的 `Knowledge` 查阅面。

它的职责是：

- 展示当前 knowledge nodes
- 展示 knowledge links
- 展示局部或全局 knowledge map 投影
- 让用户观察 Agent 长期记忆的当前状态
- 作为 `Nodes` 模块中的正式 `Knowledge` 背面平面存在

这一层可以借用 `NodeFlow` 的 panel / flow 承接能力，但必须始终保持：

> `Knowledge Core` 为真相  
> `Knowledge Surface Projection` 为投影

它不是知识本体，但它是正式产品表层中的只读观察面。

当前正式产品承载方式已经明确为：

- `Nodes / Flow`：正面，用户工作流
- `Nodes / Knowledge`：背面，Agent 长期记忆只读观测面

这意味着 `Nodes` 已经成为项目的中心区域，而 `Knowledge Surface` 不再是一个独立面板系统。

在这个中心区域中：

- 正面承托用户与 Agent 的工作流协同
- 背面承托 Agent 长期记忆的可观测映射

它们不是两个割裂系统，而是一体两面的同一张画布。

也就是说，`Knowledge Surface` 不再作为一个独立长期面板存在，而是作为与 `Flow` 同一张无限画布的背面出现。

用户可以：

- 查阅当前有哪些 knowledge nodes / links / maps
- 观察某个 `script / episode / scene` anchor 下沉淀了哪些长期记忆
- 观察 Agent 如何通过 supersede 持续修正知识

用户不可以：

- 直接手动创建 knowledge node
- 直接手动改写 knowledge link
- 直接覆写 canonical-source
- 绕过 Agent 生命周期机制直接修正长期记忆

当前阶段还需坚持：

- 正式 `Knowledge Surface` 不暴露 `Mutation Lab`
- 开发写入实验能力如果保留，应与正式 `Nodes / Knowledge` 产品路径分离

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
  开放命名空间类型。

  当前系统只对 canonical source 的起点种类作最小约定，例如：
  - `source.script`
  - `source.episode`
  - `source.scene`

  对于 Agent 后续沉淀出的 derived knowledge，不预设固定 ontology。
  `kind` 应保持开放，让 Agent 能根据实际需要形成自己的知识命名空间。

  但“开放”不等于“无边界”。系统只施加极轻的命名约束：

  - canonical source 必须使用 `source.*`
  - derived kind 不得占用 `source.*`
  - kind 应采用轻量 namespaced 形式，例如：
    - `derived.note`
    - `derived.observation`
    - `memory.patch`

  这不是在替 Agent 设计知识模板，只是为了防止长期运行后 `kind` 变脏。

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

不建议一开始就把知识节点做成单个超级块：

- 完整人物大全
- 一整集分析总结
- 一整套导演方案
- 一整篇风格说明

但这里的“更小颗粒”并不等于由人工写死一套固定知识模板。

正确原则是：

- 保持知识节点小而稳定
- 让 Agent 自主决定哪些知识值得成为节点
- 不人为限定知识只能长成某几类预设内容

系统提供的是容器，不是剧本理解标准答案。

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

这些关系类型只是最小抽象示例，而不是强制性的知识关系目录。
如果 Agent 在实践中需要新的关系类型，应允许在最小结构约束下自由扩展。

## 4.3 KnowledgeAnchor

Knowledge 必须可追溯。

```ts
type KnowledgeAnchor = {
  type: "script" | "episode" | "scene" | "nodeflow" | "asset";
  ref: string;
  span?: string;
};
```

### Anchor 的作用

- 让知识可以回溯到源事实
- 让 Agent 修正旧知识时有依据
- 防止知识层漂移成“自我循环的幻觉仓库”

Knowledge 不应只存“结论”，而不存任何来源。

### Anchor Ref 约定

`KnowledgeAnchor` 的传输和调试展示应统一遵守：

- `script:raw`
- `episode:1`
- `scene:1-3`

也就是说：

- `type` 决定锚点类别
- `ref` 只保存该类别内部的稳定引用值

不要混用：

- `source:script`
- `ep:1`

这类旧式临时表示。它们不是长期的 Knowledge anchor 协议。

## 4.3.1 生命周期边界

Knowledge Core 不规定 Agent 必须沉淀什么知识，只规定最小生命周期边界：

- `canonical-source`
  代表源事实起点，不应被 Agent 直接覆盖或重写

- `agent-derived`
  代表 Agent 自主沉淀出的知识节点和关系

- 当 Agent 需要修正一个 derived knowledge node 时，优先通过 `supersede`
  的方式新增一个后继节点，并将旧节点标记为 `superseded`

- 新的 knowledge link 只能建立在真实存在的 knowledge node 之间

也就是说，系统提供的是：

- 最小结构容器
- 来源边界
- 修正方式

而不是人为规定 Agent 必须写成人物关系、事件树、冲突表这类固定知识模板。

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

第一阶段应优先落下这些最小 lens：

- `full`
- `local`
- `anchor`
- `kind`
- `focus`

它们不需要一次做重，但不能长期只停留在类型承诺里。

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

## 5.3 Agent First, Schema Light

Knowledge 的设计必须优先服务于 Agent 的智能发挥，而不是服务于人工预设的知识规范。

这意味着：

- 少人工干预
- 少预设分类
- 少预设理解路径
- 少预设知识模板

系统只提供最小图式结构，不替 Agent 规定应该如何理解 source。

## 5.4 Package Before Content

知识节点必须天然支持两层读取：

- 先通过 `package` 略览
- 再通过 `content` 精读

不要让 Agent 一开始就吞入所有细节。

## 5.5 Anchor Everything

知识沉淀必须尽量带来源锚点。

即便是高层推断，也应尽量能追溯到：

- 剧本片段
- episode / scene
- NodeFlow 节点
- 已生成资产

## 5.6 Derived, Not Duplicated

能从 Knowledge Core 推导出的东西，不要再作为第二套真相存储。

例如：

- 局部知识地图是投影
- 调试视图是投影
- map lens 也是投影规则

## 5.7 Correctable, Not Immutable

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

## 5.8 Protected Mutation Boundaries

生命周期规则不应只停留在 helper 中，而应尽量体现在公共接口边界上。

对开发期内部实现可以保留低层 mutation primitive，但对外主入口应优先是：

- create derived
- create anchored derived
- create derived link
- supersede derived
- supersede anchored derived

而不是直接开放通用 upsert / remove。

## 5.9 Read Small, Derive Big

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

## 5.10 One Graph, Many Lenses

Knowledge Core 只有一张知识网真相。

不同的地图、局部视图、专题视图，都来自不同 lens，而不是第二套独立地图存储。

## 5.11 Search Small, Search Clean

Knowledge 的搜索边界应尽量围绕：

- package
- anchors
- links
- 轻量 content 文本
- origin / status
- 当前局部上下文偏好

而不是直接把整个结构化 content 粗暴 JSON 化后做全文检索。

Agent-first 不等于噪声优先。检索应该帮助 Agent 快速命中相关知识，而不是把原始结构噪声混入搜索。

如果当前任务已经围绕某个 anchor、focus node 或 kind 展开，搜索排序也应尽量吸收这些局部上下文，而不是只做孤立的词法匹配。

## 5.12 Knowledge Surface First, Mutation Lab Separate

正式的 Knowledge Surface 的长期职责应是：

- 观测
- 审查
- 调试投影

如果需要保留开发期写入实验能力，应将其隔离在单独的 Mutation Lab 中，而不是让正式的 Knowledge Surface 长期混合承担观察与写入实验两种职责。`Nodes / Knowledge` 正式产品路径只承载只读 Knowledge Surface，不提供 Mutation Lab 入口。

## 5.13 No UI Leakage

Knowledge Core 里不应出现这些字段作为本体：

- `x / y`
- `parentId`
- `width / height`
- `view`
- ReactFlow / NodeFlow handles
- 节点组件状态
- 用户展示专用装饰字段

这些如果未来需要用于调试投影，应该存在于 projection 层，而不是本体层。

## 6. 与 NodeFlow / Nodes 的关系

## 6.1 NodeFlow 不是 Knowledge 的本体

`NodeFlow` 属于面向用户的上层设施。

它服务于：

- 用户创作工作流
- 生成流程组织
- 资产连接与执行
- 结构化创作可视化

它不是 Knowledge 的本体。

## 6.2 Nodes 是 Knowledge / Flow 两平面结构

`Nodes` 模块当前应被理解为同一张无限画布的两个平面：

- `Flow`
- `Knowledge`

其中：

- `Flow` 是正面，可编辑，承载用户工作流
- `Knowledge` 是背面，只读，承载 Agent 长期记忆观测

两面共享：

- `node / link / map` 的观看语言
- 同一张画布式体验
- 从正面到背面的切换心智

但它们不共享本体：

- 正面的 node 是 `NodeFlowNode`
- 背面的 node 是 `KnowledgeNode`

两者是理念同构，不是类型同构。

### 6.3 当前 Cross-Plane Coupling 策略

`Flow` 正面与 `Knowledge` 背面的联动当前只允许 **确定性映射**。

当前第一阶段仅考虑剧本主链相关的稳定映射：

- `scriptBoard`
- `storyboardBoard`

并且只围绕以下 canonical anchor：

- `script:raw`
- `episode:*`
- `scene:*`

映射策略应保持保守：

- 有 `sceneId` 时优先落到 `scene:*`
- 否则落到 `episode:*`
- 再否则回到 `script:raw`

当前不应对其它节点类型做主观推断式映射。  
后续若需扩大联动范围，应在下一阶段、在剧本主链稳定跑通后，再逐步加入新的确定性映射。

在产品表层，`Nodes` 将被设计成两个平面：

- `Flow`
- `Knowledge`

其中：

- `Flow` 是面向用户工作的正面，承接可编辑的 NodeFlow
- `Knowledge` 是面向用户观察的背面，承接只读的长期记忆观察面

这里的“正面 / 背面”是产品表层的使用关系，不代表两者在底层属于同一本体。

更准确地说：

- `Flow` 直接承接 `NodeFlow Core`
- `Knowledge` 只读投影 `Knowledge Core`

两者在表层上天然亲和，因此可以共同由 `Nodes` 模块承接；但底层真相仍然是两套不同层级的数据系统。

## 6.3 NodeFlow 只是当前可借用的观测壳

在当前阶段，可以借用 `NodeFlow` 的 panel / flow 与无限画布承接能力，将 `Knowledge` 投影为可视结构，以避免底层知识系统黑箱化。

但这种关系必须始终保持为：

> `Knowledge Core` 为真相  
> `Knowledge Surface / Flow Projection` 为投影

而不能反过来让 `NodeFlow` 定义 `Knowledge`。

## 6.4 理念同构，不是本体同构

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
  surface/
    labels.ts
    focus.ts
    KnowledgeFlowProjection.tsx
    KnowledgeCanvasSurface.tsx
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

- `surface/labels.ts`
  Knowledge 的表层阅读标签映射

- `surface/focus.ts`
  Flow 正面到 Knowledge 背面的确定性焦点映射

- `surface/KnowledgeFlowProjection.tsx`
  Knowledge -> Canvas Projection 映射

- `surface/KnowledgeCanvasSurface.tsx`
  `Nodes / Knowledge` 背面正式只读承载面

## 8. 当前实施路线

### 第一阶段

先落地 Knowledge Core 的最小本体：

- `KnowledgeNode`
- `KnowledgeLink`
- `KnowledgeAnchor`
- `KnowledgeMap`

并从 Canonical Source Layer 种入第一批只读 source nodes。

### 第二阶段

补第一批 source links，让知识网真正开始形成。

当前第一批只围绕剧本三层关系：

- script -> episode
- episode -> scene

不引入 guide 作为核心圈数据起点。

### 第三阶段

再引入 Agent 写入与修正：

- 新增 derived knowledge nodes
- 新增 anchored derived knowledge nodes
- 新增知识 links
- 基于 anchors 做知识修正与 supersede

在这一阶段，仍然坚持：

- 不为 Agent 预铺固定知识套路
- 不强制指定人物关系、事件、主题等预设写法
- 只提供最小 node / link / map 结构

由 Agent 自身根据实际 source 决定哪些知识值得沉淀、如何命名、如何连结。

这里的 `anchor-first` 只是写入辅助，不是知识模板。

也就是说，系统允许 Agent 更方便地创建：

- 挂在某个 `script` anchor 上的知识节点
- 挂在某个 `episode` anchor 上的知识节点
- 挂在某个 `scene` anchor 上的知识节点

同样地，当 Agent 需要修正某个已有 derived knowledge node 时，
也可以通过 `anchor-first supersede` 的方式在保留原知识链的同时，
显式把新修正结果挂回对应的 `script / episode / scene` anchor。

但系统仍然不规定这些节点必须写成人物、事件、冲突或任何固定分类。

### 第四阶段

最后再做正式的 `Knowledge Surface` 图式投影，而不是反过来先让用户面板定义底层本体。
