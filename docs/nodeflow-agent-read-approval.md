# Qalam NodeFlow 面向 Agent 的统一读取与执行审批设计

## 目标

在新的 NodeFlow 架构下，为 Agent 定义一套足够简洁、足够稳定的读取与执行边界。

这套设计必须满足：

- 不强行把所有节点参数压成同一套字段
- 优先让 Agent 先知道“这个节点是什么”
- 只有在需要时才深入读取节点细节
- 让图片/视频生成这类高权限动作必须经过用户审批
- 保持用户与 Agent 面对同一张 `node's map`

## 核心判断

NodeFlow 中统一的，不应该是所有节点的内部参数结构。

统一的应该是：

- 节点的识别方式
- 节点的读取层次
- 节点的执行权限边界

也就是说：

- 第一层先回答：`这个节点是什么`
- 第二层再回答：`这个节点具体有什么内容和参数`

## 一、Links 与 Inputs / Outputs

## 1. Links 是已发生的关系

对某个 node 来说：

- 上行 links 表示它当前接收了哪些输入
- 下行 links 表示它当前输出到了哪些目标

这部分是实际关系。

## 2. Inputs / Outputs 是可连接能力

`inputs / outputs` 不等于 links。

它们表示的是：

- 这个节点允许接收什么类型的输入
- 这个节点允许输出什么类型的结果

所以：

- `links` 是实际连了什么
- `inputs / outputs` 是还能怎么连

## 3. 在 Agent 读取中的定位

对 Agent 的统一读取来说：

- 第一层优先读 `incomingLinks / outgoingLinks`
- `inputs / outputs` 作为按需细读信息，不进入第一层主视图

原因：

- Agent 首先需要理解当前 map 的真实关系
- 只有在计划操作时，才需要知道端口能力

## 二、统一读取模型

## 1. 读取原则

NodeFlow 的节点读取采用两层结构：

1. `Identity Layer`
2. `Detail Layer`

不要让 Agent 默认读入复杂参数。

## 2. Identity Layer

Identity Layer 只负责回答：

- 这个节点是什么
- 它在图里的位置和关系是什么

建议统一返回：

```ts
type NodeIdentityRead = {
  id: string;
  ref: string;
  kind: string;
  title: string;
  status?: string | null;
  parentId?: string | null;
  incomingLinks: Array<{
    linkId: string;
    fromNodeId: string;
    fromRef: string;
    fromTitle: string;
    fromPort?: string | null;
    toPort?: string | null;
    paused?: boolean;
  }>;
  outgoingLinks: Array<{
    linkId: string;
    toNodeId: string;
    toRef: string;
    toTitle: string;
    fromPort?: string | null;
    toPort?: string | null;
    paused?: boolean;
  }>;
};
```

这层不追求完整参数，只追求快速识别。

## 3. Detail Layer

Detail Layer 只在需要时才读取。

建议按节点类型返回真实内容：

- `text`
  - `text`
  - `entityBindings`
- `knowledge`
  - `content`
  - `tags`
  - `sourceRefs`
  - `fields`
- `scriptBoard`
  - `episodeId`
  - `sceneId`
- `storyboardBoard`
  - `episodeId`
  - `sceneId`
  - `displayMode`
- `identityCard`
  - `identityId`
  - `avatarOverrides`
- `imageGen / videoGen`
  - 当前模型
  - prompt 相关字段
  - 引用素材
  - 运行状态
  - 产出结果

这层保持类型化，不强求所有节点细节完全同构。

## 4. 结论

统一读取的关键不是统一参数形状，而是统一读取路径：

- `先识别`
- `再深读`

## 三、节点标题规则

## 1. 标题是节点识别的第一入口

在新的 NodeFlow 中，标题应当成为 Agent 和用户识别节点的第一入口。

因此：

- 不依赖复杂 summary
- 不依赖 Agent 额外总结
- 优先让标题本身表达节点用途

## 2. 标题生成原则

### 文本节点

- 用户自定义标题优先
- 没有标题时保留默认标题即可
- 默认标题意味着它可能不是高优先级节点，Agent 需要时再深读内容

### 剧本面板节点

统一命名为：

- `第{episode}集剧本`
- 如有场次：`第{episode}集 {scene} 剧本`

