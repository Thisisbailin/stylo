# Verify — Canvas Content Locator and Agent Visibility Diagnosis

Date: 2026-07-13

## Diagnosis

截图中的“操作成功但看不到结果”由三个不同问题叠加，不是单纯的画布显示问题：

1. **写入结果被修订冲突拒绝。** 消息中明确出现“Flow 已从修订 263266 更新到 291071……本轮 Agent 写入未应用”。Edge 工具只修改本次请求里的内存 `NodeFlow`，浏览器在整轮结束后才尝试提交；若期间本地 revision 改变，`StyloAgent` 会拒绝整个 durable result。因此工具调用时的“成功”只代表内存快照操作成功，并不代表已经落入当前项目。
2. **跳过/未更新仍以成功样式呈现。** `Tool budget exhausted` 是预算器返回的正常结构化结果，不抛异常；`Document not updated` 同样是 `updated=false` 的业务结果。当前消息生命周期把“函数正常返回”映射成绿色成功，造成了错误的持久化暗示。这属于 Agent 工具结果语义与消息渲染问题。
3. **视口可能偏离实际节点。** 截图仍能看到底部时间轴节点，说明画布并非零节点；新建 Foundation 区块可能位于当前视口外。新引导控件只解决这一层可发现性，不会掩盖前两类写入失败。

## AC -> Evidence Mapping

- AC1: visible-node intersection test -> pass.
- AC2: left/right/down nearest-node direction tests -> pass.
- AC3: `fitView` integration followed by committed viewport persistence -> strict typecheck/build pass.
- AC4: no-node and Agent dock inset tests -> pass.
- AC5: semantic button, `role=status`, focus-visible state, transform-only motion and reduced-motion CSS -> static review pass.
- AC6: geometry tests plus repository gates -> pass.

Instruction coverage: **IC = 6/6 = 1.0**.

## Commands and Results

```text
npm run typecheck
PASS — TypeScript strict, exit 0

npm test
PASS — 66/66 tests, 0 failures, exit 0

npm run build
PASS — Vite production build, 7201 modules transformed, exit 0

npm audit --offline --audit-level=high
PASS — 0 vulnerabilities, exit 0

git diff --check
PASS — no whitespace errors, exit 0
```

## UI Verification Limit

The current local web entry intentionally renders `LandingPage`; the editable workspace is loaded only when the Electron preload exposes `window.styloDesktop.isDesktop`. Repository policy does not allow launching the Electron packaging/runtime binary without approval. The supplied Stylo appshot was used for the workflow diagnosis, while the new viewport policy is covered by deterministic geometry tests and the desktop bundle is covered by the production build.

## Rollback

Remove the `CanvasContentLocator` mount and the viewport observation callbacks from `CreativeWorkspace`; no migration or persisted data cleanup is required.

