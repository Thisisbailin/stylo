# Verify — Foundation Operation Bar Anchor

## Evidence Block

- Motivation: Foundation 展开态曾通过 `bottom + 74px` 移动整条操作栏，导致主操作栏不再稳定处于窗口底部中央。
- Impact: 仅影响 Flow 底部操作栏与 Foundation 详情轨道的 CSS 布局；不改变项目数据、Agent 状态、组件接口或平台分支。
- Plan: 固定主操作栏视口锚点；让详情轨道独立向上展开；以样式契约测试覆盖桌面和窄屏。
- Verify: strict typecheck、78 项全量测试、生产构建及本地 Electron 展开/收起实机检查均通过。
- Rollback: 恢复 `nodeflow.css` 最终操作栏样式段的旧展开态 `bottom` 和详情轨道 `top` 规则；无数据回滚。

## Automated Verification

| Check | Result |
| --- | --- |
| `git diff --check` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 78/78 |
| `npm run build` | Pass — Vite production build |

新增的 3 项回归测试覆盖：

1. 展开态不得覆盖主操作栏的水平或底部锚点。
2. Foundation 详情轨道必须从主操作栏上方向上展开。
3. 不超过 760px 的响应式规则只能调整间距和宽度，不能移动展开态主操作栏。

## Desktop UI Verification

在 `127.0.0.1:3000` 的本地 Electron 开发窗口中执行：

1. 记录 Foundation 收起状态的主操作栏位置。
2. 点击“展开 Foundation”。
3. 确认主操作栏底部基线与窗口水平中心保持不变。
4. 确认 Foundation 详情轨道改为在主操作栏上方展开。

结果：Pass。测试后已关闭临时 Electron 窗口和浏览器测试页。

## Acceptance Coverage

- AC1 同一底部锚点：完成。
- AC2 整个应用视口水平居中：完成。
- AC3 详情轨道向上展开：完成。
- AC4 桌面与窄屏一致：完成。
- AC5 自动化与构建门禁：完成。

Instruction Coverage: **5/5 = 1.0**

