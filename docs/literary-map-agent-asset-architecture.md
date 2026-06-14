# Qalam 文学地图式 Agent 资产架构设计

## 1. 目标

为 Qalam 设计一套新的 Agent 项目资产底层架构。

这套架构不是为某个具体 skill 服务。
它面向的是更底层的问题：

- 如何让 Agent 围绕剧本建立可持续演化的外部化项目资产
- 如何让这些资产不是线性文档，而是天然关系化的“文学地图”
- 如何在保证极简、原子化、性能可控的前提下，给 Agent 足够大的认知自由度
- 如何保证剧本作为项目确定起点的只读边界不被破坏

## 2. 核心判断

### 2.1 术语统一

本架构统一使用：

- `node`
- `link`
- `map`

不在底层架构设计中混用 `edge`。

原因不是语言偏好，而是为了统一产品、数据层、Agent 工具层和持久化层的心智模型：

- `node` 是第一实体
- `link` 是 node 与 node 之间的原子关系记录
- `map` 是大量 node 及其 links 的天然投影

因此 NodeFlow 的抽象可以直接写成：

`a - b`

其中：

- `a` 和 `b` 是 `node`
- `-` 是 `link`
- `map` 是大量类似 `a - b` 的关系天然形成的视图

### 2.2 文学地图不是文档

新的 Agent 理解资产不再以 markdown 文档为本体。

它的本体应当是：

- 可被读取的 node
- 可被连接的 link
- 可被组织的 map

所谓“文学地图”，本质上不是一篇总结，而是一张围绕作品对象、事件、关系、主题、冲突、节奏和设计约束不断扩展的图结构。

### 2.3 剧本是 Canonical Source，不可改

剧本本身是 Qalam 项目的确定起点。

这意味着：

- `ProjectData.rawScript`
- `episodes`
- `scenes`

仍然是系统 canonical source。

Agent 可以：

- 读取剧本
- 引用剧本
- 将剧本映射为只读 source nodes
- 围绕剧本建立自己的理解资产

Agent 不可以：

- 改写剧本正文
- 覆盖 episode / scene source
- 将 semantic 推断回写为剧本事实

这条边界必须是数据层和工具层约束，而不是只写在 prompt 里。

### 2.4 Agent 不应直接吞入整张图

文学地图可以很大，但 Agent 不应以“整图输入”的方式工作。

正确策略是：

- 底层真相是图
- Agent 默认读取局部
- map 主要是工作视图和导航入口

因此本架构坚持：

`Read Small, Derive Big`

即：

- 小读取
- 局部搜索
- 邻域导航
- 主题视图

而不是整图注入。

## 3. 架构总览

新的理解资产架构分为两层：

### 3.1 Canonical Source Layer

这是项目的确定起点，不由 Agent 直接修改。

主要包括：

- 原始剧本文本
- episode
- scene
- 用户导入的指南和参考资料

这层仍可沿用现有 `ProjectData` 作为主真相来源。

### 3.2 Agent Working Graph Layer

这是 Agent 的工作层。

它将：

- 把 canonical source 映射为只读 source nodes
- 把理解沉淀为 semantic nodes
- 把创作决策沉淀为 design nodes
- 把执行结果和工作流节点保留为 execution nodes

这层统一落在 `node / link / map` 模型之上。

## 4. 第一实体：Node

`node` 是唯一第一实体。

每个 node 代表一个最小可复用、可连接、可检索的认知单元。

建议最小结构：

```ts
type AssetNodeRecord = {
  id: string;
  ref: string;

  plane: "source" | "semantic" | "design" | "execution";
  type: string;

  title?: string;
  body: Record<string, unknown>;
  meta?: Record<string, unknown>;

  status?: "draft" | "working" | "approved" | "superseded" | "archived";
  confidence?: "low" | "medium" | "high";

  locked?: boolean;
  sourceRef?: string;

  x: number;
  y: number;
  parentId?: string | null;

  createdAt: number;
  updatedAt: number;
};
```

