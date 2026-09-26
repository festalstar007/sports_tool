# 第一版技术设计

产品名称为 `sports_tool`，正式域名为 `https://sports.345001.xyz`。代码、Worker 和 Cloudflare 资源名称优先使用兼容性更好的连字符形式 `sports-tool`。

本地工程根目录固定为 `/home/zhang/fs/code/project/sports_demo`。下文目录结构均相对于该目录，初始化工具必须使用当前目录模式，不得生成第二层项目文件夹。

## 1. 总体架构

```text
手机浏览器 / PWA
        |
        | HTTPS，同源 /api/*
        v
Cloudflare Worker
  ├─ 静态资源：React + Vite
  ├─ API：Hono
  ├─ D1：导入记录、正式运动记录
  ├─ Images：上传截图转换为 WebP
  ├─ R2：转换后的私有截图
  └─ Workers AI：截图识别

Cloudflare Access 位于整个应用之前
```

第一版为单部署单元。前端静态资源和 `/api/*` 由同一个 Worker 提供，避免拆分域名和处理 CORS。

## 2. 技术栈

- Node.js `>=22`，推荐 Node.js 24；项目验证环境为 `24.19.0`。
- pnpm `12.3.4`，唯一允许的包管理器。
- React、TypeScript、Vite。
- Cloudflare Vite 插件及 Wrangler。
- Hono：API 路由与中间件。
- Zod：表单、API 和 AI 输出校验。
- React Router：页面路由。
- TanStack Query：服务端状态、缓存和请求状态。
- Apache ECharts：趋势图。
- D1：关系数据。
- R2：私有图片对象。
- Workers AI：视觉识别。
- Vitest：单元测试。
- Playwright：手机视口端到端测试。

具体依赖版本由初始化时的稳定版本决定，但不得随意加入功能重复的大型依赖。

## 3. 当前目录结构

```text
sports_demo/
├── AGENTS.md
├── README.md
├── docs/
├── migrations/
├── public/
│   ├── manifest.webmanifest
│   └── icons/
├── src/
│   ├── client/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   ├── form.ts
│   │   └── main.tsx
│   ├── worker/
│   │   ├── routes/
│   │   │   ├── activities.ts
│   │   │   ├── imports.ts
│   │   │   └── statistics.ts
│   │   ├── services/
│   │   │   ├── recognition-service.ts
│   │   │   └── screenshot-storage.ts
│   │   ├── app-types.ts
│   │   ├── db.ts
│   │   ├── env.ts
│   │   ├── http.ts
│   │   └── index.ts
│   └── shared/
│       ├── activity-schema.ts
│       ├── api.ts
│       ├── units.ts
│       └── validation.ts
├── tests/
│   ├── unit/
│   └── e2e/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
└── wrangler.jsonc
```

客户端与 Worker 共享纯类型、Zod Schema 和单位转换函数。共享模块不得依赖浏览器专属或 Worker 专属 API。

### 3.1 当前 Worker 后端目录

Worker 后端按业务域组织：

- `worker/index.ts`：创建 Hono 应用，挂载日志、request ID、Access 校验、健康检查和全局错误处理。
- `worker/app-types.ts`：统一 Cloudflare bindings、Hono variables 和 Context 类型。
- `worker/routes/imports.ts`：截图上传、导入查询、私有图片读取和重新识别。
- `worker/routes/activities.ts`：运动记录创建、列表、详情、修改和删除。
- `worker/routes/statistics.ts`：汇总数据与趋势时间桶查询。
- `worker/services/recognition-service.ts`：Workers AI 调用及识别结果规范化。
- `worker/services/screenshot-storage.ts`：通过 Images binding 将上传图片编码为 WebP，并按 UTC 年月和时间戳生成 R2 对象键。
- `worker/db.ts`：D1 行类型及数据库字段到 API 字段的映射。
- `worker/http.ts`：统一成功、失败响应及 Zod 错误转换。

路由模块只负责 HTTP 参数与响应编排。业务继续增长时，再把跨多个路由复用的逻辑提取到 `services`，不要提前为每个简单 SQL 增加一层空包装。

## 4. Cloudflare 绑定

Wrangler 配置需要包含：

