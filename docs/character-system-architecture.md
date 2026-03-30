# 统一角色系统架构设计

## 1. 目标
- 把“角色”提升为项目全局一级对象，成为剧本、理解、AIGC 定模、`@` 绑定、NodeLab 工作流、Agent 工具的共同主键。
- 让角色像“身份证”一样稳定存在：名字可以改、形态可以扩、资产可以追加，但角色身份本身不漂移。
- 本期只设计角色系统；场景系统后续沿用同一思路扩展。

## 2. 当前系统现状

### 2.1 已有能力
- 理解层已经有 `Character` 和 `CharacterForm` 两级结构，字段足够覆盖角色抽象描述、形态描述、定模清单、语音设计。
- AIGC 流程已经明确要求为角色生成“形态级”定模需求：`hair/face/body/costume/accessories/props/materialPalette/poses/expressions/deliverables/genPrompts/voicePrompt` 等。
- 设计资产层已经按 `form` 绑定定模图，`refId = ${character.id}|${form.id}`。
- NodeLab 已经能在文本节点、图片节点、视频节点里用 `@` 解析角色/形态，并将其映射到参考资产或 subjects。

### 2.2 当前断层
- `Character.id` 仍然混用“稳定 id”和“角色名”。
  - `identifyCharacters/generateCharacterBriefs/generateCharacterRosterBriefs` 里常直接把 `id` 设为 `name`。
  - `edit_understanding_resource` 又会生成 `char-*` 风格 id。
- `@` 绑定仍是“按可见文本模糊匹配”的轻绑定，而不是“按稳定身份引用”的强绑定。
  - 当前 `TextNodeData.atMentions` 只保存 `name/status/kind/characterId/formName` 等摘要，不保存文本区间、绑定版本、解析来源。
  - 文本中的 `@洛青舟` 本质仍靠名字匹配；改名、别名、同名角色都会造成歧义。
- 工作流层对角色的真实消费单位其实是“形态”，但产品层暴露的概念还在“角色 / 角色形态 / formTag / subjects / identityCard”之间切换，没有统一词汇。
- 角色定模资产目前是“形态资产集合”，但没有一张真正的“角色身份证”主卡来统领：
  - 默认形态是谁
  - 可接受哪些别名
  - AIGC 工作流默认应该引用哪个形态
  - 角色语音是角色级还是形态级继承

## 3. 现有代码里的真实约束

### 3.1 理解模型约束
来源：
- `/Users/joe/Documents/APP/Qalam/types.ts`
- `/Users/joe/Documents/APP/Qalam/services/responsesTextService.ts`

当前 `Character` 更像“角色档案”，`CharacterForm` 更像“角色形态定模条目”。

这说明统一角色系统不应该推翻现有模型，而应该在其上补齐：
- 稳定身份主键
- 绑定别名
- 默认形态
- 绑定解析结果
- 生命周期状态

### 3.2 `@` 绑定约束
来源：
- `/Users/joe/Documents/APP/Qalam/node-workspace/nodes/TextNode.tsx`
- `/Users/joe/Documents/APP/Qalam/node-workspace/nodes/ImageInputNode.tsx`
- `/Users/joe/Documents/APP/Qalam/node-workspace/store/useLabExecutor.ts`

当前机制：
- 文本输入时通过 `@xxx` 做实时解析。
- 可选目标分为 `form / character / zone`。
- 执行期再把 mention 解析成资产或视频 `subjects`。

问题不是功能缺失，而是“绑定结果没有成为一等数据”。

### 3.3 AIGC 定模约束
来源：
- `/Users/joe/Documents/APP/Qalam/services/responsesTextService.ts`
- `/Users/joe/Documents/APP/Qalam/node-workspace/components/CharacterSceneLibraryPanel.tsx`
- `/Users/joe/Documents/APP/Qalam/node-workspace/components/qalam/toolActions.ts`

角色定模在当前产品里天然是“形态级”：
- 一个角色会有多个 forms
- 每个 form 有独立设计要素、交付要求、生成提示、参考图、语音设计
- design assets 实际挂在 `form` 上

所以“角色身份证”必须是父对象，“形态”必须是子对象，不能反过来。

## 4. 统一角色系统的核心设计

### 4.1 设计原则
- `角色` 是身份主体，不是视觉主体。
- `形态` 是角色在某一时期/状态下的可生产视觉版本。
- `@` 绑定的默认目标是角色身份证；当工作流需要可执行视觉主体时，再落到默认形态或指定形态。
- 用户可继续输入自然语言 `@名字`，但系统内部必须保存为稳定 id 绑定。

