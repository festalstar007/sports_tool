import { Hono, type Context } from 'hono';
import { logger } from 'hono/logger';
import { confirmedActivitySchema, updateActivitySchema } from '../shared/activity-schema';
import { deriveMovementMetrics } from '../shared/units';
import { validateActivityConsistency } from '../shared/validation';
import { mapActivity, mapImport, type ActivityRow, type ImportRow } from './db';
import type { Env } from './env';
import { fail, ok, zodFields } from './http';
import { recognizeScreenshot } from './services/recognition-service';

type Variables = { requestId: string };
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('*', logger());
app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') || crypto.randomUUID();
  c.set('requestId', requestId);
  await next();
  c.header('x-request-id', requestId);
  c.header('x-content-type-options', 'nosniff');
});

app.use('/api/*', async (c, next) => {
  const isDevelopment = c.env.APP_ENV !== 'production';
  const bypass = isDevelopment && c.env.DEV_AUTH_BYPASS === 'true';
  const accessAssertion = c.req.header('cf-access-jwt-assertion');
  if (!bypass && !accessAssertion) {
    return fail(c, 401, { code: 'UNAUTHORIZED', message: '需要通过 Cloudflare Access 登录' });
  }
  await next();
});

app.get('/api/health', (c) => ok(c, { status: 'ok', service: 'sports-tool' }));

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

  const id = crypto.randomUUID();
  const extension = image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : 'jpg';
  const imageKey = `imports/${id}/original.${extension}`;
  const now = new Date().toISOString();
  const bytes = await image.arrayBuffer();

  try {
    await c.env.SCREENSHOTS.put(imageKey, bytes, {
      httpMetadata: { contentType: image.type },
      customMetadata: { importId: id },
    });
    await c.env.DB.prepare(
      `INSERT INTO activity_imports (
        id, image_key, image_content_type, image_size_bytes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'recognizing', ?, ?)`,
    )
      .bind(id, imageKey, image.type, image.size, now, now)
      .run();

    const outcome = await recognizeScreenshot(c.env, bytes, image.type);
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
  if (!object) return fail(c, 404, { code: 'IMAGE_NOT_FOUND', message: '原始截图不存在' });
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
  if (!object) return fail(c, 404, { code: 'IMAGE_NOT_FOUND', message: '原始截图不存在' });
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

const activityColumns = `id, import_id, source_type, sport_type, started_at, timezone, distance_meters,
  duration_seconds, calories_kcal, avg_pace_seconds_per_km, avg_speed_kmh,
  avg_cadence_spm, avg_stride_cm, steps, avg_heart_rate_bpm,
  elevation_gain_meters, elevation_loss_meters, validation_warnings_json,
  created_at, updated_at`;

app.post('/api/activities', async (c) => {
  const parsed = confirmedActivitySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 400, {
      code: 'VALIDATION_ERROR',
      message: '提交的数据无效',
      fields: zodFields(parsed.error),
    });
  }
  const parsedInput = parsed.data;
  if (parsedInput.importId) {
    const existing = await c.env.DB.prepare(`SELECT ${activityColumns} FROM activities WHERE import_id = ?`)
      .bind(parsedInput.importId)
      .first<ActivityRow>();
    if (existing) return ok(c, mapActivity(existing));

    const importRow = await c.env.DB.prepare('SELECT id FROM activity_imports WHERE id = ?')
      .bind(parsedInput.importId)
      .first<{ id: string }>();
    if (!importRow) return fail(c, 404, { code: 'IMPORT_NOT_FOUND', message: '对应的截图导入不存在' });
  }

  const input = parsedInput.importId
    ? parsedInput
    : { ...parsedInput, ...deriveMovementMetrics(parsedInput.distanceMeters, parsedInput.durationSeconds, parsedInput.steps) };

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const warnings = validateActivityConsistency(input);
  try {
    const statements = [
      c.env.DB.prepare(
        `INSERT INTO activities (${activityColumns}) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`,
      ).bind(
        id,
        input.importId,
        input.importId ? 'screenshot' : 'manual',
        input.sportType,
        input.startedAt,
        input.timezone,
        input.distanceMeters,
        input.durationSeconds,
        input.caloriesKcal,
        input.avgPaceSecondsPerKm,
        input.avgSpeedKmh,
        input.avgCadenceSpm,
        input.avgStrideCm,
        input.steps,
        input.avgHeartRateBpm,
        input.elevationGainMeters,
        input.elevationLossMeters,
        JSON.stringify(warnings),
        now,
        now,
      ),
    ];
    if (input.importId) {
      statements.push(
        c.env.DB.prepare("UPDATE activity_imports SET status = 'confirmed', updated_at = ? WHERE id = ?").bind(
          now,
          input.importId,
        ),
      );
    }
    await c.env.DB.batch(statements);
    const row = await c.env.DB.prepare(`SELECT ${activityColumns} FROM activities WHERE id = ?`)
      .bind(id)
      .first<ActivityRow>();
    return ok(c, mapActivity(row!), 201);
  } catch (error) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), importId: input.importId, error: String(error) }));
    return fail(c, 500, { code: 'CREATE_ACTIVITY_FAILED', message: '保存运动记录失败' });
  }
});

