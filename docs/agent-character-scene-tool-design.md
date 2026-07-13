# Agent 角色/场景工具设计（含稳定形态/分区 ID 与局部更新）

## 背景与目标
- 让 Agent 读取剧本上下文，自动创建/更新角色与场景数据（含形态/分区）。
- 正常聊天与工具执行区分呈现：聊天为普通文本，工具调用以“工具卡片”展示。
- 不需要用户确认即可落库，合并策略允许覆盖模式（默认用新数据覆盖旧数据）。
- 证据引用只需给出“剧集-场景”。
- 本期不做批量工具调用。

## 方案选型（Tool vs Subagent）
- 选择 Tool-first：实现路径最短、便于展示工具卡片、可直接落库。
- Subagent 可作为后续增强（如多步分析/复核），但最终仍需落库工具。

## 数据模型调整（稳定 ID）
### 新增字段
- `CharacterForm.id: string`
- `LocationZone.id: string`

### 设计资产绑定规则
现有 `designAssets.refId` 依赖名称（`${entity.id}|${formName/zoneName}`），名称变更会断链。  
引入稳定 ID 后改为：
- `form` 资产 `refId = ${character.id}|${form.id}`
- `zone` 资产 `refId = ${location.id}|${zone.id}`

### 迁移与兼容
- 若旧数据缺少 `form.id/zone.id`：初始化时自动生成并回填。
- 对已有 `designAssets`：若 `refId` 使用旧的“名称”结构，按名称匹配生成新 `refId`，保留资产不丢失。

## 工具定义（不做批量）
### 1) upsert_character
**作用**：创建或更新单个角色（含形态）。  
**核心特性**：支持局部更新（patch），默认不覆盖未提供字段。

示例：
```json
{
  "character": {
    "id": "char-optional",
    "name": "B",
    "role": "男主",
    "isMain": true,
    "bio": "2-3 句中文概述",
    "assetPriority": "high",
    "episodeUsage": "1-1,1-3",
    "forms": [
      {
        "id": "form-optional",
        "formName": "新郎形态",
        "episodeRange": "1-3",
        "description": "具体形态描述",
        "visualTags": "关键词",
        "identityOrState": "新郎"
      }
    ]
  },
  "formsMode": "merge",
  "mergeStrategy": "patch",
  "evidence": ["1-1", "1-3"]
}
```

### 2) upsert_location
**作用**：创建或更新单个场景（含分区）。  
**核心特性**：支持局部更新（patch），默认不覆盖未提供字段。

示例：
```json
{
  "location": {
    "id": "loc-optional",
    "name": "家",
    "type": "core",
    "description": "抽象场景概述",
    "visuals": "视觉氛围",
    "assetPriority": "high",
    "episodeUsage": "1-1",
    "zones": [
      {
        "id": "zone-optional",
        "name": "厨房",
        "kind": "interior",
        "episodeRange": "1-1",
        "layoutNotes": "布局要点",
        "keyProps": "关键道具",
        "lightingWeather": "光线/天气",
        "materialPalette": "材质色彩"
      }
    ]
  },
  "zonesMode": "merge",
  "mergeStrategy": "patch",
  "evidence": ["1-1"]
}
```

## 合并与更新策略
### 顶层实体（角色/场景）
- `mergeStrategy = "patch"`：默认策略。仅更新传入字段，未提供字段保留原值。
- `mergeStrategy = "replace"`：用新对象替换旧对象（仍保留未被替换的稳定 `id`）。

### 嵌套结构（形态/分区）
使用 `formsMode/zonesMode` 控制：
- `merge`（默认）：按 `id` 合并。未提供字段保留，提供字段覆盖。
- `replace`：用传入数组替换整个 `forms/zones`。

若传入 `forms/zones` 中的子项缺少 `id`：
- 新建并生成稳定 `id`（例如 `form-${timestamp}` / `zone-${timestamp}`）。

### 删除语义
为了避免误删，默认不自动删除缺失项。若需要删除：
```json
{
  "formsToDelete": ["form-123"],
  "zonesToDelete": ["zone-456"]
}
```

## ID 生成规则
- `char-*` / `loc-*`：与当前前端保持一致，便于兼容旧逻辑。
- `form-*` / `zone-*`：新增稳定 ID，用于资产绑定与更新定位。

## 证据引用
- 工具输入提供 `evidence: ["1-1", "1-3"]`。
- 工具卡片展示证据列表即可；不要求写入数据结构。

## Agent 行为规范
- 用户明确“创建/更新角色/场景”或“基于剧本分析生成”时触发工具。
- 若未选择剧本上下文，提示用户打开“剧本”上下文或说明证据不足。
- 若未识别形态/分区，默认创建 1 个基础形态/分区（如 `Standard` / `主场景`）。

## UI 展示（聊天 vs 工具卡片）
- `chat`：普通文本气泡，允许正常排版。
- `tool`：展示工具名、目标实体、形态/分区数量、证据、执行状态。
- `tool_result`：显示成功/失败与落库结果摘要。

## 风险与补救
- 工具调用不可用时：回退为结构化 JSON 输出，由前端解析执行。
- 旧数据资产断链风险：通过稳定 `id` 迁移和 `refId` 更新规避。

## 实现提示（参考文件）
- 数据结构：`types.ts`
- 资产编辑与 refId 逻辑：`components/AssetsBoard.tsx`
- Agent UI：`node-workspace/components/StyloAgent.tsx`