### 4.2 统一对象层级
```ts
CharacterCard
  -> CharacterFormCard[]
  -> CharacterAlias[]
  -> CharacterVoiceProfile?
  -> CharacterBindingProfile
  -> CharacterEvidence[]
```

其中：
- `CharacterCard`：项目里的唯一角色身份证。
- `CharacterFormCard`：该角色的一个可生产形态。
- `CharacterAlias`：角色的名字、称谓、别名、可触发 `@` 的别称。
- `CharacterBindingProfile`：默认形态、默认 voice、绑定规则。
- `CharacterEvidence`：角色在剧本里的证据位置，用于 agent 和后续自动修复。

## 5. 推荐数据模型

### 5.1 角色身份证
建议在现有 `Character` 上演进，而不是新起一套平行类型。

```ts
type CharacterStatus = "draft" | "verified" | "locked" | "archived";

interface CharacterAlias {
  id: string;
  value: string;
  kind: "primary" | "alias" | "title" | "short";
  normalized: string;
}

interface CharacterBindingProfile {
  defaultFormId?: string;
  defaultVoiceScope?: "character" | "form";
  mentionPolicy?: "character-first" | "form-first";
  canonicalMention: string;
}

interface CharacterEvidenceRef {
  episodeId: number;
  sceneId?: string;
  quote?: string;
}

interface CharacterCard extends Character {
  id: string;                  // 必须稳定，统一为 char-*
  slug: string;                // 只用于人类阅读/URL/搜索
  aliases: CharacterAlias[];   // 名字、称谓、别名
  status: CharacterStatus;
  binding: CharacterBindingProfile;
  evidence?: CharacterEvidenceRef[];
  version: number;
}
```

### 5.2 角色形态卡
保留 `CharacterForm`，但补齐“这是角色子卡”的显式语义。

```ts
type CharacterFormType =
  | "default"
  | "age"
  | "costume"
  | "identity"
  | "state"
  | "disguise"
  | "battle"
  | "special";

interface CharacterFormCard extends CharacterForm {
  id: string;               // 稳定，统一为 form-*
  characterId: string;      // 父角色 id
  type: CharacterFormType;
  key: string;              // 机器稳定键，如 default / wedding / wounded
  isDefault?: boolean;
  aliases?: string[];       // 允许 @婚服洛青舟 / @洛青舟-婚服
  status?: "draft" | "ready" | "deprecated";
}
```

### 5.3 文本绑定结果
当前 `atMentions` 需要升级为真正的“绑定记录”。

```ts
interface EntityBinding {
  id: string;
  rawText: string;          // 用户输入的原始片段，如 @洛青舟
  entityType: "character";
  entityId: string;         // char-*
  formId?: string;          // 若明确绑定到形态
  aliasId?: string;         // 通过哪个别名解析成功
  status: "resolved" | "ambiguous" | "missing";
  start: number;
  end: number;
  resolutionSource: "manual" | "auto";
  version: number;          // 绑定时的角色系统版本
}
```

说明：
- 用户界面仍显示 `@名字`，不强迫暴露 id。
- 但节点数据必须保存区间级绑定，而不是只保存去重后的名字列表。
- 这样角色改名后，文本仍可自动重渲染或重新定位。

## 6. `@` 绑定规则

### 6.1 用户侧语法
统一支持三层：
- `@角色名`
  - 绑定到 `CharacterCard`
  - 执行期自动回落到 `binding.defaultFormId`
- `@角色名/形态名`
  - 显式绑定到某个 `CharacterFormCard`
- `@别名`
  - 通过 `aliases` 解析回角色身份证

不建议再长期把“只输入 `@形态名`”作为主路径。

原因：
- 形态名脱离角色名容易重名
- 难以在脚本正文里形成可读的统一语义
- 不符合“角色身份证”这个主模型

兼容策略：
- 旧文本里的 `@形态名` 继续可解析
- 但新系统内部会把它标准化为 `entityId + formId`

### 6.2 解析优先级
1. 精确匹配 `角色名/形态名`
2. 精确匹配角色主名
3. 精确匹配角色别名
4. 精确匹配形态别名
5. 模糊搜索，仅用于 picker，不用于自动落库

## 7. AIGC 工作流中的角色系统职责

