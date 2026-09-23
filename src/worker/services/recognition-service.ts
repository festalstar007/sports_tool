import { recognitionResultSchema, type RecognitionResult } from '../../shared/activity-schema';
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

const prompt = `你是运动截图数据提取器。只输出一个 JSON 对象，不要 Markdown，不要解释。
支持标题“户外跑步”和“户外步行”，分别映射为 running 和 walking。
必须忽略手机顶部状态栏的时间、电量、运营商、网络图标；startedAtLocal 只能读取运动详情正文中的完整日期时间。
将单位规范化：公里转米，HH:MM:SS 转秒，M'SS"/公里转秒/公里，去掉步数千位逗号。
无法确定的可选字段填 null，不要用 0，不要臆测。
返回字段：schemaVersion 固定为 1；sportType；startedAtLocal（YYYY-MM-DDTHH:mm:ss）；timezone 固定 Asia/Shanghai；distanceMeters；durationSeconds；caloriesKcal；avgPaceSecondsPerKm；avgSpeedKmh；avgCadenceSpm；avgStrideCm；steps；avgHeartRateBpm；elevationGainMeters；elevationLossMeters；confidence（每个识别字段 0 到 1）；warnings（字符串数组）。`;

function extractText(response: unknown): string {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    if (typeof record.response === 'string') return record.response;
    if (typeof record.result === 'string') return record.result;
    if (typeof record.text === 'string') return record.text;
  }
  return JSON.stringify(response);
}

function parseJsonText(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

export async function recognizeScreenshot(env: Env, bytes: ArrayBuffer): Promise<RecognitionOutcome> {
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
    // 视觉模型输入协议可能随最终所选模型不同而变化，因此集中在此适配。
    const response = await env.AI.run(env.AI_MODEL, {
      prompt,
      image: Array.from(new Uint8Array(bytes)),
      max_tokens: 1400,
    });
    const raw = extractText(response);
    const parsed = recognitionResultSchema.safeParse(parseJsonText(raw));
    if (!parsed.success) {
      return {
        extraction: emptyRecognition(timezone),
        rawResponse: raw,
        errorCode: 'AI_SCHEMA_INVALID',
        errorMessage: '识别结果格式无效，请手工填写或稍后重试',
      };
    }
    return { extraction: parsed.data, rawResponse: raw, errorCode: null, errorMessage: null };
  } catch (error) {
    return {
      extraction: emptyRecognition(timezone),
      rawResponse: null,
      errorCode: 'AI_REQUEST_FAILED',
      errorMessage: error instanceof Error ? error.message : '图片识别失败',
    };
  }
}
