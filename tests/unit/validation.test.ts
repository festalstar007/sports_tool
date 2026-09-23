import { describe, expect, it } from 'vitest';
import type { ConfirmedActivityInput } from '../../src/shared/activity-schema';
import { validateActivityConsistency } from '../../src/shared/validation';

const running: ConfirmedActivityInput = {
  importId: 'run-import',
  sportType: 'running',
  startedAt: '2026-09-20T20:41:00+08:00',
  timezone: 'Asia/Shanghai',
  distanceMeters: 2210,
  durationSeconds: 1240,
  caloriesKcal: 181,
  avgPaceSecondsPerKm: 561,
  avgSpeedKmh: 6.42,
  avgCadenceSpm: 148,
  avgStrideCm: 72,
  steps: 3061,
  avgHeartRateBpm: 142,
  elevationGainMeters: 8.5,
  elevationLossMeters: 5.8,
};

const walking: ConfirmedActivityInput = {
  importId: 'walk-import',
  sportType: 'walking',
  startedAt: '2026-09-22T20:09:00+08:00',
  timezone: 'Asia/Shanghai',
  distanceMeters: 3030,
  durationSeconds: 1889,
  caloriesKcal: 221,
  avgPaceSecondsPerKm: 623,
  avgSpeedKmh: 5.77,
  avgCadenceSpm: 122,
  avgStrideCm: 78,
  steps: 3866,
  avgHeartRateBpm: 120,
  elevationGainMeters: 7.5,
  elevationLossMeters: 5.1,
};

describe('截图数据交叉校验', () => {
  it('跑步样例内部一致', () => {
    expect(validateActivityConsistency(running)).toEqual([]);
  });

  it('步行样例内部一致', () => {
    expect(validateActivityConsistency(walking)).toEqual([]);
  });

  it('发现明显错误的配速和速度', () => {
    const warnings = validateActivityConsistency({ ...running, avgPaceSecondsPerKm: 100, avgSpeedKmh: 30 });
    expect(warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['PACE_MISMATCH', 'SPEED_MISMATCH']));
  });
});
