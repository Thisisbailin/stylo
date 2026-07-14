# Verify — LookBook Booklet Wrapper

## Outcome

LookBook 已从独立素材板改为 Canvas + Flow 上的全屏实体书册投影。书页与排版归属索引文档，媒体与文本仍归属底层 Flow；页面操作在纸面直接完成，右键菜单承担添加与编排，透明 PNG 使用 sticker surface。

## AC → Evidence Mapping

| Acceptance criterion | Evidence |
| --- | --- |
| 索引文档拥有版式 | `LookbookBookState` 位于 index mdText data；图片/文本创建测试确认成员不写 `lookbookLayout`。 |
| 手工排版不被新增覆盖 | 布局测试先写入 x/zIndex，再新增文本，断言原值保持。 |
| 实体书册交互 | 本地 1422×800 真实界面验证双页书脊、页码、封面、打开与合上。 |
| 直接编辑、无检查器 | 右键新增“视觉笔记”后标题/正文输入位于纸面；DOM 和结构测试确认无 inspector。 |
| 右键集成功能 | 真实右键菜单显示导入图片、添加文本、自动编排和合上书册；条目菜单包含 fit、旋转、层级和跨页。 |
| Flow 原子创建 | 测试确认批量图片一次 revision、有效 `image → identity image` handle 和索引 entry。 |
| PNG sticker | PNG alpha/tRNS 单测；CSS `.is-sticker` 为透明背景、无 border/shadow/checkerboard。 |
| 持久化 | 本地创建文本 → 返回 Flow → 双击身份重新打开，页内文本节点仍存在。 |
| 主题与位置 | 所有表面使用 `--app-*`；实测左侧 Stylo、右侧返回 Flow，无窗口控件重叠。 |

## Verification Commands

- 本轮首次 `npm run typecheck` → PASS
- 本轮首次 `npm test` → PASS，105/105
- 最终 LookBook 范围 strict compile → PASS（领域事务、测试、Studio 与 item 组件）
- 最终 LookBook 定向测试 → PASS，9/9（包含“新增不覆盖手工版式”）
- 最终全仓 `typecheck/test` → BLOCKED：并行新增的未跟踪 Cinewor 文件存在 4 个 strict 错误，与本轮文件无关
- `npm run build` → PASS，7222 modules transformed
- `npm run audit` → PASS，0 vulnerabilities
- `git diff --check` → PASS
- Local Browser `http://127.0.0.1:3000/?app=1` → PASS：创建身份、打开、右键新增文本、合上、重开、返回 Flow、重新进入内容仍在
- LookBook scoped runtime warnings/errors → 0

## Runtime Observation

浏览器日志中存在历史 Flow project key 重复警告，来源为 `CreativeWorkspace` 的既有本地项目列表，并非 LookBook 渲染路径；以 `Lookbook` 过滤的 warning/error 为空。本轮不扩大范围修改该历史数据问题。

## Evidence Block

- **Motivation:** 把视觉开发界面恢复为共享 Canvas + Flow 的书册包装器。
- **Impact:** 索引所有权、跨页模型、书册 UI、右键操作、直接编辑、PNG sticker、事务与测试。
- **Verify:** 类型、全量测试、生产门禁、1422×800 本地真实交互与 scoped logs。
- **Rollback:** 可切回旧入口；内容节点与连接无需回滚。