### 分镜表节点

统一命名为：

- `第{episode}集分镜表`
- 如有场次：`第{episode}集 {scene} 分镜表`

### 身份卡节点

统一命名为：

- `{角色名}身份卡`

### Knowledge 节点

- 保留作者标题
- 标题应明确它代表什么知识资产

### 图片 / 视频生成节点

- 用户自定义标题优先
- 默认标题至少应体现模型或用途
- 例如：
  - `角色主视觉图`
  - `Seedance 视频生成`
  - `WAN 图像生成`

## 3. 目的

这样 Agent 在读 map 时，主要依赖标题就能完成第一层理解：

- 这个节点是什么
- 它大致承担什么作用
- 是否值得进一步深读

## 四、NodeFlow 的统一读取接口

建议后续资源读取收敛为以下几类：

## 1. `read_node_identity`

返回节点的第一层信息：

- 标题
- 类型
- ref
- incoming/outgoing links

## 2. `read_node_detail`

按节点类型返回完整细节。

## 3. `read_node_links`

只读关系，不展开内容。

适用于：

- 追踪数据流
- 判断某节点上下游影响

## 4. `read_map`

返回整张 map 的轻量视图：

- revision
- 节点列表
- link 列表
- activeView
- viewport

但这层仍然以导航和定位为主，不替代单节点细读。

## 五、执行权限边界

## 1. 基本原则

Agent 可以理解、规划、读写结构。

但高成本、高风险、不可逆或会真实消耗外部能力的操作，不能让 Agent 自动执行。

尤其是：

- 图片生成
- 视频生成
- 可能产生外部费用的任务

必须由用户审批后才能真正执行。

## 2. 四类操作

### A. Read

例如：

- list
- read
- search

规则：

- 永远直接允许

### B. Structure Mutate

例如：

- 创建节点
- 修改标题
- 连线
- 移动节点
- 删除普通结构

规则：

- 可以直接执行

### C. Config Mutate

例如：

- 修改图片/视频生成节点的模型
- 修改 prompt
- 修改引用素材
- 修改比例、时长、质量参数

规则：

- 可以允许 Agent 直接改配置
- 但要保留清晰可见的变更结果

### D. Execution

例如：

- 真正启动图片生成
- 真正启动视频生成
- 真正发起外部生成任务

规则：

- 必须审批

## 3. 执行流程

高权限执行采用：

1. `prepare`
2. `preview`
3. `approve`
4. `execute`

即：

- Agent 先准备并返回执行提案
- UI 显示审批卡片
- 用户批准后才触发真实生成

## 4. 为什么必须审批

原因很明确：

- 会消耗真实额度
- 会产生真实任务
- 会改变项目状态
- 可能造成误触发与误生成

所以在 NodeFlow 中：

Agent 可以负责“搭结构”和“准备执行”，
但不能自己“点火”。

## 六、与当前 NodeFlow 架构的关系

这套设计与当前 NodeFlow 总纲一致：

- `node` 是本体
- `link` 是关系
- `map` 是投影

同时补上了 Agent 侧最关键的两条边界：

1. 统一读取的层次
2. 高权限执行的审批机制

## 七、后续开发原则

后续代码实现遵循：

## 1. 统一入口，不统一细节

统一读取路径：

- identity
- detail

不强迫所有节点细节长成一样。

## 2. 标题优先

在第一层读取中：

- 标题优先于摘要
- 标题优先于复杂 body 压缩

## 3. Links 优先于 Ports

第一层阅读优先看：

- incoming links
- outgoing links

端口能力按需再查。

## 4. 配置可写，执行需批

生成类节点：

- 配置层可由 Agent 准备
- 执行层必须审批

## 5. 先让 Agent 看懂，再让 Agent 动手

第一阶段重点不是让 Agent 自动执行所有事，
而是先让 Agent 稳定理解 NodeFlow 的结构、节点意义与数据流向。

## 八、下一步实现顺序

建议按以下顺序落地：

1. 收敛节点标题生成规则
2. 重构 `nodeflow/model.ts`，改成 `identity-first` 读取模型
3. 在 `read_project_resource` 中引入 `read node identity / read node detail`
4. 为生成类节点增加审批式执行协议
5. 再把审批卡片接入 Agent UI
