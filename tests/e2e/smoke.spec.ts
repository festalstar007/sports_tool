import { expect, test } from '@playwright/test';

test('移动端首页可以打开', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('sports_tool', { exact: true })).toBeVisible();
  const uploadButton = page.getByRole('button', { name: '从相册选择截图' });
  await expect(uploadButton).toBeVisible();
  await expect(uploadButton).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.upload-icon')).toHaveCount(0);
});

test('健康检查正常', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ data: { status: 'ok' }, error: null });
});

test('拆分后的统计接口正常', async ({ request }) => {
  const [summaryResponse, trendsResponse] = await Promise.all([
    request.get('/api/statistics/summary'),
    request.get('/api/statistics/trends?metric=distance&bucket=day'),
  ]);
  expect(summaryResponse.ok()).toBeTruthy();
  expect(trendsResponse.ok()).toBeTruthy();
  await expect(summaryResponse.json()).resolves.toMatchObject({
    data: { count: expect.any(Number), totalDistanceMeters: expect.any(Number) },
    error: null,
  });
  await expect(trendsResponse.json()).resolves.toMatchObject({ data: expect.any(Array), error: null });
});

for (const { fixture, originalBytes } of [
  { fixture: 'outdoor-running-2026-09-20.jpg', originalBytes: 473727 },
  { fixture: 'outdoor-walking-2026-09-22.jpg', originalBytes: 481205 },
]) {
  test(`${fixture} 转换并存储为 WebP`, async ({ page, request }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(`tests/fixtures/screenshots/${fixture}`);
    await expect(page).toHaveURL(/\/imports\/[^/]+\/review$/);
    const importId = page.url().match(/\/imports\/([^/]+)\/review$/)?.[1];
    expect(importId).toBeTruthy();
    const importResponse = await request.get(`/api/imports/${importId}`);
    expect(importResponse.ok()).toBeTruthy();
    const { data: imported } = await importResponse.json();
    expect(imported.imageContentType).toBe('image/webp');
    expect(imported.imageSizeBytes).toBeLessThan(originalBytes);

    const imageResponse = await request.get(`/api/imports/${imported.id}/image`);
    expect(imageResponse.ok()).toBeTruthy();
    expect(imageResponse.headers()['content-type']).toContain('image/webp');
    const converted = await imageResponse.body();
    expect(converted.byteLength).toBe(imported.imageSizeBytes);
    expect(converted.toString('ascii', 0, 4)).toBe('RIFF');
    expect(converted.toString('ascii', 8, 12)).toBe('WEBP');
    const screenshot = page.locator('.screenshot-card img');
    await expect(screenshot).toHaveJSProperty('naturalWidth', 1264);
    await expect(screenshot).toHaveJSProperty('naturalHeight', 2736);
  });
}

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
