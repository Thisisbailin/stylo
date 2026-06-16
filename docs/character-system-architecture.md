# 身份系统 ProjectData 架构设计

## 1. 当前决策

身份系统从旧剧本解析模块切出。旧的 `ProjectData.rawScript`、`ProjectData.episodes`、`Episode.characters`、`Episode.scenes` 不再作为身份生成、身份合并、角色统计或场景统计的输入。

当前身份系统的运行事实是：

- 身份主存储是 `ProjectData.roles`，类型为 `ProjectRoleIdentity[]`。
- 身份视觉资产通过 `ProjectData.designAssets` 与 `ProjectRolePortrait` 关联。
- 身份卡节点 `identityCard` 只读取和更新 `roles`，不读取旧解析结果。
- Agent 当前公开工具已转向 Flow 文档节点和资源工具，旧 `get_episode_script` / `get_scene_script` / `read_project_data` / `search_script_data` 不注册。

旧解析数据可以继续作为历史项目兼容字段存在，但不能再驱动身份系统业务逻辑。

## 2. 新边界

### 2.1 ProjectData

`ProjectData` 是项目数据外壳，承载：

- `roles`: 身份索引与稳定主键
- `designAssets`: 身份相关生成资产索引
- `flow.flowNodes`: Flow 文档节点、身份卡节点、生成节点、媒体节点
- `flow.graphLinks`: 文档、身份和工作流之间的语义引用

身份模块可以读写 `roles`、`designAssets` 和身份相关 Flow 节点，但不直接依赖旧 `episodes`。

### 2.2 Flow 文档节点

Flow 文档节点是后续身份系统的内容来源和设计承载层。

关键文档类型：

- Fountain 剧本文档：`scriptPage`，`documentKind=script`，`format=fountain`
- 角色档案文档：`mdText` 或后续专用 `identityProfile`，`documentKind=archive`
- 普通设计说明：`mdText` / `text`

身份系统不再把“角色档案”塞进一个巨大结构字段里。`roles` 只保留稳定索引和生产需要的摘要，细化设计进入角色档案文档。

## 3. 身份对象职责

### 3.1 `ProjectRoleIdentity`

`ProjectRoleIdentity` 是身份索引卡，不是完整角色档案。

它负责：

- 稳定身份 id
- 展示名、mention、别名
- 身份类型：人物或场景
- 当前摘要、状态、标签
- 默认视觉形态与定妆图索引
- 语音、资产优先级、生成引用需要的轻量字段
- 指向角色档案文档的关联关系

建议补充的字段：

```ts
interface ProjectRoleIdentity {
  id: string;
  name: string;
  displayName: string;
  mention: string;
  kind: "person" | "scene";
  status?: "draft" | "verified" | "locked" | "archived";
  aliases?: ProjectRoleAlias[];
  portraits: ProjectRolePortrait[];

  profileDocumentId?: string;
  profileNodeId?: string;
  sourceDocumentIds?: string[];
  evidenceRefs?: IdentityEvidenceRef[];
  lastDerivedAt?: number;
}
```

### 3.2 角色档案文档

每个角色默认拥有一个同名档案文档。文档标题默认等于角色名。

档案文档负责承载：

- 角色定位
- 人物关系
- 动机、欲望、弱点、转变
- 视觉设计细节
- 服装和阶段状态
- 表演与语音设计
- 已确认事实与待确认推断

建议的默认 Markdown 模板：

```md
# 角色名

## 身份摘要

## 剧情功能

## 人物关系

## 视觉设定

## 形态与阶段

## 语音与表演

## 证据与来源

## 待确认
```

### 3.3 视觉形态

现有 `ProjectRolePortrait` 继续作为可生产视觉形态的轻量索引。

它不再承担完整 `CharacterForm` 职责。复杂的形态设计进入角色档案文档的“形态与阶段”章节，或后续拆成子文档节点。

## 4. Fountain 解析器接入方式

后续 Fountain 解析器只做文档解析，不直接制造旧 `episodes` 身份输入。

输入：

- Flow 中的 Fountain 剧本文档节点

输出：

- 文档结构索引：幕、场、角色 cue、对白块、动作块、位置
- 角色候选：规范名、出现次数、证据位置、上下文片段
- 场景候选：场景标题、位置、时间、证据位置

解析器输出应先进入“候选层”，再由身份模块合并到 `roles`。

```ts
interface FountainIdentityCandidate {
  name: string;
  normalizedName: string;
  kind: "person";
  sourceDocumentId: string;
  occurrences: Array<{
    blockId: string;
    sceneHeading?: string;
    lineStart?: number;
    lineEnd?: number;
    excerpt?: string;
  }>;
}
```

