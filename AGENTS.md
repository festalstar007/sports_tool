# AGENTS.md

本文件是后续 AI 开发本工程时的首要执行说明。开始编码前必须完整阅读 `README.md` 和 `docs/` 下全部文档。

## 目标

实现 `sports_tool`：一款个人使用、移动端优先的运动记录 PWA。用户上传一张运动详情截图，系统识别跑步或步行及相关指标，用户检查和修正后保存，之后可查看历史记录和趋势曲线。生产域名为 `https://sports.345001.xyz`。

## 强制工程约束

- 只使用 `pnpm`，不得运行 `npm install`、`npm ci`、`yarn` 或生成相应锁文件。
- Node.js 必须为 22 或更高版本，推荐使用 `.nvmrc` 指定的 Node.js 24；不得用 Node.js 20 运行当前 Wrangler。
- 提交并维护唯一的 `pnpm-lock.yaml`。
- `package.json` 必须包含 `"packageManager": "pnpm@12.3.4"`。
- 工程根目录固定为 `/home/zhang/fs/code/project/sports_demo`；必须在此目录原地初始化和开发，不得再创建嵌套的 `sports-tool/`、`sports_demo/` 或其他工程目录。
- 第一版采用一个仓库、一个部署单元，不拆微服务，不引入 monorepo。
- 前端使用 React + TypeScript + Vite；API 使用同一 Cloudflare Worker 内的 Hono。
- 数据使用 D1；截图使用私有 R2 Bucket；图片识别使用 Workers AI。
- Workers AI 具体模型暂不固定，只能选择当时可在 Cloudflare Workers 免费计划及免费额度内调用的视觉模型；通过 `AI_MODEL` 环境变量配置并保留替换能力。
- 生产环境由 Cloudflare Access 保护；第一版不开发用户名、密码、注册和找回密码功能。
- API 与前端使用同一源，统一使用 `/api/*` 路由，避免额外 CORS 配置。
- 所有外部输入和 AI 输出均视为不可信数据，必须用 Zod 校验。
- 数据库存储使用本文档规定的标准单位，不直接保存带单位的展示字符串。
- D1 迁移一旦应用，不得修改旧迁移；通过新增迁移演进。
- 不得提交密钥、Access Token、R2 凭据或真实 `.dev.vars`。
- 每完成一个阶段，运行格式检查、类型检查、单元测试和构建。
- 变更产品范围、字段语义、API 契约或数据库结构时，同步更新对应文档。

## 第一版范围边界

第一版只处理：

- 户外跑步，对应 `running`。
- 户外步行，对应 `walking`。
- 与样例截图相同类型的中文运动详情页面。
- 单张图片上传、同步识别、确认、保存、修改、删除和趋势查看。

第一版不实现：

- 多用户和应用内账户系统。
- 原生 Android/iOS 客户端。
- Cloudflare Queues、VPS OCR、批量导入和多图合并。
- 地图轨迹、分段数据、逐秒心率或步频数据。
- Garmin、Apple Health、华为运动健康等官方 API 同步。
- 社交、排行榜、训练处方或医疗建议。

## 实现原则

1. 先完成不依赖 AI 的闭环：上传截图、手工确认、保存、历史列表。
2. 再把 Workers AI 识别结果填入同一个确认表单。
3. AI 不能直接创建正式运动记录；只有用户确认操作能创建记录。
4. 上传截图由 Worker 转为 WebP；R2 保留转换后的截图，原始识别 JSON 必须保留，方便复查与改进识别。
5. 运动时间读取截图正文中的日期时间，必须忽略手机状态栏时间。
6. 跑步和步行共享组件、接口和表结构，只通过 `sport_type` 区分。
7. 先确保手机竖屏体验；桌面端只需正常可用。
8. `tests/fixtures/screenshots/` 中的两张用户授权截图是第一版识别回归测试的固定输入，不得覆盖原图。

## 推荐质量门槛

项目脚本至少提供：

```text
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm deploy
```

单元测试覆盖单位转换、配速解析、时间解析、运动类型映射和交叉校验。端到端测试至少覆盖上传、确认保存、历史查询和趋势筛选。

## 已确定的部署标识

- 产品名称：`sports_tool`。
- Worker/工程标识建议使用连字符形式 `sports-tool`。
- 正式子域名：`sports.345001.xyz`。

## 未决定但不阻塞开发的事项

- 具体 Workers AI 视觉模型：实现阶段从 Cloudflare 免费计划及免费额度内可用的视觉模型中选择，通过 `AI_MODEL` 配置，不在业务代码中散落模型名称。
- 样例截图的具体来源品牌；数据库中的 `source_app` 允许为空，识别逻辑不依赖品牌名称。