app.get('/api/activities', async (c) => {
  const sportType = c.req.query('sportType');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 50), 1), 100);
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (sportType === 'running' || sportType === 'walking') {
    conditions.push('sport_type = ?');
    values.push(sportType);
  }
  if (from) {
    conditions.push('started_at >= ?');
    values.push(from);
  }
  if (to) {
    conditions.push('started_at <= ?');
    values.push(to);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await c.env.DB.prepare(
    `SELECT ${activityColumns} FROM activities ${where} ORDER BY started_at DESC, id DESC LIMIT ?`,
  )
    .bind(...values, limit)
    .all<ActivityRow>();
  return ok(c, result.results.map(mapActivity));
});

app.get('/api/activities/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT ${activityColumns} FROM activities WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<ActivityRow>();
  if (!row) return fail(c, 404, { code: 'ACTIVITY_NOT_FOUND', message: '找不到运动记录' });
  return ok(c, mapActivity(row));
});

app.patch('/api/activities/:id', async (c) => {
  const parsed = updateActivitySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 400, {
      code: 'VALIDATION_ERROR',
      message: '提交的数据无效',
      fields: zodFields(parsed.error),
    });
  }
  const existing = await c.env.DB.prepare('SELECT source_type FROM activities WHERE id = ?')
    .bind(c.req.param('id'))
    .first<{ source_type: ActivityRow['source_type'] }>();
  if (!existing) return fail(c, 404, { code: 'ACTIVITY_NOT_FOUND', message: '找不到运动记录' });
  const input = existing.source_type === 'manual'
    ? { ...parsed.data, ...deriveMovementMetrics(parsed.data.distanceMeters, parsed.data.durationSeconds, parsed.data.steps) }
    : parsed.data;
  const warnings = validateActivityConsistency(input);
  await c.env.DB.prepare(
    `UPDATE activities SET sport_type = ?, started_at = ?, timezone = ?, distance_meters = ?,
      duration_seconds = ?, calories_kcal = ?, avg_pace_seconds_per_km = ?, avg_speed_kmh = ?,
      avg_cadence_spm = ?, avg_stride_cm = ?, steps = ?, avg_heart_rate_bpm = ?,
      elevation_gain_meters = ?, elevation_loss_meters = ?, validation_warnings_json = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      input.sportType,
      input.startedAt,
      input.timezone,
      input.distanceMeters,
      input.durationSeconds,
      input.caloriesKcal,
      input.avgPaceSecondsPerKm,
      input.avgSpeedKmh,
      input.avgCadenceSpm,
      input.avgStrideCm,
      input.steps,
      input.avgHeartRateBpm,
      input.elevationGainMeters,
      input.elevationLossMeters,
      JSON.stringify(warnings),
      new Date().toISOString(),
      c.req.param('id'),
    )
    .run();
  const row = await c.env.DB.prepare(`SELECT ${activityColumns} FROM activities WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<ActivityRow>();
  return ok(c, mapActivity(row!));
});

