# Plan — Agent Message Visual System and Rendering Audit

## Architecture Intent Block

```text
runtime tool catalog (capability truth)
              ↓ type-only exhaustiveness
UI visual policy (message/tool → icon key + tone)
              ↓
memoized flat icon + theme-native message surfaces
              ↓
native details/summary + content-visibility

Message[] → paired timeline projection → stable display items → coalesced scroll anchoring
```

运行时目录不持有 UI 组件；UI 视觉策略通过 `StyloToolName` 的穷尽映射跟随目录演进。消息投影保持纯函数，React 组件只负责展示和滚动协调。

## Work Breakdown

1. 建立主要消息类型和全部工具的纯视觉策略，添加唯一性与穷尽性测试。
2. 实现统一的主题化 Phosphor 图标组件，并接入用户、回答、状态、工作阶段、审批和工具行。
3. 将消息项提取为 `React.memo` 组件，以底层消息引用判断未变化历史项。
4. 合并同帧滚动请求，仅在 pinned 状态真正变化时更新 React state。
5. 给非当前消息项添加原生离屏渲染隔离；保留当前消息、展开详情和可访问性。
6. 简化时间线工作阶段汇总，避免同一阶段重复统计。
7. 增加消息流正确性、图标覆盖和长序列投影测试，执行完整质量门禁与 Electron UI 验证。
8. 重排混合消息层级：强化用户目标、最终回答和待决审批；将整轮执行收敛为一个次级摘要；缩进并弱化工具/思考明细；过滤与最终回答重复的完成状态。

## Verification Plan

- 图标策略：每个目录工具均存在映射，且 icon key 唯一；未知工具有 fallback。
- 投影：乱序 tool_result/tool 配对、工作阶段折叠、审批与最终回答顺序、空/错误/流式状态。
- 性能结构：历史消息项使用 memo；滚动 RAF 可取消；离屏样式含 `content-visibility` 和 intrinsic size。
- 合成基准：构建 10,000 条混合消息并记录时间线投影耗时与输出数量。
- 门禁：`git diff --check`、`npm run typecheck`、`npm test`、`npm run build`。
- UI：本地 Electron 展开 Stylo，检查图标形态、主题色、工具折叠和最终消息层级。

## Rollback

- 删除视觉策略与图标组件引用即可回到原 `Brain/Wrench/TerminalWindow` 图标。
- 移除 memo 消息项、RAF 合并和 `content-visibility` 样式即可恢复旧渲染路径。
- 无数据迁移或持久化格式变更。