### 4.1 字段解释

- `id`
  内部稳定标识

- `ref`
  供用户、Agent、工具共用的稳定引用

- `plane`
  节点所属层次

- `type`
  节点的开放命名空间类型

- `body`
  节点真实内容

- `locked`
  是否只读。`source` plane 默认应为 `true`

- `sourceRef`
  节点指向的源材料位置，例如 `ep:3`、`scene:3-12`

- `x / y / parentId`
  仅用于 map 组织，不代表语义本体

### 4.2 原子化原则

一个 node 只表达一个稳定意思。

不要把这些做成单个超级节点：

- 完整角色档案
- 一整集导演方案
- 一整篇文学分析

而应拆为多个原子节点，例如：

- 一个角色实体 node
- 一个事件 node
- 一个关系 node
- 一个主题判断 node
- 一个导演节奏判断 node

长期看，角色档案、导演板都应该是 view，而不是单个 node。

## 5. 原子关系：Link

`link` 是 node 之间的原子关系记录。

建议最小结构：

```ts
type AssetLinkRecord = {
  id: string;

  fromNodeId: string;
  fromPort?: string | null;
  toNodeId: string;
  toPort?: string | null;
  paused?: boolean;

  createdAt: number;
  updatedAt: number;
};
```

### 5.1 为什么 Link 必须极简

本架构刻意不把 link 做厚。

第一阶段不建议为 link 引入：

- 大段正文
- 任意 payload
- 独立摘要
- 高度复杂的边 schema
- 强语义 `rel/type` 体系

原因：

- link 本质是关系，不是第二种 node
- 厚 link 会迅速把图结构变成难维护的半图谱系统
- Agent 使用 link 时最重要的是关系类型稳定，而不是边上再挂很多内容
- 性能上，轻 link 更适合大量连接和快速邻域遍历
- 当前 NodeFlow 实际代码已经使用非常轻的 `source / target / sourceHandle / targetHandle / hasPause` 结构，这更像正确起点，而不是需要被推翻的过渡实现

### 5.1.1 Link Minimalism

Link 应始终遵守一个原则：

**link 是关系记录，不是内容容器。**

在这套架构里：

- node 承载内容
- link 承载关系
- map 承载组织和观看方式

因此，不应让 link 逐渐长成“第二种 node”。

如果某个关系需要：

- 被详细解释
- 被版本化
- 被审批
- 被挂证据
- 被别的对象再次引用

它就不应该继续停留在 link 层，而应提升为一个独立 node。

换句话说：

复杂关系不做“厚 link”，而做：

`a -> relationship_node -> b`

例如：

- `Stephen -> Buck`
  适合作为轻量 link

但如果需要表达：

- 两人的张力结构
- 阶段性关系变化
- 冲突来源
- 主题层映射

就应创建一个 `semantic.relationship` node，再由 link 连接它和两端对象。

### 5.2 为什么当前阶段不把 `rel` 做成基础字段

在纯抽象层面，`a -[rel]-> b` 很优雅。

但结合当前 NodeFlow 实际代码，第一阶段更稳的方案是：

- 保留现有 link 的轻结构
- 继续让执行连接主要依赖 `source/target + port`
- 把语义性更强的关系建模为 node

原因是：

- 现有执行流、ReactFlow 适配、命令层、查询层都已经围绕当前 link 结构稳定工作
- 如果过早给所有 link 注入 `rel`，会把“执行连接”和“语义关系”混入同一层心智负担
- 文学地图真正需要表达的复杂关系，绝大多数都更适合作为 node，而不是 link 类型枚举

因此，本架构当前建议是：

- `link v1` 保持极简
- `semantic richness` 主要放在 node
- 如果未来局部检索与 Agent 导航实践证明确实需要，再谨慎引入一个可选 `rel`

也就是说：

不是不能有 `rel`，而是**不应把它作为第一阶段的基础前提**。

