import { confirmedActivitySchema, updateActivitySchema } from '../../shared/activity-schema';
import { deriveMovementMetrics } from '../../shared/units';
import { validateActivityConsistency } from '../../shared/validation';
import type { App } from '../app-types';
import { mapActivity, type ActivityRow } from '../db';
import { fail, ok, zodFields } from '../http';

const activityColumns = `id, import_id, source_type, sport_type, started_at, timezone, distance_meters,
  duration_seconds, calories_kcal, avg_pace_seconds_per_km, avg_speed_kmh,
  avg_cadence_spm, avg_stride_cm, steps, avg_heart_rate_bpm,
  elevation_gain_meters, elevation_loss_meters, validation_warnings_json,
  created_at, updated_at`;

export function registerActivityRoutes(app: App) {
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
}
