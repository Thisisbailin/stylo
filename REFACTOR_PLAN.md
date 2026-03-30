# Qalam 改造施工手册（细粒度版）

目标：从小到大、可回退地拆分，最终让 `App.tsx` 变成薄壳（只装配布局与上下文），并落实整体架构分层：
- 顶层框架：头部（标题+工具栏）、侧边栏、主内容区域
- Phase 模块：Assets & Guides / Script Viewer / Deep Understanding / Shot List / Visual Assets / Video Studio（主内容各标签）
- Workflow Actions 模块：侧栏顶部的批处理进度与操作
- 追踪模块：Dashboard
- 账户系统模块：登录/登出/清理项目等
- 工具模块：TryMe、导出、设置入口等（头部工具栏）

---

## 阶段 0：准备与守护栏
- 快速回归路径：`npm run dev` + 手工流（导入脚本 → Phase1 启动 → 导出 CSV → 视频轮询模拟）。
- 最小测试基线：`utils/parser.ts`（episode/scene 解析、CSV 导入）、`services/*` 参数构造单测（不调外部接口）。
- 代码规范：若缺失，补 ESLint/Prettier 基线，避免拆分时风格漂移。

## 阶段 1：提取“纯工具/服务”和常量（不改行为）
- 迁移纯函数：
  - `normalizeProjectData` → `utils/projectData.ts`
  - `isEpisodeSoraComplete` / `findNextSoraIndex` → `utils/episodes.ts`
  - `dropFileReplacer` / `isProjectEmpty` / `backupData` → `utils/persistence.ts`
- 验收：Phase1-3、导入导出、TryMe、轮询等全部走通，无行为差异。

## 阶段 2：封装持久化（localStorage）
- 新建 `hooks/usePersistedState`：支持 key、初始值、序列化/反序列化、可选 debounce。
- 替换 `projectData/config/uiState/theme` 的 `useState + useEffect` 为 `usePersistedState`，键名保持不变。
- 验收：刷新后状态/主题/UI Tab/配置保持；localStorage 内容与旧版等价。

## 阶段 3：封装云同步与备份
- 新建 `hooks/useCloudSync`（输入：projectData/setProjectData/auth）：
  - 远端加载（含本地/远端冲突提示与双备份）。
  - 远端保存防抖（保持 1200ms，可配置）。
  - 错误分型：401/403 → 触发登录；404 → 首次；其他 → 提示但不阻塞本地。
- `App.tsx` 仅保留 hook 调用与提示回调。
- 验收：登录后自动拉取；断网/鉴权失败不阻塞本地保存；原确认弹窗行为保留。

## 阶段 4：拆出视频轮询与任务状态更新
- 新建 `hooks/useVideoPolling`（episodes、videoConfig、setProjectData）：
  - 仅在配置完整时启动 interval。
  - 轮询异常时标记对应 shot 为 `error` 并写 `videoErrorMsg`。
  - 避免依赖 `projectData` 频繁重建 interval。
- 验收：提交视频后状态能 queued → generating → completed/error；模拟异常时任务置 error。

## 阶段 5：分离配置与主题
- `useConfig` 或 `ConfigContext`：集中管理 config 读写、模型 fetch 状态，`SettingsModal` 直接消费。
- `useTheme`：含持久化与切换，Header/Sidebar 通过 hook 获取。
- 验收：设置实时生效、刷新保留；主题切换无回归。

## 阶段 6：Workflow Actions 状态机化
- 引入 `workflowReducer`（或 XState），state：`step/analysisStep/queues/isProcessing/processingStatus/currentEpIndex/activeTab`。
- Phase1 队列改事件驱动（START_ANALYSIS、EP_SUMMARY_DONE、CHAR_DEEP_DONE、ERROR_SKIP 等），减少 useEffect 互相触发。
- 侧边栏 Workflow Actions 封装为 `WorkflowPanel`，只消费 reducer 状态/dispatch。
- 验收：Phase1 批处理/跳过/重试正常；Phase2/3 入口与进度条正常。

## 阶段 7：框架壳与布局拆分
- 新建 `layout/AppShell`, `layout/Header`, `layout/Sidebar`, `layout/MainContent`。
- 导出菜单、用户菜单、TryMe/工具按钮拆为小组件（放入 `modules/tools`），Header 引用。
- 验收：导航、导出、登录、主题、侧栏折叠、Tab 切换正常。

