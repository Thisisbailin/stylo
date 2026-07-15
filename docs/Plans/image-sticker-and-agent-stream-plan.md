# Plan — 图片贴纸节点与 Agent 消息流收敛

Architecture Intent Block:
- 图片像素与节点 chrome 分离：alpha 由图片自身决定，节点底板不参与合成；`hasAlpha` 只用于语义和贴纸状态标记。
- 图片动作使用三入口 disclosure 模型：Replace 是直接命令，Review 与 Info 是互斥小面板，状态信息不再占用独立 rail 行。
- Agent 自动跟随由消息容器负责：消息数据变化与当前块 ResizeObserver 共用帧调度，既跟随外层底部，也跟随超高当前块内部底部。

Work Breakdown:
1. 图片 alpha 与贴纸表面
   - 上传时读取 PNG bytes 并调用既有透明度解析器。
   - 为 ImageInput 输出 sticker 状态，覆盖媒体背景、裁切与 BaseNode 底板。
   - 回滚点：移除 `hasAlpha` 写入与 imageInput 专属透明 CSS。
2. 三控件图片 rail
   - 增加互斥展开状态与 icon-only Replace / Review / Info 按钮。
   - 将名称编辑、文件名、尺寸、Storage 状态移入 Info 面板。
   - 将审核状态、错误与 asset URI 移入 Review 面板，并在有提示时自动保持可发现。
   - 回滚点：恢复原纵向文本 label 与独立状态行。
3. Agent 消息层级
   - 移除用户和助手正文两类前置图标，保留工具、思考和审批的语义图标。
   - 工具线程不再根据“当前消息”强制 `open`。
   - 回滚点：恢复 `StyloMessageIcon` 两处渲染与 tool expanded 参数。
4. 连续自动滚动
   - 抽取帧合并滚动函数，按当前块高度决定外层锚点，并把超高当前块滚到内部底部。
   - 观察消息列表内容与当前块尺寸变化，流式 Markdown 增长也能触发。
   - 回滚点：恢复仅依赖 messages 的原 useEffect。
5. 验证
   - 增加源码/行为约束测试，运行目标测试、typecheck、全量测试、build、diff-check。
   - 具备可测试本地会话时，再做应用内浏览器透明图与消息流检查。

Verification Plan (by AC):
- AC1/AC2：PNG 透明解析单测沿用 + ImageInput 源码断言 + 浏览器贴纸合成检查。
- AC3/AC4/AC5：ImageInput 结构与 CSS 测试，检查三个 action、两个 panel、无独立 status label。
- AC6/AC7：Agent 架构测试断言用户/助手分支无 `StyloMessageIcon`，工具 details 无强制 open。
- AC8：源码测试断言 ResizeObserver、帧合并与 current block 底部滚动；流式会话做视觉检查。
- 全局：`npm run typecheck`、`npm test`、`npm run build`、`git diff --check`。

Rollback Points:
- `hasAlpha` 是 optional 字段，不需要迁移。
- 图片外观、rail、消息图标与滚动观察器分层，可逐层独立回退。
- 不修改云端 schema 或审核 API，回滚不会遗留数据结构变更。
