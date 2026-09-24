const EXTENSIONS_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function createRandomEightDigitSuffix(): string {
  const randomValue = new Uint32Array(1);
  crypto.getRandomValues(randomValue);
  return String(randomValue[0] % 100_000_000).padStart(8, '0');
}

export function createScreenshotObjectKey(
  contentType: string,
  uploadedAt = new Date(),
  randomSuffix = createRandomEightDigitSuffix(),
): string {
  const extension = EXTENSIONS_BY_CONTENT_TYPE[contentType];
  if (!extension) throw new Error(`Unsupported screenshot content type: ${contentType}`);
  if (!/^\d{8}$/.test(randomSuffix)) throw new Error('Screenshot random suffix must contain exactly 8 digits');

  const month = `${uploadedAt.getUTCFullYear()}${String(uploadedAt.getUTCMonth() + 1).padStart(2, '0')}`;
  const unixSeconds = Math.floor(uploadedAt.getTime() / 1000);
  return `${month}/${unixSeconds}_${randomSuffix}.${extension}`;
}
