# Plan — Public Account Square

Architecture Intent Block:
- Account 是项目目录与公开策略的所有者；Foundation 只解释当前项目内部结构。
- Public read 是独立能力：目录发现、快照读取、只读实时流、踪迹审计分别建立服务端边界。
- 所有项目写入仍只有账户自己的 `/api/project-realtime` 连接；跨账户连接只能使用 `/api/public-project-realtime` 并携带 `access=view` attachment。

Work Breakdown (≤1 day each):
1. 数据与授权边界
   - 新增 profile/publication/visit migration 与共享可见性查询。
   - 扩展个人 profile API，新增目录、公开主页、公开项目、发布设置与踪迹 API。
   - 回滚点：删除新 API 与 `0005` migration；不影响现有项目文档表。
2. 只读实时链路
   - 扩展 Durable Object socket attachment 为 edit/view。
   - 新增公开项目 websocket gateway；验证访客不能写入但可接收广播。
   - 回滚点：关闭公开 gateway，原有编辑连接保持 `edit`。
3. 账户工作台与用户广场
   - 新增全屏账户组件：我的项目、用户广场、踪迹三种工作面。
   - 实现项目管理、发布开关、用户名搜索、只读实时项目大纲与响应式状态。
   - 回滚点：移除入口，不改变底层 `ProjectData` 结构。
4. Foundation 职责迁移
   - 移除 Foundation gateway 中的项目货架和编辑表单。
   - 账户弹层增加账户工作台与用户广场入口。
   - 回滚点：恢复原项目货架 UI。
5. 验证与审计
   - 新增公共访问/踪迹/只读实时/迁移职责测试。
   - 执行 typecheck、全量测试、build，并写 Verify / Reflect。

Verification Plan (by AC):
- AC1/2/4: API 源码架构测试 + D1 migration 约束测试。
- AC3: Durable Object attachment 与 view-update 拒绝测试。
- AC5/6/7: 组件契约测试 + typecheck + build；在本地页面做桌面/窄屏检查。
- AC8: `npm run typecheck`, `npm test`, `npm run build`。

Rollback Points:
- 数据表均为新增，不重写现有项目文档；生产前可不应用 migration。
- 公共 API 与 UI 入口可整体撤销，现有多端协作通道仍保持原路径。
- 若只读房间隔离验证失败，不开放公开实时入口，仅保留静态公开快照。
