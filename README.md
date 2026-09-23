# sports_tool

一个面向个人使用的移动端运动记录 PWA。第一版支持上传运动详情截图，识别跑步或步行数据，经用户确认后保存，并按时间查看趋势曲线。

正式访问域名：`https://sports.345001.xyz`

当前目录已经包含第一版可运行源码、数据库迁移、自动化测试和开发文档。未配置 Workers AI 时，上传流程会进入人工确认模式；配置兼容的 Cloudflare 视觉模型后，可在同一确认页面接收识别结果。

工程根目录固定为 `/home/zhang/fs/code/project/sports_demo`。后续源码、`package.json`、Cloudflare 配置、数据库迁移和测试均直接放在该目录，不再创建嵌套项目目录。

## 文档入口

开发前按以下顺序阅读：

1. [AGENTS.md](./AGENTS.md)：AI 和开发者必须遵守的工程约束。
2. [产品需求](./docs/01-product-requirements.md)：第一版做什么、不做什么。
3. [技术设计](./docs/02-technical-design.md)：技术栈、目录、页面和接口。
4. [数据与识别](./docs/03-data-and-recognition.md)：D1 表结构、字段单位、识别协议与校验规则。
5. [开发计划](./docs/04-development-plan.md)：推荐实现顺序和每阶段完成条件。
6. [验收测试](./docs/05-acceptance-tests.md)：功能完成的判断标准。
7. [本地开发与部署](./docs/06-local-development-and-deployment.md)：启动、测试、Cloudflare 资源配置和上线步骤。

真实识别样例位于 `tests/fixtures/screenshots/`，用户已授权将其用于开发、测试和验收。

## 已确定的核心范围

- 仅供个人使用。
- 手机端优先，可安装为 PWA。
- 第一版只支持 `running`（户外跑步）和 `walking`（户外步行）。
- 两种运动共享同一套参数、数据库表和确认表单。
- 一次上传一张运动详情截图。
- 截图识别结果必须经过用户确认后才能成为正式记录。
- 使用 Cloudflare Workers、D1、R2、Workers AI 和 Access。
- 使用 React、TypeScript、Vite、Hono 和 ECharts。
- 只允许使用 `pnpm` 管理依赖。
- Workers AI 视觉模型暂不固定；开发时只选择 Cloudflare Workers 免费计划及其免费额度可用的模型，并通过 `AI_MODEL` 配置。

## 包管理约束

本工程推荐并统一使用 pnpm。pnpm 通过全局内容寻址存储复用相同版本的依赖，可以显著减少多个工程重复占用磁盘；工程内仍会保留轻量的 `node_modules` 链接结构，这是 pnpm 正常工作方式。

```bash
corepack enable
pnpm install
pnpm db:migrate:local
pnpm dev
```

最新 Wrangler 要求 Node.js 22 或更高版本；推荐使用 Node.js 24。工程提供 `.nvmrc`，使用 nvm 时可执行 `nvm use`。

禁止生成或提交 `package-lock.json`、`npm-shrinkwrap.json`、`yarn.lock`。创建 `package.json` 时应声明：

```json
{
  "packageManager": "pnpm@12.3.4",
  "engines": {
    "node": ">=22"
  }
}
```

## 当前实现

- 移动端 PWA：首页、上传确认、历史记录、详情编辑和趋势页面。
- D1 运动记录与导入记录，R2 私有保存原始截图。
- 跑步和步行共用一套字段与表单。
- 识别服务以 `AI_MODEL` 为配置入口；未配置时可完整走通人工录入。
- Cloudflare Access 生产鉴权，本地开发可显式开启绕过。
- Vitest 单元测试和 Playwright 移动端冒烟测试。

常用检查命令：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

详细配置与上线步骤见 `docs/06-local-development-and-deployment.md`。