### 5.3 Link 与执行线的关系

需要明确区分两类 link：

- 语义 link
- 执行 link

语义 link 用于文学地图和理解资产。

执行 link 用于现有 NodeFlow 工作节点之间的输入输出连接。

两者都可以共享 `link` 这一底层抽象，但不应混淆其用途。

当前更合理的统一方式是：

- `execution` 继续沿用现有 `fromPort / toPort / paused`
- `semantic` 与 `design` 先用极简 link + 关系 node 表达复杂语义

这样既能保持：

- 底层抽象统一
- 与现有 NodeFlow 兼容
- 语义层不被过早的 link taxonomy 绑死
- 执行层不丢失现有端口能力

### 5.4 Link 的性能原则

Link 的强性能不来自“减少关系”，而来自：

- link 本身足够轻
- 索引作为派生层存在

持久化层应保存平铺的 links。

运行时再派生至少这些索引：

- `outgoing[fromNodeId]`
- `incoming[toNodeId]`
- `neighbors[nodeId]`
- `byPort[fromPort/toPort]`

因此本架构坚持：

**轻 link，强索引。**

而不是：

**厚 link，弱遍历。**

## 6. Map 是天然投影，不是第二真相

`map` 不是独立本体。

它是：

- 一组 node
- 一组 link
- 一个布局和过滤上下文

天然形成的投影。

建议最小结构：

```ts
type AssetMapView = {
  id: string;
  name: string;
  revision: number;

  rootNodeRefs?: string[];
  filter?: Record<string, unknown>;

  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
};
```

### 6.1 Map 的角色

map 用来承载：

- 文学地图
- 角色关系地图
- 导演地图
- 美术设计地图
- prompt 组织地图

同一批 node / link 可以出现在多个 map 中。

因此：

- map 是组织方式
- 不是内容本体

### 6.2 Map of Maps

当作品规模增大时，需要支持 `map of maps`。

但它不应额外引入重型图实体。

更简单的方式是：

- 某些 map 作为上层目录视图
- 通过 root node 或 view filter 指向下层 map
- 由 UI 和查询层做主题切换

也就是说：

- map 可以嵌套使用
- 但 node/link 仍然是唯一真相层

## 7. 四个 Plane

为了避免“所有节点都混在一起”，需要在同一底层之上做轻量分层。

### 7.1 Source Plane

承载只读源材料。

示例：

- `source.script`
- `source.episode`
- `source.scene`
- `source.reference_doc`

规则：

- 默认 `locked=true`
- 不允许 Agent 通过编辑工具修改
- 只允许导入、解析、重建

### 7.2 Semantic Plane

承载 Agent 的理解资产。

示例：

- `semantic.event`
- `semantic.fact`
- `semantic.character_state`
- `semantic.relationship`
- `semantic.conflict`
- `semantic.theme`
- `semantic.motif`
- `semantic.question`
- `semantic.insight`
- `semantic.constraint`

这一层是“文学地图”的核心。

### 7.3 Design Plane

承载面向创作决策的设计资产。

示例：

- `design.episode_vision`
- `design.sequence_plan`
- `design.directing_beat`
- `design.visual_rule`
- `design.character_look`
- `design.prompt_brief`

它不是 skill 的容器，而是未来 skill 会消费和生产的设计层资产。

### 7.4 Execution Plane

承载真正的工作流执行节点。

示例：

- `execution.text`
- `execution.script_board`
- `execution.image_gen`
- `execution.video_gen`

这一层可以与现有 NodeFlow 节点体系兼容演进。

## 8. 剧本如何进入文学地图

剧本不是被改造成“可编辑理解资产”，而是被映射为只读 source nodes。

建议路径：

1. 用户导入剧本
2. 系统解析出 episodes 和 scenes
3. 系统自动生成只读 source nodes
4. Agent 在 source nodes 周围创建 semantic nodes 与 links

也就是说：

- 剧本保留 canonical source 身份
- 文学地图只是围绕剧本扩展出的工作图

