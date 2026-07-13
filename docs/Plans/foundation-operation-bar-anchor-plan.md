# Plan — Foundation Operation Bar Anchor

## Architecture Intent Block

```text
viewport + safe-area inset
          ↓
immutable primary-bar anchor (bottom center)
          ↓
Foundation expanded state
          ↓
independent detail rail positioned above the primary bar
```

定位责任保持在样式层：主操作栏只有一个视口锚点，展开状态只控制详情轨道和宽度，不再重写主操作栏位置。

## Work Breakdown

1. 移除展开态对主操作栏 `bottom` 的覆盖，并将水平锚点明确为视口中心。
2. 把 Foundation 详情轨道从主操作栏下方改为上方展开。
3. 同步窄屏规则，移除会导致展开态偏移的重复覆盖。
4. 增加最终样式契约测试，防止展开态或响应式规则重新引入位置覆盖。
5. 执行静态检查、全量测试和生产构建。

## Verification Plan

- 样式契约：基础规则固定为 `position: fixed`、`left: 50vw`；展开态不得包含 `left`、`bottom` 或 `transform` 覆盖。
- 展开方向：详情轨道使用 `bottom: calc(100% + gap)`，桌面和窄屏均成立。
- 质量门禁：`git diff --check`、`npm run typecheck`、`npm test`、`npm run build`。

## Rollback

恢复最终操作栏样式段的旧 `bottom + 74px` 和详情轨道 `top` 规则即可；不涉及数据迁移。

