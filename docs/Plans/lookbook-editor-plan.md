# Plan — LookBook Editorial Canvas

## Architecture Intent Block

```text
local image files
  → validated decode + PNG alpha inspection
  → immutable LookBook transaction
  → Flow image/text node + membership link + revision

Flow members
  → pure editorial layout projection
  → normalized LookBook-only coordinates
  → interactive board items
  → drag/resize end commit
  → member.data.lookbookLayout
```

Flow 节点与连接继续承担内容和关系，LookBook 不复制正文或媒体；版式只作为节点数据中的独立投影视图元数据。纯函数模块拥有创建、更新与重排事务，UI 不手写图结构。

## Work Breakdown

1. [x] 扩展节点数据契约，建立归一化版式、PNG chunk 解析和自适应 masonry 投影纯函数。
2. [x] 实现有界图片验证/解码，批量创建图片节点与有效媒体端口连接；实现文本卡创建和内容更新事务。
3. [x] 将活跃 LookBook 入口替换为桌面编辑画布，拆出画布、项目项和检查器组件。
4. [x] 接入 Framer Motion transform 拖动、rAF resize、选择/层级/fit 控制、自动整理和键盘关闭。
5. [x] 修复工具栏身份卡只创建裸节点的入口分叉，使身份、索引、连接和 revision 原子落盘。
6. [x] 增加纯函数与架构契约测试，运行完整类型、测试、构建门禁和桌面尺寸浏览器验证。
7. [ ] 隔离 Electron 窗口截图验证：实例可启动，但 macOS 锁屏阻止 Computer Use 读取窗口；不阻断代码交付。

## Verification Plan

- 布局：横/方/竖图跨度不同；重排确定；手工 layout 优先；纵向范围可扩展。
- 事务：批量图片与文本卡节点/连接/revision 原子更新；错误输入不调用事务。
- PNG：color type 4/6、tRNS 为 true；普通 RGB PNG 为 false；损坏头安全返回 false。
- 渲染结构：活跃入口可写；拖动结束提交；resize 有清理；transparent class、主题变量和 reduced-motion 存在。
- 门禁：`git diff --check`、`npm run typecheck`、`npm test`、`npm run build`。
- 桌面：本地 1147×768 工作区验证打开、文本创建/编辑、选中检查器、自动整理与 Account Theme 变量继承；Electron 窗口验证在锁屏环境下记录为受阻证据。

## Rollback Points

- 活跃入口可切回 `LookbookLeafPanel` 的旧翻页实现。
- `lookbookLayout` 是可选字段，移除新 UI 后旧数据仍可读取。
- 新节点是普通 Flow 节点和标准 membership 连接，不需要数据回滚迁移。
