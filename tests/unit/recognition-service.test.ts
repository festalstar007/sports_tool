import { describe, expect, it, vi } from 'vitest';
import type { AiBinding, Env } from '../../src/worker/env';
import { recognizeScreenshot } from '../../src/worker/services/recognition-service';

const validRawResponse = {
  schemaVersion: 1,
  sportType: 'running',
  startedAtLocal: '2026年9月20日 20:41',
  distanceText: '2.21 公里',
  durationText: '00:20:40',
  caloriesText: '181 千卡',
  avgPaceText: '9\'21"/公里',
  avgSpeedText: '6.42 公里/小时',
  avgCadenceText: '148 步/分钟',
  avgStrideText: '72 厘米',
  stepsText: '3,061 步',
  avgHeartRateText: '142 次/分钟',
  elevationGainText: '8.5 米',
  elevationLossText: '5.8 米',
  confidence: { distanceText: 0.99, durationText: 0.99 },
  warnings: [],
} as const;

function createEnv(run: AiBinding['run']): Env {
  return {
    AI_MODEL: '@cf/meta/llama-3.2-11b-vision-instruct',
    AI: { run },
    APP_TIMEZONE: 'Asia/Shanghai',
  } as Env;
}

describe('recognizeScreenshot', () => {
  it('sends a base64 data URL and normalizes copied screenshot text in code', async () => {
    const run = vi.fn().mockResolvedValue({ response: validRawResponse });
    const bytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46]).buffer;

    const result = await recognizeScreenshot(createEnv(run), bytes, 'image/webp');

    expect(run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.2-11b-vision-instruct',
      expect.objectContaining({
        image: 'data:image/webp;base64,UklGRg==',
        max_tokens: 1200,
        temperature: 0,
      }),
    );
    expect(result.errorCode).toBeNull();
    expect(result.extraction).toMatchObject({
      sportType: 'running',
      startedAtLocal: '2026-09-20T20:41:00',
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
    });
  });

  it('accepts JSON wrapped in a Markdown code fence', async () => {
    const run = vi.fn().mockResolvedValue({ response: `\`\`\`json\n${JSON.stringify(validRawResponse)}\n\`\`\`` });

    const result = await recognizeScreenshot(createEnv(run), new ArrayBuffer(0), 'image/png');

    expect(result.errorCode).toBeNull();
    expect(result.extraction.distanceMeters).toBe(2210);
  });

  it('derives pace, speed, cadence and stride from reliable base fields', async () => {
    const run = vi.fn().mockResolvedValue({
      response: {
        ...validRawResponse,
        avgPaceText: '6.42 公里/小时',
        avgSpeedText: '7.2 米/分钟',
        avgCadenceText: '错误值',
        avgStrideText: '1.48 米',
      },
    });

    const result = await recognizeScreenshot(createEnv(run), new ArrayBuffer(0), 'image/jpeg');

    expect(result.extraction).toMatchObject({
      avgPaceSecondsPerKm: 561,
      avgSpeedKmh: 6.42,
      avgCadenceSpm: 148,
      avgStrideCm: 72,
    });
  });

  it('derives walking metrics using the screenshot base values', async () => {
    const run = vi.fn().mockResolvedValue({
      response: {
        ...validRawResponse,
        sportType: 'walking',
        distanceText: '3.03 公里',
        durationText: '00:31:29',
        stepsText: '3,866 步',
      },
    });

    const result = await recognizeScreenshot(createEnv(run), new ArrayBuffer(0), 'image/jpeg');

    expect(result.extraction).toMatchObject({
      avgPaceSecondsPerKm: 623,
      avgSpeedKmh: 5.77,
      avgCadenceSpm: 122,
      avgStrideCm: 78,
    });
  });

  it('removes invalid confidence entries and empty warnings', async () => {
    const run = vi.fn().mockResolvedValue({
      response: {
        ...validRawResponse,
        confidence: { distanceText: 1, avgHeartRateText: null },
        warnings: [''],
      },
      tool_calls: [],
    });

    const result = await recognizeScreenshot(createEnv(run), new ArrayBuffer(0), 'image/jpeg');

    expect(result.errorCode).toBeNull();
    expect(result.extraction.confidence).toEqual({ distanceMeters: 1 });
    expect(result.extraction.warnings).toEqual([]);
  });

  it('falls back to manual review when AI is not configured', async () => {
    const result = await recognizeScreenshot(
      { APP_TIMEZONE: 'Asia/Shanghai' } as Env,
      new ArrayBuffer(0),
      'image/png',
    );

    expect(result.errorCode).toBe('AI_NOT_CONFIGURED');
    expect(result.extraction.sportType).toBeNull();
  });

  it('reports invalid structured output without trusting it', async () => {
    const run = vi.fn().mockResolvedValue({ response: '{"sportType":"walking"}' });

    const result = await recognizeScreenshot(createEnv(run), new ArrayBuffer(0), 'image/webp');

    expect(result.errorCode).toBe('AI_SCHEMA_INVALID');
    expect(result.rawResponse).toBe('{"sportType":"walking"}');
  });
});
