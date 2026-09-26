export const SCREENSHOT_CONTENT_TYPE = 'image/webp';

// Keep the source dimensions so the small metric labels remain legible to OCR.
const SCREENSHOT_WEBP_QUALITY = 90;

export async function convertScreenshotToWebp(images: ImagesBinding, source: File): Promise<ArrayBuffer> {
  const converted = await images.input(source.stream()).output({
    format: SCREENSHOT_CONTENT_TYPE,
    quality: SCREENSHOT_WEBP_QUALITY,
  });
  const bytes = await new Response(converted.image()).arrayBuffer();
  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 12));
  const isWebp = header.byteLength === 12
    && String.fromCharCode(...header.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...header.subarray(8, 12)) === 'WEBP';
  if (!isWebp) throw new Error('Image conversion did not produce WebP');
  return bytes;
}

function createRandomEightDigitSuffix(): string {
  const randomValue = new Uint32Array(1);
  crypto.getRandomValues(randomValue);
  return String(randomValue[0] % 100_000_000).padStart(8, '0');
}

export function createScreenshotObjectKey(
  uploadedAt = new Date(),
  randomSuffix = createRandomEightDigitSuffix(),
): string {
  if (!/^\d{8}$/.test(randomSuffix)) throw new Error('Screenshot random suffix must contain exactly 8 digits');

  const month = `${uploadedAt.getUTCFullYear()}${String(uploadedAt.getUTCMonth() + 1).padStart(2, '0')}`;
  const unixSeconds = Math.floor(uploadedAt.getTime() / 1000);
  return `${month}/${unixSeconds}_${randomSuffix}.webp`;
}
