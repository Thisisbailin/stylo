# Plan — Lookbook 3D 包装器、页级编排与 Design System Lab

Architecture Intent Block:
- 包装器的开合状态仍属于 Flow 数据；收展过程属于 FlowSurface 的短生命周期视觉投影，不写入成员节点坐标。
- Lookbook 页级归属由纯函数负责，UI 只提供目标页；所有最终布局统一经过页内吸附，避免不同入口产生不同边界规则。
- 3D 材质封装在包装器叶组件和 CSS，数据层只提供封面图、名称、成员数与状态。
- Design System Lab 使用独立叶组件和新的 ModuleKey，不与项目数据耦合。

Work Breakdown (≤1 day each):
1. 包装器实体与动效
   - Lookbook 尺寸改为 286×356，仅投影第一张封面图。
   - 重构封面/页芯/书脊层次，增强 open/closed 3D 区分；同步增强 Manus 纸叠开合。
   - FlowSurface 增加成员 collapsing/expanding 过渡与边淡出。
2. Lookbook 稳定翻页
   - 增加固定书体 viewport，去除 scale 和内页 y 入场。
   - 保留首封/跨页/封底状态机与 reduced-motion。
3. 页级拖放与吸附
   - 新增页归属、页内布局约束与 move-to-page 纯函数。
   - 拖动期间显示页缩略图；释放到缩略图后跨页持久化并导航。
   - 拖动和缩放统一走页内约束。
4. Design System Lab 占位
   - 扩展 ModuleKey、App 路由与 Lab 列表。
   - 新增可关闭的只读占位界面。
5. 验证
   - 更新纯函数/源码测试，运行 typecheck、全量测试、build、diff-check。
   - 应用内浏览器验证包装器尺寸与开合、收展动效、稳定翻页、缩略图跨页和 Lab 入口。

Verification Plan (by AC):
- AC1/AC2：源码断言 + 应用内浏览器尺寸、封面图数量与开合视觉检查。
- AC3：wrapper 投影测试 + 浏览器收起/展开，检查 motion class 和最终 hidden。
- AC4：组件源码断言无 `scale`/素材 `y` 入场 + 浏览器连续翻页截图。
- AC5/AC6/AC8：页级纯函数单测 + 浏览器拖动到缩略图并检查目标页与边界。
- AC7：Design System Lab 源码测试 + 浏览器从 Lab 列表打开/关闭。

Rollback Points:
- 包装器尺寸和材质 CSS 可独立回退。
- 成员动效只包裹既有 `wrapperCollapsed` 切换，可恢复为直接 hidden。
- 页级函数只扩展索引条目解释，不改变 schema version。
- `designSystemLab` 为独立入口，可移除而不影响其他 Lab。
