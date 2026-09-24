import { z } from 'zod';
import { recognitionResultSchema, type RecognitionResult, type SportType } from '../../shared/activity-schema';
import { parseDuration, parsePace } from '../../shared/units';
import type { Env } from '../env';

export type RecognitionOutcome = {
  extraction: RecognitionResult;
  rawResponse: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export function emptyRecognition(timezone = 'Asia/Shanghai'): RecognitionResult {
  return {
    schemaVersion: 1,
    sportType: null,
    startedAtLocal: null,
    timezone,
    distanceMeters: null,
    durationSeconds: null,
    caloriesKcal: null,
    avgPaceSecondsPerKm: null,
    avgSpeedKmh: null,
    avgCadenceSpm: null,
    avgStrideCm: null,
    steps: null,
    avgHeartRateBpm: null,
    elevationGainMeters: null,
    elevationLossMeters: null,
    confidence: {},
    warnings: [],
  };
}

const prompt = `你是运动截图 OCR 提取器。只输出一个 JSON 对象，不要 Markdown，不要解释。
你的任务仅仅是逐项抄录当前图片中的原文，不做任何算术、换算、推导、纠错或补全，不得使用历史图片中的数值。
必须忽略手机顶部状态栏的时间、电量、运营商和网络图标。
运动类型只能按页面标题判断：“户外跑步”返回 running，“户外步行”返回 walking。
startedAtLocal 只抄录运动详情正文中的完整日期时间。
每个 *Text 字段都必须保留图片中的完整数字和单位，包括小数点、冒号、单引号、双引号及千位逗号；看不清或图片中没有的字段填 null，禁止用 0 代替缺失值。
平均步频和平均步幅是两个不同字段，不得交换。累计爬升和累计下降必须分别读取。
confidence 只包含置信度为 0 到 1 数字的字段；不确定字段不要写入 confidence。没有警告时 warnings 返回空数组。
返回且只返回这些字段：schemaVersion 固定为 1；sportType；startedAtLocal；distanceText；durationText；caloriesText；avgPaceText；avgSpeedText；avgCadenceText；avgStrideText；stepsText；avgHeartRateText；elevationGainText；elevationLossText；confidence；warnings。`;

const nullableText = z.union([z.string(), z.number().transform(String)]).nullable();

const rawRecognitionSchema = z.object({
  schemaVersion: z.literal(1),
  sportType: z.string().nullable(),
  startedAtLocal: nullableText,
  distanceText: nullableText,
  durationText: nullableText,
  caloriesText: nullableText,
  avgPaceText: nullableText,
  avgSpeedText: nullableText,
  avgCadenceText: nullableText,
  avgStrideText: nullableText,
  stepsText: nullableText,
  avgHeartRateText: nullableText,
  elevationGainText: nullableText,
  elevationLossText: nullableText,
  confidence: z.record(z.string(), z.number().min(0).max(1)).default({}),
  warnings: z.array(z.string()).default([]),
});

type RawRecognition = z.infer<typeof rawRecognitionSchema>;

function toDataUrl(bytes: ArrayBuffer, contentType: string): string {
  const data = new Uint8Array(bytes);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

function extractPayload(response: unknown): { payload: unknown; raw: string } {
  if (typeof response === 'string') return { payload: response, raw: response };
  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    for (const key of ['response', 'result', 'text']) {
      if (record[key] !== undefined) {
        const payload = record[key];
        return { payload, raw: typeof payload === 'string' ? payload : JSON.stringify(payload) };
      }
    }
  }
  return { payload: response, raw: JSON.stringify(response) };
}

function parseJsonText(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

function normalizeModelPayload(payload: unknown): unknown {
  const parsed = typeof payload === 'string' ? parseJsonText(payload) : payload;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;

  const result = { ...(parsed as Record<string, unknown>) };
  const confidence = result.confidence;
  if (confidence && typeof confidence === 'object' && !Array.isArray(confidence)) {
    result.confidence = Object.fromEntries(
      Object.entries(confidence).filter(
        ([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1,
      ),
    );
  }
  if (Array.isArray(result.warnings)) {
    result.warnings = result.warnings.filter((value) => typeof value === 'string' && value.trim().length > 0);
  }
  return result;
}

function parseNumberText(value: string | null): number | null {
  if (value == null) return null;
  const match = value.replace(/[,，]/g, '').match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDistanceMeters(value: string | null): number | null {
  const distance = parseNumberText(value);
  if (distance == null) return null;
  if (value && /(?:公里|km)/i.test(value)) return Math.round(distance * 1000);
  if (value && /(?:米|m)/i.test(value)) return Math.round(distance);
  return distance < 100 ? Math.round(distance * 1000) : Math.round(distance);
}

function parseSportType(value: string | null): SportType | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes('running') || normalized.includes('跑步')) return 'running';
  if (normalized.includes('walking') || normalized.includes('步行')) return 'walking';
  return null;
}

function normalizeStartedAt(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .replace(/[年/]/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, ' ')
    .replace(/\s+/g, ' ');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00'] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
}

function normalizeRawRecognition(raw: RawRecognition, timezone: string): RecognitionResult {
  const distanceMeters = parseDistanceMeters(raw.distanceText);
  const durationSeconds = raw.durationText == null ? null : parseDuration(raw.durationText);
  const steps = parseNumberText(raw.stepsText);
  const canDeriveMovement = distanceMeters != null && distanceMeters > 0 && durationSeconds != null && durationSeconds > 0;
  const canDeriveStepMetrics = canDeriveMovement && steps != null && steps > 0;
  const distanceKm = distanceMeters == null ? null : distanceMeters / 1000;

  const avgPaceSecondsPerKm = canDeriveMovement && distanceKm != null
    ? Math.round(durationSeconds / distanceKm)
    : raw.avgPaceText == null ? null : parsePace(raw.avgPaceText);
  const avgSpeedKmh = canDeriveMovement && distanceKm != null
    ? Math.round((distanceKm / (durationSeconds / 3600)) * 100) / 100
    : parseNumberText(raw.avgSpeedText);
  const avgCadenceSpm = canDeriveStepMetrics
    ? Math.floor(steps / (durationSeconds / 60))
    : parseNumberText(raw.avgCadenceText);
  const avgStrideCm = canDeriveStepMetrics
    ? Math.round((distanceMeters * 100) / steps)
    : parseNumberText(raw.avgStrideText);

  const confidenceKeys: Record<string, string> = {
    sportType: 'sportType',
    startedAtLocal: 'startedAtLocal',
    distanceText: 'distanceMeters',
    durationText: 'durationSeconds',
    caloriesText: 'caloriesKcal',
    avgPaceText: 'avgPaceSecondsPerKm',
    avgSpeedText: 'avgSpeedKmh',
    avgCadenceText: 'avgCadenceSpm',
    avgStrideText: 'avgStrideCm',
    stepsText: 'steps',
    avgHeartRateText: 'avgHeartRateBpm',
    elevationGainText: 'elevationGainMeters',
    elevationLossText: 'elevationLossMeters',
  };
  const confidence = Object.fromEntries(
    Object.entries(raw.confidence).map(([key, value]) => [confidenceKeys[key] ?? key, value]),
  );

  return recognitionResultSchema.parse({
    schemaVersion: 1,
    sportType: parseSportType(raw.sportType),
    startedAtLocal: normalizeStartedAt(raw.startedAtLocal),
    timezone,
    distanceMeters,
    durationSeconds,
    caloriesKcal: parseNumberText(raw.caloriesText),
    avgPaceSecondsPerKm,
    avgSpeedKmh,
    avgCadenceSpm,
    avgStrideCm,
    steps,
    avgHeartRateBpm: parseNumberText(raw.avgHeartRateText),
    elevationGainMeters: parseNumberText(raw.elevationGainText),
    elevationLossMeters: parseNumberText(raw.elevationLossText),
    confidence,
    warnings: raw.warnings,
  });
}

export async function recognizeScreenshot(
  env: Env,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<RecognitionOutcome> {
  const timezone = env.APP_TIMEZONE || 'Asia/Shanghai';
  if (!env.AI_MODEL?.trim() || !env.AI) {
    return {
      extraction: emptyRecognition(timezone),
      rawResponse: null,
      errorCode: 'AI_NOT_CONFIGURED',
      errorMessage: 'Workers AI 模型尚未配置，请手工确认运动数据',
    };
  }

  try {
    const response = await env.AI.run(env.AI_MODEL, {
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: '请逐项抄录这张运动详情截图，并按要求返回 JSON。' },
      ],
      image: toDataUrl(bytes, contentType),
      max_tokens: 1200,
      temperature: 0,
    });
    const { payload, raw } = extractPayload(response);
    const parsed = rawRecognitionSchema.safeParse(normalizeModelPayload(payload));
    if (!parsed.success) {
      return {
        extraction: emptyRecognition(timezone),
        rawResponse: raw,
        errorCode: 'AI_SCHEMA_INVALID',
        errorMessage: '识别结果格式无效，请手工填写或稍后重试',
      };
    }
    return {
      extraction: normalizeRawRecognition(parsed.data, timezone),
      rawResponse: raw,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      extraction: emptyRecognition(timezone),
      rawResponse: null,
      errorCode: 'AI_REQUEST_FAILED',
      errorMessage: error instanceof Error ? error.message : '图片识别失败',
    };
  }
}