## 阶段 8：Phase 模块分区（主内容）
- 目录：`modules/assets`, `modules/script`, `modules/understanding`, `modules/shots`, `modules/visuals`, `modules/video`, `modules/metrics`。
- 模块只收 props，不直接触全局状态/副作用；异步由上传入的服务/hook 处理。
- 验收：各 Tab 功能/渲染与旧版一致（导入/解析/生成/导出/生成视频等）。

## 阶段 9：表单与生成逻辑局部化
- Phase2/3 操作抽到各自 hook：`useShotGeneration`, `useSoraGeneration`，局部管理 `isProcessing/processingStatus`。
- 验收：逐集生成、重试、跳过逻辑与旧行为一致。

## 阶段 10：安全与配置清理（可并行）
- 视频/多模态请求改为 header 传 key，避免 query string。
- 密钥默认仅存内存；提供“记住密钥”开关才写 localStorage。
- 服务层补充类型定义与错误分类。
- 验收：接口可用，敏感信息不落 URL；设置策略可选。

## 阶段 11：测试与文档
- 单测：parser、services 参数构造、workflowReducer/useWorkflowEngine、usePersistedState。
- 集成：导入脚本 → Phase1 → Phase2/3 → 导出 → 视频轮询。
- 文档：更新 README/DEV_GUIDE，描述新目录、关键 hook/模块接口。

---

## 目录规划（目标态）
- layout/: AppShell, Header, Sidebar, MainContent
- modules/: assets, script, understanding, shots, visuals, video, metrics, account, tools
- hooks/: usePersistedState, useTheme, useConfig, useCloudSync, useVideoPolling, useWorkflowEngine, useShotGeneration, useSoraGeneration
- reducers/ or machines/: workflowReducer (或 XState)
- utils/: projectData, episodes, persistence
- services/: geminiService, videoService, multimodalService

## 验收清单（关键路径）
- 导入脚本 → Phase1 全流程（含跳过/重试） → Phase2/3 → 导出 CSV/XLS。
- Visual Assets 生成/多次 refinement；Video Studio 提交与轮询成功/失败路径。
- 登录/登出、主题切换、侧栏折叠、TryMe 脚本。

## 执行节奏与回退
- 每阶段独立提交，发现回归可回滚上一阶段。
- 每步后跑“关键路径手工回归 + 单测”；改动顺序：纯函数迁移 → 持久化 → 副作用（云/轮询）→ 状态机 → 布局 → 模块局部化 → 安全 → 测试文档。

## 进度记录
- 2025-xx-xx：完成阶段1（纯工具迁移到 utils/projectData.ts、utils/episodes.ts、utils/persistence.ts），App.tsx 已改为引用新工具函数，构建通过。
- 2025-xx-xx：完成阶段2（引入 hooks/usePersistedState，projectData/config/uiState/theme 改用持久化 hook，移除散落的 localStorage 副作用），构建通过。
- 2025-xx-xx：完成阶段3（引入 hooks/useCloudSync，封装远端加载/保存、冲突提示、错误回退；App.tsx 移除内联云同步 effect），构建通过。
- 2025-xx-xx：完成阶段4（引入 hooks/useVideoPolling，封装视频任务轮询与错误标记；App.tsx 移除内联轮询 effect），构建通过。
- 2025-xx-xx：完成阶段5（引入 hooks/useConfig, hooks/useTheme，集中配置/主题状态；App.tsx 改为使用这些 hooks），构建通过。
- 2025-xx-xx：完成阶段6（引入 reducers/workflowReducer + hooks/useWorkflowEngine，工作流/分析队列/processing 状态改为 reducer 驱动，Phase1 相关 effect 精简），构建通过。
- 2025-12-17：完成阶段7（App.tsx 改用 AppShell/Header/Sidebar 布局壳，保留导出/账户/主题/侧栏折叠交互），构建通过。
- 2025-12-17：完成阶段8（主内容模块分区：assets/script/understanding/shots/visuals/video/metrics 模块化，App.tsx 通过 modules 引用，脚本视图拆成 ScriptViewer），构建通过。
- 2025-12-17：完成阶段9（Phase2/3 生成逻辑下沉到 hooks/useShotGeneration 与 hooks/useSoraGeneration，局部管理处理状态与递归调度），构建通过。
- 2025-12-17：完成阶段10（安全与配置清理：Video API 改为 Header 传 key，避免 query string；设置面板新增“记住密钥”开关，默认不落盘，config 序列化会清空密钥），构建通过。
