import type { ConfirmedActivityInput, ValidationWarning } from './activity-schema';

function relativeDifference(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : Infinity;
  return Math.abs(actual - expected) / Math.abs(expected);
}

export function validateActivityConsistency(
  activity: Pick<
    ConfirmedActivityInput,
    | 'distanceMeters'
    | 'durationSeconds'
    | 'avgPaceSecondsPerKm'
    | 'avgSpeedKmh'
    | 'avgCadenceSpm'
    | 'avgStrideCm'
    | 'steps'
    | 'avgHeartRateBpm'
  >,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const distanceKm = activity.distanceMeters / 1000;

  if (activity.avgPaceSecondsPerKm != null && distanceKm > 0) {
    const expected = activity.durationSeconds / distanceKm;
    if (relativeDifference(activity.avgPaceSecondsPerKm, expected) > 0.03) {
      warnings.push({
        code: 'PACE_MISMATCH',
        message: '配速与距离、时长计算结果偏差较大',
        fields: ['avgPaceSecondsPerKm', 'distanceMeters', 'durationSeconds'],
      });
    }
  }

  if (activity.avgSpeedKmh != null && activity.durationSeconds > 0) {
    const expected = distanceKm / (activity.durationSeconds / 3600);
    if (relativeDifference(activity.avgSpeedKmh, expected) > 0.03) {
      warnings.push({
        code: 'SPEED_MISMATCH',
        message: '平均速度与距离、时长计算结果偏差较大',
        fields: ['avgSpeedKmh', 'distanceMeters', 'durationSeconds'],
      });
    }
  }

  if (activity.steps != null && activity.avgStrideCm != null && activity.distanceMeters > 0) {
    const expected = (activity.steps * activity.avgStrideCm) / 100;
    if (relativeDifference(expected, activity.distanceMeters) > 0.08) {
      warnings.push({
        code: 'STEP_DISTANCE_MISMATCH',
        message: '步数和步幅估算的距离与运动距离偏差较大',
        fields: ['steps', 'avgStrideCm', 'distanceMeters'],
      });
    }
  }

  const ranges: Array<[number | null, number, number, string]> = [
    [activity.avgHeartRateBpm, 30, 240, '平均心率'],
    [activity.avgCadenceSpm, 20, 300, '平均步频'],
    [activity.avgStrideCm, 10, 300, '平均步幅'],
  ];
  for (const [value, min, max, label] of ranges) {
    if (value != null && (value < min || value > max)) {
      warnings.push({
        code: 'RANGE_WARNING',
        message: `${label}超出常见范围，请确认`,
        fields: [],
      });
    }
  }

  return warnings;
}