## 5. 自动建档业务流程

### 5.1 导入或更新 Fountain 文档

1. 用户创建或更新 Fountain 剧本文档节点。
2. Fountain 解析器读取该文档节点。
3. 解析器产出角色候选列表。
4. 身份模块按规范名、别名和人工锁定状态匹配现有 `roles`。
5. 对新增角色创建 `ProjectRoleIdentity`。
6. 对每个新增角色创建同名档案文档。
7. 建立身份与文档的语义链接。

### 5.2 匹配规则

匹配优先级：

1. 已存在 `mention` 精确匹配
2. `name/displayName` 精确匹配
3. aliases 精确匹配
4. 人工确认的候选映射

禁止在自动流程中用模糊匹配直接合并身份。模糊结果只能进入待确认队列。

### 5.3 自动创建角色

默认创建：

```ts
{
  id: "role-*",
  name: candidate.name,
  displayName: candidate.name,
  mention: buildRoleMention(candidate.name),
  kind: "person",
  tone: "emerald",
  status: "draft",
  summary: "人物身份",
  description: "",
  aliases: [candidate.name, `@${mention}`],
  portraits: [],
  profileDocumentId,
  profileNodeId,
  sourceDocumentIds: [candidate.sourceDocumentId],
  evidenceRefs: candidate.occurrences
}
```

自动创建的身份只能是 `draft`。`verified` 和 `locked` 必须由用户或显式 Agent 操作设置。

## 6. 身份与文档关系

建议用 `flow.graphLinks` 表示关系，而不是把所有引用塞进角色对象。

关系类型：

- `identity.profile`: 身份 -> 默认档案文档
- `identity.source`: 身份 -> Fountain 剧本文档
- `identity.evidence`: 身份 -> 剧本文档中的具体 block/ref
- `identity.asset`: 身份 -> 生成资产或定妆图节点
- `identity.derived`: 档案文档 -> 派生出来的形态或设计文档

这样角色档案可以自由拆分为多个文档节点，身份索引仍保持稳定。

## 7. Agent 工具方向

短期：

- 继续使用 `find_documents`、`read_document`、`create_document`、`update_document` 操作档案文档。
- 继续使用 `read_project_resource` / `operate_project_resource` 操作 Flow 节点和链接。
- 不恢复旧 `upsert_character` / `upsert_location` 作为公开工具。

中期建议新增专用身份工具：

- `find_identities`
- `read_identity`
- `create_identity_from_candidate`
- `link_identity_profile_document`
- `sync_identities_from_fountain_document`

这些工具应直接读写 `ProjectData.roles` 和 Flow 文档链接，不经过旧 `Character/forms` 或 `Episode` 结构。

## 8. AIGC 工作流消费规则

生成节点消费身份时按以下顺序解析：

1. 节点显式 `identityId`
2. `entityBindings` 中的 `identity` 绑定
3. `@mention` 到 `roles` 的精确匹配
4. 旧节点数据的兼容回退

身份引用产出：

- prompt 中使用 `displayName`、summary、档案文档摘要
- 参考图使用 primary portrait 或最新身份资产
- 语音使用角色级 voice 字段
- 复杂形态说明从档案文档或后续形态子文档读取

生成节点不应读取旧 `episodes.characters` 来补全主体。

## 9. 模块划分建议

建议后续新增模块：

- `utils/identityIndex.ts`: 身份匹配、mention、别名、候选合并
- `utils/fountainIdentityCandidates.ts`: Fountain 解析结果到身份候选
- `utils/identityProfileDocuments.ts`: 默认档案文档创建和模板
- `agents/tools/identityTools.ts`: Agent 身份专用工具
- `node-workspace/nodeflow/identityLinks.ts`: 身份与文档、资产的 graph link 管理

模块边界：

- Fountain 解析器只产出候选和证据。
- 身份模块决定是否创建、合并、锁定身份。
- 文档模块负责档案文档内容读写。
- NodeFlow 负责节点和语义链接。
- 生成执行器只消费已经解析好的身份引用。

## 10. 迁移原则

- 保留旧字段读取能力，避免历史项目崩溃。
- 禁止新增从 `episodes` 派生身份的运行时代码。
- 禁止新增以角色名作为主键的身份写入逻辑。
- 禁止让 Agent 直接写旧 `Character/forms` 结构后再转换回 `roles`。
- 新身份能力必须以 `roles + profile document + graph links` 为核心。

最终状态：Fountain 文档是源材料，角色档案是可编辑设计文档，`ProjectData.roles` 是稳定身份索引，AIGC 工作流通过身份索引和文档节点消费角色设计。