### 7.1 对图像生成
- 角色身份证决定“这个提示里提到的是谁”。
- 角色形态卡决定“应该引用哪组定模资产”。
- 图像生成节点不再依赖裸 `formTag` 文本，而应优先使用 `entityId/formId`。

### 7.2 对视频生成
- `ViduVideoGen` 的 `subjects` 应直接来自绑定后的角色形态，而不是从 prompt 文本再次猜。
- `WanReferenceVideoGen` 的 project reference targets 应支持直接选择角色身份证，再由系统展开到默认形态或指定形态资产。

### 7.3 对剧本和分镜
- 剧本正文里的角色名字，未来可以升级为结构化角色绑定。
- 分镜表里的人物字段、台词字段、调度字段，也应该可以解析角色绑定。
- 这样 agent 在“读剧本 -> 生成分镜 -> 生成图/视频”链路里能保持同一角色身份。

## 8. NodeLab 集成边界

### 8.1 文本节点
从：
- `atMentions: { name, kind, characterId, formName... }[]`

升级到：
- `entityBindings: EntityBinding[]`
- `mentionViewModel` 仅作为 UI 派生结果，不作为真实数据源

### 8.2 身份卡节点
当前 `IdentityCardNode` 是“角色/场景身份卡片”的混合节点。  
后续角色系统成熟后，建议拆为：
- `characterCard`：真正的角色身份证节点
- `sceneCard`：后续单独扩展

在角色节点里，父卡就是 `CharacterCard`，子卡就是 `CharacterFormCard`。

### 8.3 工作流执行器
`useLabExecutor` 目前已经具备：
- 从 mention 找 form 资产
- 从 character 回落到第一个可用 form 资产

统一角色系统上线后，执行器应改为：
- 优先读取 `entityBindings`
- 角色绑定时走 `binding.defaultFormId`
- 只有旧节点数据才回退到基于文本的 mention 猜测

## 9. Agent 工具的统一方向

### 9.1 角色工具不再只写“理解档案”
当前：
- `read_project_resource(character_profile)`
- `edit_understanding_resource(character_profile)`
- `upsert_character`

未来角色系统里，`character_profile` 应升级为“角色身份证”的一个视图，而不是全部本体。

建议 agent 侧最终形成三类角色工具：
- `read_character_card`
- `upsert_character_card`
- `bind_text_entities`

其中本期不必马上加工具，但架构上应这样收口。

### 9.2 Agent 的主输入不应再偏向名字
优先级应为：
1. `character_id`
2. `name`
3. `alias`

否则 agent 每次写角色都有机会制造新角色或误绑旧角色。

## 10. 兼容现有代码的最小演进方案

### Phase A：统一主键
- 强制 `Character.id` 统一为 `char-*`
- 保留 `name` 作为展示名
- 所有生成角色的入口都不再用 `name` 充当 `id`

### Phase B：补齐角色身份证字段
- 在 `Character` 上新增：
  - `aliases`
  - `status`
  - `binding`
  - `version`
  - `evidence`
- 在 `CharacterForm` 上新增：
  - `characterId`
  - `type`
  - `key`
  - `isDefault`
  - `aliases`

### Phase C：升级绑定存储
- 文本节点新增 `entityBindings`
- 保留旧 `atMentions` 一段时间作为兼容字段
- 所有执行器优先吃 `entityBindings`

### Phase D：升级工作流消费
- `formTag` 逐步废弃，改为 `characterId/formId`
- `subjects.id` 改为使用稳定 `formId` 或 `characterId:formId`
- project references 增加角色身份证入口

## 11. 明确保留与废弃

### 保留
- `Character`
- `CharacterForm`
- `designAssets(category="form")`
- 角色级与形态级 voice 字段
- `upsert_character` 作为过渡入口

### 逐步废弃
- 用 `name` 作为角色主键
- 只靠 `formName` 做工作流身份引用
- 只保存名字去重列表的 `atMentions`
- `identityCard` 里角色/场景混合建模

## 12. 推荐结论

统一角色系统不需要推倒重来。  
正确路线是：
- 保留现有 `Character -> forms -> designAssets(form)` 主结构
- 补一个真正的“角色身份证层”
- 把 `@` 从“字符串提示”升级为“结构化实体绑定”
- 让 NodeLab/AIGC/Agent 全部围绕 `char-* / form-*` 这套稳定身份工作

这样后续扩到场景系统时，只需要把同一套“身份证 + 子卡 + 绑定 + 资产 + 工作流消费”模式复制到 `Location / Zone`，而不需要再发明第二套体系。
