# Lookbook 3D、分页与 Design System 验收

日期：2026-07-16

## 自动化校验

- `npm run typecheck`：通过。
- `npm test`：169 / 169 通过。
- `npm run build`：通过；Vite 生产包成功生成。
- `git diff --check`：通过。

覆盖重点：

- Lookbook 与 Manus 使用一致的 286 × 356 包装器规格。
- 封面只读取第一个直接连接的图片节点。
- 内容可以移动到指定物理页，页码和 spread 映射保持一致。
- 布局在拖放和缩放后被限制于单个物理页安全区内。
- 翻页内容不再使用纵向初始位移或缩放入场。
- 收起与展开具有成员节点、连线的分阶段动效，并支持 reduced-motion。
- Design System 作为独立 Lab 占位模块完成路由。

## 浏览器验收

在 `http://127.0.0.1:3011/?app=1` 的真实项目数据中确认：

- Lookbook 画布卡片计算尺寸为 286 × 356。
- 打开状态包含封面、页芯和封底三个独立 3D 层；封面使用 `matrix3d` 透视变换，页芯与封面存在明确层差。
- 现有身份在无图片时保持单一封面视觉槽，不再出现双图拼贴。
- Settings → Lab 显示第 6 个 `Design System` 条目。
- Design System Lab 可正常打开，包含 Tokens、Typography、Components、Motion 四个规划区，并可从右上角关闭。

