# Mission Brief — Lookbook 节点与 Markdown 文本统一

Objective:
- Lookbook 支持持久化新增空白页；连接内容仍按连接/索引顺序进入册子。
- 将自动生成的角色/场景“身份卡”节点统一呈现并命名为 Lookbook，节点外观是一册合上的封面。
- Add Node 中保留 Lookbook 的类型说明，但禁用人工创建；Lookbook 仅由剧本身份解析生成。
- 将“档案文档”收敛为 Markdown 文本节点；旧 `mdText` 与 `identityCard` 数据继续可读。
- 移除 Lookbook 全屏层顶栏，改为右侧悬浮关闭按钮。

Out-of-scope:
- 不删除旧节点类型或批量重写用户项目文件。
- 不引入新的富文本编辑器、文件格式或第三方依赖。
- 不模拟纸张弯曲或复杂物理翻页。

Inputs / Outputs (contracts):
- 输入：项目角色、Flow 节点与连接、Lookbook 索引文档内的 `lookbookBook` 状态。
- 输出：自动生成的 canonical `lookbook` 节点、Markdown `text` 节点、可选 `pageCount` 页数状态。
- 兼容：旧 `identityCard` 作为 Lookbook 读取；旧 `mdText` 作为 Markdown 文本读取。

Acceptance Criteria (AC):
- AC1：用户可在 Lookbook 中新增一页，刷新/重开后页数保持。
- AC2：新增页后可导航到新页；无内容页显示明确空状态。
- AC3：自动解析创建 `lookbook` 节点，名称只显示绑定角色或场景名称。
- AC4：节点呈现为合上小册子封面，首个连接图片作为封面图。
- AC5：Add Node 中 Lookbook 置灰并说明由剧本自动生成，所有创建入口均不可人工创建。
- AC6：新建档案入口创建 `text` 节点，格式为 Markdown；不再创建 canonical `mdText`。
- AC7：Lookbook 无顶栏，仅保留右侧关闭按钮；键盘 Esc 仍可关闭。
- AC8：旧项目中的 `identityCard` / `mdText` 仍可显示、连接、打开与导出。

Constraints (perf/i18n/a11y/privacy):
- 动画仅使用 transform/opacity；尊重 reduced-motion。
- 图标统一使用项目已安装的 Phosphor 图标。
- 新增页和关闭按钮需有可访问名称与禁用状态。
- 不联网、不读取任务范围外数据。

Dependencies & Risks:
- `pageCount` 为索引文档的向后兼容可选字段；缺失时从现有内容推导。
- `lookbook` / `text` 为新 canonical 类型，旧类型继续保留在 schema 中以防项目丢失。
- Foundation 仍可能生成旧 `mdText`；本次仅统一用户可创建的档案文档与 Lookbook 内文本，不重写 Foundation 内部结构。

Platform Differences via Platform Layer:
- 当前为同一 React/Electron 交互层；桌面与浏览器共享实现，无平台差异。
