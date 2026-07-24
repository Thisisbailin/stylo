# Plan — Account and Project Reliability

Architecture Intent Block:
- Account Profile 只拥有登录标识与公开身份；邮箱属于认证层，用户名属于公开资料层。
- Project Catalog 负责项目级操作与发布策略；Foundation 不参与。
- Reset、Delete 是两个不同用例：Reset 保留项目身份并清空内容，Delete 写墓碑并永久移除项目身份。

Work Breakdown (≤1 day each):
1. 身份与布局语义
   - 将显示名称折叠为用户名；邮箱只读、标记为私密。
   - 将账户公开控制移到账户侧栏，将项目可见性控制放入项目条目。
2. 创建幂等
   - 创建草稿生成稳定项目 ID。
   - 项目创建函数按 ID 幂等，防止双击/重复事件生成第二个项目。
3. 删除用例拆分
   - 新增项目删除 API；客户端改用专用路径。
   - 移除错误的全局 write-guard 项目删除 SQL。
   - Reset 改为 POST-only，Delete 改为专用 DELETE。
4. 删除防复活
   - 新增 D1 墓碑表。
   - 实时网关拒绝墓碑项目；删除模式关闭现有房间 socket。
5. 验证
   - 覆盖双提交、项目级 SQL、专用路由、墓碑守卫与 UI 信息架构。
   - 运行 typecheck、全量测试、build，记录 Verify / Reflect。

Verification Plan (by AC):
- AC1/2: 组件契约测试与本地响应式视觉检查。
- AC3: `createAccountProject` 双提交单元测试。
- AC4/5/7: 项目生命周期 API 源码测试与 D1 批处理单元测试。
- AC6: migration / gateway / room close 协议测试。
- AC8: `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`。

Rollback Points:
- UI 可恢复为上一版账户工作台，不影响数据库。
- 删除专用路由可回退到只禁用删除按钮；不得回退到错误的账户重置路径。
- 墓碑表为增量表；代码回滚时可保留，不应删除历史墓碑。

