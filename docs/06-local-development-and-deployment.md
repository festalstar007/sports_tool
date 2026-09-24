# 本地开发与部署

本文说明如何在不连接正式 Cloudflare 资源的情况下开发和验收，以及后续如何接入 `sports.345001.xyz`。生产部署前应先读完 `02-technical-design.md` 和 `03-data-and-recognition.md`。

## 1. 环境要求

- Node.js 22 或更高，推荐 Node.js 24；工程根目录提供 `.nvmrc`。
- pnpm 12.3.4；依赖由 pnpm 的全局内容寻址仓库复用，不要改用 npm 或 Yarn。
- 本地开发无需预先创建 D1、R2 或 Workers AI 资源，Wrangler 会使用 `.wrangler/` 下的本地状态。

```bash
cd /home/zhang/fs/code/project/sports_demo
corepack enable
nvm use
pnpm install
```

如果系统没有 nvm，直接确保 `node --version` 不低于 22 即可。

## 2. 本地配置和数据库

仓库提供 `.dev.vars.example`，本地实际配置使用 `.dev.vars`，该文件已被 Git 忽略：

```dotenv
APP_ENV=development
DEV_AUTH_BYPASS=true
AI_MODEL=
```

`DEV_AUTH_BYPASS=true` 只允许用于非生产环境。`AI_MODEL` 留空时，上传成功后会得到 `needs_review` 状态和 `AI_NOT_CONFIGURED` 提示，用户仍可在确认页手工录入并保存。

首次启动或迁移变更后执行：

```bash
pnpm db:migrate:local
```

## 3. 启动与验收

```bash
pnpm dev
```

默认地址为 `http://localhost:5173`，健康检查为 `http://localhost:5173/api/health`。两张固定验收截图位于：

- `tests/fixtures/screenshots/outdoor-running-2026-09-20.jpg`
- `tests/fixtures/screenshots/outdoor-walking-2026-09-22.jpg`

质量检查：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Playwright 首次使用若缺少浏览器，可执行：

```bash
pnpm exec playwright install chromium
```

## 4. 创建 Cloudflare 资源

先登录 Wrangler：

```bash
pnpm exec wrangler login
```

创建 D1 数据库和私有 R2 bucket：

```bash
pnpm exec wrangler d1 create sports-tool
pnpm exec wrangler r2 bucket create sports-tool-screenshots
```

将 D1 命令返回的真实 `database_id` 替换 `wrangler.jsonc` 中的全零占位值。R2 不设置公共域名，也不开放匿名读取；截图只能通过已鉴权的 Worker API 返回。

应用首次部署前执行远程迁移：

```bash
pnpm db:migrate:remote
```

## 5. 启用 Workers AI

当前生产配置使用 `AI` binding 和视觉模型 `@cf/meta/llama-3.2-11b-vision-instruct`。模型适配集中在 `src/worker/services/recognition-service.ts`，图片以带 MIME 类型的 Base64 data URL 发送，模型输出仍须通过 Zod 校验后才能进入确认页。

首次使用该模型前，账户所有者必须接受 Meta Llama 3.2 License 和 AUP。使用具有 `Workers AI Write` 权限的临时 API Token 执行以下命令，令牌不要写入仓库或聊天记录：

```bash
export CLOUDFLARE_ACCOUNT_ID="你的账户 ID"
export CLOUDFLARE_AUTH_TOKEN="临时 API Token"
curl "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct" \
  -X POST \
  -H "Authorization: Bearer ${CLOUDFLARE_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"prompt":"agree"}'
unset CLOUDFLARE_AUTH_TOKEN
```

确认响应中的 `success` 为 `true` 后：

1. 部署包含 `AI` binding 和 `AI_MODEL` 的版本。
2. 使用两张固定截图校验 `03-data-and-recognition.md` 中的全部期望字段。
3. 特别确认没有把手机状态栏时间识别为运动开始时间。
4. AI 结果仅用于预填，保存前始终由用户人工确认。

## 6. 配置 Access 和域名

在 Cloudflare Zero Trust 中为 `sports.345001.xyz` 创建 Access Self-hosted Application，只允许本人的身份登录。生产环境不要配置 `DEV_AUTH_BYPASS=true`。

为 Worker 配置自定义域名 `sports.345001.xyz` 后，确认：

- 页面和 `/api/*` 都由 Access 保护。
- 未登录请求无法读取运动记录或原始截图。
- R2 bucket 没有公共访问入口。
- HTTPS 和 PWA manifest 正常。

工程通过 `wrangler.jsonc` 的 Custom Domain route 管理该域名，并显式关闭 `workers.dev` 和预览 URL，避免绕过 Access 访问 Worker。

## 7. 构建与部署

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm run deploy
```

部署完成后，用手机执行一次完整流程：登录、上传跑步截图、校对、保存、查看历史和曲线，再对步行截图重复一次。

## 8. GitHub 持续集成

`.github/workflows/ci.yml` 会在 push 和 pull request 时执行安装、类型检查、Lint、单元测试与生产构建。生产部署暂不自动触发，等 Cloudflare API Token、Account ID、D1 ID 和 Workers AI 模型确定后，再单独添加受保护的部署工作流。

## 9. 不应提交的内容

- `.dev.vars` 和任何 Cloudflare Token。
- `.wrangler/` 本地数据库与对象存储状态。
- `node_modules/`、`dist/`、Playwright 报告。
- 包含个人信息的新截图；当前两个测试样例已获得用户授权。

构建过程可能由 Cloudflare Vite 插件临时生成一份本地变量文件；工程的 `postbuild` 会删除该副本，防止本地变量残留在 `dist/` 中。