### 8.1 Source Node 粒度

第一阶段建议只做到：

- `episode`
- `scene`

不要一开始就细到句子级或台词块级。

原因：

- 成本低
- 检索直观
- 足够支撑大多数理解工作
- 不会让图规模在早期爆炸

当后续确实需要时，再补：

- `dialogue_block`
- `beat_block`

## 9. Agent 如何高效使用这套图

关键不是把所有东西都变成 map，而是给 Agent 一套局部读取协议。

Agent 默认不应该读取整图。

它应该通过原子工具进行局部导航。

### 9.1 查阅类

建议未来查阅工具收敛为：

- `list_resources`
- `search_resources`
- `read_resource`
- `read_neighborhood`
- `read_map_outline`

含义：

- `list_resources`
  列目录，不读大内容

- `search_resources`
  基于 `plane / type / ref / title / sourceRef / body` 搜索节点

- `read_resource`
  读取单个 node 或单个 source 资源

- `read_neighborhood`
  读取某个 node 周围一跳或两跳关系

- `read_map_outline`
  只返回某个 map 的入口节点、主要分组和概览，不返回整张图

### 9.2 编辑类

建议未来编辑工具收敛为：

- `create_node`
- `update_node`
- `create_link`
- `remove_link`
- `supersede_node`
- `patch_map_layout`

规则：

- 不允许修改 `source` plane
- semantic / design / execution 可编辑
- 修改必须走 revision-aware 工具边界

### 9.3 操作类

建议未来操作工具收敛为：

- `materialize_execution_nodes`
- `compose_map`
- `instantiate_template`
- `bind_design_to_execution`

这类工具负责把理解层和设计层转成执行层工作流。

## 10. 为什么图不会让 Agent 更难

如果设计错误，图当然会更难。

真正让 Agent 困难的不是“图”，而是“坏图”。

### 10.1 会让 Agent 困难的坏设计

- 一个 node 是一整篇长文
- link 类型过多过乱
- map 和真相层混在一起
- 默认读取整个图
- 允许 source 与 semantic 混写

### 10.2 会让 Agent 更强的好设计

- node 原子化
- link 极简
- map 只是投影
- source 严格只读
- 默认局部读取
- 统一的查阅 / 编辑 / 操作工具边界

所以问题不在“是否 map 化”，而在“是否保住原子化和局部读取原则”。

## 11. 与现有架构的关系

本设计不是重做第二套系统。

它与当前架构关系如下：

- 保留 `ProjectData` 作为剧本 canonical source
- 保留 `NodeFlow` 的 `node / link / map` 基本哲学
- 保留原子 command / mutation / revision 机制
- 将当前工作流节点视为 execution plane

这意味着：

- 也不是让所有节点都直接变成现有执行节点
- 而是在 NodeFlow 底层之上补出 Agent 认知资产层

## 12. 第一阶段落地边界

第一阶段应尽量克制，只做必要抽象。

### 12.1 该做的

- 统一术语为 `node / link / map`
- 引入 `plane`
- 引入只读 source nodes
- 引入 semantic nodes
- 引入少量稳定 link types
- 引入局部读取工具协议

### 12.2 暂时不做的

- 重型 graph ontology
- 厚 link payload
- 全图级摘要系统
- 句子级 source node 默认拆分
- 复杂自动布局语义推理
- 多代理分工

## 13. 最终结论

Qalam 新的 Agent 理解资产底层，不应是“新的文档系统”，而应是：

- 以 `node` 为第一实体
- 以 `link` 为原子关系
- 以 `map` 为天然投影
- 以剧本 canonical source 为只读起点
- 以 semantic plane 为文学地图核心
- 以 design plane 和 execution plane 承接后续创作与工作流

一句话概括：

**新的理解资产不是“Agent 写了一批理解文档”，而是“Agent 围绕只读剧本 source 持续构建和维护一张可导航、可扩展、可投影的文学地图”。**
