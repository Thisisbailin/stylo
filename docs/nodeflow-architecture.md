# Qalam NodeFlow 架构设计

## 目标

为 Qalam 设计一套面向用户工作流的 NodeFlow 基础架构，并为 `Nodes` 模块中的 `Flow` 平面提供底层支撑。

这套架构必须满足：

- 对用户友好：可视、可拖拽、可编辑、可连接
- 对 Agent 友好：可读、可定位、可搜索、可操作
- 领域模型极简：避免过早引入复杂图谱本体、冗余摘要层、二次语义层
- 性能可控：不让“Agent 友好”演化成一套额外的重型中间系统

需要强调的是：

- `NodeFlow` 负责 `Nodes` 模块中的 `Flow` 平面
- `Knowledge` 负责 `Nodes` 模块中的 `Knowledge` 平面
- 两者在产品表层亲和，但在底层不是同一本体

## 核心判断

NodeFlow 的唯一第一实体是 `node`。

`link` 不是与 `node` 平权的业务本体，而是 `node` 与 `node` 之间的关系记录。  
`map` 也不是独立存在的实体，而是大量 `node` 及其 `links` 在某一时刻形成的整体投影。

因此：

- `node` 是本体
- `link` 是关系
- `map` 是视图

这意味着 Qalam 的工作流，不应被理解为“三个同权对象：点、线、图”，而应被理解为：

**node，以及 node 的 links，自然形成的 map。**

## 产品视角

Qalam 的 `Nodes` 模块最终会形成两个平面：

- `Flow`
- `Knowledge`

其中：

- `Flow` 承载用户可编辑的工作流地图
- `Knowledge` 承载用户只读观察的长期记忆地图

对 `NodeFlow` 本文而言，关注的是 `Flow` 平面。

在 `Flow` 平面中，Qalam 的画布不是“用户的画布”和“Agent 的画布”两套系统。

它是同一个 `node's map`：

- 用户通过可视交互在地图上组织数据
- Agent 通过工具在同一张地图上读取和操作数据

两者面对的是同一个底层真相，只是交互方式不同。

从这个角度看，用户和 Agent 的核心动作本质一致：

**让数据在地图上流动。**

这也是 NodeFlow 设计的总原则：

> 用户与 Agent 的协作，不是围绕“对话”本身展开，而是围绕 node's map 上的数据流展开。

与之对应，`Knowledge` 平面不是用户编辑流，而是用户对 Agent 长期记忆现状的查阅流。

当前 `Flow -> Knowledge` 的跨平面联动仍应保持保守：

- 只做剧本主链相关的确定性映射
- 当前优先围绕 `scriptBoard / storyboardBoard`
- 仅落到 `script / episode / scene` 这些稳定 anchor

不在这一阶段对其它节点类型做主观推断式联动。

在 Agent 工具分层上，也应保持清晰边界：

- `Source`：
  负责 canonical script facts 的读取
- `Knowledge`：
  负责长期记忆的读取，未来 `edit` 若重新开放也应落在这一层
- `NodeFlow`：
  负责当前工作流结构、画布节点、连线、审批与操作

因此，正式资源命名与工具心智应统一收敛为：

- `source_*`
- `knowledge_*`
- `nodeflow_*`

但工具本身不再被理解成“分别服务三个互不相关模块”的工具。

更准确地说，Qalam Agent 面对的是同一个统一图式世界，而工具只是这个世界中的三类原子动作：

- `read`
  - 统一读取动作
  - 面向 `Source / Knowledge / NodeFlow`
  - 读取的是同一项目世界在不同层级上的 `node / link / map` 事实
- `edit`
  - 面向 `Knowledge`
  - 编辑底层长期记忆图
- `operate`
  - 面向 `NodeFlow`
  - 操作表层工作流图

因此 `operate` 明确属于 `NodeFlow` 层，而不是项目通用图操作层。

从这个意义上说，`Nodes` 是项目的中心区域：

- 正面承托用户和 Agent 在工作流上的协同
- 背面承托 Agent 长期记忆的可观测映射

它们不是两个割裂系统，而是一体两面的统一中心画布。

## 领域模型

## 1. Node

`node` 是唯一第一实体。

每个 node 必须同时满足：

- 能在 UI 中被良好展示与编辑
- 能在运行时被 Agent 稳定读取与修改

建议 Node 的最小核心字段为：

