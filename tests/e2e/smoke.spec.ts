import { expect, test } from '@playwright/test';

test('移动端首页可以打开', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('sports_tool', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '从相册选择截图' })).toBeVisible();
});

test('健康检查正常', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ data: { status: 'ok' }, error: null });
});

test('未配置 AI 时明确提示手工填写并规范化运动时长', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/screenshots/outdoor-walking-2026-09-22.jpg');
  await expect(page).toHaveURL(/\/imports\/[^/]+\/review$/);
  await expect(page.getByText('当前未启用自动识别，下面的示例文字不是识别结果。')).toBeVisible();

  const duration = page.getByLabel('运动时长');
  await duration.fill('31分29秒');
  await duration.blur();
  await expect(duration).toHaveValue('00:31:29');
});
