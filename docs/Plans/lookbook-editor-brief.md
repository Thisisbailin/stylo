# Mission Brief — LookBook Booklet Wrapper

## Objective

将 LookBook 重构为 Canvas + Flow 上的全屏书册包装器，而不是独立子应用或无限素材板。它需要具备实体小册子的封面、打开、合上、跨页和翻页感；图片、文本、音频与视频仍是底层 Flow 的真实节点，书页顺序和版式则统一由身份卡附带的 LookBook 索引文档持有。

编辑必须发生在纸面：拖动改变位置、边角改变大小、文本直接输入。导入、添加文本、自动编排、适配、层级和跨页移动进入右键菜单，不设置属性检查器侧栏。透明 PNG 以贴纸呈现，纸面直接透过 alpha，不出现棋盘底或素材卡框。

## Out of scope

- 不改变成员节点在主 Flow 画布上的位置和尺寸。
- 不复制图片或正文到第二套 LookBook 数据模型。
- 不引入媒体服务、第三方依赖或移动端手势编辑。
- 不在本轮实现印刷 PDF、协作批注或视频/音频剪辑。

## Ownership Contract

- **Flow 成员节点**：保存媒体/文本内容及真实 typed membership link。
- **LookBook 索引文档**：通过 `lookbookBook.version + entries` 保存 nodeId、spreadIndex 和归一化 layout，是书册版式的唯一新写入来源。
- **包装器 UI**：只投影上述共享数据；开合状态是本地 UI 状态，不制造独立项目。
- **旧数据**：成员节点上的 `lookbookLayout` 仅作为兼容读取；用户再次编辑时迁移到索引文档。

## Acceptance Criteria

1. LookBook 以全屏包装器覆盖画布，左侧只显示 Stylo，右侧统一返回 Flow；没有独立应用工具栏或检查器侧栏。
2. 具备可点击封面、打开/合上、双页跨页、页码、书脊和前后翻页；方向键可翻页，reduced-motion 安全降级。
3. 每个跨页最多自动容纳六个内容条目，按图片比例生成确定性编辑版式；明确执行自动编排才允许覆盖手工排版。
4. 拖动与缩放在纸面直接完成，结束时单次写入索引文档；不修改成员节点 Flow 坐标。
5. 拖入图片一次事务创建真实 `imageInput` 节点、有效媒体端口连接和索引条目；新增文本创建真实 `text` 节点并可页内编辑。
6. 新增内容只分配新条目位置，不覆盖已有手工坐标；条目可通过右键移动到前/后一跨页。
7. PNG alpha/tRNS 可识别；透明图默认 `contain`，渲染为无底色、无边框、无棋盘纹的贴纸。
8. 主题全部使用 Account Theme 同源的 `--app-*` 变量；桌面窗口优先，窄窗口安全收敛，不出现返回控件重叠。
9. 文件大小、批次、像素与并发解码有界；错误在事务外失败，不产生半完成节点。
10. strict typecheck、全量测试、生产构建、diff 检查与本地真实交互验证通过。

## Constraints

- 不新增依赖；使用现有 React、Framer Motion、Phosphor Icons。
- drag 使用 transform，resize 使用 requestAnimationFrame 预览，pointer up 后提交。
- 单文件 20 MiB、单批 12 张/80 MiB、单图 4000 万像素、最多 3 路解码。
- 图片仅在本地读取，不上传、不保存本地路径。
