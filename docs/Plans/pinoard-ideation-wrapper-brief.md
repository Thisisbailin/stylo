# Mission Brief — Pinoard 构思包装器

Objective:
- 在 Manus 之前增加 Pinoard 构思阶段：以独立包装器聚合普通 `text` 节点，让细碎灵感逐渐形成大纲前身。
- Pinoard 在 Flow 中是可折叠的实体节点；成员仍是可连接、可独立编辑的真实文本节点，不把内容复制进包装器私有字段。
- Pinoard 提供单一全屏工作区：未唤起 Agent 时始终放大一个当前文本节点，其余文本节点避让到两侧；唤起 Agent 后消息流取代中央主编辑区，文本节点自适应排列在消息两侧。
- Flow 画布中的普通文本节点维持原有交互：单击直接编辑，双击进入该文本所属的 Pinoard；如果尚未归属，则即时创建 Pinoard 并连接该文本。
- 将新项目的第一步从 Manus 前移为 Pinoard；Add Nodes 中 Pinoard 位于 Manus 之前，且一个 Flow 项目只提供一个 Pinoard 创建入口。

Out-of-scope:
- 本轮不自动把 Pinoard 内容转写为 Manus 剧本，也不增加新的 Agent 工具或服务端 API。
- 不改变普通文本节点的 Markdown 数据格式、云端存储结构或既有 Foundation/Lookbook/Leporello/Manus 语义。
- 不把 Agent 对话复制成 Pinoard 私有会话；继续使用当前项目的统一 Stylo 会话。
- 不实现“所有卡片等权平摊”的灵感墙或工作模式切换；Flow 画布仍保留自由空间位置。

Inputs / Outputs (contracts):
- 新节点类型：`pinoard`，数据为 `{ title, wrapperCollapsed }`，不持有正文副本。
- 成员关系：`pinoard-membership`，要求一端为 Pinoard，另一端为普通 `text` 节点。
- 创建输出：新建 Pinoard 时创建一个包装器节点；在其全屏工作区新增灵感时创建真实 `text` 节点及一条成员关系。
- 编辑输出：标题与 Markdown 正文写回成员 `text` 节点，并同步当前 Flow project 快照。
- UI 状态：当前文本节点 ID 与 Agent 是否展开仅为本地工作区状态，不写入项目图谱。
- Agent 中枢：CreativeWorkspace 继续只渲染一个 `StyloAgent`，Pinoard 打开且 Agent 展开时通过 panel style 投影重定位它。

Acceptance Criteria (AC):
- AC1：`NODE_TYPES`、默认数据、handle/model/schema 链路接受 `pinoard`，旧项目无需迁移即可读取。
- AC2：Wrapper projection 识别双向 `pinoard-membership`，折叠 Pinoard 时仅隐藏其文本成员；普通连接不被误判。
- AC3：Add Nodes 的创作包装器顺序以 Pinoard、Manus 开始；存在 Pinoard 时隐藏创建项；空画布默认创建 Pinoard。
- AC4：Pinoard 画布节点明确展示包装器身份、成员数量和折叠状态；单击折叠/展开，双击进入全屏工作区。
- AC5：普通文本节点单击仍直接编辑；双击进入其所属 Pinoard，未归属时自动创建包装器与成员关系，并把被双击文本设为当前节点。
- AC6：Pinoard 未唤起 Agent 时始终把当前节点扩展为主编辑 page，其余节点分配到左右 rail；点击 rail 节点切换当前编辑对象。
- AC7：Pinoard 唤起 Agent 后把同一个 Stylo Agent 面板定位在中央，当前及其它文本节点以左右两列环绕；关闭 Agent 后立即恢复当前文本主编辑区，退出 Pinoard 后恢复 Agent 的标准停靠布局。
- AC8：空 Pinoard 有可行动空态；删除成员只解除成员关系并删除该文本节点，不删除包装器或其它成员。
- AC9：所有模式支持键盘焦点、可访问名称、浅深主题变量与 `prefers-reduced-motion`；动效仅使用 transform/opacity。
- AC10：类型检查、全量测试、生产构建与 `git diff --check` 通过，并完成本地应用视觉验收。

Constraints:
- 不新增第三方依赖；使用现有 React、Phosphor icons 和项目主题变量。
- 文本输入采用本地草稿与短延迟批量写回，避免每个按键触发项目级持久化。
- Agent 仍由单一 `StyloAgent` 实例管理，防止重复运行、重复会话或双重工具审批。
- 不触碰当前工作区中 Account/Realtime/API 的未提交修改。

Dependencies & Risks:
- 风险：Pinoard 内 Agent 展开态与现有全局 Agent 固定定位冲突。规避：由 CreativeWorkspace 统一计算 panel override，Pinoard 只读取 Agent 展开状态。
- 风险：多文本同时编辑造成高频同步。规避：每节点独立 520ms debounce，关闭工作区时 flush。
- 风险：包装器成员误收 Foundation Markdown 文档。规避：关系创建和投影都限定 `text` 类型。
- 风险：小屏左右 rail 过窄。规避：低于 900px 时退化为中央编辑区和底部横向 rail。

Platform Differences via Platform Layer:
- Web 与 Electron 共用 React 工作区和数据契约。
- macOS 桌面支持完整左右 rail 和 hover 状态；触控/窄屏采用单列与横向 rail，不依赖 hover 才能操作。
