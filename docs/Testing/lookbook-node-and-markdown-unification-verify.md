# Verify — Lookbook 节点与 Markdown 文本统一

AC -> Evidence Mapping:
- AC1 新增空白页持久化：tests/lookbookWorkspace.test.ts 覆盖 1 页及批量增至 3 页，索引文档 pageCount 为 3。
- AC2 页导航与空状态：应用内浏览器实测连续新增 1、2、3 页；第 3 页自动进入 02 / 02，上一页按钮可用。
- AC3 canonical Lookbook：tests/lookbookIdentities.test.ts 验证自动同步生成 lookbook 节点与 text 索引。
- AC4 合册封面节点：真实节点采用 236 × 292 的竖向摄影集开本，使用前两张连接图片，并呈现硬壳封面、压槽书脊与只在右/下边缘露出的页芯；无图时显示字母占位。
- AC5 禁止人工创建：Flow 创建命令拒绝 lookbook 与旧 identityCard；主 Add Node 与连线 Add Node 均显示禁用态和自动生成说明。
- AC6 Markdown 文本统一：新档案入口与 Lookbook 文本均创建 text，默认 format: markdown；旧 mdText 保留渲染与导入。
- AC7 无顶栏：浏览器 DOM 与截图确认全屏层没有 header，右上角只有“关闭 Lookbook”按钮；Esc 行为保留。
- AC8 旧数据兼容：渲染、连接、标题、输入投影与 Lookbook 打开逻辑同时接受 identityCard / mdText。

Verification Results:
- Lookbook targeted tests: PASS，17 / 17。
- Full npm test checkpoint: PASS，156 / 156；随后并行中的 Agent timeline 改动使最终全量测试被 tests/agentRuntimeArchitecture.test.ts 的既有类型断言阻断，本次未修改或回退该并行工作。
- npm run typecheck: PASS。
- npm run build: PASS，Vite 7.3.6，7227 modules transformed。
- git diff --check: PASS。
- 浏览器控制台 warning/error：0。

Visual Interaction Checks:
- 初始打开：仅显示合上的封面。
- 点击“新增页”：出现第 1 页，未创建的相邻页采用轻微斜线占位。
- 连续新增：第 2 页补齐当前跨页，第 3 页进入下一跨页，页码与计数同步。
- 顶部：无顶栏与重复标题；右上角关闭按钮独立悬浮。
- 动画：沿用 transform/opacity 的平滑书页过渡；reduced-motion 样式保留。
- Flow 节点：应用内浏览器在实际画布缩放下验证竖向摄影集比例、长短名称、字母占位、左侧书脊及右下页芯；封面不再透出页芯横纹。

Compatibility / Rollback:
- LookbookBookState.pageCount 为 optional；删除该字段后旧 entry 仍能推导页数。
- identityCard 与 mdText 仍在 NodeType/schema 中，回退不会令旧项目节点丢失。
- Foundation 的内部 mdText 档案结构未迁移，避免扩大 Foundation 变更面。
