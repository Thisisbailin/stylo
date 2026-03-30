<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1eXXIDiX1tzLucyPDhlkUsEd1pykGpNZ7

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Cloudflare Pages + Clerk 同步
- 前端：在 `.env.local` 设置 `VITE_CLERK_PUBLISHABLE_KEY`（Clerk Publishable Key）。
- 可选：本地未运行 Pages Functions 时，可设置 `VITE_API_BASE=https://qalam.pages.dev` 让 `/api/*` 走线上后端。
- 可选灰度开关（前端）：`VITE_SYNC_ROLLOUT_PERCENT`（0-100，默认 100）、`VITE_SYNC_ROLLOUT_SALT`、`VITE_SYNC_ROLLOUT_ALLOWLIST`（逗号分隔 userId）。
- 后端（Pages Functions）：在 Cloudflare Pages “Environment variables” 添加 `CLERK_SECRET_KEY`（对应同一环境的 Secret Key）。
- 可选灰度开关（后端）：`SYNC_ROLLOUT_PERCENT`（0-100，默认 100）、`SYNC_ROLLOUT_SALT`、`SYNC_ROLLOUT_ALLOWLIST`（逗号分隔 userId）。
- 数据库：为站点绑定一个 D1 数据库，绑定名 `DB`。初始化表：
  ```sql
  CREATE TABLE IF NOT EXISTS user_projects (
    user_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  ```
- API：`functions/api/project.ts` 会通过 Authorization Bearer token（前端用 `getToken()` 获取）校验用户并读写用户专属数据。重新部署 Pages 后即生效。