```ts
type NodeRecord = {
  id: string;
  ref: string;
  kind: string;

  title?: string;
  body?: unknown;
  meta?: Record<string, unknown>;

  inputs?: string[];
  outputs?: string[];

  x: number;
  y: number;
  parentId?: string;

  createdAt: number;
  updatedAt: number;
};
```

这里的关键不在字段名本身，而在以下约束：

- `id` 是内部稳定标识
- `ref` 是用户与 Agent 共用的稳定引用
- `kind` 是节点类型
- `title/body/meta` 是节点真实内容，而不是“Agent 专用摘要”
- `inputs/outputs` 描述节点能接收和输出什么
- `x/y` 是节点在地图中的空间位置

## 2. NodeLink

`link` 是关系记录，而不是独立业务本体。

但它仍然需要被持久化，因为 node 之间的关系必须稳定可管理。

建议 Link 的最小核心字段为：

```ts
type NodeLinkRecord = {
  id: string;

  fromNodeId: string;
  fromPort?: string;

  toNodeId: string;
  toPort?: string;

  createdAt: number;
  updatedAt: number;
};
```

第一阶段不要给 Link 过早加入：

- `relationType`
- `semanticMeaning`
- `payloadType`
- `whyConnected`

这些信息如果未来真的有必要，应优先从 `node.kind` 和 port 命名中推导，而不是先行把 link 做厚。

## 3. NodeMap

`map` 不是独立真相，而是投影。

建议把 map 理解为：

```ts
type NodeMapView = {
  revision: string;
  nodes: NodeRecord[];
  links: NodeLinkRecord[];
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
};
```

这意味着：

- 不需要先发明“图实体”
- 不需要先设计复杂 graph ontology
- 不需要先把 subgraph、motif、semantic graph 当作基础设施

只要 `node` 与 `link` 足够干净，`map` 自然成立。

## 架构原则

## 1. Node First

所有设计从 `node` 出发。

不要优先围绕：

- edge 本体
- graph 本体
- agent 专用派生对象

展开设计。

## 2. Derived, Not Duplicated

能从 node 和 link 推导出来的东西，不单独存为另一套真相。

例如：

- map 是派生视图
- 图结构分析是派生结果
- agent 阅读视图应尽可能来自 node 的规范化读取，而不是维护第二份平行 schema

## 3. Canonical Content, Not Summary First

第一阶段不要给 node 设计额外的 `summary` 作为基础字段。

原因：

- 用户维护成本高
- Agent 自动生成会漂移
- 自动摘要会引入额外同步问题

第一阶段只保证节点真实内容可被统一读取：

- `title`
- `body`
- `meta`

先保证事实可读，再考虑更高层摘要。

## 4. One Surface For User And Agent

用户和 Agent 面对的是同一套领域真相，不应发展成两套并行数据模型。

允许存在适配层，但不允许出现：

- 一套“用户节点模型”
- 一套“Agent 节点模型”

长期并行演化。

正确方式是：

- UI 负责人类交互
- Agent 工具负责读写
- 底层都落在同一套 node/link 真相上

## 5. Atomic Operations

NodeFlow 的底层操作必须保持原子化。

建议后续仅保留这类基础动作：

- `create_node`
- `update_node`
- `move_node`
- `delete_node`
- `link_nodes`
- `unlink_nodes`

复杂工作流构建都应该视为这些原子动作的组合，而不是再发明更高层的写入本体。

## 6. Read Small, Derive Big

Agent 不应默认吞入整个工作流快照。

正确路径应当是：

- 运行时只给轻量导航上下文
- 细节通过 `list/read/search` 按需读取
- map 视图用于定位与理解

也就是：

- 小读取为主
- 大结构为派生

## 7. Revision Before Mutation

NodeFlow 的写操作必须具备版本意识。

工作流真实状态建议具备 `revision`：

- 读取时拿到当前 revision
- 修改时带上预期 revision
- 发现 revision 已变化时，先重新读取，再执行变更

这比“始终依赖整图快照”更健壮，也更适合用户与 Agent 协同编辑。

## 对现有模块的指导

## 1. 当前 `NodeFlowFile` 的角色

