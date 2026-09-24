import type { App, AppContext } from '../app-types';
import { fail, ok } from '../http';

function addStatisticFilters(c: AppContext) {
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

export function registerStatisticRoutes(app: App) {
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
    const bucketSql = bucket === 'month'
      ? "substr(started_at, 1, 7)"
      : bucket === 'week' ? "strftime('%Y-W%W', started_at)" : "substr(started_at, 1, 10)";
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
}
