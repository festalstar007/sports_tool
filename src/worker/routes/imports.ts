import type { App } from '../app-types';
import { mapImport, type ImportRow } from '../db';
import { fail, ok } from '../http';
import { recognizeScreenshot } from '../services/recognition-service';
import { convertScreenshotToWebp, createScreenshotObjectKey, SCREENSHOT_CONTENT_TYPE } from '../services/screenshot-storage';

export function registerImportRoutes(app: App) {
  app.post('/api/imports', async (c) => {
    const body = await c.req.parseBody();
    const image = body.image;
    if (!(image instanceof File)) {
      return fail(c, 400, { code: 'IMAGE_REQUIRED', message: '请选择一张运动截图' });
    }

    const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!supportedTypes.has(image.type)) {
      return fail(c, 415, { code: 'UNSUPPORTED_IMAGE', message: '仅支持 JPEG、PNG 或 WebP 图片' });
    }
    const maxBytes = Number(c.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
    if (image.size > maxBytes) {
      return fail(c, 413, { code: 'IMAGE_TOO_LARGE', message: '图片超过 10 MiB 限制' });
    }

    let bytes: ArrayBuffer;
    try {
      bytes = await convertScreenshotToWebp(c.env.IMAGES, image);
    } catch (error) {
      console.error(JSON.stringify({ requestId: c.get('requestId'), error: String(error) }));
      return fail(c, 415, { code: 'IMAGE_CONVERSION_FAILED', message: '截图无法转换为 WebP，请检查图片后重试' });
    }

    const id = crypto.randomUUID();
    const uploadedAt = new Date();
    const imageKey = createScreenshotObjectKey(uploadedAt);
    const now = uploadedAt.toISOString();

    try {
      await c.env.SCREENSHOTS.put(imageKey, bytes, {
        httpMetadata: { contentType: SCREENSHOT_CONTENT_TYPE },
        customMetadata: { importId: id },
      });
      await c.env.DB.prepare(
        `INSERT INTO activity_imports (
          id, image_key, image_content_type, image_size_bytes, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'recognizing', ?, ?)`,
      )
        .bind(id, imageKey, SCREENSHOT_CONTENT_TYPE, bytes.byteLength, now, now)
        .run();

      const outcome = await recognizeScreenshot(c.env, bytes, SCREENSHOT_CONTENT_TYPE);
      const status = outcome.errorCode && outcome.errorCode !== 'AI_NOT_CONFIGURED' ? 'failed' : 'needs_review';
      const updatedAt = new Date().toISOString();
      await c.env.DB.prepare(
        `UPDATE activity_imports
         SET status = ?, raw_ai_response = ?, normalized_extraction_json = ?,
             recognition_error_code = ?, recognition_error_message = ?, updated_at = ?
         WHERE id = ?`,
      )
        .bind(
          status,
          outcome.rawResponse,
          JSON.stringify(outcome.extraction),
          outcome.errorCode,
          outcome.errorMessage,
          updatedAt,
          id,
        )
        .run();

      const row = await c.env.DB.prepare('SELECT * FROM activity_imports WHERE id = ?').bind(id).first<ImportRow>();
      return ok(c, mapImport(row!), 201);
    } catch (error) {
      await c.env.SCREENSHOTS.delete(imageKey).catch(() => undefined);
      console.error(JSON.stringify({ requestId: c.get('requestId'), importId: id, error: String(error) }));
      return fail(c, 500, { code: 'IMPORT_FAILED', message: '上传或保存截图失败，请重试' });
    }
  });

  app.get('/api/imports/:id', async (c) => {
    const row = await c.env.DB.prepare('SELECT * FROM activity_imports WHERE id = ?')
      .bind(c.req.param('id'))
      .first<ImportRow>();
    if (!row) return fail(c, 404, { code: 'IMPORT_NOT_FOUND', message: '找不到这次导入' });
    return ok(c, mapImport(row));
  });

  app.get('/api/imports/:id/image', async (c) => {
    const row = await c.env.DB.prepare('SELECT image_key, image_content_type FROM activity_imports WHERE id = ?')
      .bind(c.req.param('id'))
      .first<{ image_key: string; image_content_type: string }>();
    if (!row) return fail(c, 404, { code: 'IMPORT_NOT_FOUND', message: '找不到这次导入' });
    const object = await c.env.SCREENSHOTS.get(row.image_key);
    if (!object) return fail(c, 404, { code: 'IMAGE_NOT_FOUND', message: '截图不存在' });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('content-type', row.image_content_type);
    headers.set('cache-control', 'private, max-age=3600');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(object.body, { headers });
  });

  app.post('/api/imports/:id/retry', async (c) => {
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(
      `SELECT i.* FROM activity_imports i
       LEFT JOIN activities a ON a.import_id = i.id
       WHERE i.id = ? AND a.id IS NULL`,
    )
      .bind(id)
      .first<ImportRow>();
    if (!row) return fail(c, 409, { code: 'IMPORT_NOT_RETRYABLE', message: '导入不存在或已经确认保存' });
    const object = await c.env.SCREENSHOTS.get(row.image_key);
    if (!object) return fail(c, 404, { code: 'IMAGE_NOT_FOUND', message: '截图不存在' });
    await c.env.DB.prepare("UPDATE activity_imports SET status = 'recognizing', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), id)
      .run();
    const outcome = await recognizeScreenshot(c.env, await object.arrayBuffer(), row.image_content_type);
    const status = outcome.errorCode && outcome.errorCode !== 'AI_NOT_CONFIGURED' ? 'failed' : 'needs_review';
    await c.env.DB.prepare(
      `UPDATE activity_imports SET status = ?, raw_ai_response = ?, normalized_extraction_json = ?,
        recognition_error_code = ?, recognition_error_message = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(
        status,
        outcome.rawResponse,
        JSON.stringify(outcome.extraction),
        outcome.errorCode,
        outcome.errorMessage,
        new Date().toISOString(),
        id,
      )
      .run();
    const updated = await c.env.DB.prepare('SELECT * FROM activity_imports WHERE id = ?').bind(id).first<ImportRow>();
    return ok(c, mapImport(updated!));
  });
}
