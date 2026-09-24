import { describe, expect, it } from 'vitest';
import { createScreenshotObjectKey } from '../../src/worker/services/screenshot-storage';

describe('R2 截图对象键', () => {
  it('按 UTC 年月分组，并使用 UTC Unix 秒和 8 位随机数字命名 JPEG', () => {
    const uploadedAt = new Date('2026-09-24T07:09:27.999Z');

    expect(createScreenshotObjectKey('image/jpeg', uploadedAt, '12345678')).toBe(
      `202609/${Math.floor(uploadedAt.getTime() / 1000)}_12345678.jpg`,
    );
  });

  it('跨年时仍按 UTC 月份生成前缀，并保留随机数前导零', () => {
    const uploadedAt = new Date('2027-01-01T00:00:00.000Z');

    expect(createScreenshotObjectKey('image/png', uploadedAt, '00000042')).toBe(
      `202701/${Math.floor(uploadedAt.getTime() / 1000)}_00000042.png`,
    );
  });

  it('保留 WebP 扩展名', () => {
    const uploadedAt = new Date('2026-12-31T23:59:59.000Z');

    expect(createScreenshotObjectKey('image/webp', uploadedAt, '87654321')).toBe(
      `202612/${Math.floor(uploadedAt.getTime() / 1000)}_87654321.webp`,
    );
  });

  it('拒绝非 8 位数字后缀', () => {
    expect(() => createScreenshotObjectKey('image/jpeg', new Date(), '1234')).toThrow(
      'Screenshot random suffix must contain exactly 8 digits',
    );
  });
});