app.delete('/api/activities/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT import_id FROM activities WHERE id = ?')
    .bind(c.req.param('id'))
    .first<{ import_id: string | null }>();
  if (!row) return fail(c, 404, { code: 'ACTIVITY_NOT_FOUND', message: '找不到运动记录' });
  try {
    if (row.import_id) {
      const importRow = await c.env.DB.prepare('SELECT image_key FROM activity_imports WHERE id = ?')
        .bind(row.import_id)
        .first<{ image_key: string }>();
      if (importRow) await c.env.SCREENSHOTS.delete(importRow.image_key);
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM activities WHERE id = ?').bind(c.req.param('id')),
        c.env.DB.prepare('DELETE FROM activity_imports WHERE id = ?').bind(row.import_id),
      ]);
    } else {
      await c.env.DB.prepare('DELETE FROM activities WHERE id = ?').bind(c.req.param('id')).run();
    }
    return ok(c, { deleted: true });
  } catch (error) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), activityId: c.req.param('id'), error: String(error) }));
    return fail(c, 500, { code: 'DELETE_FAILED', message: '删除失败，请重试' });
  }
});

function addStatisticFilters(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const sportType = c.req.query('sportType');
  if (sportType === 'running' || sportType === 'walking') {
    conditions.push('sport_type = ?');
    values.push(sportType);
  }
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (from) {
    conditions.push('started_at >= ?');
    values.push(from);
  }
  if (to) {
    conditions.push('started_at <= ?');
    values.push(to);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

app.get('/api/statistics/summary', async (c) => {
  const { where, values } = addStatisticFilters(c);
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count,
      COALESCE(SUM(distance_meters), 0) AS total_distance_meters,
      COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds,
      COALESCE(SUM(calories_kcal), 0) AS total_calories_kcal,
      COALESCE(SUM(steps), 0) AS total_steps
     FROM activities ${where}`,
  )
    .bind(...values)
    .first<{
      count: number;
      total_distance_meters: number;
      total_duration_seconds: number;
      total_calories_kcal: number;
      total_steps: number;
    }>();
  return ok(c, {
    count: row?.count ?? 0,
    totalDistanceMeters: row?.total_distance_meters ?? 0,
    totalDurationSeconds: row?.total_duration_seconds ?? 0,
    totalCaloriesKcal: row?.total_calories_kcal ?? 0,
    totalSteps: row?.total_steps ?? 0,
  });
});

app.get('/api/statistics/trends', async (c) => {
  const metrics: Record<string, { column: string; aggregate: 'SUM' | 'AVG' }> = {
    distance: { column: 'distance_meters', aggregate: 'SUM' },
    duration: { column: 'duration_seconds', aggregate: 'SUM' },
    calories: { column: 'calories_kcal', aggregate: 'SUM' },
    steps: { column: 'steps', aggregate: 'SUM' },
    pace: { column: 'avg_pace_seconds_per_km', aggregate: 'AVG' },
    speed: { column: 'avg_speed_kmh', aggregate: 'AVG' },
    heartRate: { column: 'avg_heart_rate_bpm', aggregate: 'AVG' },
    cadence: { column: 'avg_cadence_spm', aggregate: 'AVG' },
    stride: { column: 'avg_stride_cm', aggregate: 'AVG' },
    elevationGain: { column: 'elevation_gain_meters', aggregate: 'SUM' },
  };
  const metric = metrics[c.req.query('metric') || 'distance'];
  if (!metric) return fail(c, 400, { code: 'INVALID_METRIC', message: '不支持的趋势指标' });
  const bucket = c.req.query('bucket') || 'day';
  const bucketSql = bucket === 'month' ? "substr(started_at, 1, 7)" : bucket === 'week' ? "strftime('%Y-W%W', started_at)" : "substr(started_at, 1, 10)";
  const { where, values } = addStatisticFilters(c);
  const result = await c.env.DB.prepare(
    `SELECT ${bucketSql} AS bucket, ${metric.aggregate}(${metric.column}) AS value
     FROM activities ${where}
     GROUP BY ${bucketSql} ORDER BY bucket ASC`,
  )
    .bind(...values)
    .all<{ bucket: string; value: number }>();
  return ok(c, result.results.map((point) => ({ bucket: point.bucket, value: Number(point.value) })));
});

app.notFound((c) => fail(c, 404, { code: 'NOT_FOUND', message: '接口不存在' }));

app.onError((error, c) => {
  console.error(JSON.stringify({ requestId: c.get('requestId'), error: error.message, stack: error.stack }));
  return fail(c, 500, { code: 'INTERNAL_ERROR', message: '服务器处理失败' });
});

export default app;
