import { z } from 'zod';

export const sportTypeSchema = z.enum(['running', 'walking']);
export type SportType = z.infer<typeof sportTypeSchema>;

const nullableNonNegative = z.number().finite().nonnegative().nullable();
const nullablePositive = z.number().finite().positive().nullable();

export const confirmedActivitySchema = z.object({
  importId: z.string().min(1),
  sportType: sportTypeSchema,
  startedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), '运动时间无效'),
  timezone: z.string().min(1).default('Asia/Shanghai'),
  distanceMeters: z.number().int().positive().max(200_000),
  durationSeconds: z.number().int().positive().max(172_800),
  caloriesKcal: nullableNonNegative,
  avgPaceSecondsPerKm: nullablePositive,
  avgSpeedKmh: nullablePositive,
  avgCadenceSpm: nullablePositive,
  avgStrideCm: nullablePositive,
  steps: nullableNonNegative,
  avgHeartRateBpm: nullablePositive,
  elevationGainMeters: nullableNonNegative,
  elevationLossMeters: nullableNonNegative,
});

export const updateActivitySchema = confirmedActivitySchema.omit({ importId: true });

export type ConfirmedActivityInput = z.infer<typeof confirmedActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const confidenceSchema = z.record(z.string(), z.number().min(0).max(1));

export const recognitionResultSchema = z.object({
  schemaVersion: z.literal(1),
  sportType: sportTypeSchema.nullable(),
  startedAtLocal: z.string().nullable(),
  timezone: z.string().default('Asia/Shanghai'),
  distanceMeters: nullableNonNegative,
  durationSeconds: nullableNonNegative,
  caloriesKcal: nullableNonNegative,
  avgPaceSecondsPerKm: nullablePositive,
  avgSpeedKmh: nullablePositive,
  avgCadenceSpm: nullablePositive,
  avgStrideCm: nullablePositive,
  steps: nullableNonNegative,
  avgHeartRateBpm: nullablePositive,
  elevationGainMeters: nullableNonNegative,
  elevationLossMeters: nullableNonNegative,
  confidence: confidenceSchema.default({}),
  warnings: z.array(z.string()).default([]),
});

export type RecognitionResult = z.infer<typeof recognitionResultSchema>;

export type ValidationWarning = {
  code: 'PACE_MISMATCH' | 'SPEED_MISMATCH' | 'STEP_DISTANCE_MISMATCH' | 'RANGE_WARNING';
  message: string;
  fields: string[];
};

export type Activity = {
  id: string;
  importId: string;
  sportType: SportType;
  startedAt: string;
  timezone: string;
  distanceMeters: number;
  durationSeconds: number;
  caloriesKcal: number | null;
  avgPaceSecondsPerKm: number | null;
  avgSpeedKmh: number | null;
  avgCadenceSpm: number | null;
  avgStrideCm: number | null;
  steps: number | null;
  avgHeartRateBpm: number | null;
  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
  validationWarnings: ValidationWarning[];
  createdAt: string;
  updatedAt: string;
};

export type ImportStatus = 'uploaded' | 'recognizing' | 'needs_review' | 'failed' | 'confirmed';

export type ActivityImport = {
  id: string;
  status: ImportStatus;
  imageContentType: string;
  imageSizeBytes: number;
  sourceApp: string | null;
  extraction: RecognitionResult | null;
  recognitionErrorCode: string | null;
  recognitionErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Summary = {
  count: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalCaloriesKcal: number;
  totalSteps: number;
};

export type TrendPoint = {
  bucket: string;
  value: number;
};
