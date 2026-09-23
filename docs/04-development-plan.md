# 开发计划

实现顺序以尽快形成可验证的纵向闭环为准。每个阶段都必须保持项目可运行，并满足本阶段完成条件后再进入下一阶段。

## 阶段 0：工程初始化

工作内容：

- 初始化 Git 仓库。
- 在 `/home/zhang/fs/code/project/sports_demo` 原地初始化工程，禁止创建嵌套项目目录。
- 使用 pnpm 创建 Cloudflare React + Vite + TypeScript 工程；如果脚手架不能安全地在非空当前目录运行，则手工添加项目文件，不能覆盖现有文档和测试夹具。
- 加入 Hono、Zod、React Router、TanStack Query、ECharts、Vitest 和 Playwright。
- 配置 Wrangler、TypeScript、Lint、测试和构建脚本。
- 工程和 Worker 标识使用 `sports-tool`，产品界面名称使用 `sports_tool`。
- 创建 `.dev.vars.example`，确保真实 `.dev.vars` 被忽略。
- 添加基础 PWA Manifest。

完成条件：

- `pnpm install` 成功。
- `pnpm dev` 能同时访问前端和 `/api/health`。
- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 全部通过。
- 没有 npm 或 Yarn 锁文件。

## 阶段 1：数据和手工录入闭环

工作内容：

- 编写 D1 初始迁移。
- 实现共享 Zod Schema 和单位转换函数。
- 实现上传接口，将截图保存到本地模拟存储或开发 R2。
- 创建导入记录，但暂不调用 AI。
- 实现统一确认表单，允许用户手工填写跑步/步行数据。
- 实现创建、查看、修改和删除正式运动记录。
- 实现历史列表。

完成条件：

- 手机视口可上传截图并看到预览。
- 可以手工录入两种运动并保存到本地 D1。
- 重复提交同一个导入不会创建重复正式记录。
- 可以修改、删除和筛选历史记录。

## 阶段 2：Workers AI 识别

工作内容：

- 创建独立的 recognition service。
- 编写仅返回 JSON 的视觉识别 Prompt。
- 使用 Zod 验证 AI 响应。
- 实现运动类型、日期、单位和千位分隔符转换。
- 实现三组交叉校验。
- 把识别结果填入现有确认表单。
- 实现识别失败后的手工填写及重试。

完成条件：

- `tests/fixtures/screenshots/` 中两张固定样例得到 `03-data-and-recognition.md` 中的期望值。
- 状态栏时间不会被识别为运动时间。
- AI 非 JSON、字段缺失和数值异常都有明确处理。
- AI 识别完成后仍需用户点击确认保存。

## 阶段 3：统计和趋势

工作内容：

- 实现 summary 和 trends API。
- 首页展示本周摘要及最近一次运动。
- 实现 7、30、90 天和全部时间范围。
- 实现运动类型筛选。
- 使用 ECharts 绘制主要指标。
- 处理空数据、单点数据和缺失指标。

完成条件：

- 跑步和步行可分别筛选。
- 总距离、总时长、总热量和总步数计算正确。
- 配速曲线明确表达“越低越快”。
- 图表在 320px 宽度下可读且不横向溢出。

## 阶段 4：生产部署和安全

工作内容：

- 创建正式 D1、R2 和 Workers AI bindings。
- 从部署时 Cloudflare 免费计划及免费额度可用的视觉模型中选择模型并配置 `AI_MODEL`。
- 配置 Cloudflare Access。
- 配置自定义子域名 `sports.345001.xyz`。
- 配置 GitHub Actions 或 Cloudflare Git 部署。
- 运行远程数据库迁移。
- 验证 R2 没有公共访问。
- 增加部署说明和备份说明。

完成条件：

- 未登录用户不能访问应用和 API。
- 登录后手机可以完成完整流程。
- 页面刷新后记录保持存在。
- 截图不能通过猜测 R2 key 匿名访问。
- 生产环境未启用开发认证绕过。

## 阶段 5：PWA 完善

工作内容：

- 添加完整图标和安装体验。
- 缓存静态应用壳。
- 检查 iOS Safari 和 Android Chrome 上传体验。
- 不缓存私有 API 或截图响应。

完成条件：

- 可添加到手机主屏幕并以 standalone 模式启动。
- 更新部署后不会因为旧缓存长期停留在错误版本。
- 网络异常时给出可理解提示。

## 后续候选项

以下事项需要新需求确认后才能加入：

- Cloudflare Queues 异步识别。
- VPS Python OCR 备用识别。
- 更多运动类型和更多截图模板。
- CSV/JSON 导入导出。
- D1 定期备份。
- 训练负荷、恢复和长期建议。
