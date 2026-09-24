import { describe, expect, it } from 'vitest';
import {
  deriveMovementMetrics,
  formatDuration,
  formatPace,
  normalizeDurationInput,
  parseDuration,
  parsePace,
} from '../../src/shared/units';

describe('运动单位转换', () => {
  it('解析并格式化运动时长', () => {
    expect(parseDuration('00:20:40')).toBe(1240);
    expect(parseDuration('31:29')).toBe(1889);
    expect(parseDuration('00：31：29')).toBe(1889);
    expect(parseDuration('31分29秒')).toBe(1889);
    expect(parseDuration('00时31分29秒')).toBe(1889);
    expect(formatDuration(1889)).toBe('00:31:29');
    expect(normalizeDurationInput('31分29秒')).toBe('00:31:29');
    expect(parseDuration('00:61:00')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });

  it('解析并格式化平均配速', () => {
    expect(parsePace("9'21\"")).toBe(561);
    expect(parsePace("9'21\"/公里")).toBe(561);
    expect(parsePace('10:23')).toBe(623);
    expect(formatPace(623)).toBe('10′23″');
    expect(parsePace('10:75')).toBeNull();
  });

  it('根据基础数据计算派生指标', () => {
    expect(deriveMovementMetrics(2210, 1240, 3061)).toEqual({
      avgPaceSecondsPerKm: 561,
      avgSpeedKmh: 6.42,
      avgCadenceSpm: 148,
      avgStrideCm: 72,
    });
    expect(deriveMovementMetrics(3030, 1889, null)).toEqual({
      avgPaceSecondsPerKm: 623,
      avgSpeedKmh: 5.77,
      avgCadenceSpm: null,
      avgStrideCm: null,
    });
  });
});
