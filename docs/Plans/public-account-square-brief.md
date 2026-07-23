# Mission Brief — Public Account Square

Objective:
- 允许账户整体公开，或仅公开账户下的指定项目。
- 新增“账户工作台 / 用户广场”全屏组件，承接项目层级、项目切换与发布控制；Foundation 回归当前项目的时间 / 空间创作结构。
- 登录用户可以按用户名检索其他账户，进入其主页并实时只读查看已公开项目。
- 所有跨账户查看都绑定登录身份并留下“正在查看 / 查看历史”踪迹，账户双方都可查询自己的相关记录。

Out-of-scope:
- 匿名浏览、公开项目编辑、评论、关注、点赞与社交推荐排序。
- 将访客加入项目协作者或赋予写权限。
- 本轮远端 D1 迁移与生产发布；本地验证通过后单独申请批准。

Inputs / Outputs (contracts):
- `user_profile`: 唯一用户名、展示名、简介、头像、账户公开状态与更新时间。
- `user_project_visibility`: `(user_id, project_id)` 级公开覆盖；账户公开或项目单独公开均可授权只读访问。
- `user_profile_visits`: 查看者、被查看者、可选项目、会话、首次/最近查看时间；最近心跳在有效窗口内即为“正在查看”。
- 公开目录仅返回账户身份摘要；公开项目接口在服务端验证可见性后才返回项目快照。
- 公开实时连接复用项目 Durable Object 房间，但 socket attachment 标记为 `view`，服务端拒绝该连接发送任何更新。

Acceptance Criteria (AC):
- AC1: 账户可设置整体公开/私密，每个项目可单独公开/恢复继承，并持久化到 D1。
- AC2: 用户名唯一、可检索；普通账户主页只暴露最小身份，公开内容由服务端可见性规则过滤。
- AC3: 公开项目可得到初始快照，并持续收到所有者实时更新；访客写入会被 Durable Object 拒绝。
- AC4: 打开他人主页/项目会生成可审计踪迹；“正在看我、看过我的、我看过的”可查询，自访不计入。
- AC5: 账户工作台可浏览、切换、新建、重命名和删除项目，并显示项目的 Foundation 层级摘要。
- AC6: Foundation 的项目货架不再承担账户项目管理；账户入口可直接打开账户工作台和用户广场。
- AC7: 桌面与移动宽度均可使用；包含 loading、empty、error 状态，键盘焦点与按钮标签可识别。
- AC8: 新增架构测试、类型检查、全量测试和生产构建均通过。

Constraints (perf/i18n/a11y/privacy):
- 必须登录后查看；禁止匿名踪迹与匿名实时访问。
- 访客只读权限由服务端和 Durable Object 双重执行，不能只依赖 UI 禁用。
- 搜索结果不返回邮箱、用户 ID、私有项目内容或存储对象地址。
- 踪迹历史默认保留最近 90 天的查询窗口；“正在查看”以 45 秒心跳窗口判定。
- UI 使用现有 React/Tailwind v4、Phosphor 图标与现有主题变量，不新增依赖。

Dependencies & Risks:
- Clerk token 仅提供稳定 `user_id`；用户名由 `user_profile` 持久化并建立唯一索引。
- 公开项目快照可能较大；首版限制为现有项目文档上限，目录接口不携带项目正文。
- Durable Object 连接过去默认可写；必须先落实 attachment 访问模式再开放公开实时入口。
- 账户公开会扩大数据可见面，生产迁移与发布必须在明确批准后执行。

Platform Differences via Platform Layer:
- Web / Desktop Electron 共用 React 组件与 API；窄屏退化为单栏导航，不依赖桌面悬停。
- 本轮不引入原生平台分支。
