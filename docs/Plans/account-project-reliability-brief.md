# Mission Brief — Account and Project Reliability

Objective:
- 将账户身份语义收敛为“邮箱 + 用户名”：邮箱来自登录账户、仅本人可见；用户名同时是公开显示名称。
- 将账户公开开关放到账户区域，将项目公开策略放到每个项目条目中，默认继承账户设置。
- 保证一次新建操作至多产生一个项目。
- 将单项目永久删除从“账户数据重置”中拆出，完整删除该项目的本地状态、D1 数据、实时房间状态和对象存储前缀。

Out-of-scope:
- 修改登录邮箱、账号合并、恢复已删除项目。
- 删除整个账户或更改 Clerk 登录方式。
- 本轮未获批准前不应用远端迁移、不发布生产版本。

Inputs / Outputs (contracts):
- Clerk `email`: 只读登录标识，只显示给账户本人，不进入用户广场响应。
- `user_profile.username`: 唯一公开名称，也是其他用户看到的显示名称。
- 项目公开策略：`inherit | public | private`，由每个项目条目直接编辑。
- 项目创建草稿携带稳定 `projectId`；重复提交同一草稿必须返回同一项目集合。
- `DELETE /api/project-delete?projectId=...`: 只执行一个 `(user_id, project_id)` 的永久删除，不接受账户级作用域。
- 删除墓碑阻止旧终端在收到删除事件后用陈旧离线数据重新创建同一项目。

Acceptance Criteria (AC):
- AC1: 账户 UI 只提供只读邮箱、可编辑用户名和简介；不再出现“显示名称”字段。
- AC2: 账户公开开关位于账户侧栏；每个项目条目都有自己的继承/公开/私密选项。
- AC3: 同一创建草稿被提交两次仍只产生一个项目。
- AC4: 单项目删除不再调用 `/api/account-data-reset`，错误信息不再出现 “reset account data”。
- AC5: 删除成功后清除项目 D1 行、实时房间、IndexedDB/本地 Agent 状态及 Supabase 项目前缀。
- AC6: 已删除项目 ID 被墓碑阻断，旧终端无法通过实时网关复活项目。
- AC7: 账户重置仍使用独立 POST 路径，且项目重置与项目删除语义不混用。
- AC8: 新增回归测试，严格类型检查、全量测试和生产构建通过。

Constraints (perf/i18n/a11y/privacy):
- 邮箱不得进入公开目录、公开主页或踪迹 DTO。
- 不新增依赖；继续使用现有 React、Tailwind v4、Framer Motion 和 Phosphor。
- 删除是高风险操作，必须明确确认、显示进行中状态，并在远端成功后才移除本地项目。
- 对象存储与 D1 无跨系统事务，先删除对象前缀，再写删除墓碑、关闭实时房间并清理 D1；失败时保留本地项目供重试。

Dependencies & Risks:
- 现有生产 D1 需要新增项目删除墓碑表。
- 旧客户端不知道墓碑，但新的实时网关会在服务端拒绝其重连。
- 已经产生的重复项目不会按标题自动合并，避免误删两个恰好同名但内容不同的合法项目。

Platform Differences via Platform Layer:
- Web 与 Electron 共享同一账户组件和删除协议；移动宽度保持单栏回退。

