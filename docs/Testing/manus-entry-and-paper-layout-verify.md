# Verify — Manus 入口与连续稿纸布局

AC -> Evidence Mapping:
- AC1：`CreativeWorkspace` 空画布 CTA 与 `FlowSurface` 空态均调用 `scriptPage` 创建路径，界面文案统一为 Manus。
- AC2：`scriptCreateOptions` 第一组依次为 Manus、Lookbook、Cinewor、文件夹；Foundation 与连接落点菜单均在存在任意 `scriptPage` 时过滤 Manus。本地既有稿纸项目的菜单实际只显示后三项。
- AC3：输入组源码与本地菜单均按文本、图片、声音、视频排列。
- AC4：最终级联将 Add Nodes 和连接落点菜单限制为 304px、单列 34px 条目，内部 `max-height: none` 且 `overflow: visible`；本地渲染为紧凑右键菜单式弹层，无滚动轨道。
- AC5：Manus 浮动工具新增“新增稿纸”，复用 `onSplitScriptDocument` 把空白 `scriptPage` 插入当前页之后并激活，不新增数据协议。
- AC6：纵向模式映射整个 `displayPages`，当前稿纸保留完整编辑器，其余稿纸以同尺寸只读纸张预览进入主视口纵向滚动。
- AC7：横向模式映射整条稿纸序列，使用 CSS scroll snap；左右边缘具备 360ms hover intent，离开即取消，页眉不再包含上一页/下一页按钮。
- AC8：`filmstrip` 第三态仅展示当前稿纸正文，并在底部渲染全序列缩略队列；缩略项点击通过同一 `openScriptPage` 激活和定位。
- AC9：空文本编辑器使用 flex 居中；图片、声音、视频共享 `media-input-empty` 的实体渐变表面、实线主题边框、48px 图标和同一文案层级。

Verification Results:
- `npm run typecheck`: pass.
- `npm test`: pass, 166/166.
- `npm run build`: pass.
- `git diff --check`: pass.
- 本地应用浏览器：pass for Manus editor render, conditional Manus omission, wrapper/input group ordering, compact menu surface, and absence of an internal menu scrollbar.

Known Non-blocking Observations:
- 本地项目只有一张稿纸，视觉验收没有创建测试稿纸，以免改写用户项目或触发当前 Cloud Sync 冲突；多稿纸三态由既有页序列算法测试、源码契约断言与生产构建共同覆盖。
- 本地控制台存在既有重复 `flow-project-main` React key 警告；本次改动未触碰 Flow project 列表生成逻辑。
- Vite 构建继续报告一个大于 500 kB 的 Cinewor vendor chunk warning，不影响构建成功。

Build Matrix:
- Web production bundle: pass.
- macOS Electron renderer: covered by shared Vite renderer build and local app-mode browser run.
- Touch/mobile: data与布局协议兼容；边缘 hover 为桌面增强，触控仍可横向滚动或使用 filmstrip。

# Evidence Block
- Motivation: 将所有剧本稿纸收敛进 Manus 包装器，并把多页浏览从离散翻页改成连续的一沓稿纸。
- Impact: 空画布入口、Add Nodes 信息架构、Manus 稿纸创建与三态布局、文本及媒体空节点表面。
- Plan: 条件化唯一 Manus 入口，复用 split contract，新建连续纵向/横向/缩略队列投影，并统一 context-menu 与空输入视觉。
- Verify: 严格类型检查、166 项测试、生产构建、diff-check 与本地应用视觉检查全部通过。
- Rollback: 不涉及 schema；入口过滤、稿纸布局、菜单 CSS 与空态共享样式可分别回退，既有 `scriptPage` 数据与连接保持有效。
