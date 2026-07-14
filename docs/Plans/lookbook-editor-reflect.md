# Reflect — LookBook Editorial Canvas

## What failed / nearly failed

- 初始 UI 验证暴露出工具栏身份卡只调用通用 `addNode`，没有角色与索引绑定；单测若只从已有合法身份开始会漏掉这个入口断点。最终将所有身份创建入口统一路由到原子事务。
- 第一版 membership link 对图片使用 `text → text`，但 `imageInput` 没有文本输入，属于“数据里有 link、画布上无有效连线”。现按媒体类型使用图片/音频/视频输出到身份卡对应输入。
- 第一版批量解析只限制单文件，12 × 20 MiB data URL 会造成高内存峰值；补充批次、像素和并发上限。
- 一次定向测试尝试使用仓库未安装的 `tsx` loader，属于验证命令错误而非实现错误；随后改用仓库标准 `npm test` 并全量通过。
- 隔离 Electron 启动成功，但 Computer Use 无法在 macOS 锁屏状态取得窗口；浏览器桌面尺寸验证完成，Electron 截图证据明确标为受阻而非伪报通过。

## Three concrete improvements next time

1. 在写 UI 前先列出所有创建入口（工具栏、Foundation 尾部菜单、连接拖放），为每个入口建立同一事务的路由测试。
2. 对“连接成功”的验收必须同时检查语义 relation 与节点真实 handle contract，不能只断言 links 数量。
3. 媒体功能的输入预算同时约束单项、批次、解码后像素和并发数，并把错误保持在事务边界之外。

## Lessons appended to context memory

- LookBook 是 Flow 的投影视图，不拥有第二份内容；只有 `lookbookLayout` 属于视图状态。
- 媒体 membership 必须遵循真实 typed handles：media output → identity media input；文本与档案使用 text。
- 高频交互过程不写 ProjectData：drag 使用 transform，resize 使用 rAF 预览，结束时单次递增 revision。
