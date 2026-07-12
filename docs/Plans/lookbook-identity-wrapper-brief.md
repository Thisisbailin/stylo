# Mission Brief — Identity Lookbook Wrapper

## Objective

- 从 Flow 中的 Fountain 剧本文档提取角色 cue 与场景标题，并自动创建或复用统一的 `ProjectRoleIdentity`。
- 为每个提取到的身份自动创建并绑定一个 `identityCard` 节点与一个 Lookbook 索引档案文档。
- 双击身份卡节点时打开全屏 Lookbook；Lookbook 聚合该身份卡直接连接的档案、图片、音频和视频节点。
- 保留节点式操作路径；Lookbook 只是相同 Flow 数据与边界连接的专注视图，不复制媒体数据。
- Lookbook 以全屏可翻页小册呈现：封面、按连接顺序生成的双页内页、封底；没有可见成员时只保留封面。
- 身份卡收敛为名称与头像，头像只取连接顺序中的第一个图片节点。

## Out of scope

- 本次不删除 Foundation 的角色轴或场景轴。
- 本次不实现 Agent 专用 Lookbook 写操作工具。
- 本次不做模糊身份合并；只按 mention、名称和别名精确复用。

## Inputs / Outputs

- 输入：`scriptPage` 的 Fountain `content/text`。
- 输出：`ProjectData.roles` 中的 `ProjectRoleIdentity`；Flow 中的 `identityCard`、`mdText` 索引节点及 `lookbook-membership` 连线。
- Lookbook 成员：与身份卡直接相连的 `mdText`、`text`、`imageInput`、`audioInput`、`videoInput`。

## Acceptance Criteria

1. 保存含角色 cue 与场景标题的剧本后，相应人物/场景身份只创建一次。
2. 每个被同步的身份都有唯一身份卡和唯一 Lookbook 索引文档，重复保存保持幂等。
3. 双击身份卡打开对应 Lookbook，Escape/关闭按钮可退出。
4. Lookbook 展示连接档案与图片/音频/视频；无成员时提供可操作的空状态说明。
5. 既有身份字段与用户内容不会被自动同步覆盖。
6. 类型检查、单元测试和生产构建通过。
7. 自动 Lookbook 索引继续存在于数据层，但不生成视觉册内页。

## Constraints

- 不新增依赖，不访问网络。
- 自动身份状态固定为 `draft`；不自动产生 `verified/locked`。
- 精确匹配，避免同名近似项被错误合并。
- Lookbook 使用既有 Flow 节点作为事实来源，不持有媒体副本。

## Risks

- Fountain 写法存在多种变体：解析覆盖标准 Fountain 与编辑器现有中文标记，未知格式保持不创建。
- 自动节点可能与用户手工节点重叠：使用身份 ID 和显式 Lookbook 元数据做幂等识别。

## Platform Differences

当前工程为 React/Electron Web UI；桌面和窄屏共享同一组件，窄屏切为单列视觉册布局。