- `DB`：D1 database binding。
- `SCREENSHOTS`：R2 bucket binding。
- `IMAGES`：Cloudflare Images binding，用于上传时转换 WebP。
- `AI`：Workers AI binding。
- `ASSETS`：由 Cloudflare/Vite 静态资源配置生成或提供。

环境变量建议：

```text
APP_ENV=development|production
APP_TIMEZONE=Asia/Shanghai
AI_MODEL=<部署时从 Cloudflare 免费计划及免费额度内选择的视觉模型>
MAX_UPLOAD_BYTES=10485760
DEV_AUTH_BYPASS=false
```

`DEV_AUTH_BYPASS` 只能在本地开发环境启用；生产代码检测到生产环境和绕过配置同时开启时应拒绝启动或拒绝请求。

`AI_MODEL` 不设硬编码默认值。部署前检查 Cloudflare 当时免费计划及免费额度可用的视觉模型，选择支持图片理解/OCR 和结构化输出的模型。模型不可用或额度耗尽时，产品必须退化为手工确认录入，不能阻断创建运动记录。

## 5. API 契约

所有响应采用：

```json
{
  "data": {},
  "error": null
}
```

错误响应采用：

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "提交的数据无效",
    "fields": {}
  }
}
```

### 5.1 导入

`POST /api/imports`

- `multipart/form-data`，字段名 `image`。
- 校验类型和大小。
- 创建 `activity_imports` 记录。
- 使用 Images binding 将图片转为 WebP，不缩小像素尺寸；转换失败时不创建导入记录。
- 将转换后的 WebP 写入 R2，并将同一份图片交给识别服务。D1 记录 WebP 的字节数和 `image/webp` 类型。
- 截图对象键格式为 `YYYYMM/<UTC Unix 秒>_<8 位随机数字>.webp`，例如 `202609/1790238567_12345678.webp`。
- 调用识别服务并保存原始、规范化结果。
- 返回导入记录和待确认字段。
- 个人低频场景下第一版同步等待识别；识别失败也返回可手工编辑的导入记录。

`GET /api/imports/:id`

- 返回导入状态、截图访问地址或受保护的图片接口，以及规范化识别结果。

`POST /api/imports/:id/retry`

- 对未生成正式运动记录的导入重新识别。
- 重试不得覆盖用户已经确认的正式记录。

### 5.2 正式运动记录

`POST /api/activities`

- 输入包含 `importId` 和用户确认后的全部字段。
- `importId` 唯一，重复提交返回已有记录，实现幂等。

`GET /api/activities`

- 参数：`sportType`、`from`、`to`、`cursor`、`limit`。
- 默认按 `started_at DESC, id DESC` 排序。

`GET /api/activities/:id`

- 返回运动记录和对应导入信息。

`PATCH /api/activities/:id`

- 修改用户可编辑字段，重新执行交叉校验。

`DELETE /api/activities/:id`

- 删除正式记录和对应导入记录、R2 图片。
- 如果对象删除失败，应记录错误并允许后台或人工重试，不能返回伪成功。

### 5.3 统计

`GET /api/statistics/summary`

- 参数：`sportType`、`from`、`to`。
- 返回次数、总距离、总时长、总热量、总步数。

`GET /api/statistics/trends`

- 参数：`sportType`、`from`、`to`、`metric`、`bucket=day|week|month`。
- 返回按时间桶排序的点列表。

## 6. 图片读取

R2 Bucket 不公开。详情页通过受 Access 保护的 Worker 路由读取图片，例如：

```text
GET /api/imports/:id/image
```

响应设置正确的 `Content-Type`、私有缓存策略和 `X-Content-Type-Options: nosniff`。接口不得接受任意 R2 key，只通过导入 ID 查库后读取。

## 7. PWA 与移动端要求

- 提供 Web App Manifest、图标、主题色和 standalone display。
- 第一版 Service Worker 只缓存静态应用壳，不缓存私有 API 和截图。
- 适配常见手机竖屏宽度，从 320px 开始可用。
- 主要点击目标至少约 44px。
- 上传、识别和保存过程显示清晰状态，避免用户重复点击。
- 不要求离线创建记录。

## 8. 可观测性

- 为每次请求生成或透传 request ID。
- 记录导入 ID、状态和错误码，不记录图片内容。
- 识别失败区分上传错误、AI 调用错误、JSON 解析错误和业务校验错误。
- 第一版使用结构化 `console` 日志及 Cloudflare 平台日志即可。