当前代码中的 [`NodeFlowFile`](/Users/joe/Documents/APP/Qalam/node-workspace/types/index.ts#L346) 仍然是工作流的主承载结构：

- `nodes`
- `edges`
- `viewport`
- `labContext`
- `globalAssetHistory`

这可以继续作为持久化容器存在。

但从新架构角度看，应重新理解为：

- `nodes` 是主数据
- `edges` 是 `node links`
- `NodeFlowFile` 是某一时刻的 map 容器

也就是说，后续不是推翻 `NodeFlowFile`，而是明确它的领域定位。

## 2. Node 模块的重构方向

Node 模块后续应优先收敛这几件事：

### 统一身份

所有节点都必须稳定具备：

- `id`
- `qalamNodeRef`
- `type`

其中 `qalamNodeRef` 应逐渐成为用户与 Agent 共用的外部引用主键。

### 统一内容入口

无论节点种类如何，最终都必须能被规范化读取为：

- `title`
- `body`
- `meta`

而不是直接把各类 UI 内部实现细节暴露给 Agent。

### 统一端口入口

节点应明确暴露可连接端口，而不是只在画布连线层隐式存在。

### 统一空间入口

节点的位置、父子关系、分组关系都应作为 node 的自然属性处理。

## 3. Link 模块的重构方向

Link 保持轻量，不成为业务语义中心。

后续应优先做好：

- 稳定连接标识
- 明确 source / target
- 明确 sourceHandle / targetHandle
- 可追踪创建与更新时间

不优先引入厚重边语义。

## 4. Agent 工具层的方向

工具层必须继续保持统一资源模型。

读取工作流时，建议围绕以下三类粒度组织：

- `workflow_node`
- `workflow_node_links`
- `workflow_map`

搜索则统一归于：

- `workflow`

也就是说，Agent 读取工作流的方式应该是：

1. 读单个 node
2. 读该 node 的 links
3. 读某一时刻的 map 投影

而不是先把工作流抽象成复杂图谱系统再交给 Agent。

## 用户与 Agent 的协同原则

## 1. 同图协作

用户和 Agent 永远在同一张 map 上协作。

用户看到的是画布。
Agent 看到的是同一张画布的结构化读取结果。

## 2. 相同真相，不同界面

用户通过：

- 拖拽
- 编辑
- 选择
- 连接

来改变 map。

Agent 通过：

- read
- list
- search
- operate

来改变 map。

两者都是对同一个数据世界的不同入口。

## 3. 数据流才是核心动作

NodeFlow 的真正核心不是“画节点”。

真正核心是：

- 数据进入某个 node
- 数据在 node 之间被连接
- 数据沿着 links 在 map 上流动
- 最终形成可继续生产的工作链

所以，用户和 Agent 的动作本质都应围绕：

**如何让数据在地图上被更清晰地组织、连接、流动。**

## 开发禁令

为了保持架构简洁，后续开发中应避免以下倾向：

1. 不把 `map` 做成独立业务本体先行设计  
2. 不过早引入复杂 graph ontology  
3. 不先给 node 设计大量 Agent 专属语义字段  
4. 不用“摘要层”替代真实内容层  
5. 不让 Agent 依赖整图大快照作为默认真相  
6. 不把复杂工作流操作直接做成黑盒高阶写入，而应尽量拆回原子动作  

## 后续实施顺序

建议按以下顺序推进：

### 阶段 1：重构 Node 模块为 Agent-Friendly 的统一底座

- 统一 node 的身份字段
- 统一 node 的规范化可读内容
- 统一 node 的端口定义
- 统一 node 的位置和层级表示

### 阶段 2：明确 Link 是关系层而非业务主角

- 清理 edge/link 的命名与定位
- 保持关系层轻量
- 确保连接关系稳定可读、可写、可追踪

### 阶段 3：把 Map 定位为投影视图

- 引入 workflow revision
- 明确 map 只是 node + links 在某时刻的组合视图
- 让 Agent 按需读 map，而不是默认吞整图

### 阶段 4：再让 Agent 适配新的 NodeFlow

- 基于统一的 node/link/map 读取模型重构 `read/list/search`
- 基于 revision-aware 原子操作重构 `operate`
- 保持用户与 Agent 共用同一份底层真相

## 最终原则

Qalam NodeFlow 的设计总纲可以收敛成一句话：

> NodeFlow 的唯一第一实体是 node。  
> link 是 node 的关系记录。  
> map 是 node 与 links 在某一时刻形成的投影。  
> 用户与 Agent 在同一张 node's map 上协同，让数据在地图上流动。

这条原则应成为后续 NodeFlow 重构、Agent 适配、工具设计与状态管理的统一起点。
