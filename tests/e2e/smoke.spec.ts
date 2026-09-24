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

test('未配置 AI 时明确提示手工填写并使用分段时长输入', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/screenshots/outdoor-walking-2026-09-22.jpg');
  await expect(page).toHaveURL(/\/imports\/[^/]+\/review$/);
  await expect(page.getByText('当前未启用自动识别，下面的示例文字不是识别结果。')).toBeVisible();

  await page.getByLabel('运动时长-分钟').fill('31');
  await page.getByLabel('运动时长-秒').fill('29');
  await expect(page.getByLabel('运动时长-小时')).toHaveValue('00');
  await expect(page.getByLabel('运动时长-分钟')).toHaveValue('31');
  await expect(page.getByLabel('运动时长-秒')).toHaveValue('29');
});

test('可以快速手动录入运动并自动计算配速', async ({ page }) => {
  await page.goto('/activities/new');
  await page.getByRole('radio', { name: '跑步' }).click();
  await page.getByLabel('距离').fill('2.21');
  await page.getByLabel('运动时长-分钟').click();
  await page.getByLabel('运动时长-分钟').pressSequentially('20');
  await expect(page.getByLabel('运动时长-分钟')).toHaveValue('20');
  await expect(page.getByLabel('运动时长-秒')).toBeFocused();
  await page.getByLabel('运动时长-秒').pressSequentially('40');
  await expect(page.getByLabel('运动时长-秒')).toHaveValue('40');

  await expect(page.getByText('9′21″ /公里')).toBeVisible();
  await expect(page.getByText('6.42 公里/小时')).toBeVisible();

  await page.getByRole('button', { name: '保存运动记录' }).click();
  await expect(page).toHaveURL(/\/activities\/[^/]+$/);
  await expect(page.getByText('户外跑步')).toBeVisible();
  await expect(page.getByText('2.21 km')).toBeVisible();
});

test('时长字段支持双位输入、清空和重新输入', async ({ page }) => {
  await page.goto('/activities/new');
  const hours = page.getByLabel('运动时长-小时');
  const minutes = page.getByLabel('运动时长-分钟');

  await hours.click();
  await hours.press('3');
  await expect(hours).toHaveValue('3');
  await expect(hours).toBeFocused();

  await hours.press('4');
  await expect(hours).toHaveValue('34');
  await expect(minutes).toBeFocused();

  await hours.click();
  await hours.press('Backspace');
  await expect(hours).toHaveValue('');
  await hours.press('3');
  await expect(hours).toHaveValue('3');
  await expect(hours).toBeFocused();
});

test('无效分钟数改正后会清除错误并允许保存', async ({ page }) => {
  await page.goto('/activities/new');
  await page.getByRole('radio', { name: '跑步' }).click();
  await page.getByLabel('距离').fill('1');

  const minutes = page.getByLabel('运动时长-分钟');
  await minutes.click();
  await minutes.pressSequentially('61');
  await expect(page.getByRole('alert')).toContainText('分钟和秒需为 0–59');

  await minutes.click();
  await minutes.pressSequentially('55');
  await expect(page.getByRole('alert')).not.toBeVisible();
  await page.getByRole('button', { name: '保存运动记录' }).click();
  await expect(page).toHaveURL(/\/activities\/[^/]+$/);
});

test('距离错误会在修正后重新校验并消失', async ({ page }) => {
  await page.goto('/activities/new');
  await page.getByRole('radio', { name: '步行' }).click();
  await page.getByLabel('距离').fill('0');
  await page.getByLabel('距离').press('Tab');
  await expect(page.getByRole('alert')).toHaveText('请填写有效的运动距离');

  await page.getByLabel('距离').fill('3');
  await page.getByLabel('距离').press('Tab');
  await expect(page.getByRole('alert')).not.toBeVisible();
  await page.getByLabel('运动时长-分钟').fill('30');
  await page.getByRole('button', { name: '保存运动记录' }).click();
  await expect(page).toHaveURL(/\/activities\/[^/]+$/);
});

test('手动录入草稿在页面意外刷新后可以恢复', async ({ page }) => {
  await page.goto('/activities/new');
  await page.getByRole('radio', { name: '步行' }).click();
  await page.getByLabel('距离').fill('4.25');
  await page.getByLabel('运动时长-分钟').fill('45');

  await page.reload();

  await expect(page.getByRole('radio', { name: '步行' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('距离')).toHaveValue('4.25');
  await expect(page.getByLabel('运动时长-分钟')).toHaveValue('45');
});
