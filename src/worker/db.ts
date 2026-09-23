import type { Activity, ActivityImport, RecognitionResult, ValidationWarning } from '../shared/activity-schema';

export type ImportRow = {
  id: string;
  image_key: string;
  image_content_type: string;
  image_size_bytes: number;
  source_app: string | null;
  status: ActivityImport['status'];
  raw_ai_response: string | null;
  normalized_extraction_json: string | null;
  recognition_error_code: string | null;
  recognition_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityRow = {
  id: string;
  import_id: string;
  sport_type: Activity['sportType'];
  started_at: string;
  timezone: string;
  distance_meters: number;
  duration_seconds: number;
  calories_kcal: number | null;
  avg_pace_seconds_per_km: number | null;
  avg_speed_kmh: number | null;
  avg_cadence_spm: number | null;
  avg_stride_cm: number | null;
  steps: number | null;
  avg_heart_rate_bpm: number | null;
  elevation_gain_meters: number | null;
  elevation_loss_meters: number | null;
  validation_warnings_json: string;
  created_at: string;
  updated_at: string;
};

function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function mapImport(row: ImportRow): ActivityImport {
  return {
    id: row.id,
    status: row.status,
    imageContentType: row.image_content_type,
    imageSizeBytes: row.image_size_bytes,
    sourceApp: row.source_app,
    extraction: safeJson<RecognitionResult | null>(row.normalized_extraction_json, null),
    recognitionErrorCode: row.recognition_error_code,
    recognitionErrorMessage: row.recognition_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    importId: row.import_id,
    sportType: row.sport_type,
    startedAt: row.started_at,
    timezone: row.timezone,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    caloriesKcal: row.calories_kcal,
    avgPaceSecondsPerKm: row.avg_pace_seconds_per_km,
    avgSpeedKmh: row.avg_speed_kmh,
    avgCadenceSpm: row.avg_cadence_spm,
    avgStrideCm: row.avg_stride_cm,
    steps: row.steps,
    avgHeartRateBpm: row.avg_heart_rate_bpm,
    elevationGainMeters: row.elevation_gain_meters,
    elevationLossMeters: row.elevation_loss_meters,
    validationWarnings: safeJson<ValidationWarning[]>(row.validation_warnings_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
